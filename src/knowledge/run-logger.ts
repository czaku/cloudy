/**
 * Run logger — writes run events and a state summary to `.cloudy/runs/{runId}/`.
 *
 * Each run gets its own directory so the dashboard can list runs uniformly,
 * whether they came from `cloudy run` or a pipeline phase (both produce directories).
 *
 * Files written per run:
 *   .cloudy/runs/run-YYYYMMDD-HHmmss/events.jsonl  ← one JSON line per task event
 *   .cloudy/runs/run-YYYYMMDD-HHmmss/state.json    ← summary written on completion
 *   .cloudy/runs/latest.jsonl                       ← copy of latest events (compat)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR } from '../config/defaults.js';
import { ensureDir } from '../utils/fs.js';
import type { AcceptanceCriterionResult, CostSummary, Task } from '../core/types.js';

const RUNS_DIR = 'runs';
const LATEST = 'latest.jsonl';

// ── Entry shapes ──────────────────────────────────────────────────────────────

interface RetryEntry {
  attempt: number;
  timestamp: string;
  failureType: string;
  aiReview?: string;     // extracted ai-review feedback for this attempt
  reason?: string;
}

export interface TaskCompletedEntry {
  ts: string;
  event: 'task_completed';
  taskId: string;
  title: string;
  attempt: number;        // which attempt succeeded (1 = first try)
  durationMs: number;
  costUsd: number;
  model: string;
  engine: string;
  filesChanged: string[];
  criteriaResults: AcceptanceCriterionResult[];
  resultSummary: string;
  validationStrategies: string[];  // which validators ran
}

export interface TaskFailedEntry {
  ts: string;
  event: 'task_failed';
  taskId: string;
  title: string;
  totalAttempts: number;
  totalDurationMs: number;
  costUsd: number;
  finalError: string;
  retryHistory: RetryEntry[];
  criteriaResults: AcceptanceCriterionResult[];
  // Diagnosis hint — last ai-review message, useful for understanding the failure
  lastAiReview: string;
}

export interface RunCompletedEntry {
  ts: string;
  event: 'run_completed';
  runId: string;
  totalTasks: number;
  completed: number;
  failed: number;
  skipped: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  durationMs: number;
  failedTaskIds: string[];
  costByModel: Record<string, number>;
  costByPhase: Record<string, number>;
}

export interface RunFailedEntry {
  ts: string;
  event: 'run_failed';
  runId: string;
  error: string;
  durationMs: number;
}

type LogEntry = TaskCompletedEntry | TaskFailedEntry | RunCompletedEntry | RunFailedEntry;

// ── RunLogger ─────────────────────────────────────────────────────────────────

export class RunLogger {
  private runId: string;
  private runDir: string;
  private logPath: string;
  private latestPath: string;
  private startMs: number;

  constructor(cwd: string) {
    const now = new Date();
    const stamp = now.toISOString()
      .replace('T', '-')
      .replace(/:/g, '')
      .slice(0, 15);             // "20260226-110000"
    this.runId = `run-${stamp}`;
    const runsDir = path.join(cwd, CLAWDASH_DIR, RUNS_DIR);
    this.runDir = path.join(runsDir, this.runId);
    this.logPath = path.join(this.runDir, 'events.jsonl');
    this.latestPath = path.join(runsDir, LATEST);
    this.startMs = Date.now();
  }

  async init(): Promise<void> {
    await ensureDir(this.runDir);
  }

  getId(): string { return this.runId; }

  async logTaskCompleted(opts: {
    taskId: string;
    title: string;
    attempt: number;
    durationMs: number;
    costUsd: number;
    model: string;
    engine: string;
    filesChanged: string[];
    criteriaResults: AcceptanceCriterionResult[];
    resultSummary: string;
    validationStrategies: string[];
  }): Promise<void> {
    const entry: TaskCompletedEntry = {
      ts: new Date().toISOString(),
      event: 'task_completed',
      ...opts,
    };
    await this.append(entry);
  }

  async logTaskFailed(opts: {
    taskId: string;
    title: string;
    totalAttempts: number;
    totalDurationMs: number;
    costUsd: number;
    finalError: string;
    retryHistory: Array<{ attempt: number; timestamp: string; failureType: string; fullError?: string; reason?: string }>;
    criteriaResults: AcceptanceCriterionResult[];
  }): Promise<void> {
    // Extract the last ai-review message for quick diagnosis
    const lastEntry = opts.retryHistory[opts.retryHistory.length - 1];
    const lastAiReview = lastEntry
      ? (lastEntry.fullError ?? lastEntry.reason ?? '').slice(0, 600)
      : '';

    const retryHistory: RetryEntry[] = opts.retryHistory.map((r) => ({
      attempt: r.attempt,
      timestamp: r.timestamp,
      failureType: r.failureType,
      // Pull out just the ai-review line (first 400 chars)
      aiReview: (r.fullError ?? r.reason ?? '').slice(0, 400),
    }));

    const entry: TaskFailedEntry = {
      ts: new Date().toISOString(),
      event: 'task_failed',
      taskId: opts.taskId,
      title: opts.title,
      totalAttempts: opts.totalAttempts,
      totalDurationMs: opts.totalDurationMs,
      costUsd: opts.costUsd,
      finalError: opts.finalError,
      retryHistory,
      criteriaResults: opts.criteriaResults,
      lastAiReview,
    };
    await this.append(entry);
  }

  async logRunCompleted(opts: {
    totalTasks: number;
    completed: number;
    failed: number;
    skipped: number;
    failedTaskIds: string[];
    costSummary: CostSummary;
    tasks?: Task[];
  }): Promise<void> {
    const now = new Date().toISOString();
    const durationMs = Date.now() - this.startMs;
    const entry: RunCompletedEntry = {
      ts: now,
      event: 'run_completed',
      runId: this.runId,
      totalTasks: opts.totalTasks,
      completed: opts.completed,
      failed: opts.failed,
      skipped: opts.skipped,
      totalCostUsd: opts.costSummary.totalEstimatedUsd,
      totalInputTokens: opts.costSummary.totalInputTokens,
      totalOutputTokens: opts.costSummary.totalOutputTokens,
      totalCacheReadTokens: opts.costSummary.totalCacheReadTokens,
      durationMs,
      failedTaskIds: opts.failedTaskIds,
      costByModel: opts.costSummary.byModel,
      costByPhase: opts.costSummary.byPhase,
    };
    await this.append(entry);

    // Write state.json for dashboard compatibility (same format as pipeline phase dirs)
    const stateSummary = {
      version: 1,
      runId: this.runId,
      startedAt: new Date(Date.now() - durationMs).toISOString(),
      completedAt: now,
      costSummary: { totalEstimatedUsd: opts.costSummary.totalEstimatedUsd },
      plan: opts.tasks ? { tasks: opts.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })) } : undefined,
    };
    await fs.writeFile(path.join(this.runDir, 'state.json'), JSON.stringify(stateSummary, null, 2), 'utf-8').catch(() => {});
  }

  async logRunFailed(error: string): Promise<void> {
    const entry: RunFailedEntry = {
      ts: new Date().toISOString(),
      event: 'run_failed',
      runId: this.runId,
      error,
      durationMs: Date.now() - this.startMs,
    };
    await this.append(entry);
  }

  private async append(entry: LogEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logPath, line, 'utf-8');
    // Keep latest.jsonl in sync (overwrite with full content each time for atomicity)
    await fs.copyFile(this.logPath, this.latestPath);
  }
}

/**
 * Read the 3 most recent run logs and return a compact insights summary
 * suitable for injection into the planning prompt.
 *
 * Surfaces: recurring failure patterns, tasks that needed retries,
 * expensive tasks, and known caveats from last runs.
 */
export async function loadRecentRunInsights(cwd: string): Promise<string | undefined> {
  const runsDir = path.join(cwd, CLAWDASH_DIR, RUNS_DIR);
  let eventFiles: string[];
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    // Support both directory runs (new: run-*/events.jsonl) and legacy flat JSONL
    const runDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith('run-'))
      .map((e) => path.join(runsDir, e.name, 'events.jsonl'));
    const flatFiles = entries
      .filter((e) => e.isFile() && e.name.startsWith('run-') && e.name.endsWith('.jsonl'))
      .map((e) => path.join(runsDir, e.name));
    eventFiles = [...runDirs, ...flatFiles].sort().slice(-3).reverse();
  } catch {
    return undefined;
  }

  if (eventFiles.length === 0) return undefined;

  const lines: string[] = [];
  let totalFailedTasks = 0;
  let totalRetries = 0;
  const failureReasons: string[] = [];
  const expensiveTasks: string[] = [];

  for (const file of eventFiles) {
    const content = await fs.readFile(file, 'utf-8').catch(() => '');
    for (const line of content.trim().split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        if (entry.event === 'task_failed') {
          totalFailedTasks++;
          const e = entry as TaskFailedEntry;
          totalRetries += e.totalAttempts - 1;
          if (e.lastAiReview) {
            failureReasons.push(`[${e.taskId}] ${e.lastAiReview.slice(0, 200)}`);
          }
        }
        if (entry.event === 'task_completed') {
          const e = entry as TaskCompletedEntry;
          if (e.attempt > 1) totalRetries += e.attempt - 1;
          if (e.costUsd > 0.5) {
            expensiveTasks.push(`[${e.taskId}] $${e.costUsd.toFixed(3)} (${e.attempt} attempt(s))`);
          }
        }
      } catch { /* malformed line — skip */ }
    }
  }

  if (totalFailedTasks === 0 && totalRetries === 0 && expensiveTasks.length === 0) {
    return undefined;
  }

  lines.push(`From the last ${eventFiles.length} run(s):`);
  if (totalFailedTasks > 0) {
    lines.push(`- ${totalFailedTasks} task(s) ultimately failed`);
  }
  if (totalRetries > 0) {
    lines.push(`- ${totalRetries} retry attempt(s) were needed`);
  }
  if (failureReasons.length > 0) {
    lines.push('\nRecurring failure patterns (avoid similar mistakes):');
    for (const reason of failureReasons.slice(0, 5)) {
      lines.push(`  • ${reason}`);
    }
  }
  if (expensiveTasks.length > 0) {
    lines.push('\nHigh-cost tasks from previous runs (consider splitting if similar scope):');
    for (const t of expensiveTasks.slice(0, 3)) {
      lines.push(`  • ${t}`);
    }
  }

  return lines.join('\n');
}
