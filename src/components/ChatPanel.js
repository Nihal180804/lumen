import React, { useState, useEffect, useRef } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import './ChatPanel.css';

const RAG_BASE = (typeof window !== 'undefined' && window.bookshelf && window.bookshelf.ragBase)
  || process.env.REACT_APP_RAG_BASE || 'http://localhost:5001';

export default function ChatPanel({ open, onToggle, onOpenSettings, onCite }) {
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
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
            <button className="chat-icon" title="Delete this book" onClick={deleteBook} disabled={!selectedBook}>🗑</button>
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
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
            <div>{m.content || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : '')}</div>
            {m.citations && m.citations.length > 0 && (
              <details className="chat-cite">
                <summary>📖 from the book · click to find in the page</summary>
                {m.citations.map(c => (
                  <button
                    key={c.idx}
                    type="button"
                    className="chat-cite-item"
                    onClick={() => onCite && onCite(selectedBook, c.snippet, c.page)}
                    title={c.page ? `Go to page ${c.page}` : 'Show this passage in the PDF'}
                  >{c.page ? <span className="chat-cite-page">p.{c.page}</span> : null}{c.snippet}…</button>
                ))}
              </details>
            )}
          </div>
        ))}
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

