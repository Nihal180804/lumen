# Lumen desktop app (Windows / Linux)

The desktop build wraps the React UI and the RAG reading-assistant in a single
Electron app. One window to open, one to close — Electron starts the RAG server
for you and shuts it down on exit. No separate terminals, no port juggling.

It supports **any local model** (via Ollama) and **any OpenAI-compatible API**,
switchable at runtime from the chat panel's ⚙ button.

## How it's wired

```
Electron main process (electron/main.js)
├── spawns the RAG server  (backend/rag/server.js)  on a free port
├── detects / launches Ollama  (only if installed; API mode doesn't need it)
├── opens the window → your React UI (unchanged)
└── kills all children when the window closes
```

The React app finds the RAG server through a value injected by
`electron/preload.js` (`window.bookshelf.ragBase`), so the dynamically chosen
port just works. Outside Electron (plain `npm start`) it falls back to
`http://localhost:5001`, so the web workflow still works too.

Data (config, PDFs, embeddings) is stored in the OS user-data directory, not
inside the app bundle:

- Windows: `%APPDATA%\Lumen\rag-data\`
- Linux: `~/.config/Lumen/rag-data/`

## First-time setup

```bash
# frontend + electron tooling
npm install

# RAG server dependencies (express, multer, pdf-parse, cors)
cd backend && npm install && cd ..
```

Node 18+ is required (the RAG server uses built-in `fetch`).

## Run in development

```bash
npm run electron:dev
```

This starts the CRA dev server (hot reload), waits for it, then launches
Electron pointed at it. The RAG server is spawned by Electron automatically.

## Build installers

```bash
npm run dist
```

Output lands in `dist-electron/`:

- **Windows** → `Lumen-<version>-win-x64.exe` (NSIS installer, user-choosable
  install dir)
- **Linux** → `Lumen-<version>-linux-x86_64.AppImage` (portable) and `.deb`

Note: electron-builder builds for the OS you run it on. Build the Windows
installer on Windows and the Linux ones on Linux (or use CI / a Linux VM).

**Icon:** drop a square `icon.png` (≥512×512) into `build-resources/` and the
installer, window, and taskbar entry all pick it up automatically — see
[build-resources/README.md](build-resources/README.md).

## Using it

1. Launch the app.
2. Drag a PDF into the drop area (📂 button opens it). The PDF is indexed in the
   background.
3. Click 💬 to open the chat panel, pick the book, ask questions.
4. Click ⚙ to choose your model:
   - **Local (Ollama)** — install [Ollama](https://ollama.com), then the app
     auto-starts it. Hit **↻ Refresh models** to see everything you've pulled;
     pick from the list or type any model name.
   - **API** — paste any OpenAI-compatible base URL + key (OpenAI, Groq,
     Together, OpenRouter, LM Studio, vLLM). **↻ Refresh models** lists what the
     endpoint offers; you can also type any model id.

See [backend/rag/README.md](backend/rag/README.md) for the RAG internals and the
full provider/endpoint reference.
