import { useEffect, useRef } from 'react';

// Passing handlers by ref so the subscription is set up once and stays stable
// regardless of how often the parent re-renders / re-creates its callbacks.
export function useKeyboardShortcuts(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
      // Escape always goes through so users can close panels while typing.
      if (typing && e.key !== 'Escape') return;

      const cb = handlersRef.current[e.key];
      if (cb) {
        e.preventDefault();
        cb(e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
