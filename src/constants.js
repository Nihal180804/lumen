// Assets bundled in public/ must be referenced relative to PUBLIC_URL so they
// resolve under Electron's file:// protocol. A leading "/" points at the
// filesystem root there (breaking wallpapers + music in the packaged app);
// PUBLIC_URL is "" in dev and "." in the build, so this works in both.
const ASSET = process.env.PUBLIC_URL || '';

export const TRACKS = [
  { src: `${ASSET}/music/lofi1.mp3`, name: 'Track 1' },
  { src: `${ASSET}/music/lofi2.mp3`, name: 'Track 2' },
  { src: `${ASSET}/music/lofi3.mp3`, name: 'Track 3' },
  { src: `${ASSET}/music/lofi4.mp3`, name: 'Track 4' },
  { src: `${ASSET}/music/lofi5.mp3`, name: 'Track 5' },
  { src: `${ASSET}/music/lofi6.mp3`, name: 'Track 6' },
  { src: `${ASSET}/music/lofi7.mp3`, name: 'Track 7' },
  { src: `${ASSET}/music/lofi8.mp3`, name: 'Track 8' },
];

export const BACKGROUNDS = [
  { file: 'background1.gif', name: 'Blue Lagoon' },
  { file: 'background4.gif', name: 'Cafe' },
  { file: 'background6.gif', name: 'Beachside Living Room' },
  { file: 'background7.gif', name: 'Sunset Window' },
  { file: 'background8.gif', name: 'Midnight Street' },
  { file: 'cozy-sofa.png', name: 'Cozy Sofa' },
  { file: 'elf-kingdom.jpg', name: 'Elf Kingdom' },
];

export const DEFAULT_BACKGROUND = `${ASSET}/images/background7.gif`;
