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

  search(id, queryEmbedding, k = 6) {
    const chunks = this.loadChunks(id);
    const scored = chunks.map(c => ({
      idx: c.idx,
      text: c.text,
      page: c.page,
      score: cosine(c.embedding, queryEmbedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

module.exports = { Store };
