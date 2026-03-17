import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectState, Plan, CostSummary, CloudyConfig } from './types.js';
import {
  CLAWDASH_DIR,
  RUNS_DIR,
  CURRENT_FILE,
  STATE_FILE,
  STATE_VERSION,
  DEFAULT_CONFIG,
} from '../config/defaults.js';
import { ensureDir, readJson, writeJson, fileExists } from '../utils/fs.js';
import { getCurrentRunDir } from '../utils/run-dir.js';
import { EventStore } from './event-store.js';
import type { Task } from './types.js';

// ── Run name generation ───────────────────────────────────────────────

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function generateRunName(goal: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM
  return `${date}-${time}-${toSlug(goal)}`;
}

// ── Run directory helpers ─────────────────────────────────────────────

export function getRunDir(cwd: string, runName: string): string {
  return path.join(cwd, CLAWDASH_DIR, RUNS_DIR, runName);
}

export async function getCurrentRunName(cwd: string): Promise<string | null> {
  try {
    const content = await fs.readFile(
      path.join(cwd, CLAWDASH_DIR, CURRENT_FILE),
      'utf-8',
    );
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function setCurrentRun(cwd: string, runName: string): Promise<void> {
  await ensureDir(path.join(cwd, CLAWDASH_DIR));
  await fs.writeFile(
    path.join(cwd, CLAWDASH_DIR, CURRENT_FILE),
    runName,
    'utf-8',
  );
}

export async function createRunDir(cwd: string, runName: string): Promise<string> {
  const runDir = getRunDir(cwd, runName);
  await ensureDir(runDir);
  await setCurrentRun(cwd, runName);
  return runDir;
}

// ── State path (uses current run dir) ────────────────────────────────

const EVENTS_FILE = 'events.jsonl';

async function statePath(cwd: string): Promise<string> {
  const runDir = await getCurrentRunDir(cwd);
  return path.join(runDir, STATE_FILE);
}

async function eventsPath(cwd: string): Promise<string> {
  const runDir = await getCurrentRunDir(cwd);
  return path.join(runDir, EVENTS_FILE);
}

// ── Cost summary ──────────────────────────────────────────────────────

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

function normalizeTask(task: Task, config: CloudyConfig): Task {
  const fallbackTimeout = config.taskTimeoutMs || DEFAULT_CONFIG.taskTimeoutMs;
  const fallbackMaxRetries = config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
  const rawTimeoutMinutes = (task as Task & { timeoutMinutes?: unknown }).timeoutMinutes;
  const timeoutFromMinutes =
    typeof rawTimeoutMinutes === 'number' && Number.isFinite(rawTimeoutMinutes)
      ? Math.max(1, rawTimeoutMinutes) * 60_000
      : undefined;

  return {
    ...task,
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    contextPatterns: Array.isArray(task.contextPatterns) ? task.contextPatterns : [],
    outputArtifacts: Array.isArray(task.outputArtifacts) ? task.outputArtifacts : [],
    allowedWritePaths: Array.isArray(task.allowedWritePaths) ? task.allowedWritePaths : [],
    retries: Number.isFinite(task.retries) ? task.retries : 0,
    maxRetries: Number.isFinite(task.maxRetries) ? task.maxRetries : fallbackMaxRetries,
    ifFailed: task.ifFailed === 'halt' || task.ifFailed === 'skip' ? task.ifFailed : 'skip',
    timeout: Number.isFinite(task.timeout) && task.timeout > 0 ? task.timeout : (timeoutFromMinutes ?? fallbackTimeout),
    status: task.status ?? 'pending',
  };
}

export function normalizePlanTasks(plan: Plan, config: CloudyConfig): Plan {
  return {
    ...plan,
    tasks: plan.tasks.map((task) => normalizeTask(task, config)),
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
  const ePath = await eventsPath(cwd);
  if (await fileExists(ePath)) {
    const baseState = (await readJson<ProjectState>(await statePath(cwd))) ?? createInitialState();
    const store = new EventStore(baseState, ePath);
    const replayed = await store.replay();
    if (replayed.plan) {
      replayed.plan = normalizePlanTasks(replayed.plan, replayed.config ?? DEFAULT_CONFIG);
    }
    return replayed;
  }
  const loaded = await readJson<ProjectState>(await statePath(cwd));
  if (loaded?.plan) {
    loaded.plan = normalizePlanTasks(loaded.plan, loaded.config ?? DEFAULT_CONFIG);
  }
  return loaded;
}

export async function saveState(
  cwd: string,
  state: ProjectState,
): Promise<void> {
  const p = await statePath(cwd);
  await ensureDir(path.dirname(p));
  state.version = STATE_VERSION;
  await writeJson(p, state);
}

export function getEventsPath(cwd: string): Promise<string> {
  return eventsPath(cwd);
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
  state.plan = normalizePlanTasks(plan, state.config ?? DEFAULT_CONFIG);
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
