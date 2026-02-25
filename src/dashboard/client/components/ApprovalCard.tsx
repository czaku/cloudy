import React, { useState } from 'react';
import type { ApprovalRequest } from '../types';

interface ApprovalCardProps {
  request: ApprovalRequest;
  onRespond: (taskId: string, action: string, hint?: string) => void;
}

export function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
  const [showHint, setShowHint] = useState(false);
  const [hint, setHint] = useState('');

  const stageLabel = request.stage === 'pre_task' ? 'Approval Required' : 'Failure Escalation';

  function sendHint() {
    if (hint.trim()) {
      onRespond(request.taskId, 'retry_with_hint', hint.trim());
    }
  }

  return (
    <div className="approval-overlay">
      <div className="approval-card">
        <div className="approval-header">
          <span className="approval-stage">{stageLabel}</span>
          <span className="approval-task">
            {request.taskId}: {request.title}
          </span>
        </div>
        {request.context && (
          <div className="approval-context">
            {request.context.split('\n')[0]}
          </div>
        )}
        {showHint && (
          <div className="approval-hint-row">
            <input
              className="approval-hint-input"
              type="text"
              placeholder="Enter hint for Claude..."
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendHint()}
              autoFocus
            />
          </div>
        )}
        <div className="approval-actions">
          <button
            className="approval-btn approve"
            onClick={() => onRespond(request.taskId, 'approved')}
          >
            Approve
          </button>
          <button
            className="approval-btn skip"
            onClick={() => onRespond(request.taskId, 'skipped')}
          >
            Skip
          </button>
          <button
            className="approval-btn halt"
            onClick={() => onRespond(request.taskId, 'halt')}
          >
            Halt
          </button>
          <button
            className="approval-btn retry"
            onClick={() => setShowHint((s) => !s)}
          >
            Retry with hint
          </button>
          {showHint && (
            <button className="approval-btn send-hint" onClick={sendHint}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
