import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { OutputLine } from '../types';

interface OutputLogProps {
  lines: OutputLine[];
  onClear: () => void;
  /** When set, auto-expand and scroll to the first error line for this task */
  failedTaskId?: string | null;
}

const MAX_LINES = 500;

function ToolBlock({ line }: { line: OutputLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`conv-tool${open ? ' open' : ''}`}>
      <div className="conv-tool-hdr" onClick={() => setOpen((o) => !o)}>
        <span className="conv-tool-arrow">▶</span>
        <span className="conv-tool-name">{line.toolName}</span>
        {line.toolHint && <span className="conv-tool-hint">{line.toolHint}</span>}
      </div>
      {open && (
        <div className="conv-tool-body">
          {line.content}
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({ line }: { line: OutputLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`conv-result${open ? ' open' : ''}`}>
      <div className="conv-tool-hdr" onClick={() => setOpen((o) => !o)}>
        <span className="conv-tool-arrow">▶</span>
        <span className="conv-result-label">Result</span>
        {line.taskId && <span className="conv-tool-hint">[{line.taskId}]</span>}
      </div>
      {open && (
        <div className="conv-tool-body">
          {line.content}
        </div>
      )}
    </div>
  );
}

function LogLine({ line }: { line: OutputLine }) {
  if (line.type === 'tool_call') return <ToolBlock line={line} />;
  if (line.type === 'tool_result') return <ToolResultBlock line={line} />;

  if (line.type === 'text') {
    return (
      <div className="conv-msg conv-ai">
        {line.taskId && (
          <span className="conv-label">[{line.taskId}] Claude</span>
        )}
        <div className="conv-text">{line.content}</div>
      </div>
    );
  }

  if (line.type === 'success') {
    return (
      <div className="conv-msg conv-result-final">
        {line.taskId && (
          <span className="conv-label">[{line.taskId}] Result</span>
        )}
        <div className="conv-text">{line.content}</div>
      </div>
    );
  }

  const cssClass = line.type === 'error' ? 'log-error' : line.type === 'event' ? 'log-event' : '';
  return (
    <div className={`log-line${cssClass ? ` ${cssClass}` : ''}`}>
      {line.taskId && <span className="log-task-id">[{line.taskId}]</span>}{' '}
      <span className="log-text">{line.content}</span>
    </div>
  );
}

export function OutputLog({ lines, onClear, failedTaskId }: OutputLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(320);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const lastFailedTaskId = useRef<string | null>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (!logRef.current || collapsed) return;
    const el = logRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines, collapsed]);

  // When a task fails: auto-expand and scroll to its first error line
  useEffect(() => {
    if (!failedTaskId || failedTaskId === lastFailedTaskId.current) return;
    lastFailedTaskId.current = failedTaskId;
    setCollapsed(false);
    // Scroll to first error line for this task after render
    requestAnimationFrame(() => {
      if (!logRef.current) return;
      const errorEl = logRef.current.querySelector<HTMLElement>(`.log-error`);
      if (errorEl) {
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Fallback: scroll to bottom
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    });
  }, [failedTaskId]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      const delta = dragStartY.current - e.clientY;
      const newHeight = Math.max(40, Math.min(800, dragStartHeight.current + delta));
      setHeight(newHeight);
    }
    function onMouseUp() {
      isDragging.current = false;
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const visibleLines = lines.slice(-MAX_LINES);

  return (
    <div
      className={`output-panel${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { height }}
    >
      <div className="output-resize-handle" onMouseDown={onMouseDown} />
      <div className="output-header">
        <span className="output-title">Live Output</span>
        <div className="output-actions">
          <button
            className="output-btn"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? '▲ Expand' : '▼ Collapse'}
          </button>
          <button className="output-btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="output-log" ref={logRef}>
          {visibleLines.map((line) => (
            <LogLine key={line.id} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}
