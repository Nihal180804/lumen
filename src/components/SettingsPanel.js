import React, { useState, useEffect, useRef } from 'react';
import { THEMES } from '../theme';
import { AMBIENT_SOUNDS } from '../audio/ambient';
import { useFilmstripNav } from '../hooks/useFilmstripNav';
import './SettingsPanel.css';

const RAG_BASE = (typeof window !== 'undefined' && window.bookshelf && window.bookshelf.ragBase)
  || process.env.REACT_APP_RAG_BASE || 'http://localhost:5001';

const TABS = [
  { key: 'appearance', label: 'Appearance', icon: '🎨' },
  { key: 'sounds',     label: 'Sounds',     icon: '🎵' },
  { key: 'ai',         label: 'AI',         icon: '💬' },
];

export default function SettingsPanel({
  initialTab = 'appearance', onClose,
  theme, setTheme, mode, setMode,
  wallpapers, currentWallpaper, onSelectWallpaper, onAddWallpaper, onRemoveWallpaper,
  tracks, onAddMusic, onRemoveMusic,
  ambientMix, userAmbient, onToggleAmbient, onAmbientVol, onAddAmbient, onRemoveAmbient,
  onReplayTutorial,
}) {
  // Opens to initialTab on mount; we don't reset it afterward, so switching
  // tabs sticks even as the app re-renders around it.
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <aside className="settings-rail">
          <h3 className="settings-brand">Settings</h3>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`settings-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
          <button className="settings-close" onClick={onClose} aria-label="Close settings">Close ×</button>
        </aside>

        <section className="settings-content">
          {tab === 'appearance' && (
            <AppearanceTab
              theme={theme} setTheme={setTheme} mode={mode} setMode={setMode}
              wallpapers={wallpapers} currentWallpaper={currentWallpaper}
              onSelectWallpaper={onSelectWallpaper}
              onAddWallpaper={onAddWallpaper} onRemoveWallpaper={onRemoveWallpaper}
              onReplayTutorial={onReplayTutorial}
            />
          )}
          {tab === 'sounds' && (
            <SoundsTab
              tracks={tracks} onAddMusic={onAddMusic} onRemoveMusic={onRemoveMusic}
              ambientMix={ambientMix} userAmbient={userAmbient}
              onToggleAmbient={onToggleAmbient} onAmbientVol={onAmbientVol}
              onAddAmbient={onAddAmbient} onRemoveAmbient={onRemoveAmbient}
            />
          )}
          {tab === 'ai' && <AiTab />}
        </section>
      </div>
    </div>
  );
}

/* ---------------- Appearance: themes + wallpapers ---------------- */

function AppearanceTab({ theme, setTheme, mode, setMode, wallpapers, currentWallpaper, onSelectWallpaper, onAddWallpaper, onRemoveWallpaper, onReplayTutorial }) {
  const themeRef = useRef(null);
  const wpRef = useRef(null);
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // { file, name }

  const themeIdx = Math.max(0, THEMES.findIndex((t) => t.key === theme));
  const themeNav = useFilmstripNav(THEMES.length, themeIdx, (i) => setTheme(THEMES[i].key), themeRef);

  const wpIdx = Math.max(0, wallpapers.findIndex((w) => w.url === currentWallpaper));
  const wpNav = useFilmstripNav(wallpapers.length, wpIdx, (i) => onSelectWallpaper(wallpapers[i]), wpRef);

  return (
    <div>
      <div className="settings-h2row">
        <h2 className="settings-h2">Theme</h2>
        <div className="mode-toggle" role="group" aria-label="Light or dark">
          <button className={`mode-btn${mode === 'light' ? ' is-on' : ''}`} onClick={() => setMode('light')}>☀ Light</button>
          <button className={`mode-btn${mode === 'dark' ? ' is-on' : ''}`} onClick={() => setMode('dark')}>🌙 Dark</button>
        </div>
      </div>
      <p className="settings-hint">← → to browse, Enter to apply</p>
      <div className="settings-strip" ref={themeRef} tabIndex={0} onKeyDown={themeNav.onKeyDown} role="radiogroup" aria-label="Themes">
        {THEMES.map((t, i) => (
          <button
            key={t.key}
            className={`theme-chip${theme === t.key ? ' is-active' : ''}${themeNav.focusedIndex === i ? ' is-focused' : ''}`}
            onClick={() => { themeNav.setFocusedIndex(i); setTheme(t.key); }}
            style={{ background: t.preview.bg }}
            aria-pressed={theme === t.key}
          >
            <span className="theme-dot" style={{ background: t.preview.accent }} />
            <span className="theme-name" style={{ color: t.preview.ink }}>{t.label}</span>
          </button>
        ))}
      </div>

      <h2 className="settings-h2">Wallpaper</h2>
      <p className="settings-hint">← → to browse, Enter to apply</p>
      <div className="settings-strip" ref={wpRef} tabIndex={0} onKeyDown={wpNav.onKeyDown} role="radiogroup" aria-label="Wallpapers">
        {wallpapers.map((w, i) => (
          <div
            key={w.key}
            className={`wp-chip${currentWallpaper === w.url ? ' is-active' : ''}${wpNav.focusedIndex === i ? ' is-focused' : ''}`}
            style={{ backgroundImage: `url(${w.url})` }}
          >
            <button className="wp-chip-select" onClick={() => { wpNav.setFocusedIndex(i); onSelectWallpaper(w); }} aria-label={`Select ${w.name}`} title={w.name.replace(/\.[^.]+$/, '')} />
            <span className="wp-chip-name">{w.name.replace(/\.[^.]+$/, '')}</span>
            {w.custom && (
              <button className="wp-chip-del" title="Remove" onClick={() => onRemoveWallpaper(w)}>×</button>
            )}
          </div>
        ))}
        <button className="settings-add" onClick={() => fileRef.current.click()} title="Add wallpaper">＋</button>
        <input
          ref={fileRef} type="file" accept="image/*,.gif" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPending({ file: f, name: f.name.replace(/\.[^.]+$/, '') });
            e.target.value = '';
          }}
        />
      </div>

      {pending && (
        <div className="wp-name-form">
          <input
            className="settings-field" style={{ flex: 1 }} autoFocus
            value={pending.name}
            onChange={(e) => setPending((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAddWallpaper(pending.file, pending.name.trim()); setPending(null); } }}
            placeholder="name this wallpaper…"
          />
          <button className="settings-btn primary" onClick={() => { onAddWallpaper(pending.file, pending.name.trim()); setPending(null); }}>Add</button>
          <button className="settings-btn" onClick={() => setPending(null)}>Cancel</button>
        </div>
      )}

      <h2 className="settings-h2" style={{ marginTop: 24 }}>Help</h2>
      <button className="settings-btn" onClick={() => onReplayTutorial && onReplayTutorial()}>🎓 Take the tour again</button>
    </div>
  );
}

/* ---------------- Sounds: music library ---------------- */

function SoundsTab({
  tracks, onAddMusic, onRemoveMusic,
  ambientMix = {}, userAmbient = [], onToggleAmbient, onAmbientVol, onAddAmbient, onRemoveAmbient,
}) {
  const fileRef = useRef(null);
  const ambRef = useRef(null);

  const row = (key, label, icon, removable, onRemove) => {
    const st = ambientMix[key] || {};
    return (
      <div key={key} className="amb-row">
        <button
          className={`amb-toggle${st.on ? ' is-on' : ''}`}
          onClick={() => onToggleAmbient(key)}
          aria-pressed={!!st.on}
          title={st.on ? 'Turn off' : 'Turn on'}
        >{icon}</button>
        <span className="amb-name">{label}</span>
        <input
          className="amb-vol" type="range" min="0" max="1" step="0.05"
          value={st.vol ?? 0.5}
          onChange={(e) => onAmbientVol(key, Number(e.target.value))}
          aria-label={`${label} volume`}
        />
        {removable && <button className="settings-list-del" onClick={onRemove} title="Remove">×</button>}
      </div>
    );
  };

  return (
    <div>
      <h2 className="settings-h2">Music</h2>
      <p className="settings-hint">Your playlist. Add your own tracks — kept for next time.</p>
      <ul className="settings-list">
        {tracks.map((t) => (
          <li key={t.key || t.src} className="settings-list-row">
            <span className="settings-list-name">🎵 {t.name}</span>
            {t.custom
              ? <button className="settings-list-del" onClick={() => onRemoveMusic(t)} title="Remove">×</button>
              : <span className="settings-list-tag">default</span>}
          </li>
        ))}
      </ul>
      <button className="settings-btn primary" onClick={() => fileRef.current.click()}>＋ Add music</button>
      <input
        ref={fileRef} type="file" accept="audio/*,.mp3" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddMusic(f); e.target.value = ''; }}
      />

      <h2 className="settings-h2" style={{ marginTop: 22 }}>Ambience</h2>
      <p className="settings-hint">Layer soft sounds under the music. Add your own loops too.</p>
      {AMBIENT_SOUNDS.map((s) => row(s.key, s.label, s.icon, false))}
      {userAmbient.map((a) => row(`u:${a.id}`, a.name.replace(/\.[^.]+$/, ''), '🔊', true, () => onRemoveAmbient(a)))}
      <button className="settings-btn" style={{ marginTop: 10 }} onClick={() => ambRef.current.click()}>＋ Add ambient loop</button>
      <input
        ref={ambRef} type="file" accept="audio/*,.mp3,.ogg,.wav" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddAmbient(f); e.target.value = ''; }}
      />
    </div>
  );
}

/* ---------------- AI: connection + models ---------------- */

function AiTab() {
  const [config, setConfig] = useState(null);
  const [available, setAvailable] = useState([]);
  const [newModel, setNewModel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => fetch(`${RAG_BASE}/api/rag/config`).then((r) => r.json()).then(setConfig)
    .catch(() => setConfig({ error: 'Could not reach the AI helper on ' + RAG_BASE }));
  useEffect(() => { load(); }, []);

  const refreshModels = () => fetch(`${RAG_BASE}/api/rag/models`).then((r) => r.json())
    .then((j) => setAvailable(j.models || [])).catch(() => setAvailable([]));
  useEffect(() => { if (config && !config.error) refreshModels(); /* eslint-disable-next-line */ }, [config && config.mode]);

  const update = (path, value) => setConfig((prev) => {
    const c = JSON.parse(JSON.stringify(prev));
    const parts = path.split('.'); let o = c;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value; return c;
  });

  const save = async (cfg) => {
    setSaving(true);
    try {
      await fetch(`${RAG_BASE}/api/rag/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg || config),
      });
      // Let the chat window refresh its model list / active model.
      window.dispatchEvent(new Event('rag:config'));
    } finally { setSaving(false); }
  };

  if (!config) return <div className="settings-h2">Loading…</div>;
  if (config.error) return <div className="settings-hint">{config.error}</div>;

  const m = config.mode;
  const section = config[m];
  const models = section.chatModels || [];

  const addModel = () => {
    const name = newModel.trim();
    if (!name || models.includes(name)) { setNewModel(''); return; }
    const next = JSON.parse(JSON.stringify(config));
    next[m].chatModels = [...models, name];
    next[m].chatModel = name;
    setConfig(next); setNewModel(''); save(next);
  };
  const removeModel = (name) => {
    const next = JSON.parse(JSON.stringify(config));
    next[m].chatModels = models.filter((x) => x !== name);
    if (next[m].chatModel === name) next[m].chatModel = next[m].chatModels[0] || '';
    setConfig(next); save(next);
  };
  const setActive = (name) => { const next = JSON.parse(JSON.stringify(config)); next[m].chatModel = name; setConfig(next); save(next); };

  return (
    <div>
      <h2 className="settings-h2">AI reading assistant</h2>

      <label className="settings-field-label">Mode
        <select className="settings-field" value={config.mode} onChange={(e) => { update('mode', e.target.value); }}>
          <option value="local">Local (Ollama) — private, free</option>
          <option value="api">API (OpenAI-compatible)</option>
        </select>
      </label>

      <label className="settings-field-label">{m === 'local' ? 'Ollama URL' : 'API base URL'}
        <input className="settings-field" value={section.baseUrl} onChange={(e) => update(`${m}.baseUrl`, e.target.value)} />
      </label>
      {m === 'api' && (
        <label className="settings-field-label">API key
          <input type="password" className="settings-field" value={section.apiKey} placeholder="sk-…" onChange={(e) => update(`${m}.apiKey`, e.target.value)} />
        </label>
      )}
      <label className="settings-field-label">Embedding model
        <input list="settingsModels" className="settings-field" value={section.embedModel} onChange={(e) => update(`${m}.embedModel`, e.target.value)} />
      </label>
      <datalist id="settingsModels">{available.map((x) => <option key={x} value={x} />)}</datalist>

      <div className="settings-modelbar">
        <button className="settings-btn small" onClick={refreshModels}>↻ Refresh models</button>
        <span className="settings-hint">{available.length ? `${available.length} available` : 'type any name'}</span>
      </div>

      <h3 className="settings-h3">Chat models</h3>
      <p className="settings-hint">Keep several and pick one in the chat window. The active one has the dot.</p>
      <ul className="settings-list">
        {models.map((name) => (
          <li key={name} className="settings-list-row">
            <button className={`settings-radio${section.chatModel === name ? ' is-active' : ''}`} onClick={() => setActive(name)} aria-label={`Use ${name}`} />
            <span className="settings-list-name">{name}</span>
            <button className="settings-list-del" onClick={() => removeModel(name)} title="Remove">×</button>
          </li>
        ))}
      </ul>
      <div className="settings-modelbar">
        <input list="settingsModels" className="settings-field" style={{ flex: 1 }} placeholder="add a model name…" value={newModel}
          onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addModel(); }} />
        <button className="settings-btn primary" onClick={addModel} disabled={!newModel.trim()}>Add</button>
      </div>

      <div className="settings-actions">
        <button className="settings-btn primary" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save connection'}</button>
      </div>
    </div>
  );
}
