import React, {
  forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import './PdfViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ');
const GAP = 18;      // px between pages
const WINDOW = 2;    // render active page ± this many (others are placeholders)

// Highlighter palette — swatch (solid) + the translucent mark colour.
const HL_COLORS = {
  yellow: '#f4d17b',
  green:  '#93a67f',
  pink:   '#e0729a',
  blue:   '#6ea8d8',
};

export const PdfViewer = forwardRef(function PdfViewer(
  { fileUrl, initialPage = 1, onPageChange, bookId }, ref,
) {
  const [numPages, setNumPages] = useState(0);
  const [active, setActive] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [baseWidth, setBaseWidth] = useState(520);
  const [aspect, setAspect] = useState(1.4); // height / width, from page 1
  const pdfRef = useRef(null);
  const scrollRef = useRef(null);
  const pendingRef = useRef(null);   // { snippet, page }
  const didInit = useRef(false);

  // --- Persistent highlights (per book) ---
  const [highlights, setHighlights] = useState([]);
  const [sel, setSel] = useState(null); // { x, y } popup position for a live selection

  // Load this book's saved highlights, save on change. Keyed by bookId so they
  // reappear every time you open that PDF.
  useEffect(() => {
    if (!bookId) { setHighlights([]); return; }
    try {
      const raw = window.localStorage.getItem(`bookshelf.highlights.${bookId}`);
      setHighlights(raw ? JSON.parse(raw) : []);
    } catch { setHighlights([]); }
  }, [bookId]);

  // Persist on mutation only (not via an effect) — an effect keyed on
  // `highlights` would race the load effect and blow away saved marks.
  const persist = useCallback((next) => {
    if (!bookId) return;
    try { window.localStorage.setItem(`bookshelf.highlights.${bookId}`, JSON.stringify(next)); } catch { /* ignore */ }
  }, [bookId]);

  // A text selection finished — offer the colour popup near its end.
  const onSelectUp = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return;
    const range = s.getRangeAt(0);
    const root = scrollRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) return;
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return;
    const last = rects[rects.length - 1];
    setSel({ x: Math.min(last.right, window.innerWidth - 150), y: last.bottom + 6 });
  }, []);

  // Turn the current selection into saved highlight(s) — normalised rects per
  // page so they land correctly at any zoom, and survive reloads.
  const addHighlight = useCallback((color) => {
    const s = window.getSelection();
    if (!s || !s.rangeCount) { setSel(null); return; }
    const rects = [...s.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const pageEls = [...(scrollRef.current?.querySelectorAll('.pdfv-page') || [])];
    const byPage = {};
    rects.forEach((r) => {
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const pe = pageEls.find((el) => {
        const b = el.getBoundingClientRect();
        return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
      });
      if (!pe) return;
      const b = pe.getBoundingClientRect();
      const p = Number(pe.dataset.page);
      (byPage[p] = byPage[p] || []).push({
        x: (r.left - b.left) / b.width,
        y: (r.top - b.top) / b.height,
        w: r.width / b.width,
        h: r.height / b.height,
      });
    });
    const text = s.toString().slice(0, 140);
    const additions = Object.keys(byPage).map((p) => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      page: Number(p), color, rects: byPage[p], text,
    }));
    if (additions.length) setHighlights((hs) => { const next = [...hs, ...additions]; persist(next); return next; });
    s.removeAllRanges();
    setSel(null);
  }, [persist]);

  const removeHighlight = useCallback((id) => setHighlights((hs) => {
    const next = hs.filter((h) => h.id !== id);
    persist(next);
    return next;
  }), [persist]);

  const pageW = baseWidth * zoom;
  const pageH = pageW * aspect;
  const slotH = pageH + GAP;   // one page + the gap below it

  // Fit width to container height (so a page roughly fills the panel).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight - 20;
      const byH = h / aspect;
      const byW = el.clientWidth - 40;
      setBaseWidth(Math.max(240, Math.min(byH, byW)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => { onPageChange?.(active); }, [active, onPageChange]);

  // Track the page nearest the top of the viewport from vertical scroll.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setSel(null);
    const idx = Math.round(el.scrollTop / slotH) + 1;
    setActive((cur) => (idx !== cur && idx >= 1 && idx <= numPages ? idx : cur));
  }, [slotH, numPages]);

  const scrollToPage = useCallback((n) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: (n - 1) * slotH, behavior: 'smooth' });
  }, [slotH]);

  const clampPage = useCallback((n) => Math.min(numPages || 1, Math.max(1, n)), [numPages]);

  const doHighlight = useCallback((snippet, pageIdx) => {
    const pageEl = scrollRef.current?.querySelector(`.pdfv-page[data-page="${pageIdx}"] .react-pdf__Page__textContent`);
    if (!pageEl) return false;
    const spans = [...pageEl.querySelectorAll('span')];
    let concat = ''; const map = [];
    spans.forEach((sp) => {
      const t = norm(sp.textContent) + ' ';
      map.push({ sp, start: concat.length, end: concat.length + t.length });
      concat += t;
    });
    const target = norm(snippet).trim();
    let probe = target.slice(0, 90);
    let idx = concat.indexOf(probe);
    if (idx < 0) { probe = target.slice(0, 45); idx = concat.indexOf(probe); }
    if (idx < 0) { probe = target.slice(0, 25); idx = concat.indexOf(probe); }
    if (idx < 0) return false;
    const end = idx + probe.length;
    let first = null;
    spans.forEach((sp) => sp.classList.remove('pdf-hl'));
    map.forEach((m) => { if (m.end > idx && m.start < end) { m.sp.classList.add('pdf-hl'); if (!first) first = m.sp; } });
    first?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    setTimeout(() => spans.forEach((sp) => sp.classList.remove('pdf-hl')), 1400);
    return true;
  }, []);

  // Jump to `page` (and try to highlight there). The text layer for a far page
  // may not be rendered yet, so we stash the request in pendingRef and let
  // onRenderTextLayerSuccess finish the highlight once that page paints.
  const goToSource = useCallback((snippet, page) => {
    const p = clampPage(page);
    pendingRef.current = { snippet, page: p };
    setActive(p);
    scrollToPage(p);
    setTimeout(() => {
      if (pendingRef.current && doHighlight(pendingRef.current.snippet, pendingRef.current.page)) pendingRef.current = null;
    }, 500);
  }, [clampPage, scrollToPage, doHighlight]);

  const runHighlight = useCallback(async (snippet, page) => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    // Prefer the page number the backend recorded for this passage.
    if (page && page >= 1) { goToSource(snippet, page); return; }
    // Older books were indexed without page info — fall back to scanning text.
    const target = norm(snippet).trim().slice(0, 50);
    const short = target.slice(0, 25);
    for (let p = 1; p <= pdf.numPages; p++) {
      // eslint-disable-next-line no-await-in-loop
      const tc = await (await pdf.getPage(p)).getTextContent();
      const txt = norm(tc.items.map((i) => i.str).join(' '));
      if (txt.includes(target) || txt.includes(short)) {
        pendingRef.current = { snippet, page: p };
        setActive(p);
        scrollToPage(p);
        setTimeout(() => {
          if (pendingRef.current && doHighlight(pendingRef.current.snippet, pendingRef.current.page)) pendingRef.current = null;
        }, 500);
        return;
      }
    }
  }, [scrollToPage, doHighlight, goToSource]);

  useImperativeHandle(ref, () => ({
    goToPage: (n) => { const p = clampPage(n); setActive(p); scrollToPage(p); },
    getPage: () => active,
    highlightText: runHighlight,
  }), [active, clampPage, scrollToPage, runHighlight]);

  useEffect(() => {
    const onHl = (e) => { if (!bookId || e.detail?.bookId === bookId) runHighlight(e.detail.snippet, e.detail.page); };
    window.addEventListener('reader:highlight', onHl);
    return () => window.removeEventListener('reader:highlight', onHl);
  }, [bookId, runHighlight]);

  const onDocLoad = async (pdf) => {
    pdfRef.current = pdf;
    setNumPages(pdf.numPages);
    try {
      const vp = (await pdf.getPage(1)).getViewport({ scale: 1 });
      setAspect(vp.height / vp.width);
    } catch { /* keep default */ }
  };

  // Jump to the saved page once, after the first render settles.
  useEffect(() => {
    if (!didInit.current && numPages > 0) {
      didInit.current = true;
      const p = Math.min(numPages, Math.max(1, initialPage));
      setActive(p);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = (p - 1) * slotH;
      });
    }
  }, [numPages, initialPage, slotH]);

  const onTextLayer = (pageIdx) => {
    if (pendingRef.current && pendingRef.current.page === pageIdx
        && doHighlight(pendingRef.current.snippet, pageIdx)) pendingRef.current = null;
  };

  return (
    <div className="pdfv">
      <div
        className="pdfv-scroll pdfv-vertical"
        ref={scrollRef}
        onScroll={onScroll}
        onMouseUp={onSelectUp}
        onMouseDown={() => setSel(null)}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocLoad}
          loading={<div className="pdfv-msg">Loading…</div>}
          error={<div className="pdfv-msg">Couldn't open this PDF.</div>}
          className="pdfv-doc"
        >
          {Array.from({ length: numPages }, (_, i) => {
            const p = i + 1;
            const render = Math.abs(p - active) <= WINDOW;
            return (
              <div
                key={p}
                className="pdfv-page"
                data-page={p}
                style={{ width: `${pageW}px`, height: `${pageH}px`, marginBottom: `${GAP}px` }}
              >
                {render ? (
                  <Page
                    pageNumber={p}
                    width={pageW}
                    renderAnnotationLayer={false}
                    renderTextLayer
                    onRenderTextLayerSuccess={() => onTextLayer(p)}
                    loading={<div className="pdfv-msg">·</div>}
                  />
                ) : (
                  <div className="pdfv-placeholder">{p}</div>
                )}

                {/* Saved highlights for this page (click a mark to remove) */}
                <div className="pdfv-hl-layer">
                  {highlights.filter((h) => h.page === p).map((h) => (
                    h.rects.map((r, i) => (
                      <div
                        key={`${h.id}_${i}`}
                        className="pdfv-hl-mark"
                        style={{
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.w * 100}%`,
                          height: `${r.h * 100}%`,
                          background: HL_COLORS[h.color] || HL_COLORS.yellow,
                        }}
                        title="Click to remove highlight"
                        onClick={() => removeHighlight(h.id)}
                      />
                    ))
                  ))}
                </div>
              </div>
            );
          })}
        </Document>
      </div>

      {sel && (
        <div className="pdfv-sel-pop" style={{ left: `${sel.x}px`, top: `${sel.y}px` }}>
          {Object.keys(HL_COLORS).map((c) => (
            <button
              key={c}
              type="button"
              className="pdfv-sel-color"
              style={{ background: HL_COLORS[c] }}
              title={`Highlight ${c}`}
              // preventDefault keeps the text selection alive until we read it
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addHighlight(c)}
            />
          ))}
        </div>
      )}

      <div className="pdfv-bar">
        <button onClick={() => { const p = clampPage(active - 1); setActive(p); scrollToPage(p); }} disabled={active <= 1} title="Previous page">◀</button>
        <span className="pdfv-pageinfo">{active} / {numPages || '—'}</span>
        <button onClick={() => { const p = clampPage(active + 1); setActive(p); scrollToPage(p); }} disabled={active >= numPages} title="Next page">▶</button>
        <span className="pdfv-sep" />
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} title="Zoom out">−</button>
        <span className="pdfv-zoom">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} title="Zoom in">＋</button>
      </div>
    </div>
  );
});
