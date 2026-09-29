const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const pdfParse = require('pdf-parse');
const { chunk, chunkPages } = require('./chunker');
const { Store } = require('./store');
const { embed, chat } = require('./providers');
const { extractOutline } = require('./outline');

// RAG_DATA_DIR is set by the Electron shell to the OS user-data dir so the
// index is writable when the app is installed. Falls back to a local folder
// for the standalone `npm run rag` workflow.
// Sentinel bookId meaning "search across every indexed book" (see /api/rag/chat).
const ALL_BOOKS = '__all__';

const DATA_DIR = process.env.RAG_DATA_DIR || path.join(__dirname, '..', 'rag-data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  mode: 'local',
  local: {
    baseUrl: 'http://localhost:11434',
    embedModel: 'nomic-embed-text',
    chatModel: 'llama3.2',
    chatModels: ['llama3.2'],
  },
  api: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    embedModel: 'text-embedding-3-small',
    chatModel: 'gpt-4o-mini',
    chatModels: ['gpt-4o-mini'],
  },
  chunkSize: 800,
  chunkOverlap: 100,
  topK: 6,
  // Retrieval quality knobs (see /api/rag/chat):
  // rerank: 'auto' | true | false. 'auto' turns reranking on when it's cheap —
  // always in API mode, and in local mode only when a GPU is detected (an extra
  // LLM call per question is painful on a CPU-only laptop).
  rerank: 'auto',
  rerankPool: 20,     // how many candidates to pull before reranking
  rewriteFollowups: true, // fold conversation context into the search query
};

// --- Custom media (user-added wallpapers + music) -------------------------
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MEDIA_MANIFEST = path.join(DATA_DIR, 'media.json');
for (const t of ['wallpapers', 'music', 'ambient']) fs.mkdirSync(path.join(MEDIA_DIR, t), { recursive: true });

function loadMedia() {
  const empty = { wallpapers: [], music: [], ambient: [] };
  if (!fs.existsSync(MEDIA_MANIFEST)) return empty;
  try {
    const m = JSON.parse(fs.readFileSync(MEDIA_MANIFEST, 'utf8'));
    return { wallpapers: m.wallpapers || [], music: m.music || [], ambient: m.ambient || [] };
  } catch { return empty; }
}
function saveMedia(m) { fs.writeFileSync(MEDIA_MANIFEST, JSON.stringify(m, null, 2)); }

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }
  const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    local: { ...DEFAULT_CONFIG.local, ...(saved.local || {}) },
    api: { ...DEFAULT_CONFIG.api, ...(saved.api || {}) },
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// --- GPU detection --------------------------------------------------------
// Reranking is worth it only when inference is fast. Remote APIs always are;
// local Ollama is fast only on a GPU. We probe the common vendor CLIs once and
// cache the answer for the process lifetime.
function probe(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
        resolve(!err && !!(stdout || '').trim());
      });
    } catch { resolve(false); }
  });
}

// Run a command and return trimmed stdout, or null if it fails / isn't found.
function probeOut(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
        resolve(err ? null : ((stdout || '').trim() || null));
      });
    } catch { resolve(null); }
  });
}

let hwPromise;
// Detect RAM + GPU once and cache. { ramGB, gpu, gpuName, vramMB }.
function detectHardware() {
  if (!hwPromise) {
    hwPromise = (async () => {
      const ramGB = Math.round(os.totalmem() / 1e9);
      // NVIDIA: get name + total VRAM in one query.
      const nv = await probeOut('nvidia-smi',
        ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
      if (nv) {
        const [name, mem] = nv.split('\n')[0].split(',').map((s) => s.trim());
        return { ramGB, gpu: true, gpuName: name || 'NVIDIA GPU', vramMB: parseInt(mem, 10) || null };
      }
      if (await probe('rocm-smi', ['--showid'])) {
        return { ramGB, gpu: true, gpuName: 'AMD GPU (ROCm)', vramMB: null };
      }
      return { ramGB, gpu: false, gpuName: null, vramMB: null };
    })();
  }
  return hwPromise;
}

async function hasGpu() {
  return (await detectHardware()).gpu;
}

// Suggest chat models that will actually run well on the detected hardware.
function recommendModels(hw) {
  const v = hw.vramMB || 0;
  let chat;
  if (hw.gpu && v >= 16000) {
    chat = [['qwen2.5:14b', 'top quality — fits your VRAM'], ['llama3.1:8b', 'fast, excellent all-rounder']];
  } else if (hw.gpu && v >= 8000) {
    chat = [['qwen2.5:7b', 'best balance for your GPU'], ['llama3.1:8b', 'strong all-rounder'], ['llama3.2:3b', 'snappy']];
  } else if (hw.gpu && v >= 4000) {
    chat = [['llama3.2:3b', 'fits your GPU comfortably'], ['qwen2.5:3b', 'good reasoning']];
  } else if (hw.gpu) {
    chat = [['llama3.2:3b', 'small enough for your GPU'], ['llama3.2:1b', 'fastest']];
  } else if (hw.ramGB >= 16) {
    chat = [['llama3.2:3b', 'runs on CPU with your RAM'], ['qwen2.5:3b', 'good reasoning on CPU'], ['llama3.2:1b', 'fastest on CPU']];
  } else {
    chat = [['llama3.2:1b', 'lightest — best for CPU + limited RAM'], ['llama3.2:3b', 'try if 1b feels weak']];
  }
  return { chat: chat.map(([model, note]) => ({ model, note })), embed: 'nomic-embed-text' };
}

// Resolve the effective rerank decision from config + hardware.
async function rerankEnabled(cfg) {
  if (cfg.rerank === true) return true;
  if (cfg.rerank === false) return false;
  // 'auto' (or anything unexpected): remote APIs are fast; local needs a GPU.
  if (cfg.mode !== 'local') return true;
  return hasGpu();
}

const store = new Store(DATA_DIR);
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/api/rag/config', async (req, res) => {
  const c = loadConfig();
  res.json({
    ...c,
    api: { ...c.api, apiKey: c.api.apiKey ? '••••••' : '' },
    gpu: await hasGpu(),              // detected once, cached
    rerankActive: await rerankEnabled(c), // what 'auto' resolves to right now
  });
});

app.post('/api/rag/config', (req, res) => {
  const current = loadConfig();
  const incoming = req.body || {};
  if (incoming.api && incoming.api.apiKey === '••••••') {
    incoming.api.apiKey = current.api.apiKey;
  }
  const merged = {
    ...current,
    ...incoming,
    local: { ...current.local, ...(incoming.local || {}) },
    api: { ...current.api, ...(incoming.api || {}) },
  };
  saveConfig(merged);
  res.json({ ok: true });
});

// List models the current provider can serve, so the UI can offer a picker
// instead of forcing the user to type exact names. Falls back to empty list
// (the UI keeps free-text entry) if the provider can't be reached.
app.get('/api/rag/models', async (req, res) => {
  const cfg = loadConfig();
  try {
    if (cfg.mode === 'local') {
      const r = await fetch(`${cfg.local.baseUrl}/api/tags`);
      if (!r.ok) return res.json({ models: [] });
      const j = await r.json();
      return res.json({ models: (j.models || []).map(m => m.name).sort() });
    } else {
      if (!cfg.api.apiKey) return res.json({ models: [] });
      const r = await fetch(`${cfg.api.baseUrl.replace(/\/$/, '')}/models`, {
        headers: { Authorization: `Bearer ${cfg.api.apiKey}` },
      });
      if (!r.ok) return res.json({ models: [] });
      const j = await r.json();
      const list = (j.data || []).map(m => m.id).sort();
      return res.json({ models: list });
    }
  } catch {
    res.json({ models: [] });
  }
});

// Is Ollama reachable? (so the UI can guide "install Ollama" vs "pull a model")
app.get('/api/rag/ollama', async (req, res) => {
  const cfg = loadConfig();
  try {
    const r = await fetch(`${cfg.local.baseUrl}/api/tags`);
    const j = r.ok ? await r.json() : { models: [] };
    res.json({ running: r.ok, models: (j.models || []).map((m) => m.name) });
  } catch {
    res.json({ running: false, models: [] });
  }
});

// Download an Ollama model from inside the app — streams progress over SSE.
app.post('/api/rag/pull', async (req, res) => {
  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'model required' });
  const cfg = loadConfig();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const r = await fetch(`${cfg.local.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
    if (!r.ok) { send('error', { error: `Ollama responded ${r.status}` }); return res.end(); }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let j; try { j = JSON.parse(line); } catch { continue; }
        const percent = j.total && j.completed ? Math.round((j.completed / j.total) * 100) : null;
        send('progress', { status: j.status || '', percent });
        if (j.status === 'success') { send('done', {}); return res.end(); }
        if (j.error) { send('error', { error: j.error }); return res.end(); }
      }
    }
    send('done', {});
    res.end();
  } catch (e) {
    send('error', { error: 'Cannot reach Ollama. Is it installed and running?' });
    res.end();
  }
});

// --- Media routes: user-added wallpapers + music ---
const MEDIA_TYPES = new Set(['wallpapers', 'music', 'ambient']);

app.get('/api/media/:type', (req, res) => {
  if (!MEDIA_TYPES.has(req.params.type)) return res.status(400).json({ error: 'bad type' });
  res.json(loadMedia()[req.params.type]);
});

app.post('/api/media/:type', upload.single('file'), (req, res) => {
  const type = req.params.type;
  if (!MEDIA_TYPES.has(type)) return res.status(400).json({ error: 'bad type' });
  if (!req.file) return res.status(400).json({ error: 'no file' });
  // URL-safe stored filename (no spaces) so it serves cleanly; keeps extension.
  const safeFile = req.file.originalname.replace(/[^\w.\-]+/g, '_');
  const id = crypto.randomBytes(5).toString('hex');
  const stored = `${id}__${safeFile}`;
  fs.writeFileSync(path.join(MEDIA_DIR, type, stored), req.file.buffer);
  const media = loadMedia();
  // Display name: the user's typed name, else the filename without extension.
  const custom = req.body && req.body.name ? String(req.body.name).replace(/[^\w.\- ]+/g, '_').trim().slice(0, 60) : '';
  const fallback = req.file.originalname.replace(/\.[^.]+$/, '');
  const entry = { id, name: custom || fallback, file: stored };
  media[type].push(entry);
  saveMedia(media);
  res.json(entry);
});

app.delete('/api/media/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (!MEDIA_TYPES.has(type)) return res.status(400).json({ error: 'bad type' });
  const media = loadMedia();
  const entry = media[type].find((e) => e.id === id);
  if (entry) {
    const p = path.join(MEDIA_DIR, type, entry.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    media[type] = media[type].filter((e) => e.id !== id);
    saveMedia(media);
  }
  res.json({ ok: true });
});

app.get('/api/media/file/:type/:name', (req, res) => {
  const { type, name } = req.params;
  if (!MEDIA_TYPES.has(type)) return res.status(400).send('bad type');
  // Prevent path traversal — only serve plain filenames from the media dir.
  const p = path.join(MEDIA_DIR, type, path.basename(name));
  if (!fs.existsSync(p)) return res.status(404).send('not found');
  res.sendFile(p);
});

app.get('/api/rag/books', (req, res) => res.json(store.listBooks()));

app.delete('/api/rag/books/:id', (req, res) => {
  store.deleteBook(req.params.id);
  res.json({ ok: true });
});

app.get('/api/rag/pdf/:id', (req, res) => {
  const p = path.join(DATA_DIR, 'chunks', req.params.id + '.pdf');
  if (!fs.existsSync(p)) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(p).pipe(res);
});

app.post('/api/rag/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const cfg = loadConfig();
    const buf = req.file.buffer;

    // Extract text page-by-page (via a custom pagerender) so every chunk can
    // remember which page it came from — that's what makes "go to source" work.
    const pageTexts = [];
    const pagerender = (pageData) =>
      pageData.getTextContent().then((tc) => {
        const text = tc.items.map((it) => it.str).join(' ');
        pageTexts.push({ page: pageData.pageNumber || pageTexts.length + 1, text });
        return text; // keep parsed.text populated too
      });
    const parsed = await pdfParse(buf, { pagerender });

    pageTexts.sort((a, b) => a.page - b.page);
    const chunks = pageTexts.length
      ? chunkPages(pageTexts, cfg.chunkSize, cfg.chunkOverlap)
      : chunk(parsed.text, cfg.chunkSize, cfg.chunkOverlap);
    if (!chunks.length) return res.status(400).json({ error: 'no text extracted from PDF' });

    const id = crypto.randomBytes(6).toString('hex');
    const embeddings = [];
    const BATCH = cfg.mode === 'local' ? 48 : 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vecs = await embed(batch.map(c => c.text), cfg, 'document');
      embeddings.push(...vecs);
    }
    const withEmb = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
    store.savePdf(id, buf);
    store.saveChunks(id, withEmb);
    const outline = await extractOutline(buf); // [] when the PDF has no bookmarks
    const book = {
      id,
      name: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      pages: parsed.numpages,
      outline,
    };
    store.addBook(book);
    res.json(book);
  } catch (e) {
    console.error('upload error:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Fold conversation context into a standalone search query, so a follow-up
// like "what about the second one?" retrieves the right passages instead of
// embedding a pronoun. Cheap non-streaming LLM call; falls back to the raw
// question on any hiccup.
async function rewriteFollowup(question, history, cfg) {
  if (!history.length) return question;
  const recent = history.slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  const messages = [
    { role: 'system', content: 'Rewrite the user\'s latest question into a single, standalone search query that spells out anything implied by the conversation (pronouns, "it", "that one", etc.). Reply with ONLY the query text — no quotes, no preamble. If it already stands alone, return it unchanged.' },
    { role: 'user', content: `Conversation so far:\n${recent}\n\nLatest question: ${question}\n\nStandalone search query:` },
  ];
  try {
    const out = await chat(messages, cfg);
    const q = (out || '').trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
    return q || question;
  } catch { return question; }
}

// LLM reranker: score a candidate pool and keep the k most relevant. One extra
// (non-streaming) call; falls back to the retrieval order if parsing fails.
async function rerankHits(question, hits, cfg, k) {
  if (hits.length <= k) return hits;
  const list = hits.map((h, i) => `[${i}] ${h.text.slice(0, 500)}`).join('\n\n');
  const messages = [
    { role: 'system', content: 'You rank passages by how useful they are for answering a question. Respond with ONLY a JSON array of the passage numbers, most useful first, e.g. [3,0,7]. No other text.' },
    { role: 'user', content: `Question: ${question}\n\nPassages:\n${list}\n\nJSON array of indices, best first:` },
  ];
  let order;
  try {
    const out = await chat(messages, cfg);
    const m = (out || '').match(/\[[\d,\s]*\]/);
    order = m ? JSON.parse(m[0]) : null;
  } catch { order = null; }
  if (!Array.isArray(order)) return hits.slice(0, k);
  const picked = [];
  for (const i of order) if (hits[i] && !picked.includes(hits[i])) picked.push(hits[i]);
  for (const h of hits) if (!picked.includes(h)) picked.push(h); // safety net
  return picked.slice(0, k);
}

app.post('/api/rag/chat', async (req, res) => {
  try {
    const { bookId, question, history = [] } = req.body || {};
    if (!bookId || !question) return res.status(400).json({ error: 'bookId and question required' });
    const cfg = loadConfig();

    const searchQuery = cfg.rewriteFollowups
      ? await rewriteFollowup(question, history, cfg)
      : question;

    const doRerank = await rerankEnabled(cfg);
    const [qVec] = await embed([searchQuery], cfg, 'query');
    const poolSize = doRerank ? Math.max(cfg.rerankPool, cfg.topK) : cfg.topK;
    const allBooks = bookId === ALL_BOOKS;
    let hits = allBooks
      ? store.searchAll(qVec, searchQuery, poolSize)
      : store.search(bookId, qVec, searchQuery, poolSize);
    if (!hits.length) {
      return res.status(404).json({ error: allBooks
        ? 'no books have finished indexing yet'
        : 'this book has not finished indexing yet' });
    }
    if (doRerank) hits = await rerankHits(searchQuery, hits, cfg, cfg.topK);

    // Number the passages so the model can cite them inline as [1], [2], …
    // and the UI can turn those markers into clickable jumps to the source.
    const context = hits
      .map((h, i) => `[${i + 1}]${allBooks && h.bookName ? ` (from "${h.bookName.replace(/\.pdf$/i, '')}")` : ''}\n${h.text}`)
      .join('\n\n---\n\n');
    const system = `You are a warm, concise reading companion who has read the user's book${allBooks ? 's' : ''}. Answer using ONLY the numbered passages below. Write naturally, as if you simply know the material — don't talk about "passages" or "excerpts". After each sentence or claim, add the bracketed number(s) of the passage it came from, like [1] or [2][3]. Only cite numbers that appear below. If the answer isn't in what you were given, say so plainly and kindly.`;
    const user = `Passages:\n\n${context}\n\n---\n\nQuestion: ${question}`;
    const messages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: user },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: citations\ndata: ${JSON.stringify(hits.map((h, i) => ({
      label: i + 1, idx: h.idx, snippet: h.text.slice(0, 240), page: h.page,
      bookId: h.bookId, bookName: h.bookName,
    })))}\n\n`);

    await chat(messages, cfg, (tok) => {
      res.write(`event: token\ndata: ${JSON.stringify({ t: tok })}\n\n`);
    });
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (e) {
    console.error('chat error:', e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(e.message || e) })}\n\n`);
      res.end();
    } catch {
      if (!res.headersSent) res.status(500).json({ error: String(e.message || e) });
    }
  }
});

// --- Study tools: summaries + quizzes over a chapter / page range ---------

// Detected hardware + model suggestions, so the settings UI can point a
// non-technical user at a model that will actually run well for them.
app.get('/api/rag/hardware', async (req, res) => {
  const hw = await detectHardware();
  res.json({ ...hw, recommend: recommendModels(hw) });
});

// Group chunks into text blocks under maxChars, preserving reading order.
function packChunks(chunks, maxChars) {
  const groups = [];
  let cur = '';
  for (const c of chunks) {
    if (cur && cur.length + c.text.length > maxChars) { groups.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + c.text;
  }
  if (cur) groups.push(cur);
  return groups;
}

// Summarize a range. Single block → one streamed pass. Many blocks → map-reduce:
// summarize each block to bullets, then stream a final combined summary.
async function mapReduceSummary(chunks, cfg, label, onProgress, onToken) {
  const scope = label ? ` of "${label}"` : '';
  const groups = packChunks(chunks, 6000);
  if (groups.length <= 1) {
    return chat([
      { role: 'system', content: `You are a thoughtful reading companion. Write a clear, concise summary${scope} for a student — the key ideas in a few short paragraphs. Plain language, no preamble.` },
      { role: 'user', content: groups[0] || '' },
    ], cfg, onToken);
  }
  const partials = [];
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(`reading part ${i + 1} of ${groups.length}…`);
    // eslint-disable-next-line no-await-in-loop
    const p = await chat([
      { role: 'system', content: 'Summarize this part of a longer text into 3–5 tight bullet points capturing its key ideas. No preamble.' },
      { role: 'user', content: groups[i] },
    ], cfg);
    partials.push(p);
  }
  onProgress?.('writing the summary…');
  return chat([
    { role: 'system', content: `You are a thoughtful reading companion. Using these notes${scope}, write a clear, concise summary for a student — the key ideas in a few short paragraphs. Plain language, no preamble, and don't mention "notes".` },
    { role: 'user', content: partials.join('\n\n') },
  ], cfg, onToken);
}

app.post('/api/rag/summarize', async (req, res) => {
  try {
    const { bookId, from = null, to = null, label = '' } = req.body || {};
    if (!bookId) return res.status(400).json({ error: 'bookId required' });
    const cfg = loadConfig();
    const chunks = store.chunksInRange(bookId, from, to);
    if (!chunks.length) return res.status(404).json({ error: 'no text found for that range' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders?.();
    const send = (e, d) => res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
    try {
      await mapReduceSummary(chunks, cfg, label, (s) => send('progress', { status: s }), (t) => send('token', { t }));
      send('done', {});
    } catch (e) {
      send('error', { error: String(e.message || e) });
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e.message || e) });
  }
});

// Parse "Q: …\nA: …" pairs out of a model's reply, tolerantly.
function parseQuiz(text) {
  const items = [];
  const re = /Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*?)(?=\n\s*Q:|$)/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const q = m[1].trim();
    const a = m[2].trim();
    if (q && a) items.push({ q, a });
  }
  return items;
}

app.post('/api/rag/quiz', async (req, res) => {
  try {
    const { bookId, from = null, to = null, count = 5 } = req.body || {};
    if (!bookId) return res.status(400).json({ error: 'bookId required' });
    const cfg = loadConfig();
    const chunks = store.chunksInRange(bookId, from, to);
    if (!chunks.length) return res.status(404).json({ error: 'no text found for that range' });
    const n = Math.max(1, Math.min(15, parseInt(count, 10) || 5));
    const text = chunks.map((c) => c.text).join('\n\n').slice(0, 8000);
    const out = await chat([
      { role: 'system', content: `You are a study-guide author. From the text the user provides, write exactly ${n} exam-style questions that test real understanding, each with a short model answer grounded in the text. Format EACH item EXACTLY as two lines:\nQ: <question>\nA: <answer>\nNo numbering, no headers, nothing else.` },
      { role: 'user', content: text },
    ], cfg);
    const questions = parseQuiz(out);
    if (!questions.length) return res.status(502).json({ error: 'could not generate questions — try a different range or model' });
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.RAG_PORT || 5001;
app.listen(PORT, () => {
  console.log(`RAG server on http://localhost:${PORT}`);
  const cfg = loadConfig();
  console.log(`  mode=${cfg.mode}`);
  if (cfg.mode === 'local') {
    console.log(`  ollama=${cfg.local.baseUrl}  embed=${cfg.local.embedModel}  chat=${cfg.local.chatModel}`);
  } else {
    console.log(`  api=${cfg.api.baseUrl}  embed=${cfg.api.embedModel}  chat=${cfg.api.chatModel}  key=${cfg.api.apiKey ? 'set' : 'MISSING'}`);
  }
  Promise.all([hasGpu(), rerankEnabled(cfg)]).then(([gpu, rr]) => {
    console.log(`  gpu=${gpu ? 'yes' : 'no'}  rerank=${cfg.rerank}${cfg.rerank === 'auto' ? ` (→ ${rr ? 'on' : 'off'})` : ''}`);
  });
});
