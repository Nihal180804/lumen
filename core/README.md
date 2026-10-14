# Lumen Core — RAG console

A barebones, performance-focused front end for the same local RAG engine that
powers Lumen — **no Electron, no music, themes, notes, planner, or timer**. Just
the retrieval pipeline, exposed with full telemetry.

It's one static `index.html` (no build step) that talks to the Node/Express RAG
server in [`../backend/rag`](../backend/rag). The engine is identical to the
desktop app's: page-aware chunking, hybrid dense + BM25 retrieval fused with
RRF, optional GPU-gated LLM reranking, and SSE-streamed, citation-grounded
answers against a local Ollama model (or any OpenAI-compatible API).

## Why it exists

The desktop app optimizes for ambience. This optimizes for **seeing the
machine work**. Every answer shows:

- **Retrieval latency**, broken down: query rewrite → embed → vector/keyword
  search → rerank.
- **Generation metrics**: time-to-first-token, generation time, tok/s, token
  count, end-to-end total.
- **Retrieved passages** with their fused similarity scores and source pages.
- **Hardware & config**: mode, model, GPU/VRAM (or CPU/RAM), rerank state.

## Run

```bash
cd backend && npm install && npm run rag
```

Then open **http://localhost:5001/core**. Drop in a PDF, pick it, and query.

Point it at a model the same way as the desktop app — local Ollama is the
default (`ollama pull llama3.2 && ollama pull nomic-embed-text`), or set API
mode in `backend/rag-data/config.json`. See [`../MODELS.md`](../MODELS.md).

> The telemetry is server-measured (`process.hrtime`) and streamed over the
> same SSE channel as the answer, so the numbers reflect the backend, not
> browser paint time. `tok/s` is stream-chunks per second — a close proxy for
> tokens on Ollama.
