import React, { useEffect, useState } from 'react';
import type { CostSummary, Task } from '../types';
import { formatTokens, formatCost, formatElapsedFull } from '../utils/formatters';

interface RunEntry {
  name: string;
  date: string;
  slug: string;
  cost: string | null;
}

function parseRunName(name: string): { date: string; slug: string } {
  // Format: YYYY-MM-DD-HHMM-slug
  const match = name.match(/^(\d{4}-\d{2}-\d{2})-(\d{4})-(.+)$/);
  if (match) {
    const [, datePart, timePart, slug] = match;
    const hh = timePart.slice(0, 2);
    const mm = timePart.slice(2, 4);
    return { date: `${datePart} ${hh}:${mm}`, slug };
  }
  return { date: '', slug: name };
}

interface StatsSidebarProps {
  tasks: Task[];
  costSummary: CostSummary;
  elapsedMs: number;
  onSwitchRun?: (runName: string) => void;
}

export function StatsSidebar({ tasks, costSummary, elapsedMs, onSwitchRun }: StatsSidebarProps) {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [runsOpen, setRunsOpen] = useState(true);

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((data: Array<{ name: string; costUsd?: number | null }> | string[]) => {
        const entries: RunEntry[] = (data as any[]).map((item) => {
          const name = typeof item === 'string' ? item : item.name;
          const costUsd = typeof item === 'object' && item.costUsd != null ? item.costUsd : null;
          const { date, slug } = parseRunName(name);
          return {
            name,
            date,
            slug: slug.length > 22 ? slug.slice(0, 22) + '…' : slug,
            cost: costUsd != null ? `$${(costUsd as number).toFixed(4)}` : null,
          };
        });
        setRuns(entries.slice(0, 10));
      })
      .catch(() => {});
  }, []);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'skipped').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const modelEntries = costSummary.byModel ? Object.entries(costSummary.byModel).sort() : [];

  return (
    <div className="right-panel">
      {/* Progress */}
      <div className="stats-card">
        <div className="stats-title">Progress</div>
        <div className="progress-header">
          <div>
            <span className="progress-count">{completed}</span>
            <span className="progress-total"> / {total}</span>
          </div>
          <span className="progress-pct">{pct}%</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="stats-card">
        <div className="stats-title">Status Breakdown</div>
        <div className="status-grid">
          <div className="status-item">
            <div className="status-item-dot" style={{ background: 'var(--accent-gray)' }} />
            <div>
              <div className="status-item-count">{pending}</div>
              <div className="status-item-label">Pending</div>
            </div>
          </div>
          <div className="status-item">
            <div className="status-item-dot" style={{ background: 'var(--accent-blue)' }} />
            <div>
              <div className="status-item-count">{inProgress}</div>
              <div className="status-item-label">Running</div>
            </div>
          </div>
          <div className="status-item">
            <div className="status-item-dot" style={{ background: 'var(--accent-green)' }} />
            <div>
              <div className="status-item-count">{completed}</div>
              <div className="status-item-label">Done</div>
            </div>
          </div>
          <div className="status-item">
            <div className="status-item-dot" style={{ background: 'var(--accent-red)' }} />
            <div>
              <div className="status-item-count">{failed}</div>
              <div className="status-item-label">Failed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost */}
      <div className="stats-card">
        <div className="stats-title">Cost</div>
        <div className="cost-big">{formatCost(costSummary.totalEstimatedUsd)}</div>
        <div className="token-grid">
          <div className="token-item">
            <div className="token-label">Input</div>
            <div className="token-value">{formatTokens(costSummary.totalInputTokens)}</div>
          </div>
          <div className="token-item">
            <div className="token-label">Output</div>
            <div className="token-value">{formatTokens(costSummary.totalOutputTokens)}</div>
          </div>
          <div className="token-item">
            <div className="token-label">Cache Read</div>
            <div className="token-value">{formatTokens(costSummary.totalCacheReadTokens)}</div>
          </div>
          <div className="token-item">
            <div className="token-label">Cache Write</div>
            <div className="token-value">{formatTokens(costSummary.totalCacheWriteTokens)}</div>
          </div>
        </div>
      </div>

      {/* Cost by Model */}
      <div className="stats-card">
        <div className="stats-title">Cost by Model</div>
        <div className="model-breakdown">
          {modelEntries.length > 0 ? (
            modelEntries.map(([model, cost]) => (
              <div key={model} className="model-row">
                <span className="model-name">{model}</span>
                <span className="model-cost">${(cost as number).toFixed(4)}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No data yet</div>
          )}
        </div>
      </div>

      {/* Elapsed Time */}
      <div className="stats-card">
        <div className="stats-title">Elapsed Time</div>
        <div className="elapsed-detail">{formatElapsedFull(elapsedMs)}</div>
      </div>

      {/* Run History */}
      <div className="stats-card">
        <div
          className="stats-title"
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => setRunsOpen((o) => !o)}
        >
          <span>Recent Runs</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
            {runsOpen ? '▲' : '▼'}
          </span>
        </div>
        {runsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {runs.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No runs yet</div>
            )}
            {runs.map((run) => (
              <div
                key={run.name}
                onClick={() => onSwitchRun?.(run.name)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  padding: '5px 8px',
                  borderRadius: 6,
                  cursor: onSwitchRun ? 'pointer' : 'default',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (onSwitchRun) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {run.slug || run.name}
                  </span>
                  {run.cost && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-green)', marginLeft: 6, flexShrink: 0 }}>
                      {run.cost}
                    </span>
                  )}
                </div>
                {run.date && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{run.date}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
