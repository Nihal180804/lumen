// A default panel size that scales with the viewport, clamped to sane bounds —
// so a fresh panel starts smaller on a laptop and roomier on a big monitor,
// without ever overflowing a small screen. Persisted user sizes still win
// (see useResizable), this only sets the first-run default.
export function fluidSize(maxW = 300, maxH = 360) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  return {
    width: Math.round(Math.min(maxW, Math.max(220, vw * 0.24))),
    height: Math.round(Math.min(maxH, Math.max(240, vh * 0.5))),
  };
}
