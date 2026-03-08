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
  dashboardPort: 3117,
  notifications: { desktop: false, sound: true },
  contextBudgetTokens: 60000,
  maxCostPerTaskUsd: 0,
  maxCostPerRunUsd: 0,
  worktrees: true,
  runBranch: false,
  approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
  engine: 'claude-code',
  piMono: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', piPath: 'pi' },
  review: { enabled: true, model: 'opus' },
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
