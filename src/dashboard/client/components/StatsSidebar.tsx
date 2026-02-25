import React from 'react';
import type { CostSummary, Task } from '../types';
import { formatTokens, formatCost, formatElapsedFull } from '../utils/formatters';

interface StatsSidebarProps {
  tasks: Task[];
  costSummary: CostSummary;
  elapsedMs: number;
}

export function StatsSidebar({ tasks, costSummary, elapsedMs }: StatsSidebarProps) {
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
    </div>
  );
}
