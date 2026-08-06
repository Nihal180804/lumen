import React, { useEffect, useRef, useState } from 'react';
import { AMBIENT_SOUNDS } from '../audio/ambient';
import './MusicPlayer.css';

// Library lives with the reader (its own tab); Today is folded into the Timer.
const UTILITY_ITEMS = [
  { key: 'planner',   icon: '📅', label: 'Tasks' },
  { key: 'dropArea',  icon: '📂', label: 'Files' },
  { key: 'noteArea',  icon: '📝', label: 'Notes' },
  { key: 'timer',     icon: '⏳', label: 'Timer' },
  { key: 'chat',      icon: '💬', label: 'Chat' },
  { key: 'settings',  icon: '⚙️', label: 'Settings' },
];

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function MusicPlayer({
  audioRef,
  tracks,
  currentTrackIndex,
  onPrev,
  onNext,
  volume,
  onVolumeChange,
  isPlaying,
  onTogglePlay,
  panels,
  toggle,
  toggleFullscreen,
  ambientMix,
  onToggleAmbient,
  onAmbientVol,
}) {
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ambOpen, setAmbOpen] = useState(false);
  const ambRef = useRef(null);

  // Close the ambience popover when clicking elsewhere.
  useEffect(() => {
    if (!ambOpen) return undefined;
    const onDown = (e) => { if (ambRef.current && !ambRef.current.contains(e.target)) setAmbOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ambOpen]);

  const anyAmbient = AMBIENT_SOUNDS.some((s) => ambientMix && ambientMix[s.key] && ambientMix[s.key].on);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [audioRef, volume]);

  // Track playback position for the custom seek bar.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setCurrent(el.currentTime || 0);
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
    };
  }, [audioRef]);

  const track = tracks[currentTrackIndex] || tracks[0];
  const seekPct = duration ? (current / duration) * 100 : 0;

  const seek = (e) => {
    const v = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = v;
    setCurrent(v);
  };

  return (
    <div id="musicPlayer">
      <audio ref={audioRef} hidden>
        <source src={track?.src} type="audio/mp3" />
      </audio>

      {/* Left — transport */}
      <div className="mp-transport">
        <button onClick={onPrev} title="Previous track (←)" aria-label="Previous track">◀</button>
        <button className="mp-play" onClick={onTogglePlay} title="Play / pause (Space)" aria-label="Play or pause">
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button onClick={onNext} title="Next track (→)" aria-label="Next track">▶</button>
      </div>

      {/* Center — track name + wide seek bar (grows to fill the pill) */}
      <div className="mp-center">
        <div className="mp-trackline">
          <span className="mp-track-name">{track?.name || '—'}</span>
          <span className="mp-track-counter">{currentTrackIndex + 1} / {tracks.length}</span>
        </div>
        <div className="mp-seekrow">
          <span className="mp-time">{fmt(current)}</span>
          <input
            className="mp-range mp-seek"
            type="range" min="0" max={duration || 0} step="0.1"
            value={Math.min(current, duration || 0)}
            onChange={seek}
            style={{ '--fill': `${seekPct}%` }}
            aria-label="Seek"
          />
          <span className="mp-time">{fmt(duration)}</span>
        </div>
      </div>

      {/* Right — volume + panel icons */}
      <div className="mp-right">
        <div className="mp-volume" title="Volume">
          <span aria-hidden="true">{volume === 0 ? '🔇' : '🔈'}</span>
          <input
            className="mp-range"
            type="range" min="0" max="1" step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            style={{ '--fill': `${volume * 100}%` }}
            aria-label="Volume"
          />
        </div>
        {/* Ambience — one button opens a mini mixer popover */}
        <div className="mp-divider" aria-hidden="true" />
        <div className="mp-amb" ref={ambRef}>
          <button
            type="button"
            className={`mp-util-btn${anyAmbient ? ' is-active' : ''}`}
            onClick={() => setAmbOpen((o) => !o)}
            title="Ambient sounds"
            aria-label="Ambient sounds"
            aria-expanded={ambOpen}
          >🌧️</button>
          {ambOpen && (
            <div className="mp-amb-pop" role="dialog" aria-label="Ambient sounds">
              <div className="mp-amb-title">Ambience</div>
              {AMBIENT_SOUNDS.map((s) => {
                const st = (ambientMix && ambientMix[s.key]) || {};
                const vol = st.vol == null ? 0.5 : st.vol;
                return (
                  <div className="mp-amb-row" key={s.key}>
                    <button
                      type="button"
                      className={`mp-amb-toggle${st.on ? ' is-on' : ''}`}
                      onClick={() => onToggleAmbient && onToggleAmbient(s.key)}
                      aria-pressed={!!st.on}
                      title={st.on ? `Turn off ${s.label}` : `Turn on ${s.label}`}
                    >
                      <span className="mp-amb-ico">{s.icon}</span>
                      <span className="mp-amb-name">{s.label}</span>
                    </button>
                    <input
                      className="mp-range mp-amb-vol"
                      type="range" min="0" max="1" step="0.05"
                      value={vol}
                      onChange={(e) => onAmbientVol && onAmbientVol(s.key, Number(e.target.value))}
                      style={{ '--fill': `${vol * 100}%` }}
                      aria-label={`${s.label} volume`}
                      disabled={!st.on}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mp-divider" aria-hidden="true" />
        <div className="mp-utility">
          {UTILITY_ITEMS.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`mp-util-btn${panels[it.key] ? ' is-active' : ''}`}
              onClick={() => toggle(it.key)}
              title={it.label}
              aria-label={it.label}
              aria-pressed={panels[it.key]}
            >{it.icon}</button>
          ))}
          <button type="button" className="mp-util-btn" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">⛶</button>
        </div>
      </div>
    </div>
  );
}
