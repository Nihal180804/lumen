const fs = require('fs');
const path = require('path');

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

function tokenize(s) {
  return (s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

// Classic BM25 keyword relevance. Returns a score per chunk. Good at exact
// terms — names, formulas, acronyms — that dense embeddings tend to blur.
function bm25Scores(docTokens, queryTokens, k1 = 1.5, b = 0.75) {
  const N = docTokens.length;
  const docLen = docTokens.map(t => t.length);
  const avgdl = (docLen.reduce((a, x) => a + x, 0) / (N || 1)) || 1;
  const df = new Map();
  for (const toks of docTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const qset = [...new Set(queryTokens)];
  const scores = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const tf = new Map();
    for (const t of docTokens[i]) tf.set(t, (tf.get(t) || 0) + 1);
    let s = 0;
    for (const q of qset) {
      const f = tf.get(q) || 0;
      if (!f) continue;
      const n = df.get(q) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * docLen[i] / avgdl));
    }
    scores[i] = s;
  }
  return scores;
}

// Reciprocal-rank fusion: combine two rankings by summing 1/(C + rank).
// Robust to the two scores living on totally different scales (cosine vs BM25).
function rrfMerge(rankings, C = 60) {
  const fused = new Map();
  for (const ranking of rankings) {
    ranking.forEach((i, rank) => fused.set(i, (fused.get(i) || 0) + 1 / (C + rank + 1)));
  }
  return fused;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.chunksDir = path.join(dir, 'chunks');
    this.booksPath = path.join(dir, 'books.json');
    fs.mkdirSync(this.chunksDir, { recursive: true });
    if (!fs.existsSync(this.booksPath)) fs.writeFileSync(this.booksPath, '[]');
  }

  listBooks() {
    return JSON.parse(fs.readFileSync(this.booksPath, 'utf8'));
  }

  addBook(book) {
    const books = this.listBooks();
    books.push(book);
    fs.writeFileSync(this.booksPath, JSON.stringify(books, null, 2));
  }

  deleteBook(id) {
    const books = this.listBooks().filter(b => b.id !== id);
    fs.writeFileSync(this.booksPath, JSON.stringify(books, null, 2));
    for (const ext of ['.pdf', '.json']) {
      const p = path.join(this.chunksDir, id + ext);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  savePdf(id, buf) {
    fs.writeFileSync(path.join(this.chunksDir, id + '.pdf'), buf);
  }

  saveChunks(id, chunks) {
    fs.writeFileSync(path.join(this.chunksDir, id + '.json'), JSON.stringify(chunks));
  }

  loadChunks(id) {
    const p = path.join(this.chunksDir, id + '.json');
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  // Hybrid retrieval: dense (cosine) + sparse (BM25), fused with RRF. Pass
  // queryText to enable the keyword half; omit it to fall back to pure vector
  // search. Returns the top k chunks with a fused `score`.
  search(id, queryEmbedding, queryText = '', k = 6) {
    const chunks = this.loadChunks(id);
    if (!chunks.length) return [];

    const semRank = chunks
      .map((c, i) => ({ i, score: cosine(c.embedding, queryEmbedding) }))
      .sort((a, b) => b.score - a.score)
      .map(r => r.i);

    const rankings = [semRank];

    const qTokens = tokenize(queryText);
    if (qTokens.length) {
      const bm = bm25Scores(chunks.map(c => tokenize(c.text)), qTokens);
      if (bm.some(s => s > 0)) {
        const kwRank = bm
          .map((score, i) => ({ i, score }))
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(r => r.i);
        rankings.push(kwRank);
      }
    }

    const fused = rrfMerge(rankings);
    return [...fused.entries()]
      .map(([i, score]) => ({ idx: chunks[i].idx, text: chunks[i].text, page: chunks[i].page, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

module.exports = { Store };
