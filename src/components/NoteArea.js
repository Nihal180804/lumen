import React, { useRef, useState } from 'react';
import { exportNotesToPdf } from '../utils/exportPdf';
import { useDraggable } from '../hooks/useDraggable';
import { useResizable } from '../hooks/useResizable';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { fluidSize } from '../utils/fluid';
import './NoteArea.css';

const FONT_OPTIONS = [
  { key: 'caveat',  label: 'Handwritten', css: "'Caveat', cursive" },
  { key: 'patrick', label: 'Neat hand',   css: "'Patrick Hand', cursive" },
  { key: 'shadows', label: 'Scribble',    css: "'Shadows Into Light', cursive" },
  { key: 'nunito',  label: 'Sans',        css: "'Nunito', sans-serif" },
  { key: 'serif',   label: 'Serif',       css: "Georgia, 'Times New Roman', serif" },
  { key: 'mono',    label: 'Typewriter',  css: "'Courier New', monospace" },
];

const COLOR_OPTIONS = [
  '#3b332a',   // dark brown (default)
  '#b8593a',   // coral / terracotta
  '#5a7a4d',   // sage
  '#3c6284',   // dusty blue
  '#8d4a70',   // rose plum
];

export function NoteArea({ notes, setNotes }) {
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const tapeRef = useRef(null);
  const resizeRef = useRef(null);

  const [font, setFont] = useLocalStorage('bookshelf.notes.font', 'caveat');
  const [color, setColor] = useLocalStorage('bookshelf.notes.color', COLOR_OPTIONS[0]);
  const [textSize, setTextSize] = useLocalStorage('bookshelf.notes.size', 15);
  const [showFormat, setShowFormat] = useState(false);

  const { style: dragStyle } = useDraggable(tapeRef, panelRef, 'bookshelf.pos.notes');
  const { size } = useResizable(
    resizeRef,
    panelRef,
    fluidSize(300, 360),
    'bookshelf.size.notes',
    { minWidth: 220, minHeight: 260, maxWidth: 1000, maxHeight: 900 }
  );

  const fontCss = FONT_OPTIONS.find((f) => f.key === font)?.css || FONT_OPTIONS[0].css;

  const exportNotes = () => exportNotesToPdf(notes, { font, color, size: textSize });

  const loadNotesFromFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setNotes(ev.target.result);
    reader.readAsText(file);
  };

  // Merge drag position + resize dimensions
  const panelStyle = { ...(dragStyle || {}), width: `${size.width}px`, height: `${size.height}px` };

  return (
    <div id="noteArea" ref={panelRef} style={panelStyle}>
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <div className="panel-title-row">
        <h3 className="panel-title">Notes ✿</h3>
        <button
          type="button"
          className={`note-format-toggle${showFormat ? ' is-active' : ''}`}
          onClick={() => setShowFormat((v) => !v)}
          title="Font & colour"
          aria-label="Font and colour settings"
          aria-pressed={showFormat}
        >🎨</button>
      </div>

      <textarea
        id="noteTextArea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Write your notes here..."
        style={{ fontFamily: fontCss, color, fontSize: `${textSize}px` }}
      />

      {showFormat && (
      <div className="note-format">
        <select
          className="note-font-select"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          aria-label="Font"
          title="Font"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        <div className="note-swatches" role="radiogroup" aria-label="Text color">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              className={`note-swatch${color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              title={c}
            />
          ))}
          <label className="note-swatch note-swatch-wheel" title="Custom colour">
            <span style={{ background: color }} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Custom text colour" />
          </label>
        </div>
      </div>
      )}

      {showFormat && (
      <div className="note-size">
        <span className="note-size-label">Size</span>
        <button type="button" className="note-size-btn" onClick={() => setTextSize((s) => Math.max(10, s - 1))} aria-label="Smaller text">−</button>
        <input
          type="range" min="10" max="40" step="1" value={textSize}
          onChange={(e) => setTextSize(Number(e.target.value))}
          aria-label="Text size" className="note-size-range"
        />
        <button type="button" className="note-size-btn" onClick={() => setTextSize((s) => Math.min(40, s + 1))} aria-label="Bigger text">＋</button>
        <span className="note-size-val">{textSize}</span>
      </div>
      )}

      <div className="note-controls">
        <button type="button" onClick={exportNotes} disabled={notes.length === 0}>
          Save as PDF
        </button>
        <input
          type="file"
          accept=".txt"
          onChange={loadNotesFromFile}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={() => fileInputRef.current.click()}>
          Load Notes
        </button>
      </div>

      <span
        ref={resizeRef}
        className="panel-resize-handle"
        title="Drag to resize"
        aria-hidden="true"
      />
    </div>
  );
}
