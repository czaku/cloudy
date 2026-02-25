import readline from 'node:readline';
import path from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { loadConfig } from '../../config/config.js';
import { findClaudeBinary } from '../../utils/claude-path.js';
import { createStreamFormatter } from '../../utils/stream-formatter.js';
import type { ApprovalRequest, ApprovalAction } from '../../core/approval.js';
import { mergeModelConfig, parseModelFlag } from '../../config/model-config.js';
import { loadState, loadOrCreateState, saveState, sanitizeStaleTasks, updatePlan } from '../../core/state.js';
import { createPlan } from '../../planner/planner.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { formatCostSummary } from '../../cost/reporter.js';
import { initLogger, log } from '../../utils/logger.js';
import { startDashboardServer } from '../../dashboard/server.js';
import { topologicalSort, getTransitiveDeps } from '../../planner/dependency-graph.js';
import { c, bold, dim, red, green, yellow, cyan, greenBright, yellowBright, cyanBright } from '../../utils/colors.js';
import type { DashboardCommand, OrchestratorEvent } from '../../core/types.js';
import { notifyRunComplete, notifyRunFailed } from '../../notifications/notify.js';
import { acquireLock } from '../../utils/lock.js';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export const runCommand = new Command('run')
  .description('Execute the current plan')
  .option('--model <model>', 'Model for all phases')
  .option('--model-execution <model>', 'Model for execution phase')
  .option('--model-validation <model>', 'Model for validation phase')
  .option('--model-auto', 'Auto-route model per task complexity')
  .option('--parallel', 'Enable parallel execution')
  .option('--max-parallel <n>', 'Max parallel tasks', parseInt)
  .option('--no-validate', 'Skip validation')
  .option('--no-dashboard', 'Disable the web dashboard')
  .option('--dashboard-port <port>', 'Dashboard port', parseInt)
  .option('--tui', 'Force interactive terminal UI (auto-enabled when TTY)')
  .option('--no-tui', 'Disable the interactive terminal UI')
  .option('--dashboard-only', 'Start dashboard without auto-running (control panel mode)')
  .option('--only-task <id>', 'Run only this task and its transitive dependencies')
  .option('--start-from <id>', 'Skip tasks before this one in topological order')
  .option('--retry <id>', 'Reset a specific failed task to pending and re-run it')
  .option('--retry-failed', 'Reset ALL failed tasks to pending and re-run them')
  .option('--resume', 'Show already-completed tasks and ask to confirm before re-running')
  .option('--goal <goal>', 'Create a plan for this goal and run it immediately (skips cloudy init)')
  .option('--max-retries <n>', 'Max retries per task', parseInt)
  .option('--verbose', 'Show live Claude output for each task as it runs')
  .option('--engine <engine>', 'Execution engine: claude-code (default) or pi-mono')
  .option('--pi-provider <provider>', 'Pi-mono provider: anthropic, openai, google, ollama, etc.')
  .option('--pi-model <model>', 'Pi-mono model ID: gpt-4o-mini, gemini-2.0-flash, qwen2.5-coder:7b, etc.')
  .option('--pi-base-url <url>', 'Pi-mono base URL for OpenAI-compatible endpoints')
  .action(
    async (opts: {
      model?: string;
      modelExecution?: string;
      modelValidation?: string;
      modelAuto?: boolean;
      parallel?: boolean;
      maxParallel?: number;
      maxRetries?: number;
      validate?: boolean;
      dashboard: boolean; // true by default, false when --no-dashboard
      dashboardPort?: number;
      tui?: boolean;      // undefined=auto, true=force-on, false=--no-tui
      dashboardOnly?: boolean;
      onlyTask?: string;
      startFrom?: string;
      retry?: string;
      retryFailed?: boolean;
      resume?: boolean;
      goal?: string;
      verbose?: boolean;
      engine?: string;
      piProvider?: string;
      piModel?: string;
      piBaseUrl?: string;
    }) => {
      const cwd = process.cwd();
      await initLogger(cwd);

      // Global concurrency lock (max 2 across all projects)
      let releaseLock: (() => void) | undefined;
      try {
        releaseLock = await acquireLock('run', cwd);
      } catch (err) {
        console.error(c(red, `✖  ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }

      // Verify claude CLI is available before doing anything else
      try {
        await findClaudeBinary();
      } catch (err) {
        console.error(c(red, `✖  ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }

      const config = await loadConfig(cwd);

      // ── Interactive model selection (when not provided via flags) ────────────
      const MODEL_OPTIONS = [
        { value: 'sonnet', label: 'sonnet', hint: 'recommended' },
        { value: 'haiku', label: 'haiku', hint: 'fast & cheap' },
        { value: 'opus', label: 'opus', hint: 'most capable' },
      ];

      if (!opts.model && !opts.modelExecution && !opts.goal) {
        const projectName = path.basename(cwd);
        p.intro(`${c(cyan + bold, '☁️  cloudy run')}  ${c(bold, projectName)}`);

        const execModel = await p.select({
          message: 'Execution model:',
          options: MODEL_OPTIONS,
          initialValue: config.models.execution ?? 'sonnet',
        });
        if (p.isCancel(execModel)) { p.cancel('Cancelled.'); process.exit(0); }
        opts.modelExecution = execModel as string;

        if (!opts.modelValidation) {
          const valModel = await p.select({
            message: 'Validation model:',
            options: [
              { value: 'haiku', label: 'haiku', hint: 'recommended — saves cost' },
              { value: 'sonnet', label: 'sonnet', hint: 'higher quality' },
            ],
            initialValue: config.models.validation ?? 'haiku',
          });
          if (p.isCancel(valModel)) { p.cancel('Cancelled.'); process.exit(0); }
          opts.modelValidation = valModel as string;
        }

        const dashChoice = await p.confirm({
          message: 'Launch web dashboard?',
          initialValue: true,
        });
        if (p.isCancel(dashChoice)) { p.cancel('Cancelled.'); process.exit(0); }
        if (!dashChoice) opts.dashboard = false;
      }

      // --goal: create a plan on the fly and proceed (skips cloudy init)
      if (opts.goal) {
        const existingState = await loadState(cwd);
        if (existingState?.plan) {
          console.log(c(yellow, `⚠️  existing plan will be replaced by --goal`));
        }
        const freshState = existingState ?? await loadOrCreateState(cwd);
        console.log(`\n${c(cyan, '☁️  planning:')} ${opts.goal}\n`);
        const plan = await createPlan(
          opts.goal,
          config.models.planning,
          cwd,
          (text) => process.stdout.write(text),
        );
        updatePlan(freshState, plan);
        await saveState(cwd, freshState);
        console.log('\n');
      }

      const state = await loadState(cwd);
      if (!state?.plan) {
        console.error(c(red, '✖  no plan found — run "cloudy init <goal>" first'));
        process.exit(1);
      }

      // Apply model overrides
      config.models = mergeModelConfig(config.models, {
        model: opts.model ? parseModelFlag(opts.model) : undefined,
        modelExecution: opts.modelExecution
          ? parseModelFlag(opts.modelExecution)
          : undefined,
        modelValidation: opts.modelValidation
          ? parseModelFlag(opts.modelValidation)
          : undefined,
      });

      if (opts.modelAuto) config.autoModelRouting = true;
      if (opts.parallel) config.parallel = true;
      if (opts.maxParallel) config.maxParallel = opts.maxParallel;
      if (opts.maxRetries !== undefined) config.maxRetries = opts.maxRetries;
      if (opts.dashboardPort) config.dashboardPort = opts.dashboardPort;

      // --no-dashboard disables the default-on dashboard
      if (!opts.dashboard) config.dashboard = false;

      if (opts.validate === false) {
        config.validation = {
          typecheck: false,
          lint: false,
          build: false,
          test: false,
          aiReview: false,
          commands: [],
        };
      }

      // Apply engine configuration
      if (opts.engine) {
        if (opts.engine !== 'claude-code' && opts.engine !== 'pi-mono') {
          console.error(c(red, `✖  unknown engine "${opts.engine}" — use claude-code or pi-mono`));
          process.exit(1);
        }
        config.engine = opts.engine as 'claude-code' | 'pi-mono';
      }
      if (opts.piProvider) config.piMono = { ...config.piMono, provider: opts.piProvider };
      if (opts.piModel) config.piMono = { ...config.piMono, model: opts.piModel };
      if (opts.piBaseUrl) config.piMono = { ...config.piMono, baseUrl: opts.piBaseUrl };

      // TUI: auto-enable when running in a TTY, unless --no-tui is passed
      const useTui = opts.tui === true || (opts.tui !== false && process.stdout.isTTY);
      if (useTui) {
        // Start dashboard before handing off to TUI (TUI returns early and never reaches the dashboard block below)
        if (config.dashboard) {
          const { startDashboardServer } = await import('../../dashboard/server.js');
          // Mutable ref so /api/state HTTP fallback reflects live task progress
          let tuiLiveState = state;
          const dashboard = await startDashboardServer(config.dashboardPort, state, {
            onCommand: () => {},
            getState: () => tuiLiveState,
          });
          const dashboardUrl = `http://localhost:${dashboard.port}`;
          console.log(`${c(cyan, '🌐')}  ${c(cyanBright, dashboardUrl)}  ${c(dim, '(dashboard)')}\n`);
          // Auto-open browser, then wait until browser connects (up to 10s) before run starts
          import('open').then(({ default: open }) => open(dashboardUrl)).catch(() => {});
          await dashboard.waitForClient(10000);
          // Wrap broadcast to keep tuiLiveState in sync with task status changes
          const tuiExternalHandler = (event: OrchestratorEvent) => {
            if (tuiLiveState.plan?.tasks) {
              if (event.type === 'task_started') {
                tuiLiveState = { ...tuiLiveState, plan: { ...tuiLiveState.plan!, tasks: tuiLiveState.plan!.tasks.map(t => t.id === event.taskId ? { ...t, status: 'in_progress' } : t) } };
              } else if (event.type === 'task_completed') {
                tuiLiveState = { ...tuiLiveState, plan: { ...tuiLiveState.plan!, tasks: tuiLiveState.plan!.tasks.map(t => t.id === event.taskId ? { ...t, status: 'completed' } : t) } };
              } else if (event.type === 'task_failed') {
                tuiLiveState = { ...tuiLiveState, plan: { ...tuiLiveState.plan!, tasks: tuiLiveState.plan!.tasks.map(t => t.id === event.taskId ? { ...t, status: 'failed' } : t) } };
              }
            }
            dashboard.broadcast(event);
          };
          const { runWithTui } = await import('../../ui/run-tui.js');
          runWithTui({ cwd, state, config, externalHandler: tuiExternalHandler });
        } else {
          const { runWithTui } = await import('../../ui/run-tui.js');
          runWithTui({ cwd, state, config });
        }
        return;
      }

      // Validate mutual exclusion of --only-task and --start-from
      if (opts.onlyTask && opts.startFrom) {
        console.error(c(red, '✖  cannot use --only-task and --start-from together'));
        process.exit(1);
      }

      // Validate task IDs exist
      if (opts.onlyTask && !state.plan!.tasks.some((t) => t.id === opts.onlyTask)) {
        console.error(c(red, `✖  task "${opts.onlyTask}" not found in plan`));
        process.exit(1);
      }
      if (opts.startFrom && !state.plan!.tasks.some((t) => t.id === opts.startFrom)) {
        console.error(c(red, `✖  task "${opts.startFrom}" not found in plan`));
        process.exit(1);
      }
      if (opts.retry && !state.plan!.tasks.some((t) => t.id === opts.retry)) {
        console.error(c(red, `✖  task "${opts.retry}" not found in plan`));
        process.exit(1);
      }

      // If --dashboard-only, enable dashboard implicitly
      if (opts.dashboardOnly) {
        config.dashboard = true;
      }

      // ── Approval handler (CLI) ────────────────────────────────────────
      async function cliApprovalHandler(request: ApprovalRequest): Promise<ApprovalAction> {
        const stageLabel = request.stage === 'pre_task' ? 'approval needed' : 'failure escalation';
        console.log(`\n${c(yellow, '⏸')}  ${c(yellow + bold, `[${request.taskId}] ${request.title}`)}  ${c(dim, `— ${stageLabel}  (${request.timeoutSec}s timeout)`)}`);
        if (request.context) {
          console.log(`    ${c(dim, request.context.split('\n')[0])}`);
        }
        console.log(`    ${c(dim, '[a]pprove  [s]kip  [h]alt  [r <hint>] retry with hint:')}`);

        return new Promise<ApprovalAction>((resolve) => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          let settled = false;

          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            rl.close();
            console.log(c(dim, `  → No response — auto-continuing (approval logged)`));
            resolve(request.autoAction === 'halt' ? { action: 'timeout_halt' } : { action: 'timeout_continue' });
          }, request.timeoutSec * 1000);

          rl.question(c(dim, '  ❯ '), (answer) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            rl.close();
            const trimmed = answer.trim();
            if (trimmed === 'a' || trimmed === 'approve') {
              resolve({ action: 'approved' });
            } else if (trimmed === 's' || trimmed === 'skip') {
              resolve({ action: 'skipped' });
            } else if (trimmed === 'h' || trimmed === 'halt') {
              resolve({ action: 'halt' });
            } else if (trimmed.startsWith('r ')) {
              resolve({ action: 'retry_with_hint', hint: trimmed.slice(2).trim() });
            } else {
              // Default: approve
              resolve({ action: 'approved' });
            }
          });
        });
      }

      // ── Event handler ─────────────────────────────────────────────────
      function makeEventHandler(broadcast?: (event: OrchestratorEvent) => void) {
        let taskFormatter: ((chunk: string) => void) | null = null;
        let taskHeartbeat: ReturnType<typeof setInterval> | null = null;
        let taskStartTime = 0;
        let taskHasOutput = false;

        function clearHeartbeat() {
          if (taskHeartbeat) { clearInterval(taskHeartbeat); taskHeartbeat = null; }
        }

        return (event: OrchestratorEvent) => {
          broadcast?.(event);

          switch (event.type) {
            case 'task_started': {
              const retryLabel = event.attempt > 1
                ? c(dim, `  ·  retry ${event.attempt}/${event.maxAttempts}`)
                : '';
              console.log(`\n${c(yellow, '⚡')}  ${c(yellowBright + bold, event.taskId)}  ${c(bold, event.title)}${retryLabel}`);
              console.log(`    ${c(dim, `📁 ${event.contextFileCount} file${event.contextFileCount !== 1 ? 's' : ''} in context`)}`);
              if (opts.verbose) {
                clearHeartbeat();
                taskFormatter = createStreamFormatter((s) => process.stdout.write(s));
                taskStartTime = Date.now();
                taskHasOutput = false;
                console.log(`    ${c(dim, '─── live output ───────────────────────────')}`);
                taskHeartbeat = setInterval(() => {
                  if (!taskHasOutput) {
                    const elapsed = Math.floor((Date.now() - taskStartTime) / 1000);
                    process.stdout.write(c(dim, `  [${elapsed}s — still waiting for Claude...]\n`));
                  }
                }, 10_000);
              }
              break;
            }

            case 'task_output': {
              if (opts.verbose && taskFormatter) {
                if (!taskHasOutput) {
                  taskHasOutput = true;
                  clearHeartbeat();
                }
                taskFormatter(event.text);
              }
              break;
            }

            case 'task_completed':
              clearHeartbeat();
              console.log(`${c(green, '✅')}  ${c(greenBright, event.taskId)}  ${event.title}  ${c(dim, formatDuration(event.durationMs))}`);
              break;

            case 'task_failed':
              clearHeartbeat();
              if (event.willRetry) {
                console.log(`${c(red, '❌')}  ${c(red, event.taskId)}  ${event.title}  ${c(dim, `attempt ${event.attempt}/${event.maxAttempts}`)}`);
              } else {
                console.log(`${c(red, '❌')}  ${c(red, event.taskId)}  ${c(bold, event.title)}  ${c(dim, 'gave up')}`);
                console.log(`    ${c(red + dim, event.error.split('\n')[0])}`);
              }
              break;

            case 'task_retrying':
              console.log(`    ${c(yellow, '🔄')}  ${c(yellow, `retrying in ${event.delaySec}s`)}`);
              break;

            case 'validation_started':
              console.log(`\n    ${c(cyan, '🔍 checking acceptance criteria')}`);
              break;

            case 'validation_result': {
              const { report } = event;
              if (report.passed) {
                console.log(`    ${c(green, '✨ criteria met')}`);
              } else {
                console.log(`    ${c(red, '⚠️  criteria not met')}`);
                for (const r of report.results) {
                  if (!r.passed) {
                    console.log(`       ${c(dim, `[${r.strategy}]  ${r.output.split('\n')[0]}`)}`);
                  }
                }
              }
              break;
            }

            case 'progress': {
              const width = 28;
              const filled = Math.round((event.completed / event.total) * width);
              const empty = width - filled;
              const bar = c(green, '█'.repeat(filled)) + c(dim, '░'.repeat(empty));
              console.log(`\n   ${bar}  ${c(bold, `${event.completed} / ${event.total}`)}  ${c(dim, `${event.percentage}%`)}\n`);
              break;
            }

            case 'cost_update':
              break;

            case 'run_completed': {
              console.log('\n' + formatCostSummary(event.summary));
              const cost = event.summary.totalEstimatedUsd > 0
                ? `  ${c(dim, `~$${event.summary.totalEstimatedUsd.toFixed(4)}`)}`
                : '';
              console.log(`\n${c(green, '✅')}  ${c(green + bold, 'all done!')}${cost}`);
              break;
            }

            case 'run_failed':
              console.error(`\n${c(red, '❌')}  ${c(red + bold, 'run failed:')}  ${c(red, event.error)}`);
              break;

            case 'run_status':
              if (event.status === 'stopped') {
                console.log(`\n${c(yellow, '⏸️')}  ${c(yellow, 'halted by user')}`);
              }
              break;
          }
        };
      }

      // Keep process alive until SIGINT/SIGTERM or 'q' keypress.
      function keepAliveUntilSignal(onSignal: () => void): Promise<void> {
        return new Promise((resolve) => {
          const cleanup = () => {
            process.removeListener('SIGINT', sigHandler);
            process.removeListener('SIGTERM', sigHandler);
            if (process.stdin.isTTY) {
              try { process.stdin.setRawMode(false); } catch {}
              process.stdin.pause();
              process.stdin.removeListener('data', keyHandler);
            }
            resolve();
          };
          const sigHandler = () => { onSignal(); cleanup(); };
          const keyHandler = (key: Buffer) => {
            const str = key.toString();
            // q/Q to quit; \u0003 is ctrl+c in raw mode
            if (str === 'q' || str === 'Q' || str === '\u0003') {
              onSignal();
              cleanup();
            }
          };
          process.once('SIGINT', sigHandler);
          process.once('SIGTERM', sigHandler);
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', keyHandler);
          }
        });
      }

      // ── State ─────────────────────────────────────────────────────────
      // liveState tracks the most recent state object used by executeRun
      // so that the dashboard always reflects current reality, not the startup snapshot.
      let liveState: typeof state = state;
      let dashboardBroadcast: ((event: OrchestratorEvent) => void) | undefined;
      let dashboardClose: (() => Promise<void>) | undefined;
      let runningPromise: Promise<void> | null = null;
      let isRunning = false;
      let currentOrchestrator: Orchestrator | null = null;
      let abortCurrentRun: (() => void) | null = null;

      async function executeRun(broadcast?: (event: OrchestratorEvent) => void) {
        const freshState = await loadState(cwd);
        if (freshState) liveState = freshState;
        if (!freshState?.plan) {
          console.error(c(red, '✖  no plan found — run "cloudy init <goal>" first'));
          return;
        }

        // Crash recovery: reset any in_progress tasks back to pending
        const staleIds = sanitizeStaleTasks(freshState.plan);
        if (staleIds.length > 0) {
          for (const id of staleIds) {
            console.log(c(yellow, `⚠️  [${id}] was interrupted — resetting to pending`));
          }
          await saveState(cwd, freshState);
        }

        // Apply --max-retries override to all pending tasks
        if (opts.maxRetries !== undefined) {
          for (const task of freshState.plan.tasks) {
            if (task.status === 'pending') task.maxRetries = opts.maxRetries;
          }
        }

        // Resume confirmation: show what's done vs. pending
        if (opts.resume) {
          const alreadyDone = freshState.plan.tasks.filter(
            (t) => t.status === 'completed' || t.status === 'skipped',
          );
          const stillPending = freshState.plan.tasks.filter((t) => t.status === 'pending');
          if (alreadyDone.length > 0) {
            console.log(`\n  ${c(dim, 'already done:  ')}${alreadyDone.map((t) => c(dim, t.id)).join(', ')}`);
            console.log(`  ${c(bold, 'ready to run:  ')}${stillPending.map((t) => c(bold, t.id)).join(', ') || c(dim, '(none)')}\n`);
            const answer = await new Promise<string>((resolve) => {
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              rl.question(`${c(dim, '  Continue? (yes/no) ')}`, (a) => { rl.close(); resolve(a.trim().toLowerCase()); });
            });
            if (answer !== 'yes' && answer !== 'y') {
              console.log(c(dim, '  cancelled'));
              return;
            }
          }
        }

        // --retry: reset the target task to pending and treat it like --only-task
        if (opts.retry) {
          const retryTask = freshState.plan.tasks.find((t) => t.id === opts.retry);
          if (!retryTask) {
            console.error(c(red, `✖  task "${opts.retry}" not found in plan`));
            return;
          }
          retryTask.status = 'pending';
          retryTask.error = undefined;
          retryTask.retries = 0;
          retryTask.retryHistory = [];
          console.log(c(yellow, `🔁  ${opts.retry} reset for retry`));
          await saveState(cwd, freshState);
        }

        // --retry-failed: reset ALL failed tasks (and their blocked dependents) to pending
        if (opts.retryFailed) {
          const failedTasks = freshState.plan.tasks.filter((t) => t.status === 'failed');
          if (failedTasks.length === 0) {
            console.log(c(dim, 'No failed tasks to retry.'));
          } else {
            for (const task of failedTasks) {
              task.status = 'pending';
              task.error = undefined;
              task.retries = 0;
              task.retryHistory = [];
            }
            console.log(c(yellow, `🔁  reset ${failedTasks.length} failed task(s): ${failedTasks.map((t) => t.id).join(', ')}`));
            await saveState(cwd, freshState);
          }
        }

        // Apply --only-task filtering
        if (opts.onlyTask) {
          const needed = getTransitiveDeps(freshState.plan.tasks, opts.onlyTask);
          for (const task of freshState.plan.tasks) {
            if (!needed.has(task.id) && task.status === 'pending') {
              task.status = 'skipped';
              task.resultSummary = 'Skipped (--only-task)';
            }
          }
        }

        // Apply --start-from filtering
        if (opts.startFrom) {
          const sorted = topologicalSort(freshState.plan.tasks);
          const startIndex = sorted.indexOf(opts.startFrom);
          const predecessors = new Set(sorted.slice(0, startIndex));
          for (const task of freshState.plan.tasks) {
            if (predecessors.has(task.id) && task.status === 'pending') {
              task.status = 'completed';
              task.resultSummary = 'Skipped (--start-from)';
            }
          }
        }

        const pending = freshState.plan.tasks.filter((t) => t.status === 'pending');
        const engine = config.engine ?? 'claude-code';
        const executionModel = engine === 'pi-mono'
          ? `pi-mono/${config.piMono?.model ?? '?'}${config.piMono?.provider ? ` (${config.piMono.provider})` : ''}`
          : config.autoModelRouting ? 'auto' : config.models.execution;
        const parallelLabel = config.parallel ? `parallel ×${config.maxParallel}` : 'sequential';

        console.log(`\n${c(cyan + bold, '☁️  cloudy')}  ${c(dim, '·')}  ${c(bold, `${pending.length} task${pending.length !== 1 ? 's' : ''}`)}`);
        console.log(`    ${c(dim, `🤖 exec:${executionModel}  ·  validate:${config.models.validation}  ·  ${parallelLabel}`)}`);
        console.log('');

        isRunning = true;
        broadcast?.({ type: 'run_status', status: 'running' });

        const orchestrator = new Orchestrator({
          cwd,
          state: freshState,
          config,
          onEvent: makeEventHandler(broadcast),
          onApprovalRequest: config.approval?.mode !== 'never' ? cliApprovalHandler : undefined,
        });
        currentOrchestrator = orchestrator;
        abortCurrentRun = () => orchestrator.abort();

        try {
          await orchestrator.run();
          isRunning = false;
          currentOrchestrator = null;
          abortCurrentRun = null;
          if (!orchestrator.aborted) {
            broadcast?.({ type: 'run_status', status: 'completed' });
            const completedCount = freshState.plan!.tasks.filter((t) => t.status === 'completed').length;
            void notifyRunComplete(completedCount, freshState.costSummary.totalEstimatedUsd, config.notifications);
          }
        } catch (err) {
          isRunning = false;
          currentOrchestrator = null;
          abortCurrentRun = null;
          broadcast?.({ type: 'run_status', status: 'failed' });
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `\n${c(red, '❌')}  ${c(red + bold, 'orchestration failed:')}  ${errMsg}`,
          );
          void notifyRunFailed(errMsg, config.notifications);
        }
      }

      // ── Dashboard ─────────────────────────────────────────────────────
      if (config.dashboard) {
        const dashboard = await startDashboardServer(config.dashboardPort, state, {
          onCommand: (cmd: DashboardCommand) => {
            if (cmd.type === 'start_run') {
              if (isRunning) {
                console.log(c(dim, '  ⚠️  already running'));
                return;
              }
              runningPromise = executeRun(dashboardBroadcast);
            } else if (cmd.type === 'stop_run') {
              if (!isRunning || !currentOrchestrator) {
                console.log(c(dim, '  ⚠️  no run in progress'));
                return;
              }
              console.log(`${c(yellow, '⏸️')}  ${c(yellow, 'stopping after current task...')}`);
              abortCurrentRun?.();
            }
          },
          getState: () => liveState,
        });
        dashboardBroadcast = dashboard.broadcast;
        dashboardClose = dashboard.close;
        const dashboardUrl = `http://localhost:${dashboard.port}`;
        console.log(`${c(cyan, '🌐')}  ${c(cyanBright, dashboardUrl)}  ${c(dim, '(dashboard)')}\n`);
        // Auto-open browser, then wait until browser connects (up to 10s) before run starts
        import('open').then(({ default: open }) => open(dashboardUrl)).catch(() => {});
        await dashboard.waitForClient(10000);

        if (opts.dashboardOnly) {
          dashboardBroadcast({ type: 'run_status', status: 'idle' });
          console.log(`${c(dim, '⏳ waiting for browser commands  ·  q or ctrl+c to exit')}\n`);
          await keepAliveUntilSignal(() => { abortCurrentRun?.(); });
          await dashboardClose?.();
          return;
        }
      }

      // ── Run ───────────────────────────────────────────────────────────
      await executeRun(dashboardBroadcast);
      if (config.dashboard) {
        dashboardBroadcast?.({ type: 'run_status', status: isRunning ? 'running' : 'completed' });
        console.log(`\n${c(cyan, '🌐')}  ${c(dim, 'dashboard still active  ·  q or ctrl+c to exit')}\n`);
        await keepAliveUntilSignal(() => { abortCurrentRun?.(); });
        await dashboardClose?.();
      }
    },
  );
