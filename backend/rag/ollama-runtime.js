// Ollama lifecycle helpers shared by the RAG server (used by both the desktop
// app and the standalone / "core" web version). Keeps local mode working with
// zero manual terminal steps: detect the binary, start `ollama serve` if it's
// installed but not running, and report which models are present vs missing.
//
// Installing the Ollama *runtime* itself is intentionally NOT done here — that
// needs a platform installer and sometimes admin rights. See scripts/setup.* .
const { spawn, spawnSync } = require('child_process');

// Is the Ollama HTTP API answering? (Node 18+ global fetch.)
async function isOllamaUp(baseUrl = 'http://localhost:11434') {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

// Is the `ollama` CLI on PATH?
function isOllamaInstalled() {
  try {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama'],
      { timeout: 3000, windowsHide: true });
    return which.status === 0;
  } catch { return false; }
}

// Best-effort: if Ollama is installed but not answering, spawn `ollama serve`
// and wait briefly for it to come up. Returns true if it's up afterwards.
// Idempotent and safe to call when something else already started it.
let started = null;
async function ensureOllamaRunning(baseUrl = 'http://localhost:11434', { waitMs = 8000 } = {}) {
  if (await isOllamaUp(baseUrl)) return true;
  if (!isOllamaInstalled()) return false;
  try {
    if (!started) {
      started = spawn('ollama', ['serve'], { detached: false, stdio: 'ignore' });
      started.on('error', () => { started = null; });
    }
  } catch { return isOllamaUp(baseUrl); }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 400));
    // eslint-disable-next-line no-await-in-loop
    if (await isOllamaUp(baseUrl)) return true;
  }
  return false;
}

// Names of installed models (tag-insensitive helpers below use these).
async function installedModels(baseUrl = 'http://localhost:11434') {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map((m) => m.name);
  } catch { return []; }
}

// A model counts as present if an installed tag matches it, treating a bare
// name ("llama3.2") as "llama3.2:latest".
function hasModel(installed, want) {
  const norm = (n) => (n.includes(':') ? n : `${n}:latest`);
  const target = norm(want);
  return installed.some((m) => norm(m) === target || m === want);
}

// Given the desired set, which are present and which still need pulling.
async function modelStatus(want, baseUrl = 'http://localhost:11434') {
  const installed = await installedModels(baseUrl);
  const present = [], missing = [];
  for (const m of want) (hasModel(installed, m) ? present : missing).push(m);
  return { present, missing, installed };
}

module.exports = {
  isOllamaUp, isOllamaInstalled, ensureOllamaRunning, installedModels, hasModel, modelStatus,
};
