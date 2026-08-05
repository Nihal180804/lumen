// Built-in ambient loops — real recordings in public/audio/, looped with a
// gentle fade in/out. Same public interface as before (AMBIENT_SOUNDS +
// setAmbient/setAmbientVolume) so nothing else in the app has to change.

const ASSET = process.env.PUBLIC_URL || '';

export const AMBIENT_SOUNDS = [
  { key: 'rain',  label: 'Rain',  icon: '🌧️', file: 'rain.mp3' },
  { key: 'wind',  label: 'Wind',  icon: '🍃', file: 'wind.mp3' },
  { key: 'waves', label: 'Waves', icon: '🌊', file: 'waves.mp3' },
];

const FILE = Object.fromEntries(AMBIENT_SOUNDS.map((s) => [s.key, s.file]));
const els = {}; // key -> { audio, target, raf }

function ensure(key) {
  if (els[key]) return els[key];
  const audio = new Audio(`${ASSET}/audio/${FILE[key]}`);
  audio.loop = true;
  audio.preload = 'none'; // only fetch when first turned on
  audio.volume = 0;
  els[key] = { audio, target: 0, raf: 0 };
  return els[key];
}

// Ramp volume smoothly so sounds never snap on/off.
function fadeTo(entry, target, ms) {
  cancelAnimationFrame(entry.raf);
  const from = entry.audio.volume;
  const t0 = performance.now();
  const tick = (t) => {
    const k = ms <= 0 ? 1 : Math.min(1, (t - t0) / ms);
    entry.audio.volume = Math.max(0, Math.min(1, from + (target - from) * k));
    if (k < 1) entry.raf = requestAnimationFrame(tick);
  };
  entry.raf = requestAnimationFrame(tick);
}

export function setAmbient(name, on, volume = 0.5) {
  if (!FILE[name]) return;
  const entry = ensure(name);
  const vol = Math.max(0, Math.min(1, volume));
  if (on) {
    const starting = entry.audio.paused;
    entry.target = vol;
    // play() can reject before a user gesture — ignore; a later toggle works.
    if (starting) entry.audio.play().catch(() => {});
    fadeTo(entry, vol, starting ? 1200 : 180); // slow fade-in, snappy volume tweaks
  } else {
    entry.target = 0;
    fadeTo(entry, 0, 900);
    const { audio } = entry;
    setTimeout(() => { if (entry.target === 0 && audio.volume < 0.02) audio.pause(); }, 1000);
  }
}

export function setAmbientVolume(name, volume) {
  const entry = els[name];
  if (!entry) return;
  const vol = Math.max(0, Math.min(1, volume));
  entry.target = vol;
  fadeTo(entry, vol, 180);
}
