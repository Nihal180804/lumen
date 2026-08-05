# RAG for Lumen

Chat with any PDF you drop into the app. Runs against a local model (Ollama) **or**
any OpenAI-compatible API — switch modes from the chat panel's ⚙ button.

## What it does

1. When a PDF is dropped into the app's drop area, the browser also POSTs it to
   `POST /api/rag/upload`.
2. The server extracts text with `pdf-parse`, chunks it (~800 chars, 100 overlap),
   embeds each chunk, and stores everything under `backend/rag-data/`.
3. Questions from the chat panel hit `POST /api/rag/chat`, which embeds the
   question, does cosine-similarity search over the selected book's chunks,
   builds a grounded prompt, and streams the answer back over SSE with citations.

No vector DB required — flat JSON on disk. Fine up to a few hundred books.

## Install

```bash
cd backend
npm install
```

This pulls in `express`, `cors`, `multer`, `pdf-parse`. Node **18+** required
(uses built-in `fetch`).

## Run

The desktop app (`npm run electron:dev` from the repo root) starts this server
for you automatically. To run it standalone during development:

```bash
# from backend/
npm run rag                   # http://localhost:5001
```

Then open the app, drag a PDF into the Files panel, click the 💬 button, and ask
a question.

## Choose a mode

Open the chat panel, click ⚙.

### Local (Ollama) — default

1. Install Ollama: https://ollama.com/download
2. `ollama serve` (usually auto-starts)
3. Pull models:
   ```bash
   ollama pull nomic-embed-text     # embeddings
   ollama pull llama3.2             # or qwen2.5, mistral, phi3, etc.
   ```
4. In the settings modal, keep mode=Local, verify the model names match what
   you pulled, save.

Trade-off: no network required, no per-token cost, slower on CPU. Embedding
a 300-page book on CPU can take a few minutes.

### API (OpenAI-compatible)

Works with any endpoint that speaks OpenAI's `/embeddings` and
`/chat/completions` shape — OpenAI itself, Groq, Together, OpenRouter,
LM Studio, vLLM.

In the settings modal, switch mode to API, fill in:

| Field       | OpenAI                                | Groq                                | OpenRouter                          |
| ----------- | ------------------------------------- | ----------------------------------- | ----------------------------------- |
| Base URL    | `https://api.openai.com/v1`           | `https://api.groq.com/openai/v1`    | `https://openrouter.ai/api/v1`      |
| API key     | `sk-...`                              | `gsk_...`                           | `sk-or-...`                         |
| Embed model | `text-embedding-3-small`              | (Groq has no embed — use OpenAI)    | `openai/text-embedding-3-small`     |
| Chat model  | `gpt-4o-mini`                         | `llama-3.1-70b-versatile`           | `anthropic/claude-3.5-sonnet`       |

The API key is stored in `backend/rag-data/config.json` on your machine.
The frontend only ever sees a masked value.

## Data layout

```
backend/rag-data/
  config.json            # provider settings (contains api key if using API mode)
  books.json             # [{id, name, uploadedAt, chunkCount, pages}]
  chunks/
    <bookId>.pdf         # the raw PDF
    <bookId>.json        # [{idx, text, embedding: [...]}]
```

Delete a book from the chat panel with the 🗑 button, or just delete the row
from `books.json` and the two files in `chunks/`.

## API

| Method | Path                     | Purpose                                      |
| ------ | ------------------------ | -------------------------------------------- |
| GET    | `/api/rag/config`        | Current config (API key masked)              |
| POST   | `/api/rag/config`        | Update config                                |
| GET    | `/api/rag/books`         | List indexed books                           |
| DELETE | `/api/rag/books/:id`     | Delete a book (PDF + chunks + metadata)      |
| GET    | `/api/rag/pdf/:id`       | Stream the stored PDF                        |
| POST   | `/api/rag/upload`        | multipart `file` — extract, chunk, embed     |
| POST   | `/api/rag/chat`          | `{bookId, question, history}` — SSE stream   |

Chat stream events:
- `event: citations` — sources used (chunk indices + snippets + scores)
- `event: token` — one token
- `event: done` — end of turn
- `event: error` — server-side error, then stream ends

## Known limitations / next steps

- **Page numbers, not chunk indices, would be nicer.** `pdf-parse` gives text
  in reading order but not per-page. Swap in `pdfjs-dist` and tag each chunk
  with its source page, then jump the iframe to `#page=N` when a citation is
  clicked.
- **No auth.** Anyone hitting `:5001` reads and writes books. Fine for
  localhost use; put behind auth before exposing.
- **In-process cosine search.** Fast enough for hundreds of books. If you go
  bigger, swap `store.search` for an actual vector DB (LanceDB, Qdrant,
  Mongo Atlas Vector Search).
- **No re-ranking.** For higher quality, add a re-ranker between retrieval
  and generation (e.g. `bge-reranker` locally, or Cohere Rerank via API).
