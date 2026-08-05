import React, { useRef } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { useResizable } from '../hooks/useResizable';
import { fluidSize } from '../utils/fluid';
import './Library.css';

export function Library({ books, openBookId, onOpen, onDelete, onAddBook }) {
  const panelRef = useRef(null);
  const tapeRef = useRef(null);
  const resizeRef = useRef(null);
  const fileRef = useRef(null);

  const { style: dragStyle } = useDraggable(tapeRef, panelRef, 'bookshelf.pos.library');
  const { size } = useResizable(
    resizeRef, panelRef,
    fluidSize(300, 360),
    'bookshelf.size.library',
    { minWidth: 220, minHeight: 240, maxWidth: 900, maxHeight: 900 },
  );
  const panelStyle = { ...(dragStyle || {}), width: `${size.width}px`, height: `${size.height}px` };

  return (
    <div id="library" ref={panelRef} style={panelStyle}>
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <h3 className="panel-title">Library 📚</h3>

      <div className="lib-list">
        {books.length === 0 && (
          <div className="empty-state">no books yet ~ add a PDF below</div>
        )}
        {books.map((b) => (
          <div key={b.id} className={`lib-item${openBookId === b.id ? ' is-open' : ''}`}>
            <button className="lib-open" onClick={() => onOpen(b)} title={b.name}>
              <span className="lib-icon">📖</span>
              <span className="lib-name">{b.name.replace(/\.pdf$/i, '')}</span>
              {b.pages ? <span className="lib-meta">{b.pages}p</span> : null}
            </button>
            <button className="lib-del" onClick={() => onDelete(b)} title="Remove from library">×</button>
          </div>
        ))}
      </div>

      <button className="lib-browse" onClick={() => fileRef.current.click()}>＋ Add a book</button>
      <input
        ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddBook(f); e.target.value = ''; }}
      />

      <span ref={resizeRef} className="panel-resize-handle" title="Drag to resize" aria-hidden="true" />
    </div>
  );
}
