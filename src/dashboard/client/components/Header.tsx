import React from 'react';
import type { RunStatus } from '../types';
import { formatElapsedShort } from '../utils/formatters';
import { ThemeToggle } from './ThemeToggle';
import { RunPicker } from './RunPicker';

interface HeaderProps {
  goal: string | undefined;
  runStatus: RunStatus;
  elapsedMs: number;
  wsConnected: boolean;
  onStartRun: () => void;
  onStopRun: () => void;
  onSwitchRun?: (runName: string) => void;
}

const STATUS_LABELS: Record<RunStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  completed: 'Complete',
  failed: 'Failed',
  stopped: 'Stopped',
};

const STATUS_ICONS: Record<RunStatus, string> = {
  idle: '●',
  running: '▶',
  completed: '✓',
  failed: '✗',
  stopped: '■',
};

export function Header({ goal, runStatus, elapsedMs, wsConnected, onStartRun, onStopRun, onSwitchRun }: HeaderProps) {
  const isRunning = runStatus === 'running';

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">☁</span> cloudy
        </div>
        <div className="goal-text">{goal ?? 'Waiting for plan...'}</div>
      </div>
      <div className="header-right">
        {onSwitchRun && <RunPicker onSwitch={onSwitchRun} />}
        <div className="control-buttons">
          <button
            className="ctrl-btn ctrl-btn-start"
            onClick={onStartRun}
            disabled={isRunning}
            title="Start orchestrator run"
          >
            ▶ Start Run
          </button>
          <button
            className="ctrl-btn ctrl-btn-stop"
            onClick={onStopRun}
            disabled={!isRunning}
            title="Stop after current task"
          >
            ■ Stop Run
          </button>
        </div>
        <div className={`run-status ${runStatus}`}>
          <span>{STATUS_ICONS[runStatus]}</span>
          <span>{STATUS_LABELS[runStatus]}</span>
        </div>
        <div className="elapsed-time">{formatElapsedShort(elapsedMs)}</div>
        <div
          className={`connection-dot${wsConnected ? ' connected' : ''}`}
          title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
