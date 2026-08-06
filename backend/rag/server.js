const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const { chunk, chunkPages } = require('./chunker');
const { Store } = require('./store');
const { embed, chat } = require('./providers');

// RAG_DATA_DIR is set by the Electron shell to the OS user-data dir so the
// index is writable when the app is installed. Falls back to a local folder
// for the standalone `npm run rag` workflow.
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

const store = new Store(DATA_DIR);
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

app.get('/api/rag/config', (req, res) => {
  const c = loadConfig();
  res.json({
    ...c,
    api: { ...c.api, apiKey: c.api.apiKey ? '••••••' : '' },
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
      const vecs = await embed(batch.map(c => c.text), cfg);
      embeddings.push(...vecs);
    }
    const withEmb = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
    store.savePdf(id, buf);
    store.saveChunks(id, withEmb);
    const book = {
      id,
      name: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      pages: parsed.numpages,
    };
    store.addBook(book);
    res.json(book);
  } catch (e) {
    console.error('upload error:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post('/api/rag/chat', async (req, res) => {
  try {
    const { bookId, question, history = [] } = req.body || {};
    if (!bookId || !question) return res.status(400).json({ error: 'bookId and question required' });
    const cfg = loadConfig();

    const [qVec] = await embed([question], cfg);
    const hits = store.search(bookId, qVec, cfg.topK);
    if (!hits.length) return res.status(404).json({ error: 'this book has not finished indexing yet' });

    const context = hits.map(h => h.text).join('\n\n---\n\n');
    const system = `You are a warm, concise reading companion who has read the user's book. Answer their question using ONLY the passages provided below. Write naturally, in your own words, as if you simply know the book. Never mention "passages", "excerpts", "chunks", "context", or numbers/labels for them — just answer. If the answer isn't in what you were given, say so plainly and kindly.`;
    const user = `Passages from the book:\n\n${context}\n\n---\n\nQuestion: ${question}`;
    const messages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: user },
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: citations\ndata: ${JSON.stringify(hits.map(h => ({
      idx: h.idx, snippet: h.text.slice(0, 240), page: h.page,
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
});
