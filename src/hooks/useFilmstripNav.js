import { useEffect, useState, useCallback } from 'react';

/**
 * Keyboard navigation for a horizontal filmstrip of items.
 * - ← / → move the focus (and scroll it into view + enlarge via `.is-focused`)
 * - Enter / Space select the focused item
 *
 * Returns { focusedIndex, setFocusedIndex, onKeyDown } — put onKeyDown on the
 * scrollable track (give it tabIndex={0}) and add `.is-focused` to the item
 * whose index === focusedIndex.
 */
export function useFilmstripNav(count, activeIndex, onSelect, containerRef) {
  const [focusedIndex, setFocusedIndex] = useState(activeIndex >= 0 ? activeIndex : 0);

  // Keep focus in sync when the active selection changes from outside.
  useEffect(() => {
    if (activeIndex >= 0) setFocusedIndex(activeIndex);
  }, [activeIndex]);

  // Scroll the focused item into view whenever it moves.
  useEffect(() => {
    const el = containerRef?.current?.querySelector('.is-focused');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [focusedIndex, containerRef]);

  const onKeyDown = useCallback((e) => {
    // Keep these keys inside the filmstrip — don't let them reach the global
    // shortcuts (arrows change music tracks, space toggles play).
    if (['ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === 'ArrowRight') setFocusedIndex((i) => Math.min(count - 1, i + 1));
    else if (e.key === 'ArrowLeft') setFocusedIndex((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter' || e.key === ' ') setFocusedIndex((i) => { onSelect(i); return i; });
  }, [count, onSelect]);

  return { focusedIndex, setFocusedIndex, onKeyDown };
}
