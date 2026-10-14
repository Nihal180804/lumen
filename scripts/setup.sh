#!/usr/bin/env bash
# Install Ollama (if needed), start it, and pull the models Lumen uses for local
# mode. Extra model names given as arguments are pulled too.
#   scripts/setup.sh                 # nomic-embed-text + llama3.2
#   scripts/setup.sh qwen2.5:7b      # ...plus qwen2.5:7b
set -euo pipefail

DEFAULT_MODELS=(nomic-embed-text llama3.2)
MODELS=("${DEFAULT_MODELS[@]}" "$@")
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

echo "==> Lumen local-AI setup"

# 1. Ensure the Ollama runtime is installed.
if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Installing Ollama…"
  if [ "$(uname)" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install --cask ollama || brew install ollama || true
    fi
    if ! command -v ollama >/dev/null 2>&1; then
      echo "!! Could not install automatically. Please install from https://ollama.com/download and re-run." >&2
      exit 1
    fi
  else
    # Linux — official install script.
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  echo "==> Ollama already installed."
fi

# 2. Make sure the server is answering.
if ! curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "==> Starting 'ollama serve'…"
  (ollama serve >/dev/null 2>&1 &)
  for _ in $(seq 1 30); do
    curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
if ! curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "!! Ollama did not come up at $OLLAMA_URL. Start it manually ('ollama serve') and re-run." >&2
  exit 1
fi

# 3. Pull the models (idempotent — skips what's already present).
for m in "${MODELS[@]}"; do
  echo "==> Pulling $m…"
  ollama pull "$m"
done

echo "==> Done. Lumen local mode is ready (nomic-embed-text runs the embeddings; no LM Studio needed)."
