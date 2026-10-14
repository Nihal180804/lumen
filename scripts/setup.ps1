# Install Ollama (if needed), start it, and pull the models Lumen uses for local
# mode. Extra model names given as arguments are pulled too.
#   npm run setup                    # nomic-embed-text + llama3.2
#   npm run setup -- qwen2.5:7b      # ...plus qwen2.5:7b
param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $ExtraModels)
$ErrorActionPreference = 'Stop'

$models = @('nomic-embed-text', 'llama3.2') + $ExtraModels
$ollamaUrl = if ($env:OLLAMA_URL) { $env:OLLAMA_URL } else { 'http://localhost:11434' }

Write-Host '==> Lumen local-AI setup'

# Resolve the ollama CLI (it may not be on PATH in this session right after install).
function Get-Ollama {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $guess = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
  if (Test-Path $guess) { return $guess }
  return $null
}

# 1. Ensure the Ollama runtime is installed.
$ollama = Get-Ollama
if (-not $ollama) {
  Write-Host '==> Installing Ollama…'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
  } else {
    $url = 'https://ollama.com/download/OllamaSetup.exe'
    $tmp = Join-Path $env:TEMP 'OllamaSetup.exe'
    Write-Host "    downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $tmp
    Start-Process -FilePath $tmp -ArgumentList '/VERYSILENT', '/NORESTART' -Wait
  }
  $ollama = Get-Ollama
  if (-not $ollama) {
    Write-Host '!! Ollama installed but not found on PATH. Close and reopen your terminal, then re-run.' -ForegroundColor Yellow
    exit 1
  }
} else {
  Write-Host '==> Ollama already installed.'
}

function Test-Ollama {
  try { Invoke-WebRequest -UseBasicParsing "$ollamaUrl/api/tags" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

# 2. Make sure the server is answering.
if (-not (Test-Ollama)) {
  Write-Host "==> Starting 'ollama serve'…"
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 30; $i++) { if (Test-Ollama) { break }; Start-Sleep -Milliseconds 500 }
}
if (-not (Test-Ollama)) {
  Write-Host "!! Ollama did not come up at $ollamaUrl. Start it manually ('ollama serve') and re-run." -ForegroundColor Yellow
  exit 1
}

# 3. Pull the models (idempotent — skips what's already present).
foreach ($m in $models) {
  Write-Host "==> Pulling $m…"
  & $ollama pull $m
}

Write-Host '==> Done. Lumen local mode is ready (nomic-embed-text runs the embeddings; no LM Studio needed).'
