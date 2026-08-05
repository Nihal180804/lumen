// Assets bundled in public/ must be referenced relative to PUBLIC_URL so they
// resolve under Electron's file:// protocol. A leading "/" points at the
// filesystem root there (breaking wallpapers + music in the packaged app);
// PUBLIC_URL is "" in dev and "." in the build, so this works in both.
const ASSET = process.env.PUBLIC_URL || '';

// Edition — set at build time (REACT_APP_EDITION=lite|full; default full).
// The Lite build ships a small subset of media; the rest is offered as
// downloadable packs. The two must stay in sync with scripts/strip-lite-assets.js.
const EDITION = process.env.REACT_APP_EDITION || 'full';
const LITE_MUSIC = ['lofi1.mp3', 'lofi2.mp3'];
const LITE_WALLPAPERS = ['background6.gif', 'cozy-sofa.png', 'elf-kingdom.jpg'];

const ALL_TRACKS = [
  { src: `${ASSET}/music/lofi1.mp3`, name: 'Track 1', file: 'lofi1.mp3' },
  { src: `${ASSET}/music/lofi2.mp3`, name: 'Track 2', file: 'lofi2.mp3' },
  { src: `${ASSET}/music/lofi3.mp3`, name: 'Track 3', file: 'lofi3.mp3' },
  { src: `${ASSET}/music/lofi4.mp3`, name: 'Track 4', file: 'lofi4.mp3' },
  { src: `${ASSET}/music/lofi5.mp3`, name: 'Track 5', file: 'lofi5.mp3' },
  { src: `${ASSET}/music/lofi6.mp3`, name: 'Track 6', file: 'lofi6.mp3' },
  { src: `${ASSET}/music/lofi7.mp3`, name: 'Track 7', file: 'lofi7.mp3' },
  { src: `${ASSET}/music/lofi8.mp3`, name: 'Track 8', file: 'lofi8.mp3' },
];

const ALL_BACKGROUNDS = [
  { file: 'background1.gif', name: 'Blue Lagoon' },
  { file: 'background4.gif', name: 'Cafe' },
  { file: 'background6.gif', name: 'Beachside Living Room' },
  { file: 'background7.gif', name: 'Sunset Window' },
  { file: 'background8.gif', name: 'Midnight Street' },
  { file: 'cozy-sofa.png', name: 'Cozy Sofa' },
  { file: 'elf-kingdom.jpg', name: 'Elf Kingdom' },
];

export const TRACKS = (EDITION === 'lite'
  ? ALL_TRACKS.filter((t) => LITE_MUSIC.includes(t.file))
  : ALL_TRACKS
).map(({ src, name }) => ({ src, name }));

export const BACKGROUNDS = EDITION === 'lite'
  ? ALL_BACKGROUNDS.filter((b) => LITE_WALLPAPERS.includes(b.file))
  : ALL_BACKGROUNDS;

// Default wallpaper — must exist in every edition, so it's one of the Lite set.
export const DEFAULT_BACKGROUND = `${ASSET}/images/cozy-sofa.png`;
