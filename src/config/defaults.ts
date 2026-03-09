import type { CloudyConfig } from '../core/types.js';

export const DEFAULT_CONFIG: CloudyConfig = {
  models: {
    planning: 'sonnet',
    execution: 'sonnet',
    validation: 'haiku',
  },
  validation: {
    typecheck: true,
    lint: true,
    build: true,
    test: true,
    aiReview: true,
    commands: [],
  },
  maxRetries: 2,
  parallel: false,
  maxParallel: 3,
  retryDelaySec: 30,
  taskTimeoutMs: 3600000, // 1 hour
  autoModelRouting: false,
  dashboard: true,
  dashboardPort: 1510,
  notifications: { desktop: false, sound: true },
  contextBudgetTokens: 60000,
  contextBudgetMode: 'warn',
  preflightCommands: [],
  maxCostPerTaskUsd: 0,
  maxCostPerRunUsd: 0,
  worktrees: true,
  runBranch: false,
  approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
  engine: 'claude-code',
  review: { enabled: true, model: 'opus', failBlocksRun: false },
};

export const CLAWDASH_DIR = '.cloudy';
export const RUNS_DIR = 'runs';
export const CURRENT_FILE = 'current';
export const STATE_FILE = 'state.json';
export const CONFIG_FILE = 'config.json';
export const LOGS_DIR = 'logs';
export const TASK_LOGS_DIR = 'logs/tasks';
export const CHECKPOINTS_DIR = 'checkpoints';
export const STATE_VERSION = 1;

// ── Global / Daemon constants ─────────────────────────────────────────
export const GLOBAL_CONFIG_DIR = '.cloudy';          // relative to homedir
export const PROJECT_META_FILE = 'project.json';     // in .cloudy/
export const DAEMON_PID_FILE = 'daemon.pid';
export const DAEMON_LOG_FILE = 'daemon.log';
export const PROJECTS_FILE = 'projects.json';
export const DAEMON_DEFAULT_PORT = 1510;
