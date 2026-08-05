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
      <div className="pdfv-scroll pdfv-vertical" ref={scrollRef} onScroll={onScroll}>
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
              </div>
            );
          })}
        </Document>
      </div>

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
