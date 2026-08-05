// After a Lite build, remove the media the Lite edition doesn't ship, so the
// installer only bundles 2 tracks + 3 wallpapers. Keep this in sync with the
// LITE_MUSIC / LITE_WALLPAPERS lists in src/constants.js.
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const KEEP = {
  music: new Set(['lofi1.mp3', 'lofi2.mp3']),
  images: new Set(['background6.gif', 'cozy-sofa.png', 'elf-kingdom.jpg']),
};

function prune(sub, keep) {
  const dir = path.join(BUILD, sub);
  if (!fs.existsSync(dir)) return;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!keep.has(f)) {
      fs.rmSync(path.join(dir, f), { force: true, recursive: true });
      removed++;
    }
  }
  console.log(`[lite] ${sub}: kept ${keep.size}, removed ${removed}`);
}

prune('music', KEEP.music);
prune('images', KEEP.images);
console.log('[lite] build trimmed for the Lite edition.');
