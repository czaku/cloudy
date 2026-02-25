import path from 'node:path';
import type { ProjectState, Plan, CostSummary, CloudyConfig } from './types.js';
import {
  CLAWDASH_DIR,
  STATE_FILE,
  STATE_VERSION,
  DEFAULT_CONFIG,
} from '../config/defaults.js';
import { ensureDir, readJson, writeJson } from '../utils/fs.js';

function statePath(cwd: string): string {
  return path.join(cwd, CLAWDASH_DIR, STATE_FILE);
}

function emptyCostSummary(): CostSummary {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalEstimatedUsd: 0,
    byPhase: {},
    byModel: {},
  };
}

export function createInitialState(config?: CloudyConfig): ProjectState {
  return {
    version: STATE_VERSION,
    plan: null,
    config: config ?? { ...DEFAULT_CONFIG },
    costSummary: emptyCostSummary(),
  };
}

export async function loadState(cwd: string): Promise<ProjectState | null> {
  return readJson<ProjectState>(statePath(cwd));
}

export async function saveState(
  cwd: string,
  state: ProjectState,
): Promise<void> {
  await ensureDir(path.join(cwd, CLAWDASH_DIR));
  state.version = STATE_VERSION;
  await writeJson(statePath(cwd), state);
}

export async function loadOrCreateState(
  cwd: string,
  config?: CloudyConfig,
): Promise<ProjectState> {
  const existing = await loadState(cwd);
  if (existing) return existing;
  const state = createInitialState(config);
  await saveState(cwd, state);
  return state;
}

export function updatePlan(state: ProjectState, plan: Plan): void {
  state.plan = plan;
  // Reset run-level timestamps and costs so the dashboard starts fresh for the new plan
  state.startedAt = undefined;
  state.completedAt = undefined;
  state.costSummary = emptyCostSummary();
}

/**
 * Reset any tasks stuck in `in_progress` back to `pending` (crash recovery).
 * Returns the list of task IDs that were reset so the caller can warn the user.
 */
export function sanitizeStaleTasks(plan: Plan): string[] {
  const reset: string[] = [];
  for (const task of plan.tasks) {
    if (task.status === 'in_progress') {
      task.status = 'pending';
      task.startedAt = undefined;
      reset.push(task.id);
    }
  }
  return reset;
}

export function addCost(
  state: ProjectState,
  phase: string,
  model: string,
  usd: number,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): void {
  const cs = state.costSummary;
  cs.totalInputTokens += inputTokens;
  cs.totalOutputTokens += outputTokens;
  cs.totalCacheReadTokens += cacheReadTokens;
  cs.totalCacheWriteTokens += cacheWriteTokens;
  cs.totalEstimatedUsd += usd;
  cs.byPhase[phase] = (cs.byPhase[phase] ?? 0) + usd;
  cs.byModel[model] = (cs.byModel[model] ?? 0) + usd;
}
