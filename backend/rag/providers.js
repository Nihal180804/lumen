// Two providers: 'local' (Ollama) and 'api' (OpenAI-compatible).
// Node 18+ required (built-in fetch).

// Run an async fn over items with a bounded concurrency pool (keeps order).
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
  return results;
}

async function embedOneOllama(text, cfg) {
  let r;
  try {
    r = await fetch(`${cfg.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.embedModel, prompt: text }),
    });
  } catch (e) {
    throw new Error(`Cannot reach Ollama at ${cfg.baseUrl}. Is 'ollama serve' running?`);
  }
  if (!r.ok) throw new Error(`Ollama embed error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  if (!j.embedding) throw new Error(`Ollama returned no embedding. Is the model '${cfg.embedModel}' pulled? (ollama pull ${cfg.embedModel})`);
  return j.embedding;
}

async function ollamaEmbed(texts, cfg) {
  // Fire several requests at once so a multi-core CPU (or Ollama's parallel
  // slots) stays busy instead of idling between sequential calls.
  const concurrency = cfg.concurrency || 6;
  return mapPool(texts, concurrency, (text) => embedOneOllama(text, cfg));
}

async function apiEmbed(texts, cfg) {
  if (!cfg.apiKey) throw new Error('API key not set. Open the chat settings and add one.');
  const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.embedModel, input: texts }),
  });
  if (!r.ok) throw new Error(`API embed error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data.map(d => d.embedding);
}

async function ollamaChat(messages, cfg, onToken) {
  let r;
  try {
    r = await fetch(`${cfg.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.chatModel, messages, stream: true }),
    });
  } catch (e) {
    throw new Error(`Cannot reach Ollama at ${cfg.baseUrl}. Is 'ollama serve' running?`);
  }
  if (!r.ok) throw new Error(`Ollama chat error ${r.status}: ${await r.text()}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const tok = j.message?.content || '';
      if (tok) { full += tok; onToken?.(tok); }
      if (j.done) return full;
    }
  }
  return full;
}

async function apiChat(messages, cfg, onToken) {
  if (!cfg.apiKey) throw new Error('API key not set. Open the chat settings and add one.');
  const r = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model: cfg.chatModel, messages, stream: true }),
  });
  if (!r.ok) throw new Error(`API chat error ${r.status}: ${await r.text()}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split('\n');
    buf = events.pop();
    for (const line of events) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      const tok = j.choices?.[0]?.delta?.content || '';
      if (tok) { full += tok; onToken?.(tok); }
    }
  }
  return full;
}

async function embed(texts, config) {
  return config.mode === 'local'
    ? ollamaEmbed(texts, config.local)
    : apiEmbed(texts, config.api);
}

async function chat(messages, config, onToken) {
  return config.mode === 'local'
    ? ollamaChat(messages, config.local, onToken)
    : apiChat(messages, config.api, onToken);
}

module.exports = { embed, chat };
