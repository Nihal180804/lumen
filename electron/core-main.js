// Standalone "Lumen Core" app — a thin window over the performance RAG console.
// It boots the same RAG backend, auto-starts Ollama and pulls missing models,
// then loads the Aurora console served at <backend>/core. No cozy UI, no React
// build: the window just points at the served page.
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const isDev = !app.isPackaged;
let win = null;
let ragProc = null;
let ollamaProc = null;
let ragPort = 5001;
let ragBase = 'http://localhost:5001';

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => resolve(p)); });
    });
    srv.listen(preferred, '127.0.0.1', () => { srv.close(() => resolve(preferred)); });
  });
}

function ragServerPath() {
  return isDev
    ? path.join(__dirname, '..', 'backend', 'rag', 'server.js')
    : path.join(process.resourcesPath, 'backend', 'rag', 'server.js');
}

function waitForServer(base, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(base + '/api/rag/config', (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('RAG server did not start in time'));
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function startRagServer() {
  const serverPath = ragServerPath();
  const dataDir = path.join(app.getPath('userData'), 'rag-data');
  ragProc = spawn(process.execPath, [serverPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', RAG_PORT: String(ragPort), RAG_DATA_DIR: dataDir },
    cwd: path.dirname(serverPath),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ragProc.stdout.on('data', (d) => process.stdout.write(`[rag] ${d}`));
  ragProc.stderr.on('data', (d) => process.stderr.write(`[rag:err] ${d}`));
  ragProc.on('exit', () => { ragProc = null; });
}

function ensureOllama() {
  http.get('http://localhost:11434/api/tags', (res) => { res.resume(); })
    .on('error', () => {
      const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama']);
      if (which.status !== 0) { console.log('[ollama] not installed'); return; }
      try {
        ollamaProc = spawn('ollama', ['serve'], { detached: false, stdio: 'ignore' });
        ollamaProc.on('error', () => { ollamaProc = null; });
      } catch { /* ignore */ }
    });
}

function autoProvisionModels() {
  try {
    const u = new URL(ragBase + '/api/rag/provision');
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const j = JSON.parse(line.slice(6));
              if (j.model && j.status) process.stdout.write(`[provision] ${j.model}: ${j.status}${j.percent != null ? ` ${j.percent}%` : ''}\n`);
              else if (j.pulled) console.log(`[provision] ready (pulled: ${j.pulled.join(', ') || 'none'})`);
            } catch { /* ignore */ }
          }
        });
      },
    );
    req.on('error', () => {});
    req.end('{}');
  } catch { /* ignore */ }
}

function killChildren() {
  for (const p of [ragProc, ollamaProc]) {
    if (!p) continue;
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/f', '/t']);
      else p.kill('SIGTERM');
    } catch { /* ignore */ }
  }
  ragProc = null; ollamaProc = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 820, minHeight: 560,
    backgroundColor: '#0d0f10', title: 'Lumen Core',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.loadURL(`${ragBase}/core/`);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ragPort = await findFreePort(5001);
  ragBase = `http://localhost:${ragPort}`;
  startRagServer();
  ensureOllama();
  try {
    await waitForServer(ragBase);
    autoProvisionModels();
  } catch (e) {
    dialog.showErrorBox('Lumen Core', `The RAG service failed to start.\n\n${e.message}`);
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { killChildren(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', killChildren);
process.on('exit', killChildren);
