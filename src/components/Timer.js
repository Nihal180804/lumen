import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import './Timer.css';

const PRESETS = [
  { key: 'focus', label: 'Focus', mins: 25 },
  { key: 'short', label: 'Break', mins: 5 },
  { key: 'long',  label: 'Long',  mins: 50 },
];

function softChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two gentle notes, quick fade — warm, not alarming.
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* no audio — silent is fine */ }
}

export function Timer({ onClose, onComplete }) {
  const panelRef = useRef(null);
  const tapeRef = useRef(null);
  const intervalRef = useRef(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const { style } = useDraggable(tapeRef, panelRef, 'bookshelf.pos.timer');

  const [preset, setPreset] = useState(PRESETS[0]);
  const [remaining, setRemaining] = useState(PRESETS[0].mins * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const clear = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  useEffect(() => clear, []);

  // Count a completed pomodoro toward reading stats.
  useEffect(() => { if (done) completeRef.current?.(); }, [done]);

  const pickPreset = useCallback((p) => {
    clear();
    setPreset(p);
    setRemaining(p.mins * 60);
    setRunning(false);
    setDone(false);
  }, []);

  const toggleRun = useCallback(() => {
    if (done) return;
    setRunning((r) => {
      const next = !r;
      clear();
      if (next) {
        intervalRef.current = setInterval(() => {
          setRemaining((s) => {
            if (s <= 1) {
              clear();
              setRunning(false);
              setDone(true);
              softChime();
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      }
      return next;
    });
  }, [done]);

  const reset = useCallback(() => {
    clear();
    setRemaining(preset.mins * 60);
    setRunning(false);
    setDone(false);
  }, [preset]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const total = preset.mins * 60;
  const progress = total ? 1 - remaining / total : 0;

  // Default centering uses left:50% + negative margin. Once dragged, the hook
  // gives absolute left/top, so zero the margin to position the card exactly.
  const panelStyle = style ? { ...style, marginLeft: 0, transform: 'rotate(-1deg)' } : undefined;

  return (
    <div id="timer" ref={panelRef} style={panelStyle} aria-label="Study timer">
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <div className="panel-title-row">
        <h3 className="panel-title">Timer ⏳</h3>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close timer">×</button>
      </div>

      <div className="timer-presets" role="tablist">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`timer-preset${preset.key === p.key ? ' is-active' : ''}`}
            onClick={() => pickPreset(p)}
            aria-pressed={preset.key === p.key}
          >
            {p.label}<span className="timer-preset-mins">{p.mins}m</span>
          </button>
        ))}
      </div>

      <div className={`timer-clock${done ? ' is-done' : ''}${running ? ' is-running' : ''}`}>
        <div className="timer-ring" style={{ '--progress': progress }} aria-hidden="true" />
        <span className="timer-digits">{mm}:{ss}</span>
      </div>

      <div className="timer-controls">
        <button type="button" className="timer-btn primary" onClick={toggleRun} disabled={done}>
          {running ? 'Pause' : (remaining < total ? 'Resume' : 'Start')}
        </button>
        <button type="button" className="timer-btn" onClick={reset}>Reset</button>
      </div>

      {done && <div className="timer-done-msg">time's up ~ nice work ✿</div>}
    </div>
  );
}
