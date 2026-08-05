// Procedural ambient sounds via Web Audio — soft, gentle, no audio files.
// Each sound fades in/out (never abrupt) and slowly modulates so it feels
// natural rather than like static.

let ctx = null;
const nodes = {}; // name -> { src, gain, lfo? }

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Brown noise — much softer than white noise, like distant rain/wind.
function makeNoiseSource(c) {
  const len = 4 * c.sampleRate;
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 1.6; // gentler amplitude
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

// Per-sound tone shaping. `mod` adds a slow LFO for a living, breathing feel.
const SHAPES = {
  rain:  { type: 'lowpass',  freq: 1100, q: 0.4, level: 0.9,  mod: { rate: 0.08, depth: 180, on: 'freq' } },
  wind:  { type: 'bandpass', freq: 480,  q: 0.7, level: 0.85, mod: { rate: 0.05, depth: 220, on: 'freq' } },
  waves: { type: 'lowpass',  freq: 360,  q: 0.5, level: 1.0,  mod: { rate: 0.09, depth: 0.5, on: 'gain' } },
};

export const AMBIENT_SOUNDS = [
  { key: 'rain',  label: 'Rain',  icon: '🌧️' },
  { key: 'wind',  label: 'Wind',  icon: '🍃' },
  { key: 'waves', label: 'Waves', icon: '🌊' },
];

const FADE = 1.4; // seconds

export function setAmbient(name, on, volume = 0.5) {
  const c = ensureCtx();
  const target = Math.max(0, Math.min(1, volume)) * (SHAPES[name]?.level ?? 1);

  if (on) {
    if (!nodes[name]) {
      const shape = SHAPES[name] || SHAPES.rain;
      const src = makeNoiseSource(c);
      const filter = c.createBiquadFilter();
      filter.type = shape.type;
      filter.frequency.value = shape.freq;
      filter.Q.value = shape.q;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter).connect(gain).connect(c.destination);
      src.start();

      // Slow modulation so it isn't a flat drone.
      let lfo, lfoGain;
      if (shape.mod) {
        lfo = c.createOscillator();
        lfo.frequency.value = shape.mod.rate;
        lfoGain = c.createGain();
        lfoGain.gain.value = shape.mod.depth;
        lfo.connect(lfoGain);
        lfoGain.connect(shape.mod.on === 'gain' ? gain.gain : filter.frequency);
        lfo.start();
      }

      // Gentle fade-in — never sudden.
      const now = c.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, target), now + FADE);
      nodes[name] = { src, gain, lfo };
    } else {
      const now = c.currentTime;
      nodes[name].gain.gain.cancelScheduledValues(now);
      nodes[name].gain.gain.linearRampToValueAtTime(Math.max(0.0002, target), now + 0.3);
    }
  } else if (nodes[name]) {
    // Fade out, then tear down.
    const n = nodes[name];
    const now = c.currentTime;
    n.gain.gain.cancelScheduledValues(now);
    n.gain.gain.setValueAtTime(Math.max(0.0002, n.gain.gain.value), now);
    n.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    delete nodes[name];
    setTimeout(() => {
      try { n.src.stop(); } catch {}
      try { n.lfo && n.lfo.stop(); } catch {}
      try { n.gain.disconnect(); } catch {}
    }, 900);
  }
}

export function setAmbientVolume(name, volume) {
  if (!nodes[name] || !ctx) return;
  const target = Math.max(0, Math.min(1, volume)) * (SHAPES[name]?.level ?? 1);
  const now = ctx.currentTime;
  nodes[name].gain.gain.cancelScheduledValues(now);
  nodes[name].gain.gain.linearRampToValueAtTime(Math.max(0.0002, target), now + 0.2);
}
