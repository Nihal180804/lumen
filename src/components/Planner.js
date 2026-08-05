import React, { useEffect, useRef } from 'react';
import { exportTasksToPdf } from '../utils/exportPdf';
import { useDraggable } from '../hooks/useDraggable';
import { useResizable } from '../hooks/useResizable';
import { fluidSize } from '../utils/fluid';
import './Planner.css';

export function Planner({ tasks, setTasks }) {
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const tapeRef = useRef(null);
  const resizeRef = useRef(null);
  const { style: dragStyle } = useDraggable(tapeRef, panelRef, 'bookshelf.pos.planner');
  const { size } = useResizable(
    resizeRef, panelRef,
    fluidSize(280, 340),
    'bookshelf.size.planner',
    { minWidth: 220, minHeight: 240, maxWidth: 900, maxHeight: 900 },
  );
  const style = { ...(dragStyle || {}), width: `${size.width}px`, height: `${size.height}px` };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addTask = () => {
    const text = inputRef.current.value.trim();
    if (!text) return;
    setTasks([...tasks, { text, completed: false }]);
    inputRef.current.value = '';
  };

  const toggleTask = (i) =>
    setTasks(tasks.map((t, idx) => (idx === i ? { ...t, completed: !t.completed } : t)));

  const removeTask = (i) => setTasks(tasks.filter((_, idx) => idx !== i));

  const downloadTasks = () => exportTasksToPdf(tasks);

  return (
    <div id="planner" ref={panelRef} style={style}>
      <span className="tape" ref={tapeRef} title="Drag to move · double-click to reset" />
      <h3 className="panel-title">My tasks ✏️</h3>
      <input
        type="text"
        ref={inputRef}
        placeholder="Enter a new task..."
        onKeyDown={(e) => e.key === 'Enter' && addTask()}
      />
      <button type="button" onClick={addTask}>Add Task</button>
      <button type="button" onClick={downloadTasks} disabled={tasks.length === 0}>Save as PDF</button>

      <div id="tasks">
        {tasks.length === 0 ? (
          <div className="empty-state">nothing yet ~ jot something above</div>
        ) : (
          tasks.map((task, index) => (
            <div key={index} className={`task ${task.completed ? 'completed' : ''}`}>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(index)}
                aria-label={`Mark "${task.text}" complete`}
              />
              <span>{task.text}</span>
              <button type="button" onClick={() => removeTask(index)} aria-label={`Remove "${task.text}"`}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <span ref={resizeRef} className="panel-resize-handle" title="Drag to resize" aria-hidden="true" />
    </div>
  );
}
