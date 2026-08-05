import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './Tutorial.css';

// Each step points a hand-drawn arrow at a feature and explains it.
// `sel` is a CSS selector for the element to spotlight; `center` steps float
// in the middle with no target.
const STEPS = [
  { center: true, title: 'Welcome to Lumen ✨', text: "Your cozy reading room, with a little light to read by. Here's a quick tour — about twenty seconds." },
  { sel: '#musicPlayer', title: 'Your desk 🎛️', text: 'Everything lives on this bar — play some lofi, and open any panel from the little buttons on the right.' },
  { sel: '[aria-label="Files"]', title: 'Files 📂', text: 'Drop a PDF here (or browse) to open it in the reader. Swipe sideways to turn pages.' },
  { sel: '[aria-label="Library"]', title: 'Library 📚', text: 'Every book you open is saved here — reopen it anytime, right where you left off.' },
  { sel: '[aria-label="Chat"]', title: 'Chat 💬', text: 'Ask questions about your book. Answers come with the exact passage — click a source to jump to it in the page.' },
  { sel: '[aria-label="Tasks"]', title: 'Tasks 📅', text: 'A little planner for your to-dos.' },
  { sel: '[aria-label="Notes"]', title: 'Notes 📝', text: 'Jot thoughts in your own handwriting, and save them as a PDF.' },
  { sel: '[aria-label="Timer"]', title: 'Timer ⏳', text: 'Focus sessions, pomodoro-style — great with a book and some rain.' },
  { sel: '[aria-label="Today"]', title: 'Today ☀', text: 'Your reading minutes, pomodoros, and day streak — a gentle nudge to keep going.' },
  { sel: '[aria-label="Settings"]', title: 'Settings ⚙', text: 'Themes, wallpapers, ambient sounds, and your AI model. Make the room yours.' },
  { center: true, title: "That's the tour! ✿", text: 'Drop a PDF into Files to begin. You can replay this anytime from Settings → Appearance.' },
];

function HandArrow({ x, y, dir }) {
  // A wobbly curved arrow. Drawn pointing down; flipped for "up".
  const style = { left: x - 36, top: dir === 'down' ? y - 64 : y + 4, transform: dir === 'up' ? 'scaleY(-1)' : 'none' };
  return (
    <svg className="tut-arrow" width="72" height="62" viewBox="0 0 72 62" style={style} aria-hidden="true">
      <path d="M14 6 C 30 16, 18 30, 30 40 C 38 47, 44 50, 50 54"
        fill="none" stroke="var(--coral)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M50 54 L 38 52 M50 54 L 47 42"
        fill="none" stroke="var(--coral)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const s = STEPS[step];

  const measure = useCallback(() => {
    if (s.center || !s.sel) { setRect(null); return; }
    const el = document.querySelector(s.sel);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [s]);

  useEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    const t = setInterval(measure, 500); // targets can shift (panels open/close)
    return () => { window.removeEventListener('resize', measure); clearInterval(t); };
  }, [measure]);

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : onClose());
  const back = () => setStep((p) => Math.max(0, p - 1));

  // Place the bubble + arrow relative to the target.
  let bubbleStyle;
  let arrow = null;
  if (!rect) {
    bubbleStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const bw = 300;
    const left = Math.min(vw - bw - 20, Math.max(20, cx - bw / 2));
    const above = rect.top > vh / 2;
    if (above) {
      bubbleStyle = { left, bottom: vh - rect.top + 58 };
      arrow = { x: cx, y: rect.top, dir: 'down' };
    } else {
      bubbleStyle = { left, top: rect.bottom + 58 };
      arrow = { x: cx, y: rect.bottom, dir: 'up' };
    }
  }

  return createPortal(
    <div className="tut-overlay" role="dialog" aria-label="Tutorial">
      {rect ? (
        <div
          className="tut-spot"
          style={{ left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : (
        <div className="tut-dim" />
      )}

      {arrow && <HandArrow x={arrow.x} y={arrow.y} dir={arrow.dir} />}

      <div className="tut-bubble" style={bubbleStyle}>
        <span className="tape" aria-hidden="true" />
        <h3 className="tut-title">{s.title}</h3>
        <p className="tut-text">{s.text}</p>
        <div className="tut-foot">
          <span className="tut-progress">{step + 1} / {STEPS.length}</span>
          <div className="tut-btns">
            {step > 0 && <button className="tut-btn" onClick={back}>Back</button>}
            <button className="tut-btn ghost" onClick={onClose}>Skip</button>
            <button className="tut-btn primary" onClick={next}>{step < STEPS.length - 1 ? 'Next →' : 'Done ✿'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
