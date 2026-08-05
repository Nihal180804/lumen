import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import { PdfViewer } from './PdfViewer';
import './DropArea.css';

// Portrait "page" default, but sized to the viewport so laptops don't get an
// oversized panel and big monitors don't get a tiny one.
const initialSize = () => ({
  width:  Math.min(460, Math.max(300, Math.round((window.innerWidth  || 1280) * 0.24))),
  height: Math.min(580, Math.max(260, Math.round((window.innerHeight || 800)  * 0.52))),
});

export function DropArea({ currentFile, onFileSelected, bookId, initialPage, onPageChange }) {
  const [size, setSize] = useState(initialSize);
  const [dragState, setDragState] = useState(null); // { direction, x, y } while resizing
  const dropAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [fileURL, setFileURL] = useState(null);
  const containerRef = useRef(null);
  const tapeRef = useRef(null);
  const { style: dragStyle } = useDraggable(tapeRef, containerRef, 'bookshelf.pos.dropArea');

  // Create + revoke a blob URL for the current file — React handles rendering
  // it below, so we don't need to touch the DOM by id anymore.
  useEffect(() => {
    if (!currentFile) {
      setFileURL(null);
      return undefined;
    }
    const url = URL.createObjectURL(currentFile);
    setFileURL(url);
    return () => URL.revokeObjectURL(url);
  }, [currentFile]);

  // Snap the viewer to a size that matches the loaded file's natural shape.
  // PDFs → US letter portrait (8.5:11). Video → 16:9. Images keep user size.
  useEffect(() => {
    if (!currentFile) return;
    const type = currentFile.type;
    if (type === 'application/pdf') {
      const maxH = Math.min(880, window.innerHeight - 180);
      const maxW = Math.min(680, window.innerWidth - 80);
      const h = Math.min(maxH, Math.round(maxW * 11 / 8.5));
      setSize({ width: Math.round(h * 8.5 / 11), height: h });
    } else if (type.startsWith('video/')) {
      const w = Math.min(720, window.innerWidth - 80);
      setSize({ width: w, height: Math.round(w * 9 / 16) });
    }
  }, [currentFile]);

  // Resize drag logic
  useEffect(() => {
    if (!dragState) return undefined;

    const onMove = (e) => {
      setSize((prev) => {
        const dx = e.clientX - dragState.x;
        const dy = e.clientY - dragState.y;
        if (dragState.direction === 'e') return { ...prev, width: Math.max(240, prev.width + dx) };
        if (dragState.direction === 's') return { ...prev, height: Math.max(180, prev.height + dy) };
        return {
          width: Math.max(240, prev.width + dx),
          height: Math.max(180, prev.height + dy),
        };
      });
      setDragState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s));
    };
    const onUp = () => setDragState(null);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragState]);

  const startResize = (e, direction) => {
    e.preventDefault();
    setDragState({ direction, x: e.clientX, y: e.clientY });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  const type = currentFile?.type || '';

  return (
    <div
      id="drop-area-container"
      ref={containerRef}
      style={dragStyle || { left: `calc(50% - ${size.width / 2 + 20}px)` }}
    >
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <div
        ref={dropAreaRef}
        id="drop-area"
        style={{ width: `${size.width}px`, height: `${size.height}px` }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div id="drop-area-content">
          {!currentFile && <span>drop a file in ~ or use browse below</span>}
          {currentFile && type === 'application/pdf' && (
            <PdfViewer
              fileUrl={fileURL}
              bookId={bookId}
              initialPage={initialPage}
              onPageChange={onPageChange}
            />
          )}
          {currentFile && type.startsWith('image/') && (
            <img src={fileURL} alt={currentFile.name} />
          )}
          {currentFile && type.startsWith('video/') && (
            <video src={fileURL} controls />
          )}
          {currentFile && !/^(application\/pdf|image\/|video\/)/.test(type) && (
            <span>Unsupported file type: <strong>{currentFile.name}</strong></span>
          )}
        </div>

        <div className="resize-handle resize-e" onMouseDown={(e) => startResize(e, 'e')} />
        <div className="resize-handle resize-s" onMouseDown={(e) => startResize(e, 's')} />
        <div className="resize-handle resize-se" onMouseDown={(e) => startResize(e, 'se')} />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />
      <button
        type="button"
        className="drop-area-browse"
        onClick={() => fileInputRef.current.click()}
      >
        <span aria-hidden="true">📁</span>
        <span>Browse files</span>
      </button>
    </div>
  );
}
