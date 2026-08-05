const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const isDev = !app.isPackaged;

let mainWindow = null;
let ragProc = null;       // the RAG express server child
let ollamaProc = null;    // ollama serve, only if WE started it
let ragPort = 5001;
let ragBase = 'http://localhost:5001';

// --- helpers ---------------------------------------------------------------

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      // preferred taken -> let the OS pick any free port
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => {
        const p = s2.address().port;
        s2.close(() => resolve(p));
      });
    });
    srv.listen(preferred, '127.0.0.1', () => {
      srv.close(() => resolve(preferred));
    });
  });
}

function ragServerPath() {
  // Structure (backend/rag/server.js + backend/node_modules) is preserved in
  // the packaged app via asarUnpack, so require() resolution still works.
  if (isDev) {
    return path.join(__dirname, '..', 'backend', 'rag', 'server.js');
  }
  return path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'rag', 'server.js');
}

function waitForServer(base, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(base + '/api/rag/config', (res) => {
        res.resume();
        resolve();
      });
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

  // Use Electron's bundled Node so no separate Node install is required.
  ragProc = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      RAG_PORT: String(ragPort),
      RAG_DATA_DIR: dataDir,
    },
    cwd: path.dirname(serverPath),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ragProc.stdout.on('data', (d) => process.stdout.write(`[rag] ${d}`));
  ragProc.stderr.on('data', (d) => process.stderr.write(`[rag:err] ${d}`));
  ragProc.on('exit', (code) => {
    console.log(`[rag] exited with code ${code}`);
    ragProc = null;
  });
}

// Best-effort: if Ollama is installed but not running, start it. Never blocks
// the app — API mode does not need Ollama at all.
function ensureOllama() {
  http.get('http://localhost:11434/api/tags', (res) => { res.resume(); })
    .on('error', () => {
      const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ollama']);
      if (which.status !== 0) {
        console.log('[ollama] not installed — local mode will need it, API mode is fine without it');
        return;
      }
      try {
        ollamaProc = spawn('ollama', ['serve'], { detached: false, stdio: 'ignore' });
        ollamaProc.on('error', () => { ollamaProc = null; });
        console.log('[ollama] started');
      } catch {
        console.log('[ollama] could not start automatically');
      }
    });
}

function killChildren() {
  for (const p of [ragProc, ollamaProc]) {
    if (!p) continue;
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(p.pid), '/f', '/t']);
      } else {
        p.kill('SIGTERM');
      }
    } catch { /* ignore */ }
  }
  ragProc = null;
  ollamaProc = null;
}

// --- window ----------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--rag-base=${ragBase}`],
    },
  });

  // Open external links (Spotify popup, etc.) in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// --- lifecycle -------------------------------------------------------------

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ragPort = await findFreePort(5001);
  ragBase = `http://localhost:${ragPort}`;

  startRagServer();
  ensureOllama();

  try {
    await waitForServer(ragBase);
  } catch (e) {
    dialog.showErrorBox('Lumen', `The reading assistant service failed to start.\n\n${e.message}`);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killChildren);
process.on('exit', killChildren);
