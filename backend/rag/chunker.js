function chunk(text, size = 800, overlap = 100) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const out = [];
  let start = 0;
  let idx = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);
    while (end < cleaned.length && !/\s/.test(cleaned[end])) end++;
    const slice = cleaned.slice(start, end).trim();
    if (slice) out.push({ idx: idx++, text: slice });
    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
  }
  return out;
}

// Page-aware chunking. Given per-page text ([{ page, text }, ...]), produce the
// same sliding-window chunks as chunk() but tag each with the page it starts on,
// so a citation can jump straight to its source page in the reader.
function chunkPages(pages, size = 800, overlap = 100) {
  let combined = '';
  const bounds = []; // { page, start } — offset in `combined` where each page begins
  for (const pg of pages) {
    const cleaned = (pg.text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    if (combined) combined += ' ';
    bounds.push({ page: pg.page, start: combined.length });
    combined += cleaned;
  }

  const pageAt = (pos) => {
    let page = bounds.length ? bounds[0].page : 1;
    for (const b of bounds) {
      if (b.start <= pos) page = b.page;
      else break;
    }
    return page;
  };

  const out = [];
  let start = 0;
  let idx = 0;
  while (start < combined.length) {
    let end = Math.min(start + size, combined.length);
    while (end < combined.length && !/\s/.test(combined[end])) end++;
    const slice = combined.slice(start, end).trim();
    if (slice) out.push({ idx: idx++, text: slice, page: pageAt(start) });
    if (end >= combined.length) break;
    start = Math.max(0, end - overlap);
  }
  return out;
}

module.exports = { chunk, chunkPages };
