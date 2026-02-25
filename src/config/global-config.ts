import os from 'node:os';
import path from 'node:path';
import type { ClaudeModel } from '../core/types.js';
import { readJson, writeJson, ensureDir } from '../utils/fs.js';
import {
  GLOBAL_CONFIG_DIR,
  CONFIG_FILE,
  DAEMON_DEFAULT_PORT,
} from './defaults.js';

export interface GlobalConfig {
  defaultModels: {
    planning: ClaudeModel;
    execution: ClaudeModel;
    validation: ClaudeModel;
    review: ClaudeModel;
  };
  defaultMaxRetries: number;
  defaultParallel: boolean;
  defaultMaxParallel: number;
  defaultWorktrees: boolean;
  defaultMaxCostPerTaskUsd: number;
  defaultMaxCostPerRunUsd: number;
  daemonPort: number;
  scanPaths: string[];
  autoRegister: boolean;
  planningQuestionTimeoutSec: number;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  defaultModels: {
    planning: 'sonnet',
    execution: 'sonnet',
    validation: 'haiku',
    review: 'opus',
  },
  defaultMaxRetries: 2,
  defaultParallel: false,
  defaultMaxParallel: 3,
  defaultWorktrees: true,
  defaultMaxCostPerTaskUsd: 0,
  defaultMaxCostPerRunUsd: 0,
  daemonPort: DAEMON_DEFAULT_PORT,
  scanPaths: ['~/dev', '~/projects'],
  autoRegister: true,
  planningQuestionTimeoutSec: 300,
};

export function getGlobalConfigDir(): string {
  return path.join(os.homedir(), GLOBAL_CONFIG_DIR);
}

function getGlobalConfigPath(): string {
  return path.join(getGlobalConfigDir(), CONFIG_FILE);
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const saved = await readJson<Partial<GlobalConfig>>(getGlobalConfigPath());
  if (!saved) return { ...DEFAULT_GLOBAL_CONFIG };
  return {
    defaultModels: { ...DEFAULT_GLOBAL_CONFIG.defaultModels, ...saved.defaultModels },
    defaultMaxRetries: saved.defaultMaxRetries ?? DEFAULT_GLOBAL_CONFIG.defaultMaxRetries,
    defaultParallel: saved.defaultParallel ?? DEFAULT_GLOBAL_CONFIG.defaultParallel,
    defaultMaxParallel: saved.defaultMaxParallel ?? DEFAULT_GLOBAL_CONFIG.defaultMaxParallel,
    defaultWorktrees: saved.defaultWorktrees ?? DEFAULT_GLOBAL_CONFIG.defaultWorktrees,
    defaultMaxCostPerTaskUsd: saved.defaultMaxCostPerTaskUsd ?? DEFAULT_GLOBAL_CONFIG.defaultMaxCostPerTaskUsd,
    defaultMaxCostPerRunUsd: saved.defaultMaxCostPerRunUsd ?? DEFAULT_GLOBAL_CONFIG.defaultMaxCostPerRunUsd,
    daemonPort: saved.daemonPort ?? DEFAULT_GLOBAL_CONFIG.daemonPort,
    scanPaths: saved.scanPaths ?? DEFAULT_GLOBAL_CONFIG.scanPaths,
    autoRegister: saved.autoRegister ?? DEFAULT_GLOBAL_CONFIG.autoRegister,
    planningQuestionTimeoutSec: saved.planningQuestionTimeoutSec ?? DEFAULT_GLOBAL_CONFIG.planningQuestionTimeoutSec,
  };
}

export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await ensureDir(getGlobalConfigDir());
  await writeJson(getGlobalConfigPath(), config);
}
