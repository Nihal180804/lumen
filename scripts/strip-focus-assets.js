// After a Focus build, remove ALL bundled music and wallpapers — the Focus
// edition uses none (solid themed backgrounds, no player). This is what makes
// the Focus installer dramatically smaller than full/lite.
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');

// Wallpaper/background images to drop. Keep app chrome (logos, favicon, cookie).
const KEEP_IMAGES = new Set([]);          // no wallpapers needed
const DROP_DIRS = ['music'];              // whole music folder goes

function rmDir(sub) {
  const dir = path.join(BUILD, sub);
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { force: true, recursive: true });
  console.log(`[focus] removed ${sub}/`);
}

function pruneImages() {
  const dir = path.join(BUILD, 'images');
  if (!fs.existsSync(dir)) return;
  let removed = 0, kept = 0;
  for (const f of fs.readdirSync(dir)) {
    if (KEEP_IMAGES.has(f)) { kept++; continue; }
    fs.rmSync(path.join(dir, f), { force: true, recursive: true });
    removed++;
  }
  console.log(`[focus] images: kept ${kept}, removed ${removed}`);
}

for (const d of DROP_DIRS) rmDir(d);
pruneImages();
console.log('[focus] build trimmed — no music, no wallpapers.');
