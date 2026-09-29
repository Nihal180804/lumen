import React, { useState, useEffect, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import './ChatPanel.css';

const RAG_BASE = (typeof window !== 'undefined' && window.bookshelf && window.bookshelf.ragBase)
  || process.env.REACT_APP_RAG_BASE || 'http://localhost:5001';

// Matches the server sentinel for "search across every book".
const ALL_BOOKS = '__all__';

// A generated quiz: each question reveals its model answer on click.
function QuizCard({ title, quiz, status, error }) {
  return (
    <div className="chat-msg bot chat-quiz">
      <div className="chat-study-title">🎓 {title}</div>
      {error ? (
        <div className="chat-study-err">Couldn’t make a quiz: {error}</div>
      ) : !quiz ? (
        <div className="chat-study-status">{status || '…'}</div>
      ) : (
        quiz.map((it, i) => (
          <details key={i} className="chat-quiz-item">
            <summary><span className="chat-quiz-num">{i + 1}.</span> {it.q}</summary>
            <div className="chat-quiz-a">{it.a}</div>
          </details>
        ))
      )}
    </div>
  );
}

// Render an assistant answer, turning inline [n] markers into clickable jumps
// to the cited passage. Numbers without a matching citation stay plain text.
function AnswerText({ content, citations, onJump }) {
  const byLabel = new Map((citations || []).map((c) => [String(c.label), c]));
  const parts = (content || '').split(/(\[\d+\])/g);
  return (
    <div>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        const cite = m && byLabel.get(m[1]);
        if (cite) {
          return (
            <sup
              key={i}
              className="chat-cite-mark"
              title={cite.page ? `Go to page ${cite.page}` : 'Show this passage'}
              onClick={() => onJump(cite)}
            >[{m[1]}]</sup>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
}

export default function ChatPanel({ open, onToggle, onOpenSettings, onCite }) {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [studyOpen, setStudyOpen] = useState(false);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [pageFrom, setPageFrom] = useState('');
  const [pageTo, setPageTo] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [studyBusy, setStudyBusy] = useState(false);
  const [modelInfo, setModelInfo] = useState({ models: [], active: '' });
  // Which edge the drawer lives on — the user can flip it left/right.
  const [side, setSide] = useLocalStorage('bookshelf.chat.side', 'right');
  const scrollRef = useRef();

  // Current chat model + the saved list (managed in the global AI settings).
  const loadModelInfo = () => {
    fetch(`${RAG_BASE}/api/rag/config`)
      .then((r) => r.json())
      .then((c) => {
        const sec = c[c.mode] || {};
        setModelInfo({ models: sec.chatModels || [], active: sec.chatModel || '' });
      })
      .catch(() => {});
  };
  useEffect(() => {
    loadModelInfo();
    window.addEventListener('rag:config', loadModelInfo);
    return () => window.removeEventListener('rag:config', loadModelInfo);
  }, []);
  useEffect(() => { if (open) loadModelInfo(); }, [open]);

  const setActiveModel = (name) => {
    setModelInfo((m) => ({ ...m, active: name }));
    fetch(`${RAG_BASE}/api/rag/config`)
      .then((r) => r.json())
      .then((c) => fetch(`${RAG_BASE}/api/rag/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [c.mode]: { chatModel: name } }),
      }))
      .catch(() => {});
  };

  const refresh = async () => {
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/books`);
      if (!r.ok) return;
      const bs = await r.json();
      setBooks(bs);
      setSelectedBook(prev => prev && bs.find(b => b.id === prev) ? prev : (bs[0]?.id || ''));
    } catch {}
  };

  useEffect(() => {
    refresh();
    const onUpload = () => { setUploadError(''); refresh(); };
    const onUploading = (e) => { setUploading(!!e.detail); if (e.detail) setUploadError(''); };
    const onError = (e) => { setUploading(false); setUploadError(e.detail || 'Indexing failed'); };
    window.addEventListener('rag:refresh', onUpload);
    window.addEventListener('rag:uploading', onUploading);
    window.addEventListener('rag:error', onError);
    return () => {
      window.removeEventListener('rag:refresh', onUpload);
      window.removeEventListener('rag:uploading', onUploading);
      window.removeEventListener('rag:error', onError);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Per-book chat history: load when the selected book changes, save on update.
  const justSwitched = useRef(false);
  useEffect(() => {
    let loaded = [];
    if (selectedBook) {
      try { const s = localStorage.getItem(`bookshelf.chat.${selectedBook}`); loaded = s ? JSON.parse(s) : []; } catch {}
    }
    setMessages(loaded);
    justSwitched.current = true;
  }, [selectedBook]);
  useEffect(() => {
    if (justSwitched.current) { justSwitched.current = false; return; }
    if (selectedBook) {
      try { localStorage.setItem(`bookshelf.chat.${selectedBook}`, JSON.stringify(messages)); } catch {}
    }
  }, [messages, selectedBook]);

  const send = async () => {
    const q = input.trim();
    if (!q || !selectedBook || busy) return;
    setInput('');
    const history = messages
      .filter(m => m.content)
      .map(({ role, content }) => ({ role, content }));
    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '', citations: [] }]);
    setBusy(true);
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook, question: q, history }),
      });
      if (!r.ok) throw new Error(await r.text());
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop();
        for (const evt of events) {
          const lines = evt.split('\n');
          const ev = lines.find(l => l.startsWith('event: '))?.slice(7);
          const dataLine = lines.find(l => l.startsWith('data: '))?.slice(6);
          if (!dataLine) continue;
          let parsed;
          try { parsed = JSON.parse(dataLine); } catch { continue; }
          if (ev === 'citations') {
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], citations: parsed };
              return copy;
            });
          } else if (ev === 'token') {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + parsed.t };
              return copy;
            });
          } else if (ev === 'error') {
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${parsed.error}` };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${e.message}` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  // --- Study tools: summaries + quizzes over a chapter or page range ------
  const book = books.find((b) => b.id === selectedBook);
  const studyable = !!book && selectedBook !== ALL_BOOKS;
  const outline = (book && book.outline) || [];
  // When the PDF has bookmarks, offer chapters; otherwise fall back to page inputs.
  const chapters = outline.length
    ? [{ label: 'Whole book', from: null, to: null },
       ...outline.map((o, i) => {
         const next = outline.slice(i + 1).find((x) => x.page > o.page);
         const to = next ? next.page - 1 : (book.pages || null);
         return { label: `${'  '.repeat(o.level)}${o.title}`, from: o.page, to };
       })]
    : null;

  const currentRange = () => {
    if (chapters) {
      const c = chapters[Math.min(chapterIdx, chapters.length - 1)] || chapters[0];
      return { from: c.from, to: c.to, label: c.from != null ? c.label.trim() : '' };
    }
    const from = pageFrom ? parseInt(pageFrom, 10) : null;
    const to = pageTo ? parseInt(pageTo, 10) : null;
    const label = (from != null || to != null) ? `pages ${from || 1}–${to || (book && book.pages) || ''}` : '';
    return { from, to, label };
  };

  const runSummary = async () => {
    if (!studyable || studyBusy) return;
    const { from, to, label } = currentRange();
    setMessages((prev) => [...prev, { role: 'assistant', kind: 'summary', title: `Summary${label ? ` · ${label}` : ''}`, content: '' }]);
    setStudyBusy(true);
    const patchLast = (fn) => setMessages((prev) => { const c = [...prev]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/summarize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook, from, to, label }),
      });
      if (!r.ok) throw new Error(await r.text());
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split('\n\n'); buf = events.pop();
        for (const evt of events) {
          const lines = evt.split('\n');
          const ev = lines.find((l) => l.startsWith('event: '))?.slice(7);
          const dl = lines.find((l) => l.startsWith('data: '))?.slice(6);
          if (!dl) continue;
          let j; try { j = JSON.parse(dl); } catch { continue; }
          if (ev === 'progress') patchLast((m) => (m.content ? m : { ...m, status: j.status }));
          else if (ev === 'token') patchLast((m) => ({ ...m, content: m.content + j.t, status: undefined }));
          else if (ev === 'error') patchLast((m) => ({ ...m, content: `Error: ${j.error}`, status: undefined }));
        }
      }
    } catch (e) {
      patchLast((m) => ({ ...m, content: `Error: ${e.message}`, status: undefined }));
    } finally {
      setStudyBusy(false);
    }
  };

  const runQuiz = async () => {
    if (!studyable || studyBusy) return;
    const { from, to, label } = currentRange();
    setMessages((prev) => [...prev, { role: 'assistant', kind: 'quiz', title: `Quiz${label ? ` · ${label}` : ''}`, quiz: null, status: 'writing questions…' }]);
    setStudyBusy(true);
    const patchLast = (fn) => setMessages((prev) => { const c = [...prev]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/quiz`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook, from, to, count: quizCount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'quiz failed');
      patchLast((m) => ({ ...m, quiz: j.questions, status: undefined }));
    } catch (e) {
      patchLast((m) => ({ ...m, error: e.message, status: undefined }));
    } finally {
      setStudyBusy(false);
    }
  };

  const deleteBook = async () => {
    if (!selectedBook) return;
    if (!window.confirm('Delete this book from the index?')) return;
    await fetch(`${RAG_BASE}/api/rag/books/${selectedBook}`, { method: 'DELETE' });
    try { localStorage.removeItem(`bookshelf.chat.${selectedBook}`); } catch {}
    setMessages([]);
    await refresh();
  };

  return (
    <>
      {/* Pull-tab on the chosen edge — reopens the chat without losing state */}
      <button
        className={`chat-handle${open ? ' is-hidden' : ''}${side === 'left' ? ' left' : ''}`}
        onClick={onToggle}
        title="Open chat"
        aria-label="Open chat"
      >
        <span className="chat-handle-icon">💬</span>
        <span className="chat-handle-label">Chat</span>
      </button>

      <div
        id="chatPanel"
        className={open ? 'is-open' : ''}
        aria-hidden={!open}
        style={{
          [side]: '18px',
          [side === 'left' ? 'right' : 'left']: 'auto',
          transform: open
            ? 'translateX(0) rotate(-0.6deg)'
            : `translateX(${side === 'left' ? 'calc(-100% - 34px)' : 'calc(100% + 34px)'}) rotate(-0.6deg)`,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
      <span className="tape" title="Chat with your book" />

      <div className="chat-head">
        <div className="chat-title-row">
          <h3 className="panel-title">Chat ✦</h3>
          <div className="chat-actions">
            <button className={`chat-icon${studyOpen ? ' is-active' : ''}`} title="Study tools — summaries & quizzes" onClick={() => setStudyOpen((v) => !v)} disabled={!studyable}>🎓</button>
            <button className="chat-icon" title="Delete this book" onClick={deleteBook} disabled={!selectedBook || selectedBook === ALL_BOOKS}>🗑</button>
            <button
              className="chat-icon"
              title={`Move chat to the ${side === 'left' ? 'right' : 'left'}`}
              aria-label={`Move chat to the ${side === 'left' ? 'right' : 'left'}`}
              onClick={() => setSide(side === 'left' ? 'right' : 'left')}
            >⇄</button>
            <button className="chat-icon" title="AI settings" onClick={() => onOpenSettings && onOpenSettings()}>⚙</button>
            <button className="chat-icon close" title="Hide chat" onClick={onToggle}>×</button>
          </div>
        </div>

        <select className="chat-book" value={selectedBook} onChange={e => setSelectedBook(e.target.value)}>
          {books.length === 0 && <option value="">(drop a PDF to add a book)</option>}
          {books.length > 1 && <option value={ALL_BOOKS}>✦ All books</option>}
          {books.map(b => <option key={b.id} value={b.id}>{b.name.replace(/\.pdf$/i, '')}</option>)}
        </select>

        {modelInfo.models.length > 0 && (
          <div className="chat-modelrow">
            <span className="chat-modellabel">model</span>
            <select className="chat-model" value={modelInfo.active} onChange={(e) => setActiveModel(e.target.value)}>
              {modelInfo.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}

        {studyOpen && studyable && (
          <div className="chat-study">
            <div className="chat-study-row">
              <span className="chat-study-label">Scope</span>
              {chapters ? (
                <select className="chat-study-scope" value={chapterIdx} onChange={(e) => setChapterIdx(Number(e.target.value))}>
                  {chapters.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
                </select>
              ) : (
                <span className="chat-study-pages">
                  pages
                  <input className="chat-study-num" type="number" min="1" placeholder="1" value={pageFrom} onChange={(e) => setPageFrom(e.target.value)} />
                  –
                  <input className="chat-study-num" type="number" min="1" placeholder={book && book.pages ? String(book.pages) : ''} value={pageTo} onChange={(e) => setPageTo(e.target.value)} />
                </span>
              )}
            </div>
            <div className="chat-study-row">
              <button className="chat-study-btn" onClick={runSummary} disabled={studyBusy}>📄 Summarize</button>
              <button className="chat-study-btn" onClick={runQuiz} disabled={studyBusy}>🎓 Quiz</button>
              <select className="chat-study-count" value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))} title="Number of questions">
                {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} Qs</option>)}
              </select>
              {studyBusy && <span className="chat-study-spin">working…</span>}
            </div>
            {!chapters && <div className="chat-study-hint">This PDF has no chapter bookmarks — pick a page range (leave blank for the whole book).</div>}
          </div>
        )}

        {uploading && (
          <div className="chat-status">
            Indexing PDF… this can take a while on the first upload with a local model.
          </div>
        )}
        {uploadError && !uploading && (
          <div className="chat-error">
            <span><strong>Indexing failed:</strong> {uploadError}</span>
            <button title="Dismiss" onClick={() => setUploadError('')}>×</button>
          </div>
        )}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            {books.length
              ? 'Ask a question about the selected book ~'
              : 'Drop a PDF into the Files panel, then ask a question here ~'}
          </div>
        )}
        {messages.map((m, i) => {
          const jump = (c) => onCite && onCite(c.bookId || selectedBook, c.snippet, c.page);
          if (m.kind === 'quiz') {
            return <QuizCard key={i} title={m.title} quiz={m.quiz} status={m.status} error={m.error} />;
          }
          const isLast = i === messages.length - 1;
          return (
          <div key={i} className={`chat-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
            {m.title && <div className="chat-study-title">📄 {m.title}</div>}
            {m.status && !m.content
              ? <div className="chat-study-status">{m.status}</div>
              : m.role === 'user'
                ? <div>{m.content}</div>
                : <AnswerText
                    content={m.content || ((busy || studyBusy) && isLast ? '…' : '')}
                    citations={m.citations}
                    onJump={jump}
                  />}
            {m.citations && m.citations.length > 0 && (
              <details className="chat-cite">
                <summary>📖 sources · click to find in the page</summary>
                {m.citations.map(c => (
                  <button
                    key={c.label ?? c.idx}
                    type="button"
                    className="chat-cite-item"
                    onClick={() => jump(c)}
                    title={c.page ? `Go to page ${c.page}` : 'Show this passage in the PDF'}
                  >
                    <span className="chat-cite-num">[{c.label}]</span>
                    {c.page ? <span className="chat-cite-page">p.{c.page}</span> : null}
                    {selectedBook === ALL_BOOKS && c.bookName
                      ? <span className="chat-cite-book">{c.bookName.replace(/\.pdf$/i, '')}</span> : null}
                    {c.snippet}…
                  </button>
                ))}
              </details>
            )}
          </div>
          );
        })}
      </div>

      <div className="chat-inputrow">
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={books.length ? 'Ask a question…' : 'Upload a PDF first'}
          disabled={!books.length || busy}
        />
        <button className="chat-send" onClick={send} disabled={!books.length || busy || !input.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </div>

      </div>
    </>
  );
}

