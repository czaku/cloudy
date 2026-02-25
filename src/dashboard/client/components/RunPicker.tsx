import React, { useEffect, useState, useCallback } from 'react';

export interface RunSummary {
  name: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  completedTasks: number;
  totalTasks: number;
  costUsd: number;
  startedAt: string | null;
}

interface RunPickerProps {
  onSwitch: (runName: string) => void;
}

const STATUS_COLORS: Record<RunSummary['status'], string> = {
  running: 'var(--accent-blue)',
  completed: 'var(--accent-green)',
  failed: 'var(--accent-red)',
  idle: 'var(--accent-gray)',
};

const STATUS_ICONS: Record<RunSummary['status'], string> = {
  running: '▶',
  completed: '✓',
  failed: '✗',
  idle: '●',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function RunPicker({ onSwitch }: RunPickerProps) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const fetchRuns = useCallback(() => {
    fetch('/api/runs')
      .then((r) => r.json() as Promise<RunSummary[]>)
      .then((data) => {
        setRuns(data);
        // Default to first run if none active
        if (!activeRun && data.length > 0) {
          setActiveRun(data[0].name);
        }
      })
      .catch(() => {});
  }, [activeRun]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 10000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  if (runs.length < 2) return null;

  const current = runs.find((r) => r.name === activeRun) ?? runs[0];

  function handleSelect(run: RunSummary) {
    setActiveRun(run.name);
    setOpen(false);
    fetch('/api/switch-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runName: run.name }),
    }).then(() => {
      onSwitch(run.name);
    }).catch(() => {});
  }

  return (
    <div className="run-picker" style={{ position: 'relative' }}>
      <button
        className="run-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Switch run"
      >
        <span
          className="run-picker-dot"
          style={{ background: STATUS_COLORS[current?.status ?? 'idle'] }}
        />
        <span className="run-picker-name">{current?.name ?? 'select run'}</span>
        <span className="run-picker-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="run-picker-dropdown">
          {runs.map((run) => (
            <button
              key={run.name}
              className={`run-picker-item${run.name === activeRun ? ' active' : ''}`}
              onClick={() => handleSelect(run)}
            >
              <span style={{ color: STATUS_COLORS[run.status], fontSize: 11, marginRight: 6 }}>
                {STATUS_ICONS[run.status]}
              </span>
              <span className="rpi-name">{run.name}</span>
              <span className="rpi-meta">
                {run.totalTasks > 0 && (
                  <span className="rpi-progress">{run.completedTasks}/{run.totalTasks}</span>
                )}
                {run.costUsd > 0 && (
                  <span className="rpi-cost">${run.costUsd.toFixed(3)}</span>
                )}
                {run.startedAt && (
                  <span className="rpi-date">{formatDate(run.startedAt)}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
