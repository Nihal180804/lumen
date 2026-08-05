import { useEffect, useRef, useState } from 'react';

/**
 * Makes an element resizable by dragging a corner handle.
 * Persists size to localStorage. Bottom-right (SE) resize only for now.
 */
export function useResizable(handleRef, elementRef, initial, storageKey, options = {}) {
  const { minWidth = 200, minHeight = 200, maxWidth = 1200, maxHeight = 1200 } = options;
  const [size, setSize] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return initial;
      const s = JSON.parse(raw);
      // Aggressively cap persisted size — a size saved on a larger monitor
      // shouldn't blow past ~40% of a smaller laptop's viewport.
      const cap = {
        width: Math.min(s.width, Math.round(window.innerWidth * 0.42), window.innerWidth - 40),
        height: Math.min(s.height, Math.round(window.innerHeight * 0.62), window.innerHeight - 80),
      };
      return {
        width: Math.max(minWidth, Math.min(maxWidth, cap.width)),
        height: Math.max(minHeight, Math.min(maxHeight, cap.height)),
      };
    } catch { return initial; }
  });
  const dragRef = useRef(null);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return undefined;

    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = elementRef.current.getBoundingClientRect();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: rect.width,
        startH: rect.height,
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'se-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const w = Math.max(minWidth, Math.min(maxWidth, dragRef.current.startW + dx));
      const h = Math.max(minHeight, Math.min(maxHeight, dragRef.current.startH + dy));
      setSize({ width: Math.round(w), height: Math.round(h) });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', onDown);
    return () => {
      handle.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [handleRef, elementRef, minWidth, minHeight, maxWidth, maxHeight]);

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(size)); } catch { /* ignore */ }
  }, [size, storageKey]);

  return { size, setSize };
}
