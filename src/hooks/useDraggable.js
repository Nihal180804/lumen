import { useEffect, useRef, useState } from 'react';

/**
 * Makes any element draggable by grabbing a handle inside it.
 * - Position persists to localStorage under `storageKey`.
 * - Double-click the handle to reset back to CSS default.
 *
 * Returns { style, isDragging } — spread `style` onto the element you want moved.
 */
export function useDraggable(handleRef, elementRef, storageKey) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      // If the saved position lies (mostly) outside the current viewport —
      // e.g. saved on a larger monitor, then reopened on a smaller laptop —
      // discard it and fall back to CSS defaults. Otherwise the panel
      // silently vanishes off-screen.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (p.x > vw - 80 || p.x < -80 || p.y > vh - 40 || p.y < -20) {
        window.localStorage.removeItem(storageKey);
        return null;
      }
      return p;
    } catch { return null; }
  });
  const [isDragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    const handle = handleRef.current;
    const element = elementRef.current;
    if (!handle || !element) return undefined;

    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      dragRef.current = {
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
      };
      setDragging(true);
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
      if (!dragRef.current) return;
      const w = element.offsetWidth;
      // Keep at least 60px of the panel on-screen so it's always grabbable back
      const x = Math.max(60 - w, Math.min(window.innerWidth - 60, e.clientX - dragRef.current.offsetX));
      const y = Math.max(4, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.offsetY));
      setPos({ x, y });
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    const onDouble = () => setPos(null);

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('dblclick', onDouble);
    return () => {
      handle.removeEventListener('mousedown', onDown);
      handle.removeEventListener('dblclick', onDouble);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
  }, [handleRef, elementRef]);

  useEffect(() => {
    try {
      if (pos) window.localStorage.setItem(storageKey, JSON.stringify(pos));
      else window.localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [pos, storageKey]);

  // When dragged, override CSS anchoring completely with absolute left/top.
  const style = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
    : undefined;

  return { style, isDragging };
}
