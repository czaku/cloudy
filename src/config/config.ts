import path from 'node:path';
import type { CloudyConfig } from '../core/types.js';
import { CLAWDASH_DIR, CONFIG_FILE, DEFAULT_CONFIG } from './defaults.js';
import { ensureDir, readJson, writeJson } from '../utils/fs.js';

const VALID_MODELS = new Set(['opus', 'sonnet', 'haiku']);
const VALID_APPROVAL_MODES = new Set(['never', 'always', 'on-failure']);
const VALID_AUTO_ACTIONS = new Set(['continue', 'halt']);

export function validateConfig(config: CloudyConfig): string[] {
  const errors: string[] = [];

  if (!VALID_MODELS.has(config.models.planning)) {
    errors.push(`models.planning: invalid model "${config.models.planning}" (valid: opus, sonnet, haiku)`);
  }
  if (!VALID_MODELS.has(config.models.execution)) {
    errors.push(`models.execution: invalid model "${config.models.execution}" (valid: opus, sonnet, haiku)`);
  }
  if (!VALID_MODELS.has(config.models.validation)) {
    errors.push(`models.validation: invalid model "${config.models.validation}" (valid: opus, sonnet, haiku)`);
  }
  if (typeof config.maxRetries !== 'number' || config.maxRetries < 0 || config.maxRetries > 10) {
    errors.push(`maxRetries: must be a number between 0 and 10 (got ${config.maxRetries})`);
  }
  if (typeof config.taskTimeoutMs !== 'number' || config.taskTimeoutMs < 60_000) {
    errors.push(`taskTimeoutMs: must be at least 60000ms / 1 minute (got ${config.taskTimeoutMs})`);
  }
  if (typeof config.dashboardPort !== 'number' || config.dashboardPort < 1024 || config.dashboardPort > 65535) {
    errors.push(`dashboardPort: must be between 1024 and 65535 (got ${config.dashboardPort})`);
  }
  if (!VALID_APPROVAL_MODES.has(config.approval.mode)) {
    errors.push(`approval.mode: invalid value "${config.approval.mode}" (valid: never, always, on-failure)`);
  }
  if (!VALID_AUTO_ACTIONS.has(config.approval.autoAction)) {
    errors.push(`approval.autoAction: invalid value "${config.approval.autoAction}" (valid: continue, halt)`);
  }
  if (typeof config.approval.timeoutSec !== 'number' || config.approval.timeoutSec < 10) {
    errors.push(`approval.timeoutSec: must be at least 10 seconds (got ${config.approval.timeoutSec})`);
  }

  return errors;
}

function configPath(cwd: string): string {
  return path.join(cwd, CLAWDASH_DIR, CONFIG_FILE);
}

export async function loadConfig(cwd: string): Promise<CloudyConfig> {
  const filePath = configPath(cwd);
  const saved = await readJson<Partial<CloudyConfig>>(filePath);
  if (!saved) return { ...DEFAULT_CONFIG };

  const config: CloudyConfig = {
    models: { ...DEFAULT_CONFIG.models, ...saved.models },
    validation: {
      ...DEFAULT_CONFIG.validation,
      ...saved.validation,
      commands: saved.validation?.commands ?? DEFAULT_CONFIG.validation.commands,
    },
    maxRetries: saved.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    parallel: saved.parallel ?? DEFAULT_CONFIG.parallel,
    maxParallel: saved.maxParallel ?? DEFAULT_CONFIG.maxParallel,
    retryDelaySec: saved.retryDelaySec ?? DEFAULT_CONFIG.retryDelaySec,
    taskTimeoutMs: saved.taskTimeoutMs ?? DEFAULT_CONFIG.taskTimeoutMs,
    autoModelRouting: saved.autoModelRouting ?? DEFAULT_CONFIG.autoModelRouting,
    dashboard: saved.dashboard ?? DEFAULT_CONFIG.dashboard,
    dashboardPort: saved.dashboardPort ?? DEFAULT_CONFIG.dashboardPort,
    notifications: { ...DEFAULT_CONFIG.notifications, ...saved.notifications },
    contextBudgetTokens: saved.contextBudgetTokens ?? DEFAULT_CONFIG.contextBudgetTokens,
    maxCostPerTaskUsd: saved.maxCostPerTaskUsd ?? DEFAULT_CONFIG.maxCostPerTaskUsd,
    maxCostPerRunUsd: saved.maxCostPerRunUsd ?? DEFAULT_CONFIG.maxCostPerRunUsd,
    worktrees: saved.worktrees ?? DEFAULT_CONFIG.worktrees,
    runBranch: saved.runBranch ?? DEFAULT_CONFIG.runBranch,
    approval: { ...DEFAULT_CONFIG.approval, ...saved.approval },
    engine: saved.engine ?? DEFAULT_CONFIG.engine,
    piMono: { ...DEFAULT_CONFIG.piMono, ...saved.piMono },
    review: { ...DEFAULT_CONFIG.review, ...saved.review },
  };

  const errors = validateConfig(config);
  if (errors.length > 0) {
    process.stderr.write(`⚠️  cloudy config warnings (.cloudy/config.json):\n${errors.map((e) => `   · ${e}`).join('\n')}\n\n`);
  }

  return config;
}

export async function saveConfig(
  cwd: string,
  config: CloudyConfig,
): Promise<void> {
  await ensureDir(path.join(cwd, CLAWDASH_DIR));
  await writeJson(configPath(cwd), config);
}
