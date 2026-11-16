import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PdfViewer } from './PdfViewer';
import { useLocalStorage } from '../hooks/useLocalStorage';
import './FocusWorkspace.css';

const RAG_BASE = (typeof window !== 'undefined' && window.bookshelf && window.bookshelf.ragBase)
  || process.env.REACT_APP_RAG_BASE || 'http://localhost:5001';

const uid = () => Math.random().toString(36).slice(2, 9);

// ── A small, self-contained RAG chat column (streams over SSE, uses notes) ──
function RagColumn({ bookId, notes }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef();

  useEffect(() => { setMessages([]); }, [bookId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const renderAnswer = (text, cites) => {
    const by = new Map((cites || []).map((c) => [String(c.label), c]));
    const parts = (text || '').split(/(\[\d+\])/g);
    return parts.map((p, i) => {
      const m = /^\[(\d+)\]$/.exec(p);
      const c = m && by.get(m[1]);
      if (c) return <sup key={i} className="fw-cref" title={c.source === 'notes' ? 'from your notes' : (c.page ? `p.${c.page}` : '')}>[{m[1]}]</sup>;
      return <React.Fragment key={i}>{p}</React.Fragment>;
    });
  };

  const send = async () => {
    const q = input.trim();
    if (!q || !bookId || busy) return;
    setInput('');
    const history = messages.filter((m) => m.content).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '', citations: [] }]);
    setBusy(true);
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, question: q, history, notes: notes || '' }),
      });
      if (!r.ok) throw new Error(await r.text());
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      const patch = (fn) => setMessages((prev) => { const c = [...prev]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const evts = buf.split('\n\n'); buf = evts.pop();
        for (const evt of evts) {
          const ev = evt.split('\n').find((l) => l.startsWith('event: '))?.slice(7);
          const dl = evt.split('\n').find((l) => l.startsWith('data: '))?.slice(6);
          if (!dl) continue;
          let j; try { j = JSON.parse(dl); } catch { continue; }
          if (ev === 'citations') patch((m) => ({ ...m, citations: j }));
          else if (ev === 'token') patch((m) => ({ ...m, content: m.content + j.t }));
          else if (ev === 'error') patch((m) => ({ ...m, content: `Error: ${j.error}` }));
        }
      }
    } catch (e) {
      setMessages((prev) => { const c = [...prev]; c[c.length - 1] = { ...c[c.length - 1], content: `Error: ${e.message}` }; return c; });
    } finally { setBusy(false); }
  };

  return (
    <div className="fw-rag">
      <div className="fw-rag-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="fw-empty">{bookId ? 'Ask about this PDF — your notes are in the mix too.' : 'Open a PDF to start asking.'}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`fw-msg ${m.role}`}>
            {m.role === 'user' ? m.content : (
              <>
                <div>{renderAnswer(m.content || (busy && i === messages.length - 1 ? '…' : ''), m.citations)}</div>
                {m.citations && m.citations.length > 0 && (
                  <div className="fw-cites">
                    {m.citations.map((c) => (
                      <span key={c.label} className={`fw-cite${c.source === 'notes' ? ' note' : ''}`}>
                        [{c.label}] {c.source === 'notes' ? '📝 note' : (c.page ? `p.${c.page}` : '')}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="fw-composer">
        <input
          className="fw-composer-input"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={bookId ? 'Message the assistant…' : 'Open a PDF first'}
          disabled={!bookId || busy}
        />
        <div className="fw-composer-foot">
          <span className="fw-composer-hint">grounded · pdf + notes</span>
          <button className="fw-send" onClick={send} disabled={!bookId || busy || !input.trim()} title="Send">↑</button>
        </div>
      </div>
    </div>
  );
}

export default function FocusWorkspace({ theme, setTheme, mode, setMode, onOpenSettings }) {
  const [sessions, setSessions] = useLocalStorage('focus.sessions', [{ id: 'default', name: 'Session 1', bookId: '' }]);
  const [activeId, setActiveId] = useLocalStorage('focus.active', 'default');
  const [books, setBooks] = useState([]);
  const [fileUrl, setFileUrl] = useState(null);
  const [page, setPage] = useState(1);
  const [notesW, setNotesW] = useLocalStorage('focus.col.notes', 300);
  const [ragW, setRagW] = useLocalStorage('focus.col.rag', 360);
  const [railOpen, setRailOpen] = useLocalStorage('focus.rail', true);
  const fileInputRef = useRef();

  const active = sessions.find((s) => s.id === activeId) || sessions[0];
  const bookId = active?.bookId || '';
  const [notes, setNotes] = useLocalStorage(`focus.notes.${activeId}`, '');

  const loadBooks = useCallback(() => {
    fetch(`${RAG_BASE}/api/rag/books`).then((r) => r.json()).then((bs) => setBooks(Array.isArray(bs) ? bs : [])).catch(() => {});
  }, []);
  useEffect(() => { loadBooks(); }, [loadBooks]);

  // Load the active session's PDF into the viewer.
  useEffect(() => {
    let revoked = null;
    if (!bookId) { setFileUrl(null); return undefined; }
    fetch(`${RAG_BASE}/api/rag/pdf/${bookId}`)
      .then((r) => r.blob())
      .then((b) => { const u = URL.createObjectURL(b); revoked = u; setFileUrl(u); })
      .catch(() => setFileUrl(null));
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [bookId]);

  const setBook = (id) => setSessions((ss) => ss.map((s) => (s.id === activeId ? { ...s, bookId: id } : s)));

  const addSession = () => {
    const id = uid();
    setSessions((ss) => [...ss, { id, name: `Session ${ss.length + 1}`, bookId: '' }]);
    setActiveId(id);
  };
  const removeSession = (id) => {
    setSessions((ss) => {
      const next = ss.filter((s) => s.id !== id);
      return next.length ? next : [{ id: 'default', name: 'Session 1', bookId: '' }];
    });
    if (id === activeId) { const other = sessions.find((s) => s.id !== id); setActiveId(other ? other.id : 'default'); }
  };
  const renameSession = (id, name) => setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, name } : s)));

  // Upload a new PDF and attach it to the active session.
  const onUpload = (file) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    fetch(`${RAG_BASE}/api/rag/upload`, { method: 'POST', body: form })
      .then((r) => r.json())
      .then((b) => { if (b && b.id) { loadBooks(); setBook(b.id); } })
      .catch(() => {});
  };

  // Column drag-resize (notes = left width, rag = right width, PDF flexes).
  const startResize = (which) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = which === 'notes' ? notesW : ragW;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (which === 'notes') setNotesW(Math.max(180, Math.min(620, startW + dx)));
      else setRagW(Math.max(220, Math.min(680, startW - dx)));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
  };

  return (
    <div className="fw-root">
      {/* Sessions rail */}
      <aside className={`fw-rail${railOpen ? '' : ' collapsed'}`}>
        <div className="fw-rail-brand">
          <button className="fw-rail-toggle" title={railOpen ? 'Collapse' : 'Expand'} onClick={() => setRailOpen((v) => !v)}>☰</button>
          {railOpen && <span className="fw-brand">⚓ Lumen</span>}
        </div>
        {railOpen && (
          <button className="fw-nav fw-newsess" onClick={addSession}><span className="fw-nav-ico">＋</span> New session</button>
        )}
        {railOpen && <div className="fw-rail-label">Sessions</div>}
        {railOpen && (
          <div className="fw-rail-list">
            {sessions.map((s) => (
              <div key={s.id} className={`fw-sess${s.id === activeId ? ' active' : ''}`} onClick={() => setActiveId(s.id)}>
                <span className="fw-sess-ico">▸</span>
                <input
                  className="fw-sess-name" value={s.name}
                  onChange={(e) => renameSession(s.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button className="fw-sess-del" title="Delete" onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {railOpen && (
          <div className="fw-rail-foot">
            <button className="fw-nav" onClick={() => onOpenSettings && onOpenSettings()}><span className="fw-nav-ico">◑</span> Theme</button>
          </div>
        )}
      </aside>

      {/* Tiled columns */}
      <main className="fw-main">
        <section className="fw-pane fw-notes" style={{ width: notesW, flex: '0 0 auto' }}>
          <header className="fw-pane-head">Notes</header>
          <textarea
            className="fw-notes-area" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Write your notes… the assistant reads these too."
          />
        </section>
        <div className="fw-resizer" onMouseDown={startResize('notes')} />

        <section className="fw-pane fw-pdf" style={{ flex: '1 1 auto', minWidth: 240 }}>
          <header className="fw-pane-head">
            <span>PDF</span>
            <span className="fw-pdf-controls">
              <select value={bookId} onChange={(e) => setBook(e.target.value)}>
                <option value="">— choose a PDF —</option>
                {books.map((b) => <option key={b.id} value={b.id}>{b.name.replace(/\.pdf$/i, '')}</option>)}
              </select>
              <button onClick={() => fileInputRef.current?.click()} title="Index a new PDF">＋ Add</button>
              <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
            </span>
          </header>
          <div className="fw-pdf-body">
            {fileUrl
              ? <PdfViewer fileUrl={fileUrl} initialPage={page} onPageChange={setPage} bookId={bookId} />
              : <div className="fw-empty">Choose an indexed PDF, or <button className="fw-link" onClick={() => fileInputRef.current?.click()}>add one</button>.</div>}
          </div>
        </section>
        <div className="fw-resizer" onMouseDown={startResize('rag')} />

        <section className="fw-pane fw-ragcol" style={{ width: ragW, flex: '0 0 auto' }}>
          <header className="fw-pane-head">Assistant</header>
          <RagColumn bookId={bookId} notes={notes} />
        </section>
      </main>
    </div>
  );
}
