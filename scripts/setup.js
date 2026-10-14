#!/usr/bin/env node
// Cross-platform entry for `npm run setup`: installs Ollama (if missing),
// starts it, and pulls the models Lumen needs for local mode. Any extra model
// names passed through are pulled too, e.g. `npm run setup -- qwen2.5:7b`.
const { spawnSync } = require('child_process');
const path = require('path');

const extra = process.argv.slice(2);
const here = __dirname;
const isWin = process.platform === 'win32';

const cmd = isWin ? 'powershell' : 'bash';
const args = isWin
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'setup.ps1'), ...extra]
  : [path.join(here, 'setup.sh'), ...extra];

const r = spawnSync(cmd, args, { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
