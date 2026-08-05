import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { TRACKS, BACKGROUNDS, DEFAULT_BACKGROUND } from './constants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { MusicPlayer } from './components/MusicPlayer';
import { Planner } from './components/Planner';
import { NoteArea } from './components/NoteArea';
import { Library } from './components/Library';
import { DropArea } from './components/DropArea';
import { CookiePopup } from './components/CookiePopup';
import { Timer } from './components/Timer';
import { StatsCard } from './components/StatsCard';
import SettingsPanel from './components/SettingsPanel';
import { Tutorial } from './components/Tutorial';
import ChatPanel from './components/ChatPanel';
import { useReadingStats } from './hooks/useReadingStats';
import { setAmbient, AMBIENT_SOUNDS } from './audio/ambient';
import { DEFAULT_THEME } from './theme';

const RAG_BASE = (typeof window !== 'undefined' && window.bookshelf && window.bookshelf.ragBase)
  || process.env.REACT_APP_RAG_BASE || 'http://localhost:5001';

const emptyPanels = {
  planner: false,
  dropArea: false,
  noteArea: false,
  library: false,
  timer: false,
  chat: false,
  settings: false,
  stats: false,
};

function App() {
  // --- Persisted state (survives refresh) ---
  const [tasks, setTasks] = useLocalStorage('bookshelf.tasks', []);
  const [notes, setNotes] = useLocalStorage('bookshelf.notes', '');
  const [background, setBackground] = useLocalStorage('bookshelf.bg', DEFAULT_BACKGROUND);
  const [currentTrackIndex, setCurrentTrackIndex] = useLocalStorage('bookshelf.track', 0);
  const [volume, setVolume] = useLocalStorage('bookshelf.volume', 0.7);
  const [cookiesAccepted, setCookiesAccepted] = useLocalStorage('bookshelf.cookies', false);
  const [theme, setTheme] = useLocalStorage('bookshelf.theme', DEFAULT_THEME);
  const [mode, setMode] = useLocalStorage('bookshelf.mode', 'dark');
  const [tutorialSeen, setTutorialSeen] = useLocalStorage('bookshelf.tutorialSeen', false);
  const [showTutorial, setShowTutorial] = useState(false);

  // --- Session state ---
  const [panels, setPanels] = useState(emptyPanels);
  const [settingsTab, setSettingsTab] = useState('appearance');
  const [currentFile, setCurrentFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userWallpapers, setUserWallpapers] = useState([]);
  const [userMusic, setUserMusic] = useState([]);
  const [userAmbient, setUserAmbient] = useState([]);
  const [ambientMix, setAmbientMix] = useLocalStorage('bookshelf.ambient', {});
  const [books, setBooks] = useState([]);
  const [openBookId, setOpenBookId] = useState(null);
  const [reading, setReading] = useLocalStorage('bookshelf.reading', {});
  const audioRef = useRef(null);

  // Apply the selected theme to the document root; every panel reskins via CSS.
  // Apply theme/mode instantly: disable transitions for one frame around the
  // swap so the whole UI doesn't slowly cross-fade (which felt sluggish).
  const applyInstant = (fn) => {
    const root = document.documentElement;
    root.classList.add('no-anim');
    fn(root);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-anim')));
  };
  useEffect(() => { applyInstant((root) => { root.dataset.theme = theme; }); }, [theme]);
  useEffect(() => { applyInstant((root) => { root.dataset.mode = mode; }); }, [mode]);

  // Migrate a wallpaper saved with the old absolute path (pre-PUBLIC_URL) so it
  // still resolves under Electron's file:// protocol in the packaged app.
  useEffect(() => {
    if (typeof background === 'string' && background.startsWith('/images/')) {
      setBackground(`${process.env.PUBLIC_URL}${background}`);
    }
  }, [background, setBackground]);

  // First launch → show the tour once (after a beat so the UI is in place).
  useEffect(() => {
    if (!tutorialSeen) {
      const t = setTimeout(() => setShowTutorial(true), 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [tutorialSeen]);

  const closeTutorial = useCallback(() => { setShowTutorial(false); setTutorialSeen(true); }, [setTutorialSeen]);
  const replayTutorial = useCallback(() => { setPanels(emptyPanels); setShowTutorial(true); }, []);

  // --- Reading stats ---
  const { today: statsToday, streak, addMinutes, addPomodoro } = useReadingStats();
  useEffect(() => {
    const id = setInterval(() => {
      const pdfOpen = panels.dropArea && currentFile && currentFile.type === 'application/pdf';
      if (pdfOpen && document.hasFocus()) addMinutes(1);
    }, 60000);
    return () => clearInterval(id);
  }, [panels.dropArea, currentFile, addMinutes]);

  // --- Custom media (user-added wallpapers + music) ---
  const refreshMedia = useCallback(() => {
    const arr = (d) => (Array.isArray(d) ? d : []);
    fetch(`${RAG_BASE}/api/media/wallpapers`).then((r) => r.json()).then((d) => setUserWallpapers(arr(d))).catch(() => {});
    fetch(`${RAG_BASE}/api/media/music`).then((r) => r.json()).then((d) => setUserMusic(arr(d))).catch(() => {});
    fetch(`${RAG_BASE}/api/media/ambient`).then((r) => r.json()).then((d) => setUserAmbient(arr(d))).catch(() => {});
  }, []);
  useEffect(() => { refreshMedia(); }, [refreshMedia]);

  // --- Ambient mixer ---
  // Sync the procedural (built-in) sounds with the saved mix.
  useEffect(() => {
    AMBIENT_SOUNDS.forEach((s) => {
      const st = ambientMix[s.key] || {};
      setAmbient(s.key, !!st.on, st.vol ?? 0.5);
    });
  }, [ambientMix]);

  const toggleAmbient = useCallback((key) => {
    setAmbientMix((m) => ({ ...m, [key]: { on: !(m[key]?.on), vol: m[key]?.vol ?? 0.5 } }));
  }, [setAmbientMix]);
  const setAmbientVol = useCallback((key, vol) => {
    setAmbientMix((m) => ({ ...m, [key]: { on: m[key]?.on ?? true, vol } }));
  }, [setAmbientMix]);
  const addAmbient = useCallback((file) => {
    const form = new FormData(); form.append('file', file);
    fetch(`${RAG_BASE}/api/media/ambient`, { method: 'POST', body: form }).then(() => refreshMedia()).catch(() => {});
  }, [refreshMedia]);
  const removeAmbient = useCallback((a) => {
    fetch(`${RAG_BASE}/api/media/ambient/${a.id}`, { method: 'DELETE' }).then(() => {
      setAmbientMix((m) => { const n = { ...m }; delete n[`u:${a.id}`]; return n; });
      refreshMedia();
    });
  }, [refreshMedia, setAmbientMix]);

  // --- Library (books persist server-side) ---
  const fetchBooks = useCallback(() => {
    fetch(`${RAG_BASE}/api/rag/books`).then((r) => r.json()).then((d) => setBooks(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(() => {
    fetchBooks();
    const onRefresh = () => fetchBooks();
    window.addEventListener('rag:refresh', onRefresh);
    return () => window.removeEventListener('rag:refresh', onRefresh);
  }, [fetchBooks]);

  const openBook = useCallback(async (book) => {
    try {
      const r = await fetch(`${RAG_BASE}/api/rag/pdf/${book.id}`);
      const blob = await r.blob();
      const file = new File([blob], book.name, { type: 'application/pdf' });
      setOpenBookId(book.id);
      setCurrentFile(file);
      setPanels((p) => ({ ...p, dropArea: true }));
    } catch { /* ignore */ }
  }, []);

  const deleteBook = useCallback((book) => {
    if (!window.confirm('Remove this book from your library?')) return;
    fetch(`${RAG_BASE}/api/rag/books/${book.id}`, { method: 'DELETE' }).then(() => {
      try { localStorage.removeItem(`bookshelf.chat.${book.id}`); } catch {}
      setOpenBookId((id) => (id === book.id ? null : id));
      setCurrentFile((cf) => (cf && cf.name === book.name ? null : cf));
      fetchBooks();
    });
  }, [fetchBooks]);

  // Citation click in the chat: open that book in the reader (if needed) then
  // highlight the passage. The PdfViewer listens for the 'reader:highlight' event.
  const handleCite = useCallback((bookId, snippet, page) => {
    const fire = () => window.dispatchEvent(new CustomEvent('reader:highlight', { detail: { bookId, snippet, page } }));
    if (openBookId === bookId && panels.dropArea) {
      fire();
    } else {
      const book = books.find((b) => b.id === bookId);
      if (book) { openBook(book); setTimeout(fire, 900); }
      else fire();
    }
  }, [openBookId, panels.dropArea, books, openBook]);

  const onReaderPage = useCallback((page) => {
    if (openBookId) setReading((r) => ({ ...r, [openBookId]: page }));
  }, [openBookId, setReading]);

  const wallpapers = useMemo(() => [
    ...BACKGROUNDS.map((b) => ({ key: b.file, name: b.name, url: `${process.env.PUBLIC_URL}/images/${b.file}` })),
    ...userWallpapers.map((w) => ({ key: w.id, name: w.name, url: `${RAG_BASE}/api/media/file/wallpapers/${encodeURIComponent(w.file)}`, id: w.id, custom: true })),
  ], [userWallpapers]);

  const tracks = useMemo(() => [
    ...TRACKS.map((t, i) => ({ key: `d${i}`, name: t.name, src: t.src })),
    ...userMusic.map((t) => ({ key: t.id, name: t.name, src: `${RAG_BASE}/api/media/file/music/${encodeURIComponent(t.file)}`, id: t.id, custom: true })),
  ], [userMusic]);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  // Keep the current track index valid if the playlist shrinks.
  useEffect(() => {
    if (currentTrackIndex >= tracks.length) setCurrentTrackIndex(0);
  }, [tracks.length, currentTrackIndex, setCurrentTrackIndex]);

  const togglePanel = useCallback((key) => {
    setPanels((p) => ({ ...p, [key]: !p[key] }));
  }, []);

  const openSettings = useCallback((tab = 'appearance') => {
    setSettingsTab(tab);
    setPanels((p) => ({ ...p, settings: true }));
  }, []);

  // Toolbar clicks: the ⚙ item opens Settings; everything else toggles its panel.
  const handleToggle = useCallback((key) => {
    if (key === 'settings') { openSettings('appearance'); return; }
    togglePanel(key);
  }, [openSettings, togglePanel]);

  const closeAllPanels = useCallback(() => setPanels(emptyPanels), []);

  // --- Media handlers ---
  const addWallpaper = useCallback((file, name) => {
    const form = new FormData();
    if (name) form.append('name', name);
    form.append('file', file);
    fetch(`${RAG_BASE}/api/media/wallpapers`, { method: 'POST', body: form }).then(() => refreshMedia()).catch(() => {});
  }, [refreshMedia]);
  const removeWallpaper = useCallback((w) => {
    fetch(`${RAG_BASE}/api/media/wallpapers/${w.id}`, { method: 'DELETE' }).then(() => {
      setBackground((bg) => (bg === w.url ? DEFAULT_BACKGROUND : bg));
      refreshMedia();
    });
  }, [refreshMedia, setBackground]);
  const addMusic = useCallback((file) => {
    const form = new FormData(); form.append('file', file);
    fetch(`${RAG_BASE}/api/media/music`, { method: 'POST', body: form }).then(() => refreshMedia()).catch(() => {});
  }, [refreshMedia]);
  const removeMusic = useCallback((t) => {
    fetch(`${RAG_BASE}/api/media/music/${t.id}`, { method: 'DELETE' }).then(() => refreshMedia());
  }, [refreshMedia]);
  const selectWallpaper = useCallback((w) => setBackground(w.url), [setBackground]);

  // --- Audio: track control (reads tracks via ref so callbacks stay stable) ---
  const loadAndMaybePlay = useCallback((index) => {
    const el = audioRef.current;
    const list = tracksRef.current;
    if (!el || !list[index]) return;
    el.src = list[index].src;
    el.load();
    if (isPlaying) el.play().catch(() => {});
  }, [isPlaying]);

  const nextTrack = useCallback(() => {
    setCurrentTrackIndex((i) => {
      const next = (i + 1) % tracksRef.current.length;
      loadAndMaybePlay(next);
      return next;
    });
  }, [loadAndMaybePlay, setCurrentTrackIndex]);

  const previousTrack = useCallback(() => {
    setCurrentTrackIndex((i) => {
      const len = tracksRef.current.length;
      const prev = (i - 1 + len) % len;
      loadAndMaybePlay(prev);
      return prev;
    });
  }, [loadAndMaybePlay, setCurrentTrackIndex]);

  // Wire the audio element's native events → our state.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => nextTrack();
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [nextTrack]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  // --- Keyboard shortcuts (Space, arrows, Escape) ---
  useKeyboardShortcuts({
    ' ': togglePlay,
    ArrowRight: nextTrack,
    ArrowLeft: previousTrack,
    Escape: closeAllPanels,
  });

  // --- Files ---
  const handleFileSelected = useCallback((file) => {
    setCurrentFile(file);

    // PDFs get indexed by the RAG backend (so they can be chatted with) and
    // become persistent library books. The upload response is the book.
    if (file && file.type === 'application/pdf') {
      const form = new FormData();
      form.append('file', file);
      window.dispatchEvent(new CustomEvent('rag:uploading', { detail: true }));
      fetch(`${RAG_BASE}/api/rag/upload`, { method: 'POST', body: form })
        .then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(t)))))
        .then((book) => { if (book && book.id) setOpenBookId(book.id); window.dispatchEvent(new Event('rag:refresh')); })
        .catch((err) => {
          let msg = err.message || 'upload failed';
          try { const j = JSON.parse(msg); if (j.error) msg = j.error; } catch {}
          console.warn('RAG upload failed:', msg);
          window.dispatchEvent(new CustomEvent('rag:error', { detail: msg }));
        })
        .finally(() => window.dispatchEvent(new CustomEvent('rag:uploading', { detail: false })));
    }
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  return (
    <div style={{ backgroundImage: `url(${background})` }} className="App">
      <div className="app-scrim" aria-hidden="true" />

      <MusicPlayer
        audioRef={audioRef}
        tracks={tracks}
        currentTrackIndex={currentTrackIndex}
        onPrev={previousTrack}
        onNext={nextTrack}
        volume={volume}
        onVolumeChange={setVolume}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        panels={panels}
        toggle={handleToggle}
        toggleFullscreen={toggleFullscreen}
        ambientMix={ambientMix}
        onToggleAmbient={toggleAmbient}
      />

      {/* User ambient loops (built-in ones are Web-Audio, no element needed) */}
      {userAmbient.map((a) => {
        const st = ambientMix[`u:${a.id}`] || {};
        return st.on ? (
          <audio
            key={a.id}
            src={`${RAG_BASE}/api/media/file/ambient/${encodeURIComponent(a.file)}`}
            autoPlay
            loop
            ref={(el) => { if (el) el.volume = st.vol ?? 0.5; }}
          />
        ) : null;
      })}

      {!cookiesAccepted && <CookiePopup onAccept={() => setCookiesAccepted(true)} />}

      {panels.noteArea && <NoteArea notes={notes} setNotes={setNotes} />}
      {panels.planner && <Planner tasks={tasks} setTasks={setTasks} />}
      {panels.library && (
        <Library
          books={books}
          openBookId={openBookId}
          onOpen={openBook}
          onDelete={deleteBook}
          onAddBook={handleFileSelected}
        />
      )}
      {panels.dropArea && (
        <DropArea
          currentFile={currentFile}
          onFileSelected={handleFileSelected}
          bookId={openBookId}
          initialPage={(openBookId && reading[openBookId]) || 1}
          onPageChange={onReaderPage}
        />
      )}
      {panels.timer && <Timer onClose={() => togglePanel('timer')} onComplete={addPomodoro} />}
      {panels.stats && <StatsCard today={statsToday} streak={streak} onClose={() => togglePanel('stats')} />}

      {panels.settings && (
        <SettingsPanel
          initialTab={settingsTab}
          onClose={() => togglePanel('settings')}
          theme={theme}
          setTheme={setTheme}
          mode={mode}
          setMode={setMode}
          wallpapers={wallpapers}
          currentWallpaper={background}
          onSelectWallpaper={selectWallpaper}
          onAddWallpaper={addWallpaper}
          onRemoveWallpaper={removeWallpaper}
          tracks={tracks}
          onAddMusic={addMusic}
          onRemoveMusic={removeMusic}
          ambientMix={ambientMix}
          userAmbient={userAmbient}
          onToggleAmbient={toggleAmbient}
          onAmbientVol={setAmbientVol}
          onAddAmbient={addAmbient}
          onRemoveAmbient={removeAmbient}
          onReplayTutorial={() => { togglePanel('settings'); replayTutorial(); }}
        />
      )}

      {showTutorial && <Tutorial onClose={closeTutorial} />}

      {/* Chat stays mounted so its conversation survives being hidden. */}
      <ChatPanel
        open={panels.chat}
        onToggle={() => togglePanel('chat')}
        onOpenSettings={() => openSettings('ai')}
        onCite={handleCite}
      />
    </div>
  );
}

export default App;
