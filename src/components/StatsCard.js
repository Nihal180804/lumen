import React, { useRef } from 'react';
import { useDraggable } from '../hooks/useDraggable';
import './StatsCard.css';

export function StatsCard({ today, streak, onClose }) {
  const panelRef = useRef(null);
  const tapeRef = useRef(null);
  const { style } = useDraggable(tapeRef, panelRef, 'bookshelf.pos.stats');

  const panelStyle = style ? { ...style, marginLeft: 0, transform: 'rotate(0.8deg)' } : undefined;

  return (
    <div id="statsCard" ref={panelRef} style={panelStyle} aria-label="Reading stats">
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <div className="panel-title-row">
        <h3 className="panel-title">Today ☀</h3>
        <button type="button" className="panel-close" onClick={onClose} aria-label="Close stats">×</button>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <span className="stat-num">{today.minutes || 0}</span>
          <span className="stat-label">minutes read</span>
        </div>
        <div className="stat">
          <span className="stat-num">{today.pomodoros || 0}</span>
          <span className="stat-label">pomodoros</span>
        </div>
      </div>

      <div className="stats-streak">
        <span className="streak-fire">🔥</span>
        <span className="streak-num">{streak}</span>
        <span className="streak-label">day{streak === 1 ? '' : 's'} streak</span>
      </div>
    </div>
  );
}
