import React from 'react';
import type { Task } from '../types';
import { formatDuration } from '../utils/formatters';

interface TaskCardProps {
  task: Task;
  expanded: boolean;
  onToggle: (id: string) => void;
}

export function TaskCard({ task, expanded, onToggle }: TaskCardProps) {
  const cardClass = [
    'task-card',
    task.status === 'in_progress' ? 'active' : '',
    task.status === 'completed' ? 'completed-card' : '',
    expanded ? 'expanded' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} onClick={() => onToggle(task.id)}>
      <div className="task-header">
        <div className={`status-dot ${task.status}`} />
        <div className="task-info">
          <div className="task-title-row">
            <span className="task-id">{task.id}</span>
            <span className="task-title">{task.title}</span>
          </div>
          <div className="task-meta">
            {(task.status === 'in_progress' || task.status === 'failed' || task.retries > 0) && (
              <span className="task-badge badge-attempt">
                Attempt {task.retries + 1}/{task.maxRetries + 1}
              </span>
            )}
            {task.durationMs != null && (
              <span className="task-badge badge-duration">
                {formatDuration(task.durationMs)}
              </span>
            )}
            {task.status === 'failed' && (
              <span className="task-badge badge-failed">Failed</span>
            )}
            {task.status === 'skipped' && (
              <span className="task-badge badge-skipped">Skipped</span>
            )}
          </div>
        </div>
      </div>

      <div className="task-details">
        {task.description && (
          <div className="detail-section">
            <div className="detail-label">Description</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{task.description}</div>
          </div>
        )}

        {task.dependencies.length > 0 && (
          <div className="detail-section">
            <div className="detail-label">Dependencies</div>
            <div className="deps-list">
              {task.dependencies.map((dep) => (
                <span key={dep} className="dep-tag">{dep}</span>
              ))}
            </div>
          </div>
        )}

        {task.acceptanceCriteria.length > 0 && (
          <div className="detail-section">
            <div className="detail-label">Acceptance Criteria</div>
            <ul className="criteria-list">
              {task.acceptanceCriteria.map((criterion, idx) => {
                const result = task.acceptanceCriteriaResults?.[idx];
                const iconClass = result ? (result.passed ? 'pass' : 'fail') : 'unknown';
                const icon = result ? (result.passed ? '✓' : '✗') : '○';
                return (
                  <li key={idx} className="criteria-item">
                    <span className={`criteria-icon ${iconClass}`}>{icon}</span>
                    <span>{criterion}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {task.error && (
          <div className="detail-section">
            <div className="detail-label">Error</div>
            <div className="error-box">{task.error}</div>
          </div>
        )}

        {task.resultSummary && (
          <div className="detail-section">
            <div className="detail-label">Result Summary</div>
            <div className="result-summary">{task.resultSummary}</div>
          </div>
        )}

        {task.retryHistory && task.retryHistory.length > 0 && (
          <div className="detail-section">
            <div className="detail-label">Retry History</div>
            <div className="retry-history">
              {task.retryHistory.map((entry) => (
                <div key={entry.attempt} className="retry-entry">
                  <span className="retry-entry-attempt">#{entry.attempt}</span>
                  <span>{entry.failureType}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatDuration(entry.durationMs)}</span>
                  <span className="retry-entry-reason">{entry.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {task.validationReport && (
          <div className="detail-section">
            <div className="detail-label">Validation</div>
            <ul className="criteria-list">
              {task.validationReport.results.map((r, i) => (
                <li key={i} className="criteria-item">
                  <span className={`criteria-icon ${r.passed ? 'pass' : 'fail'}`}>
                    {r.passed ? '✓' : '✗'}
                  </span>
                  <span>
                    [{r.strategy}] {r.passed ? 'Passed' : r.output.split('\n')[0]} ({formatDuration(r.durationMs)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
