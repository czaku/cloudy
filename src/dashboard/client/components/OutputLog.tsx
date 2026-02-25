import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { OutputLine, CostSummary, Task } from '../types';

// ── Tool icon map ─────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  Write: '📝', Edit: '✏️', MultiEdit: '✏️', NotebookEdit: '📓',
  Bash: '💻', Read: '📖', Glob: '🔍', Grep: '🔎',
  WebFetch: '🌐', WebSearch: '🔎', Task: '🤖',
};
function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '⚙️';
}

// ── Filter types ──────────────────────────────────────────────────────
type FilterType = 'all' | 'prompt' | 'text' | 'tools' | 'events' | 'errors';

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',    label: 'All' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'text',   label: 'Replies' },
  { id: 'tools',  label: 'Tools' },
  { id: 'events', label: 'Events' },
  { id: 'errors', label: 'Errors' },
];

function lineMatchesFilter(line: OutputLine, filter: FilterType): boolean {
  if (filter === 'all')    return true;
  if (filter === 'prompt') return line.type === 'prompt';
  if (filter === 'text')   return line.type === 'text' || line.type === 'success';
  if (filter === 'tools')  return line.type === 'tool_call' || line.type === 'tool_result';
  if (filter === 'events') return line.type === 'event';
  if (filter === 'errors') return line.type === 'error';
  return true;
}

// ── Info panel ─────────────────────────────────────────────────────────
function InfoPanel({ lines, costSummary, tasks, startedAt }: {
  lines: OutputLine[];
  costSummary?: CostSummary;
  tasks?: Task[];
  startedAt?: string;
}) {
  const counts = useMemo(() => ({
    prompts: lines.filter(l => l.type === 'prompt').length,
    replies: lines.filter(l => l.type === 'text' || l.type === 'success').length,
    toolCalls: lines.filter(l => l.type === 'tool_call').length,
    toolResults: lines.filter(l => l.type === 'tool_result').length,
    events: lines.filter(l => l.type === 'event').length,
    errors: lines.filter(l => l.type === 'error').length,
  }), [lines]);

  const taskStats = useMemo(() => !tasks ? null : ({
    total: tasks.length,
    done: tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    running: tasks.filter(t => t.status === 'in_progress').length,
  }), [tasks]);

  const elapsedSec = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : null;

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const fmtTime = (s: number) =>
    s >= 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
    : s >= 60  ? `${Math.floor(s/60)}m ${s%60}s`
    : `${s}s`;

  return (
    <div className="output-info-panel">
      <div className="info-section">
        <div className="info-section-title">Conversation</div>
        <div className="info-grid">
          <span className="info-label">Prompts</span>     <span className="info-val">{counts.prompts}</span>
          <span className="info-label">Replies</span>     <span className="info-val">{counts.replies}</span>
          <span className="info-label">Tool calls</span>  <span className="info-val">{counts.toolCalls}</span>
          <span className="info-label">Tool results</span><span className="info-val">{counts.toolResults}</span>
          <span className="info-label">Events</span>      <span className="info-val">{counts.events}</span>
          {counts.errors > 0 && <>
            <span className="info-label info-err">Errors</span>
            <span className="info-val info-err">{counts.errors}</span>
          </>}
        </div>
      </div>

      {taskStats && (
        <div className="info-section">
          <div className="info-section-title">Tasks</div>
          <div className="info-grid">
            <span className="info-label">Total</span>    <span className="info-val">{taskStats.total}</span>
            <span className="info-label info-ok">Done</span>  <span className="info-val info-ok">{taskStats.done}</span>
            {taskStats.running > 0 && <><span className="info-label info-run">Running</span><span className="info-val info-run">{taskStats.running}</span></>}
            {taskStats.failed > 0  && <><span className="info-label info-err">Failed</span><span className="info-val info-err">{taskStats.failed}</span></>}
          </div>
        </div>
      )}

      {costSummary && (
        <div className="info-section">
          <div className="info-section-title">Cost & tokens</div>
          <div className="info-grid">
            <span className="info-label">Total</span>      <span className="info-val">${costSummary.totalEstimatedUsd.toFixed(4)}</span>
            <span className="info-label">Input</span>      <span className="info-val">{fmt(costSummary.totalInputTokens)}</span>
            <span className="info-label">Output</span>     <span className="info-val">{fmt(costSummary.totalOutputTokens)}</span>
            <span className="info-label">Cache rd</span>   <span className="info-val">{fmt(costSummary.totalCacheReadTokens)}</span>
            {Object.entries(costSummary.byModel).map(([m, c]) => (
              <React.Fragment key={m}>
                <span className="info-label info-mono">{m.split('/').pop()}</span>
                <span className="info-val">${(c as number).toFixed(4)}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {elapsedSec !== null && (
        <div className="info-section">
          <div className="info-section-title">Timing</div>
          <div className="info-grid">
            <span className="info-label">Elapsed</span><span className="info-val">{fmtTime(elapsedSec)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Individual message renderers ──────────────────────────────────────

/** Right-side bubble: the task prompt / user instruction */
function PromptBubble({ line }: { line: OutputLine }) {
  const parts = line.content.split('\n');
  const title = parts[0].replace(/^\*\*|\*\*$/g, '');
  const body = parts.slice(1).join('\n').trim();
  return (
    <div className="chat-row chat-row-right">
      <div className="chat-bubble chat-bubble-prompt">
        <div className="chat-bubble-label">Task prompt</div>
        <div className="chat-bubble-title">{title}</div>
        {body && <div className="chat-bubble-body">{body}</div>}
      </div>
    </div>
  );
}

/** Left-side bubble: Claude's text response */
function ReplyBubble({ line }: { line: OutputLine }) {
  return (
    <div className="chat-row chat-row-left">
      {line.taskId && <div className="chat-avatar">C</div>}
      <div className={`chat-bubble chat-bubble-reply${line.type === 'success' ? ' chat-bubble-success' : ''}`}>
        {line.taskId && <div className="chat-bubble-label">[{line.taskId}] Claude</div>}
        <div className="chat-bubble-text">{line.content}</div>
      </div>
    </div>
  );
}

/** Centre pill: tool call (collapsible) */
function ToolCallPill({ line }: { line: OutputLine }) {
  const [open, setOpen] = useState(false);
  const icon = toolIcon(line.toolName ?? '');

  let formattedInput = line.content;
  let hint = line.toolHint ?? '';
  try {
    const parsed = JSON.parse(line.content);
    if (!hint) {
      hint = String(parsed.file_path ?? parsed.command ?? parsed.path ?? parsed.url ?? parsed.pattern ?? '');
    }
    formattedInput = Object.entries(parsed)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
  } catch { /* keep raw */ }

  return (
    <div className="chat-row chat-row-center">
      <div className={`chat-activity${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="activity-icon">{icon}</span>
        <span className="activity-name">{line.toolName}</span>
        {hint && !open && (
          <span className="activity-hint">{hint.length > 55 ? hint.slice(0, 55) + '…' : hint}</span>
        )}
        {line.taskId && <span className="activity-task">[{line.taskId}]</span>}
        <span className="activity-chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="chat-activity-body">
          <pre className="activity-pre">{formattedInput}</pre>
        </div>
      )}
    </div>
  );
}

/** Centre pill: tool result (collapsible) */
function ToolResultPill({ line }: { line: OutputLine }) {
  const [open, setOpen] = useState(false);
  const preview = line.content.split('\n')[0].slice(0, 60);
  const lines = line.content.split('\n').length;

  return (
    <div className="chat-row chat-row-center">
      <div className={`chat-activity chat-activity-result${line.isError ? ' chat-activity-error' : ''}${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="activity-icon">{line.isError ? '✗' : '↩'}</span>
        <span className="activity-name">{line.toolName ? `${line.toolName} result` : 'Result'}</span>
        {!open && <span className="activity-hint">{preview}{lines > 1 ? ` …+${lines - 1} lines` : ''}</span>}
        <span className="activity-chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="chat-activity-body">
          <pre className="activity-pre">{line.content}</pre>
        </div>
      )}
    </div>
  );
}

/** Centre pill: system event / status line */
function EventPill({ line }: { line: OutputLine }) {
  const isError = line.type === 'error';
  return (
    <div className="chat-row chat-row-center">
      <div className={`chat-event-pill${isError ? ' chat-event-error' : ''}`}>
        {line.taskId && <span className="activity-task">[{line.taskId}]</span>}
        <span>{line.content}</span>
      </div>
    </div>
  );
}

function ChatLine({ line }: { line: OutputLine }) {
  if (line.type === 'prompt')      return <PromptBubble line={line} />;
  if (line.type === 'text')        return <ReplyBubble line={line} />;
  if (line.type === 'success')     return <ReplyBubble line={line} />;
  if (line.type === 'tool_call')   return <ToolCallPill line={line} />;
  if (line.type === 'tool_result') return <ToolResultPill line={line} />;
  return <EventPill line={line} />;
}

// ── OutputLog ─────────────────────────────────────────────────────────

const MAX_LINES = 600;

interface OutputLogProps {
  lines: OutputLine[];
  onClear: () => void;
  failedTaskId?: string | null;
  costSummary?: CostSummary;
  tasks?: Task[];
  startedAt?: string;
  /** When true: fills parent height, hides resize handle and collapse button */
  fill?: boolean;
  /** When true: hides the Conversation header / filter chips bar */
  hideHeader?: boolean;
}

export function OutputLog({ lines, onClear, failedTaskId, costSummary, tasks, startedAt, fill, hideHeader }: OutputLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(380);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showInfo, setShowInfo] = useState(false);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);
  const lastFailedId = useRef<string | null>(null);

  const errorCount = useMemo(() => lines.filter(l => l.type === 'error').length, [lines]);

  const visibleLines = useMemo(() => {
    const filtered = filter === 'all' ? lines : lines.filter(l => lineMatchesFilter(l, filter));
    return filtered.slice(-MAX_LINES);
  }, [lines, filter]);

  // Auto-scroll
  useEffect(() => {
    if (!logRef.current || collapsed) return;
    const el = logRef.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleLines, collapsed]);

  // Auto-expand and jump to error on task failure
  useEffect(() => {
    if (!failedTaskId || failedTaskId === lastFailedId.current) return;
    lastFailedId.current = failedTaskId;
    setCollapsed(false);
    if (filter !== 'all' && filter !== 'errors') setFilter('all');
    requestAnimationFrame(() => {
      if (!logRef.current) return;
      const el = logRef.current.querySelector<HTMLElement>('.chat-event-error');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, [failedTaskId, filter]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setHeight(Math.max(60, Math.min(900, dragStartH.current + dragStartY.current - e.clientY)));
    };
    const onUp = () => { isDragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div
      className={`output-panel${collapsed && !fill ? ' collapsed' : ''}${fill ? ' output-panel-fill' : ''}`}
      style={fill || collapsed ? undefined : { height }}
    >
      {!fill && <div className="output-resize-handle" onMouseDown={onMouseDown} />}

      {!hideHeader && <div className="output-header">
        <div className="output-header-left">
          <span className="output-title">Conversation</span>
          <span className="output-line-count">{lines.length}</span>
          <div className="output-filters">
            {FILTERS.map(f => (
              <button
                key={f.id}
                className={`filter-chip${filter === f.id ? ' active' : ''}${f.id === 'errors' && errorCount > 0 ? ' has-badge' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.id === 'errors' && errorCount > 0 && (
                  <span className="filter-badge">{errorCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="output-actions">
          <button
            className={`output-btn info-btn${showInfo ? ' active' : ''}`}
            onClick={() => setShowInfo(s => !s)}
            title="Stats"
          >ⓘ</button>
          {!fill && (
            <button className="output-btn" onClick={() => setCollapsed(c => !c)}>
              {collapsed ? '▲ Expand' : '▼ Collapse'}
            </button>
          )}
          <button className="output-btn" onClick={onClear}>Clear</button>
        </div>
      </div>}

      {!collapsed && (
        <div className="output-body">
          {showInfo && (
            <InfoPanel
              lines={lines}
              costSummary={costSummary}
              tasks={tasks}
              startedAt={startedAt}
            />
          )}
          <div className="output-log chat-log" ref={logRef}>
            {visibleLines.length === 0 && (
              <div className="output-empty">
                {filter === 'all' ? 'Waiting for output…' : `No ${filter} lines yet`}
              </div>
            )}
            {visibleLines.map(line => (
              <ChatLine key={line.id} line={line} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
