// Pull a PDF's outline (bookmarks) using the pdf.js that ships inside
// pdf-parse — no extra dependency. Returns a flat list of
// { title, page, level }, or [] when the PDF has no usable outline. Page
// numbers are 1-based. Best-effort: any failure yields [] so upload never
// breaks over a missing or malformed outline.
const pdfjs = require('pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js');

async function pageOf(doc, dest) {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit[0]) return null;
    const ref = explicit[0];
    const idx = await doc.getPageIndex(ref); // 0-based
    return idx + 1;
  } catch {
    return null;
  }
}

async function extractOutline(buf) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: buf, disableWorker: true, verbosity: 0 }).promise;
  } catch {
    return [];
  }
  let tree;
  try {
    tree = await doc.getOutline();
  } catch {
    tree = null;
  }
  if (!tree || !tree.length) return [];

  const flat = [];
  const walk = async (items, level) => {
    for (const it of items) {
      const title = (it.title || '').trim();
      const page = await pageOf(doc, it.dest);
      if (title && page) flat.push({ title, page, level });
      if (it.items && it.items.length) await walk(it.items, level + 1);
    }
  };
  await walk(tree, 0);

  // Sort by page, drop entries that don't advance the page (dupes/anchors).
  flat.sort((a, b) => a.page - b.page || a.level - b.level);
  return flat;
}

module.exports = { extractOutline };
