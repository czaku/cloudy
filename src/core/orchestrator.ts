import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CloudyConfig,
  ClaudeModel,
  OrchestratorEventHandler,
  Plan,
  ProjectState,
  RetryHistoryEntry,
  Task,
} from './types.js';
import { TaskQueue } from './task-queue.js';
import { ParallelScheduler } from './parallel-scheduler.js';
import { runEngine } from '../executor/engine.js';
import {
  buildExecutionPrompt,
  buildRetryPrompt,
} from '../executor/prompt-builder.js';
import {
  resolveContextFiles,
  expandContext,
} from '../executor/context-resolver.js';
import { validateTask, formatValidationErrors } from '../validator/validator.js';
import { createCheckpoint } from '../git/checkpoint.js';
import { commitAll, isGitRepo, getGitDiff, getChangedFiles } from '../git/git.js';
import {
  createWorktree,
  mergeWorktree,
  removeWorktree,
  type WorktreeInfo,
} from '../git/worktree.js';
import { CostTracker } from '../cost/tracker.js';
import { routeModelForTask } from '../config/auto-routing.js';
import { saveState } from './state.js';
import { log, logTaskOutput } from '../utils/logger.js';
import {
  writeHandoff,
  readHandoffs,
  appendLearning,
  readLearnings,
  extractLearning,
} from '../knowledge/handoffs.js';
import { RunLogger } from '../knowledge/run-logger.js';
import { parseSubtasks } from './subtask-parser.js';
import { waitForApproval, type ApprovalHandler } from './approval.js';
import { logApproval } from '../utils/approval-log.js';

// ── Project conventions loader ────────────────────────────────────────────────

/**
 * Read project conventions from CLAUDE.md, AGENTS.md, or CONVENTIONS.md.
 * These are injected into every execution prompt so Claude knows the rules.
 */
async function readConventions(cwd: string): Promise<string | undefined> {
  const candidates = [
    'CLAUDE.md',
    'AGENTS.md',
    '.claude/CLAUDE.md',
    'CONVENTIONS.md',
    '.cursorrules',
  ];
  for (const name of candidates) {
    try {
      const content = await fs.readFile(path.join(cwd, name), 'utf-8');
      if (content.trim()) {
        await log.info(`  Loaded conventions from ${name} (${content.length} chars)`);
        return content.trim();
      }
    } catch {
      // not found, try next
    }
  }
  return undefined;
}

// ── Error context extractor ───────────────────────────────────────────────────

/**
 * Parse validation error text for file:line references and return code snippets.
 * This gives the retry prompt precise context about what broke and where.
 */
async function extractErrorFileContext(errors: string, cwd: string): Promise<string> {
  // Match patterns like: src/file.ts:45, api/routes.py:123:5, ./lib/foo.js:7
  const fileLineRe = /(?:^|\s)(\.?\.?\/)?(?:[\w./\-]+\/)?[\w.\-]+\.(ts|tsx|py|js|jsx|go|rs|swift):(\d+)/gm;
  const seen = new Set<string>();
  const snippets: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = fileLineRe.exec(errors)) !== null) {
    // Extract just the file path part
    const raw = match[0].trim();
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx < 0) continue;
    const filePart = raw.slice(0, colonIdx);
    const lineStr = raw.slice(colonIdx + 1).split(':')[0]; // strip extra :col

    const key = `${filePart}:${lineStr}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const fullPath = path.isAbsolute(filePart) ? filePart : path.join(cwd, filePart);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const lineNum = parseInt(lineStr, 10) - 1;
      if (lineNum < 0 || lineNum >= lines.length) continue;

      const start = Math.max(0, lineNum - 4);
      const end = Math.min(lines.length - 1, lineNum + 4);
      const snippet = lines.slice(start, end + 1)
        .map((l, i) => {
          const n = start + i + 1;
          const marker = n === lineNum + 1 ? '>>>' : '   ';
          return `${marker} ${String(n).padStart(4)}: ${l}`;
        })
        .join('\n');

      snippets.push(`**${filePart}** (around line ${lineStr}):\n\`\`\`\n${snippet}\n\`\`\``);
    } catch {
      // File not readable — skip
    }
  }

  if (snippets.length === 0) return '';
  return `# Failing Code Snippets\n\n${snippets.join('\n\n')}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export interface OrchestratorOptions {
  cwd: string;
  state: ProjectState;
  config: CloudyConfig;
  onEvent?: OrchestratorEventHandler;
  dryRun?: boolean;
  onApprovalRequest?: ApprovalHandler;
  onReviewModelRequest?: () => Promise<ClaudeModel | 'skip'>;
}

export class Orchestrator {
  private cwd: string;
  private state: ProjectState;
  private config: CloudyConfig;
  private onEvent: OrchestratorEventHandler;
  private costTracker: CostTracker;
  private dryRun: boolean;
  private abortController = new AbortController();
  private onApprovalRequest?: ApprovalHandler;
  private onReviewModelRequest?: () => Promise<ClaudeModel | 'skip'>;
  private runLogger!: RunLogger;
  private taskStartCostUsd = new Map<string, number>();

  constructor(options: OrchestratorOptions) {
    this.cwd = options.cwd;
    this.state = options.state;
    this.config = options.config;
    this.onEvent = options.onEvent ?? (() => {});
    this.costTracker = new CostTracker();
    this.dryRun = options.dryRun ?? false;
    this.onApprovalRequest = options.onApprovalRequest;
    this.onReviewModelRequest = options.onReviewModelRequest;
  }

  private needsApproval(task: Task): boolean {
    const mode = this.config.approval?.mode ?? 'never';
    return task.requiresApproval === true || mode === 'always';
  }

  abort(): void {
    this.abortController.abort();
  }

  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  async run(): Promise<void> {
    const plan = this.state.plan;
    if (!plan) {
      throw new Error('No plan found. Run "cloudy init" first.');
    }

    this.state.startedAt = new Date().toISOString();
    const queue = new TaskQueue(plan.tasks);

    // Run logger — appends JSONL on each task event for post-run AI analysis
    this.runLogger = new RunLogger(this.cwd);
    await this.runLogger.init();
    this.taskStartCostUsd = new Map();

    await log.info(`Starting execution of ${plan.tasks.length} tasks`);

    if (this.dryRun) {
      this.runDryRun(queue);
      return;
    }

    if (this.config.parallel) {
      const useWorktrees = this.config.worktrees && await isGitRepo(this.cwd);
      const scheduler = new ParallelScheduler(queue, {
        maxParallel: this.config.maxParallel,
        executeTask: async (task) => {
          let worktree: WorktreeInfo | null = null;
          let taskCwd = this.cwd;

          if (useWorktrees) {
            try {
              worktree = await createWorktree(this.cwd, task.id);
              taskCwd = worktree.path;
            } catch (err) {
              await log.warn(
                `Failed to create worktree for ${task.id}: ${err instanceof Error ? err.message : String(err)} — running in main cwd`,
              );
            }
          }

          try {
            await this.executeTask(task, queue, plan, taskCwd);
          } finally {
            if (worktree) {
              const mergeResult = await mergeWorktree(this.cwd, worktree).catch(() => ({
                merged: false,
                conflict: true,
              }));
              if (!mergeResult.merged && mergeResult.conflict) {
                if (queue.getTask(task.id)?.status === 'completed') {
                  queue.setError(task.id, 'Merge conflict when integrating changes');
                  queue.updateStatus(task.id, 'failed');
                }
              }
              await removeWorktree(this.cwd, worktree).catch(() => {});
            }
          }
        },
        cwd: this.cwd,
      });
      this.abortController.signal.addEventListener('abort', () => scheduler.abort(), { once: true });
      await scheduler.run();
    } else {
      await this.runSequential(queue, plan);
    }

    // Update plan tasks from queue
    plan.tasks = queue.getAllTasks();
    plan.updatedAt = new Date().toISOString();

    // Finalize
    this.state.costSummary = this.costTracker.getSummary();
    this.state.completedAt = new Date().toISOString();
    await saveState(this.cwd, this.state);

    // Write run summary to log
    const allTasks = queue.getAllTasks();
    const completedTasks = allTasks.filter((t) => t.status === 'completed');
    const failedTasks = allTasks.filter((t) => t.status === 'failed');
    const skippedTasks = allTasks.filter((t) => t.status === 'skipped');
    await this.runLogger.logRunCompleted({
      totalTasks: allTasks.length,
      completed: completedTasks.length,
      failed: failedTasks.length,
      skipped: skippedTasks.length,
      failedTaskIds: failedTasks.map((t) => t.id),
      costSummary: this.costTracker.getSummary(),
    }).catch(() => {});

    // Wrap-up: run after all tasks finish, even if some failed, unless aborted
    if (!this.aborted && plan.wrapUpPrompt) {
      await this.runWrapUp(plan.wrapUpPrompt);
    }

    // Post-run holistic review + auto-recovery loop
    if (!this.aborted && this.config.review?.enabled !== false) {
      const reviewResult = await this.runHolisticReview();

      // Auto-recovery: if reviewer flagged tasks for re-run, reset and re-execute them
      if (reviewResult && reviewResult.verdict === 'FAIL' && reviewResult.rerunTaskIds.length > 0) {
        const ids = reviewResult.rerunTaskIds;
        await log.info(`Reviewer flagged ${ids.length} task(s) for re-run: ${ids.join(', ')}`);
        this.onEvent({ type: 'rerun_started', taskIds: ids });

        let anyReset = false;
        for (const id of ids) {
          const task = plan.tasks.find((t) => t.id === id);
          if (task) {
            task.status = 'pending';
            task.error = undefined;
            task.retries = 0;
            task.retryHistory = [];
            anyReset = true;
          }
        }

        if (anyReset) {
          plan.updatedAt = new Date().toISOString();
          await saveState(this.cwd, this.state);

          // Re-run the queue with reset tasks
          const { TaskQueue } = await import('./task-queue.js');
          const rerunQueue = new TaskQueue(plan.tasks);
          await this.runSequential(rerunQueue, plan);

          // Update plan tasks from re-run queue
          plan.tasks = rerunQueue.getAllTasks();
          plan.updatedAt = new Date().toISOString();
          this.state.costSummary = this.costTracker.getSummary();
          await saveState(this.cwd, this.state);

          // Second review after re-run
          await this.runHolisticReview();
        }
      }
    }

    if (this.aborted) {
      this.onEvent({ type: 'run_status', status: 'stopped' });
      await log.info('Run stopped by user');
    } else if (queue.isComplete()) {
      this.onEvent({ type: 'run_completed', summary: this.costTracker.getSummary() });
      await log.info('All tasks completed successfully');
    } else if (queue.hasFailures()) {
      const failed = queue.getTasksByStatus('failed');
      const deadlocked = queue.getDeadlockedTasks();

      let msg = `${failed.length} task(s) failed: ${failed.map((t) => t.id).join(', ')}`;
      if (deadlocked.length > 0) {
        msg += `\n  ⚠️  unreachable tasks (blocked by upstream failures): ${deadlocked.map((t) => t.id).join(', ')}`;
      }
      this.onEvent({ type: 'run_failed', error: msg });
      await log.error(msg);
    }
  }

  private async runHolisticReview(): Promise<import('../reviewer.js').ReviewResult | null> {
    let reviewModel: ClaudeModel | 'skip' = this.config.review?.model ?? 'sonnet';

    // If TUI is connected with model selector, ask for model choice
    if (this.onReviewModelRequest) {
      this.onEvent({ type: 'review_model_requested' });
      reviewModel = await this.onReviewModelRequest();
    }

    if (reviewModel === 'skip') return null;

    this.onEvent({ type: 'review_started', model: reviewModel });

    try {
      const { runHolisticReview } = await import('../reviewer.js');
      const result = await runHolisticReview(
        this.cwd,
        this.state.plan!,
        reviewModel,
        (text) => this.onEvent({ type: 'review_output', text }),
      );
      this.onEvent({ type: 'review_completed', result });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onEvent({ type: 'review_failed', error: msg });
      return null;
    }
  }

  private async runWrapUp(prompt: string): Promise<void> {
    await log.info('Running wrap-up task…');
    this.onEvent({ type: 'run_status', status: 'running' });
    try {
      const result = await runEngine({
        prompt,
        engine: this.config.engine ?? 'claude-code',
        claudeModel: this.config.models.execution,
        piMono: this.config.piMono,
        cwd: this.cwd,
        onOutput: (text) => this.onEvent({ type: 'task_output', taskId: 'wrap-up', text }),
        abortSignal: this.abortController.signal,
      });
      if (result.success) {
        await log.info('Wrap-up completed');
      } else {
        await log.warn(`Wrap-up finished with error: ${result.error ?? 'unknown'}`);
      }
    } catch (err) {
      await log.warn(`Wrap-up failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async runSequential(queue: TaskQueue, plan: Plan): Promise<void> {
    while (!queue.isComplete() && !this.aborted) {
      if (queue.hasFailures()) {
        // Check for halt-on-failure tasks
        const failedWithHalt = queue
          .getTasksByStatus('failed')
          .find((t) => t.ifFailed === 'halt');
        if (failedWithHalt) break;
      }

      const ready = queue.getReadyTasks();
      if (ready.length === 0) {
        // No ready tasks — check for deadlock
        if (queue.isDeadlocked()) {
          const blocked = queue.getDeadlockedTasks();
          await log.warn(
            `Deadlock detected: tasks [${blocked.map((t) => t.id).join(', ')}] are unreachable due to upstream failures`,
          );
        }
        break;
      }
      await this.executeTask(ready[0], queue, plan, this.cwd);
    }
  }

  private runDryRun(queue: TaskQueue): void {
    const tasks = queue.getAllTasks();
    console.log('\n=== Dry Run Preview ===\n');
    console.log(`Total tasks: ${tasks.length}`);
    console.log(`Models: planning=${this.config.models.planning}, execution=${this.config.models.execution}, validation=${this.config.models.validation}`);
    console.log(`Auto model routing: ${this.config.autoModelRouting ? 'yes' : 'no'}`);
    console.log(`Parallel: ${this.config.parallel ? `yes (max ${this.config.maxParallel})` : 'no'}`);
    console.log(`Worktrees: ${this.config.worktrees ? 'yes' : 'no'}`);
    console.log(`Validation: ${Object.entries(this.config.validation).filter(([k, v]) => k !== 'commands' && v).map(([k]) => k).join(', ')}`);
    if (this.config.validation.commands?.length > 0) {
      console.log(`Validation commands: ${this.config.validation.commands.join(', ')}`);
    }
    console.log(`Retry delay: ${this.config.retryDelaySec}s`);
    console.log(`Task timeout: ${Math.round(this.config.taskTimeoutMs / 60000)}min`);
    if (this.config.contextBudgetTokens > 0) {
      console.log(`Context budget: ${this.config.contextBudgetTokens.toLocaleString()} tokens`);
    }
    if (this.config.maxCostPerTaskUsd > 0) {
      console.log(`Max cost per task: $${this.config.maxCostPerTaskUsd}`);
    }
    console.log('');

    for (const task of tasks) {
      const model = this.config.autoModelRouting
        ? routeModelForTask(task)
        : this.config.models.execution;
      const timeoutMin = Math.round(task.timeout / 60000);
      console.log(`[${task.id}] ${task.title}`);
      console.log(`  Model: ${model}${this.config.autoModelRouting ? ' (auto)' : ''}`);
      console.log(`  Dependencies: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'}`);
      console.log(`  Context: ${task.contextPatterns.length} pattern(s)`);
      console.log(`  Criteria: ${task.acceptanceCriteria.length}`);
      console.log(`  Timeout: ${timeoutMin}min`);
      console.log('');
    }

    console.log('=== No changes will be made (dry run) ===');
  }

  private getModelForTask(task: Task): ClaudeModel {
    if (this.config.autoModelRouting) {
      return routeModelForTask(task);
    }
    return this.config.models.execution;
  }

  private emitProgress(queue: TaskQueue): void {
    const progress = queue.getProgress();
    this.onEvent({
      type: 'progress',
      completed: progress.completed,
      total: progress.total,
      percentage: progress.percentage,
    });
  }

  private async executeTask(
    task: Task,
    queue: TaskQueue,
    plan: Plan,
    taskCwd: string,
  ): Promise<void> {
    const maxAttempts = task.maxRetries + 1;
    const executionModel = this.getModelForTask(task);
    const engine = this.config.engine ?? 'claude-code';
    const engineModel = engine === 'pi-mono'
      ? (this.config.piMono?.model ?? executionModel)
      : executionModel;
    let currentPatterns = [...task.contextPatterns];
    const budget = this.config.contextBudgetTokens;

    // Load conventions (CLAUDE.md / AGENTS.md), learnings, and dependency handoffs
    const conventionsContent = await readConventions(taskCwd);
    const learningsContent = await readLearnings(this.cwd) ?? undefined;
    const handoffSummaries = task.dependencies.length > 0
      ? await readHandoffs(task.dependencies, this.cwd)
      : undefined;

    // Resolve initial context files with token budget
    let contextFiles = await resolveContextFiles(currentPatterns, taskCwd, budget);

    await log.info(`Starting task "${task.id}": ${task.title}`);
    this.onEvent({
      type: 'task_started',
      taskId: task.id,
      title: task.title,
      attempt: 1,
      maxAttempts,
      contextFileCount: contextFiles.length,
      engine,
      model: String(engineModel),
    });
    queue.updateStatus(task.id, 'in_progress');
    this.taskStartCostUsd.set(task.id, this.costTracker.getSummary().totalEstimatedUsd);

    // Create git checkpoint (in the task's working directory)
    let checkpointSha: string | undefined;
    if (await isGitRepo(taskCwd)) {
      checkpointSha = await createCheckpoint(taskCwd, task.id);
      queue.setCheckpoint(task.id, checkpointSha);
    }

    const completedTitles = queue
      .getTasksByStatus('completed')
      .map((t) => t.title);

    const taskStartTime = Date.now();
    let attempt = 0;
    let lastValidationErrors = '';
    let lastErrorFileContext = '';
    let taskCostUsd = 0;
    task.retryHistory = [];

    // Pre-task approval gate (only on first attempt)
    if (this.onApprovalRequest && this.needsApproval(task)) {
      const approvalCfg = this.config.approval;
      this.onEvent({
        type: 'approval_requested',
        taskId: task.id,
        title: task.title,
        stage: 'pre_task',
        timeoutSec: approvalCfg.timeoutSec,
      });

      const action = await waitForApproval(
        {
          taskId: task.id,
          title: task.title,
          description: task.description,
          stage: 'pre_task',
          timeoutSec: approvalCfg.timeoutSec,
          autoAction: approvalCfg.autoAction,
        },
        this.onApprovalRequest,
        this.abortController.signal,
      );

      const autoTriggered = action.action === 'timeout_continue' || action.action === 'timeout_halt';
      await logApproval(this.cwd, {
        timestamp: new Date().toISOString(),
        taskId: task.id,
        stage: 'pre_task',
        action: action.action,
        autoTriggered,
      }).catch(() => {});
      this.onEvent({ type: 'approval_resolved', taskId: task.id, action: action.action, autoTriggered });

      if (action.action === 'halt' || action.action === 'timeout_halt') {
        this.abort();
        return;
      }
      if (action.action === 'skipped') {
        queue.updateStatus(task.id, 'skipped');
        this.emitProgress(queue);
        return;
      }
    }

    while (attempt <= task.maxRetries) {
      if (this.aborted) return;
      attempt++;
      const attemptStart = Date.now();
      await log.info(`  Attempt ${attempt}/${maxAttempts}`);

      // On retry, expand context
      if (attempt > 1) {
        currentPatterns = await expandContext(currentPatterns, taskCwd, budget);
        contextFiles = await resolveContextFiles(currentPatterns, taskCwd, budget);

        this.onEvent({
          type: 'task_started',
          taskId: task.id,
          title: task.title,
          attempt,
          maxAttempts,
          contextFileCount: contextFiles.length,
          engine,
          model: String(engineModel),
        });
      }

      // Build prompt with conventions + learnings + handoffs
      const prompt =
        lastValidationErrors && attempt > 1
          ? buildRetryPrompt(task, plan, completedTitles, lastValidationErrors, contextFiles, learningsContent, handoffSummaries, conventionsContent, lastErrorFileContext)
          : buildExecutionPrompt({ task, plan, completedTaskTitles: completedTitles, contextFiles, learningsContent, handoffSummaries, conventionsContent });

      // Run Claude with timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        task.timeout || this.config.taskTimeoutMs,
      );

      // Heartbeat: log every 2 min so the log file shows the engine is alive.
      // Tracks last stdout activity — real silence (no bytes from claude) is the
      // true hung signal, not just wall-clock time.
      const _engineStart = Date.now();
      let _lastOutputMs = Date.now();            // updated on every onOutput chunk
      const _SILENCE_WARN_MS  = 3 * 60 * 1000;  // 3 min no output → warn
      const _SILENCE_ABORT_MS = 10 * 60 * 1000; // 10 min no output → abort via AbortController
      const _heartbeatId = setInterval(() => {
        const elapsedMs  = Date.now() - _engineStart;
        const silenceMs  = Date.now() - _lastOutputMs;
        const elapsedSec = Math.round(elapsedMs / 1000);
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const elapsed = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

        let suffix = '';
        if (silenceMs >= _SILENCE_ABORT_MS) {
          const silenceSec = Math.round(silenceMs / 1000);
          suffix = ` 🚨 no output for ${silenceSec}s — aborting (hung engine)`;
          log.warn(`  ⏳ still running — "${task.title}" attempt ${attempt}/${maxAttempts} | ${elapsed} elapsed${suffix}`).catch(() => {});
          abortController.abort(); // trigger the existing timeout path
        } else if (silenceMs >= _SILENCE_WARN_MS) {
          const silenceSec = Math.round(silenceMs / 1000);
          suffix = ` ⚠️  no output for ${silenceSec}s — may be hung`;
          log.info(`  ⏳ still running — "${task.title}" attempt ${attempt}/${maxAttempts} | ${elapsed} elapsed${suffix}`).catch(() => {});
        } else {
          log.info(`  ⏳ still running — "${task.title}" attempt ${attempt}/${maxAttempts} | ${elapsed} elapsed`).catch(() => {});
        }
      }, 120_000); // every 2 minutes

      let result;
      try {
        result = await runEngine({
          prompt,
          engine,
          claudeModel: executionModel,
          piMono: this.config.piMono,
          cwd: taskCwd,
          onOutput: (text) => {
            _lastOutputMs = Date.now(); // reset silence timer on any stdout activity
            this.onEvent({ type: 'task_output', taskId: task.id, text });
            logTaskOutput(task.id, text, this.cwd).catch(() => {});
          },
          abortSignal: abortController.signal,
        });
      } catch (err) {
        const isTimeout = (err as Error)?.name === 'AbortError';
        result = {
          success: false,
          output: '',
          error: isTimeout ? 'Task timed out' : String(err),
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          durationMs: Date.now() - attemptStart,
          costUsd: 0,
        };
      } finally {
        clearInterval(_heartbeatId);
        clearTimeout(timeoutId);
      }

      // Track cost
      this.costTracker.record(executionModel, 'execution', result, engine);
      taskCostUsd += result.costUsd;
      this.onEvent({ type: 'cost_update', summary: this.costTracker.getSummary() });

      // Per-task cost budget check
      if (
        this.config.maxCostPerTaskUsd > 0 &&
        taskCostUsd > this.config.maxCostPerTaskUsd &&
        result.success
      ) {
        result = {
          ...result,
          success: false,
          error: `Task cost $${taskCostUsd.toFixed(4)} exceeds maxCostPerTaskUsd ($${this.config.maxCostPerTaskUsd})`,
        };
      }

      if (!result.success) {
        await log.error(`  Execution failed: ${result.error}`);

        const canRetry = queue.incrementRetry(task.id);
        const entry: RetryHistoryEntry = {
          attempt,
          timestamp: new Date().toISOString(),
          failureType: result.error?.includes('timed out') ? 'timeout' : 'execution',
          reason: result.error ?? 'Execution failed',
          fullError: result.error ?? '',
          durationMs: Date.now() - attemptStart,
        };
        task.retryHistory!.push(entry);

        if (canRetry) {
          lastValidationErrors = result.error ?? 'Execution failed';
          this.onEvent({
            type: 'task_failed',
            taskId: task.id,
            title: task.title,
            error: result.error ?? '',
            attempt,
            maxAttempts,
            willRetry: true,
          });
          this.onEvent({
            type: 'task_retrying',
            taskId: task.id,
            title: task.title,
            delaySec: this.config.retryDelaySec,
            attempt,
          });
          await sleep(this.config.retryDelaySec * 1000, this.abortController.signal);
          continue;
        }

        // Failure escalation gate
        const executionError = result.error ?? 'Execution failed';
        if (this.onApprovalRequest && (this.config.approval?.mode ?? 'never') !== 'never') {
          const approvalCfg = this.config.approval;
          this.onEvent({
            type: 'approval_requested',
            taskId: task.id,
            title: task.title,
            stage: 'failure_escalation',
            context: executionError,
            timeoutSec: approvalCfg.timeoutSec,
          });

          const escalationAction = await waitForApproval(
            {
              taskId: task.id,
              title: task.title,
              description: task.description,
              stage: 'failure_escalation',
              context: executionError,
              timeoutSec: approvalCfg.timeoutSec,
              autoAction: approvalCfg.autoAction,
            },
            this.onApprovalRequest,
            this.abortController.signal,
          );

          const autoTriggered = escalationAction.action === 'timeout_continue' || escalationAction.action === 'timeout_halt';
          await logApproval(this.cwd, {
            timestamp: new Date().toISOString(),
            taskId: task.id,
            stage: 'failure_escalation',
            action: escalationAction.action,
            autoTriggered,
            hint: escalationAction.action === 'retry_with_hint' ? escalationAction.hint : undefined,
          }).catch(() => {});
          this.onEvent({ type: 'approval_resolved', taskId: task.id, action: escalationAction.action, autoTriggered });

          if (escalationAction.action === 'retry_with_hint') {
            lastValidationErrors = `${executionError}\nHuman hint: ${escalationAction.hint}`;
            queue.incrementRetry(task.id);
            continue;
          }
          if (escalationAction.action === 'skipped') {
            queue.updateStatus(task.id, 'skipped');
            this.emitProgress(queue);
            return;
          }
          if (escalationAction.action === 'halt' || escalationAction.action === 'timeout_halt') {
            this.abort();
            return;
          }
        }

        queue.setError(task.id, executionError);
        queue.updateStatus(task.id, 'failed');
        task.durationMs = Date.now() - taskStartTime;
        this.onEvent({
          type: 'task_failed',
          taskId: task.id,
          title: task.title,
          error: executionError,
          attempt,
          maxAttempts,
          willRetry: false,
        });
        this.emitProgress(queue);

        // Append to run log for AI post-analysis
        const failCostUsd = this.costTracker.getSummary().totalEstimatedUsd
          - (this.taskStartCostUsd.get(task.id) ?? 0);
        await this.runLogger.logTaskFailed({
          taskId: task.id,
          title: task.title,
          totalAttempts: attempt,
          totalDurationMs: task.durationMs ?? 0,
          costUsd: Math.round(failCostUsd * 10000) / 10000,
          finalError: executionError,
          retryHistory: task.retryHistory ?? [],
          criteriaResults: task.acceptanceCriteriaResults ?? [],
        }).catch(() => {});

        return;
      }

      // Warn if Claude made no file changes since the checkpoint
      if (checkpointSha && await isGitRepo(taskCwd)) {
        const diff = await getGitDiff(taskCwd, checkpointSha).catch(() => '');
        if (!diff.trim()) {
          await log.warn(`Task "${task.id}" completed but made no file changes`);
          this.onEvent({
            type: 'task_output',
            taskId: task.id,
            text: '⚠️  Warning: task completed but no file changes were detected\n',
          });
        }
      }

      // Store result summary
      task.resultSummary = result.output.slice(0, 500);

      // Parse and inject dynamic subtasks before committing
      const subtasks = parseSubtasks(result.output, task);
      if (subtasks.length > 0) {
        for (const st of subtasks) {
          try {
            queue.addTask(st);
          } catch (err) {
            await log.warn(`Failed to add subtask "${st.id}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        const addedIds = subtasks.map((t) => t.id);
        this.onEvent({
          type: 'subtasks_created',
          parentTaskId: task.id,
          count: addedIds.length,
          ids: addedIds,
        });
        await log.info(`  ${addedIds.length} subtask(s) created: ${addedIds.join(', ')}`);
      }

      // Commit changes
      if (await isGitRepo(taskCwd)) {
        await commitAll(taskCwd, `[cloudy] ${task.id}: ${task.title}`);
      }

      // Collect output artifacts from all completed dependency tasks so the
      // AI reviewer knows which files already exist and aren't in this diff
      const priorArtifacts = queue
        .getTasksByStatus('completed')
        .filter((t) => task.dependencies.includes(t.id))
        .flatMap((t) =>
          (t.outputArtifacts ?? []).map((file) => ({
            file,
            taskId: t.id,
            taskTitle: t.title,
          })),
        );

      // Validate
      this.onEvent({ type: 'validation_started', taskId: task.id });
      const report = await validateTask({
        task,
        config: this.config.validation,
        model: this.config.models.validation,
        cwd: taskCwd,
        checkpointSha,
        priorArtifacts: priorArtifacts.length > 0 ? priorArtifacts : undefined,
      });

      // Store acceptance criteria results from AI review
      const aiResult = report.results.find((r) => r.strategy === 'ai-review');
      if (aiResult) {
        try {
          const json = aiResult.output.match(/\{[\s\S]*\}/)?.[0];
          if (json) {
            const parsed = JSON.parse(json);
            if (parsed.criteriaResults) {
              task.acceptanceCriteriaResults = parsed.criteriaResults.map(
                (cr: { criterion: string; met: boolean; reason: string }) => ({
                  criterion: cr.criterion,
                  passed: cr.met,
                  explanation: cr.reason,
                }),
              );
            }
          }
        } catch {
          // Best-effort parsing
        }
      }

      this.onEvent({ type: 'validation_result', taskId: task.id, report, criteriaResults: task.acceptanceCriteriaResults });

      // Do NOT check this.aborted here — if validation already passed we must
      // save the completed state so the task isn't left as in_progress on the
      // next run.  Abort is checked before starting new tasks, not after a task
      // has already finished successfully.

      if (report.passed) {
        task.durationMs = Date.now() - taskStartTime;
        queue.updateStatus(task.id, 'completed');
        this.onEvent({
          type: 'task_completed',
          taskId: task.id,
          title: task.title,
          durationMs: task.durationMs,
          resultSummary: task.resultSummary,
        });
        this.emitProgress(queue);
        await log.info(`  Task "${task.id}" completed successfully`);

        // Write structured handoff with file list for downstream tasks
        const filesChanged = await getChangedFiles(taskCwd, checkpointSha).catch(() => []);
        await writeHandoff(
          task.id,
          task.title,
          task.resultSummary ?? '',
          task.acceptanceCriteriaResults ?? [],
          this.cwd,
          filesChanged,
        ).catch(() => {});

        // Append to run log for AI post-analysis
        const taskCostUsd = this.costTracker.getSummary().totalEstimatedUsd
          - (this.taskStartCostUsd.get(task.id) ?? 0);
        await this.runLogger.logTaskCompleted({
          taskId: task.id,
          title: task.title,
          attempt,
          durationMs: task.durationMs ?? 0,
          costUsd: Math.round(taskCostUsd * 10000) / 10000,
          model: String(engineModel),
          engine,
          filesChanged,
          criteriaResults: task.acceptanceCriteriaResults ?? [],
          resultSummary: task.resultSummary ?? '',
          validationStrategies: report.results.map((r) => r.strategy),
        }).catch(() => {});

        const learning = extractLearning(result.output);
        if (learning) {
          await appendLearning(task.id, learning, this.cwd).catch(() => {});
        }

        // Save state after each task
        plan.tasks = queue.getAllTasks();
        this.state.costSummary = this.costTracker.getSummary();
        await saveState(this.cwd, this.state);
        return;
      }

      // Validation failed — extract code snippets for surgical retry
      lastValidationErrors = formatValidationErrors(report);
      lastErrorFileContext = await extractErrorFileContext(lastValidationErrors, taskCwd);
      await log.warn(`  Validation failed:\n${lastValidationErrors}`);

      const canRetry = queue.incrementRetry(task.id);
      const entry: RetryHistoryEntry = {
        attempt,
        timestamp: new Date().toISOString(),
        failureType: 'acceptance',
        reason: 'Validation failed',
        fullError: lastValidationErrors,
        durationMs: Date.now() - attemptStart,
      };
      task.retryHistory!.push(entry);

      if (!canRetry) {
        // Failure escalation gate for validation failure
        if (this.onApprovalRequest && (this.config.approval?.mode ?? 'never') !== 'never') {
          const approvalCfg = this.config.approval;
          this.onEvent({
            type: 'approval_requested',
            taskId: task.id,
            title: task.title,
            stage: 'failure_escalation',
            context: lastValidationErrors,
            timeoutSec: approvalCfg.timeoutSec,
          });

          const escalationAction = await waitForApproval(
            {
              taskId: task.id,
              title: task.title,
              description: task.description,
              stage: 'failure_escalation',
              context: lastValidationErrors,
              timeoutSec: approvalCfg.timeoutSec,
              autoAction: approvalCfg.autoAction,
            },
            this.onApprovalRequest,
            this.abortController.signal,
          );

          const autoTriggered = escalationAction.action === 'timeout_continue' || escalationAction.action === 'timeout_halt';
          await logApproval(this.cwd, {
            timestamp: new Date().toISOString(),
            taskId: task.id,
            stage: 'failure_escalation',
            action: escalationAction.action,
            autoTriggered,
            hint: escalationAction.action === 'retry_with_hint' ? escalationAction.hint : undefined,
          }).catch(() => {});
          this.onEvent({ type: 'approval_resolved', taskId: task.id, action: escalationAction.action, autoTriggered });

          if (escalationAction.action === 'retry_with_hint') {
            lastValidationErrors += `\nHuman hint: ${escalationAction.hint}`;
            queue.incrementRetry(task.id);
            continue;
          }
          if (escalationAction.action === 'skipped') {
            queue.updateStatus(task.id, 'skipped');
            this.emitProgress(queue);
            return;
          }
          if (escalationAction.action === 'halt' || escalationAction.action === 'timeout_halt') {
            this.abort();
            return;
          }
        }

        queue.setError(task.id, `Validation failed after ${attempt} attempts`);
        queue.updateStatus(task.id, 'failed');
        task.durationMs = Date.now() - taskStartTime;
        this.onEvent({
          type: 'task_failed',
          taskId: task.id,
          title: task.title,
          error: lastValidationErrors,
          attempt,
          maxAttempts,
          willRetry: false,
        });
        this.emitProgress(queue);
        return;
      }

      this.onEvent({
        type: 'task_failed',
        taskId: task.id,
        title: task.title,
        error: lastValidationErrors,
        attempt,
        maxAttempts,
        willRetry: true,
      });
      this.onEvent({
        type: 'task_retrying',
        taskId: task.id,
        title: task.title,
        delaySec: this.config.retryDelaySec,
        attempt,
      });
      await sleep(this.config.retryDelaySec * 1000, this.abortController.signal);
    }

    // Exhausted retries
    queue.setError(task.id, `Failed after ${attempt} attempts`);
    queue.updateStatus(task.id, 'failed');
    task.durationMs = Date.now() - taskStartTime;
    this.onEvent({
      type: 'task_failed',
      taskId: task.id,
      title: task.title,
      error: lastValidationErrors || 'Unknown error',
      attempt,
      maxAttempts,
      willRetry: false,
    });
    this.emitProgress(queue);
  }
}
