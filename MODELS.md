# Models, GPU, and shipping — a plain guide

This covers three things people always ask about Lumen's AI:

1. [Does it use my GPU / CUDA?](#-does-it-use-my-gpu--cuda)
2. [How do I download a model?](#-how-to-download-a-model)
3. [Is it ready to ship as a downloadable app?](#-is-it-shipping-ready)

---

## 🖥️ Does it use my GPU / CUDA?

**Yes — automatically, and you don't configure anything in Lumen.**

Lumen doesn't run the model itself. It talks to **[Ollama](https://ollama.com)** over
`http://localhost:11434`, and *Ollama* decides where the model runs. Ollama detects
your hardware on startup and uses the fastest backend it can:

| Hardware | Backend Ollama uses | Notes |
|---|---|---|
| NVIDIA GPU | **CUDA** | Needs a recent NVIDIA driver. This is the fast path. |
| AMD GPU | ROCm | Linux + supported cards. |
| Apple Silicon | Metal | Automatic on M-series Macs. |
| No GPU / too little VRAM | CPU | Slower, but works everywhere. |

So on a machine with an NVIDIA card and current drivers, the chat model already
runs on CUDA the moment you pull it — no flag, no setting.

### How to confirm it's actually on the GPU

Run this while a chat is generating (or right after asking a question):

```bash
ollama ps
```

Look at the **PROCESSOR** column:

- `100% GPU` → running on CUDA/Metal/ROCm 🎉
- `100% CPU` → running on CPU (see why below)
- `48%/52% CPU/GPU` → split, because the model didn't fully fit in VRAM

You can also watch the GPU directly:

```bash
nvidia-smi
```

If Ollama is using CUDA you'll see an `ollama` process listed with VRAM allocated.

### If it falls back to CPU when you expected GPU

Common causes, in order:

1. **Not enough VRAM.** `llama3.2` (3B) wants ~4 GB free. On a 4 GB card with a
   browser open it may spill to CPU. Fix: close VRAM hogs, or use a smaller model
   (`llama3.2:1b`).
2. **Old / missing NVIDIA driver.** Update to the latest Game Ready or Studio driver.
3. **Laptop on integrated graphics.** Force the dGPU for `ollama.exe` in
   Windows *Graphics settings → per-app GPU preference*.

You rarely need to touch these, but Ollama exposes env vars if you want manual
control (set them before `ollama serve`):

- `OLLAMA_NUM_GPU` — number of layers to offload to GPU (higher = more on GPU)
- `CUDA_VISIBLE_DEVICES` — pick which GPU to use on multi-GPU rigs

> **API mode uses no local GPU at all.** If you point Lumen at OpenAI/Groq/etc. in
> ⚙ settings, the model runs on their servers and your machine does no inference.

---

## 📥 How to download a model

Lumen needs **two** models: one for **embeddings** (understanding the PDF) and one
for **chat** (answering you).

### 1. Install Ollama

Download it from **[ollama.com/download](https://ollama.com/download)** and install.
On Windows/macOS it runs in the background automatically. (Lumen will also try to
start it for you if it's installed but not running.)

### 2. Pull the two models

Open a terminal and run:

```bash
ollama pull nomic-embed-text
```

```bash
ollama pull llama3.2
```

- **`nomic-embed-text`** — the embedding model. Tiny (~275 MB), fast, required.
- **`llama3.2`** — the chat model (3B, ~2 GB). Good default for most laptops.

That's everything. Ollama caches models under your user folder, so you only
download each once.

> On Windows, if `ollama` isn't found in your terminal, pull through its API instead:
> ```bash
> curl http://localhost:11434/api/pull -d "{\"name\":\"nomic-embed-text\"}"
> ```

### 3. Point Lumen at them

Open the chat panel, click **⚙**, choose **Local (Ollama)**, hit **↻ Refresh
models**, and pick your chat model from the list. The embedding model is set the
same way. Done.

### Picking a different chat model

Any Ollama model works — just `ollama pull <name>` then select it in ⚙. Rough guide:

| Model | Size | Good for |
|---|---|---|
| `llama3.2:1b` | ~1.3 GB | Old/low-VRAM laptops, fastest |
| `llama3.2` (3b) | ~2 GB | **Default** — balanced |
| `llama3.1:8b` | ~4.7 GB | Better answers, needs ~6 GB VRAM |
| `qwen2.5:7b` | ~4.7 GB | Strong reasoning alternative |
| `phi3.5` | ~2.2 GB | Small but sharp |

Keep the embedding model as `nomic-embed-text` unless you know why you're changing
it — if you switch embedding models you must re-index (delete and re-add) your books,
because old and new embeddings aren't comparable.

---

## 📦 Is it shipping-ready?

**Short answer: it *builds* into real installers today, but it's not yet a polished
public release.** Here's the honest status.

### What already works

Run:

```bash
npm run dist
```

and electron-builder produces installers in `dist-electron/`:

- **Windows** → `Lumen Setup <version>.exe` (NSIS, user picks install dir)
- **Linux** → `.AppImage` (portable) and `.deb`

The Electron shell bundles the RAG backend, uses Electron's own Node (so end users
don't need Node installed), starts/stops everything for you, and stores data in the
OS user-data folder. That part is genuinely ship-shaped.

### What's missing before you'd hand it to strangers

| Gap | Impact | Effort |
|---|---|---|
| **No app icon** | Generic Electron icon in taskbar/installer | Low — drop `icon.ico`/`icon.png` in `build/` and reference it in `package.json > build`. |
| **Not code-signed** | Windows SmartScreen "unknown publisher" warning; scary for users | Medium — needs a code-signing cert (paid). |
| **No macOS build** | Only Windows + Linux targets defined | Medium — add a `mac` target + notarization (Apple Developer account). |
| **Ollama + models not bundled** | First-run chat does nothing until the user separately installs Ollama and pulls models | Medium — needs an onboarding screen that detects Ollama and offers to pull models, or a bundled runtime. |
| **Auto-update** | No update channel; users must re-download to upgrade | Medium — `electron-updater` + a release host. |
| **CRA is unmaintained** | Build shows deprecation warnings; fine for now, not future-proof | Low now, higher later. |

### Verdict

- **For yourself / friends / a GitHub Releases "here's a build" link:** yes, ship it —
  `npm run dist` gives a working installer. Just tell people they need Ollama +
  `ollama pull` (this guide covers it).
- **For a wide public / "download and it just works" audience:** not yet. The two
  real blockers are **code-signing** (trust) and **the Ollama/model first-run
  experience** (nothing happens until they set up a model). Those are the things to
  fix next.
