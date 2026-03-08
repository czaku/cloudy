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
  .option('--execution-model <model>', 'Model for execution phase')
  .option('--task-review-model <model>', 'Model for per-task validation')
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
  .option('--run-review-model <model>', 'Model for post-run holistic review (haiku/sonnet/opus)')

  .option('--heartbeat-interval <seconds>', 'Write status.json to run dir every N seconds during execution', parseInt)
  .option('--non-interactive', 'Skip all prompts and disable dashboard — set models via flags')
  .option('--agent-output', 'Emit structured plain-text lines (no ANSI, no emoji) — auto-enabled with --non-interactive')
  .action(
    async (opts: {
      model?: string;
      executionModel?: string;
      taskReviewModel?: string;
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
      runReviewModel?: string;
      heartbeatInterval?: number;
      nonInteractive?: boolean;
      agentOutput?: boolean;
    }) => {
      const isNonInteractive = opts.nonInteractive || !process.stdout.isTTY;
      const isAgentOutput = opts.agentOutput || isNonInteractive;

      /** Emit a structured plain-text line for AI agent consumption. */
      function agentLog(tag: string, ...parts: string[]) {
        const ts = new Date().toISOString();
        console.log(`[${ts}] [${tag}] ${parts.join(' ')}`);
      }
      if (isNonInteractive) {
        opts.dashboard = false;
      }
      if (isNonInteractive) {
        const missing: string[] = [];
        if (!opts.executionModel && !opts.model) missing.push('--execution-model');
        if (!opts.taskReviewModel && !opts.model) missing.push('--task-review-model');
        if (!opts.runReviewModel) missing.push('--run-review-model');
        if (missing.length > 0) {
          console.error(c(red, `✖  --non-interactive requires explicit model flags: ${missing.join(', ')}`));
          process.exit(1);
        }
      }
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
        { value: 'haiku',  label: 'haiku',  hint: 'fast & cheap' },
        { value: 'opus',   label: 'opus',   hint: 'most capable' },
      ];

      if (!isNonInteractive && !opts.model && !opts.executionModel && !opts.goal) {
        const projectName = path.basename(cwd);
        p.intro(`${c(cyan + bold, '☁️  cloudy run')}  ${c(bold, projectName)}`);

        const execModel = await p.select({
          message: 'Execution model:',
          options: MODEL_OPTIONS,
          initialValue: config.models.execution ?? 'sonnet',
        });
        if (p.isCancel(execModel)) { p.cancel('Cancelled.'); process.exit(0); }
        opts.executionModel = execModel as string;

        if (!opts.taskReviewModel) {
          const valModel = await p.select({
            message: 'Task review model (per-task validation):',
            options: [
              { value: 'haiku',  label: 'haiku',  hint: 'recommended — saves cost' },
              { value: 'sonnet', label: 'sonnet',  hint: 'higher quality' },
              { value: 'opus',   label: 'opus',    hint: 'most capable' },
            ],
            initialValue: config.models.validation ?? 'haiku',
          });
          if (p.isCancel(valModel)) { p.cancel('Cancelled.'); process.exit(0); }
          opts.taskReviewModel = valModel as string;
        }

        if (!opts.runReviewModel) {
          const reviewModel = await p.select({
            message: 'Final review model (holistic post-run review):',
            options: [
              { value: 'sonnet', label: 'sonnet', hint: 'recommended — reads full spec + diff' },
              { value: 'haiku',  label: 'haiku',  hint: 'fast & cheap, less thorough' },
              { value: 'opus',   label: 'opus',   hint: 'deepest review, highest cost' },
            ],
            initialValue: config.review?.model ?? 'opus',
          });
          if (p.isCancel(reviewModel)) { p.cancel('Cancelled.'); process.exit(0); }
          opts.runReviewModel = reviewModel as string;
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
        executionModel: opts.executionModel
          ? parseModelFlag(opts.executionModel)
          : undefined,
        taskReviewModel: opts.taskReviewModel
          ? parseModelFlag(opts.taskReviewModel)
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

      // Apply review configuration
      if (opts.runReviewModel) {
        const parsed = opts.runReviewModel.toLowerCase();
        if (parsed === 'haiku' || parsed === 'sonnet' || parsed === 'opus') {
          config.review = { ...config.review, model: parsed };
        } else {
          console.error(c(red, `✖  unknown review model "${opts.runReviewModel}" — use haiku, sonnet, or opus`));
          process.exit(1);
        }
      }

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
      let lastReviewResult: import('../../reviewer.js').ReviewResult | null = null;

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
              if (isAgentOutput) {
                agentLog('TASK:STARTED', event.taskId, `"${event.title}"`, event.attempt > 1 ? `retry=${event.attempt}/${event.maxAttempts}` : '');
              } else {
              console.log(`\n${c(yellow, '⚡')}  ${c(yellowBright + bold, event.taskId)}  ${c(bold, event.title)}${retryLabel}`);
              console.log(`    ${c(dim, `📁 ${event.contextFileCount} file${event.contextFileCount !== 1 ? 's' : ''} in context`)}`);
              }
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
              if (isAgentOutput) {
                agentLog('TASK:DONE', event.taskId, `"${event.title}"`, `duration=${formatDuration(event.durationMs)}`);
              } else {
                console.log(`${c(green, '✅')}  ${c(greenBright, event.taskId)}  ${event.title}  ${c(dim, formatDuration(event.durationMs))}`);
              }
              break;

            case 'task_failed':
              clearHeartbeat();
              if (isAgentOutput) {
                if (event.willRetry) {
                  agentLog('TASK:FAILED', event.taskId, `"${event.title}"`, `attempt=${event.attempt}/${event.maxAttempts}`, 'will_retry=true');
                } else {
                  agentLog('TASK:FAILED', event.taskId, `"${event.title}"`, 'gave_up=true', `error=${event.error.split('\n')[0]}`);
                }
              } else {
                if (event.willRetry) {
                  console.log(`${c(red, '❌')}  ${c(red, event.taskId)}  ${event.title}  ${c(dim, `attempt ${event.attempt}/${event.maxAttempts}`)}`);
                } else {
                  console.log(`${c(red, '❌')}  ${c(red, event.taskId)}  ${c(bold, event.title)}  ${c(dim, 'gave up')}`);
                  console.log(`    ${c(red + dim, event.error.split('\n')[0])}`);
                }
              }
              break;

            case 'task_retrying':
              if (isAgentOutput) {
                agentLog('TASK:RETRYING', event.taskId ?? '', `delay=${event.delaySec}s`);
              } else {
                console.log(`    ${c(yellow, '🔄')}  ${c(yellow, `retrying in ${event.delaySec}s`)}`);
              }
              break;

            case 'validation_started':
              if (isAgentOutput) {
                agentLog('VALIDATE:STARTED', event.taskId ?? '');
              } else {
                console.log(`\n    ${c(cyan, '🔍 checking acceptance criteria')}`);
              }
              break;

            case 'validation_result': {
              const { report } = event;
              if (isAgentOutput) {
                agentLog('VALIDATE:RESULT', event.taskId ?? '', `passed=${report.passed}`);
                for (const r of report.results) {
                  if (!r.passed) {
                    agentLog('VALIDATE:FAIL_REASON', `strategy=${r.strategy}`, r.output.split('\n')[0]);
                  }
                }
                if (event.criteriaResults) {
                  for (const cr of event.criteriaResults) {
                    agentLog('VALIDATE:CRITERION', `passed=${cr.passed}`, cr.criterion.slice(0, 120));
                  }
                }
              } else {
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
                if (event.criteriaResults && event.criteriaResults.length > 0) {
                  for (const cr of event.criteriaResults) {
                    const icon = cr.passed ? c(green, '✓') : c(red, '✗');
                    console.log(`       ${icon} ${c(dim, cr.criterion.length > 80 ? cr.criterion.slice(0, 77) + '...' : cr.criterion)}`);
                  }
                }
              }
              break;
            }

            case 'progress': {
              if (isAgentOutput) {
                agentLog('PROGRESS', `${event.completed}/${event.total}`, `${event.percentage}%`);
              } else {
                const width = 28;
                const filled = Math.round((event.completed / event.total) * width);
                const empty = width - filled;
                const bar = c(green, '█'.repeat(filled)) + c(dim, '░'.repeat(empty));
                console.log(`\n   ${bar}  ${c(bold, `${event.completed} / ${event.total}`)}  ${c(dim, `${event.percentage}%`)}\n`);
              }
              break;
            }

            case 'cost_update':
              break;

            case 'run_completed': {
              // Print decision log if any planning Q&A decisions were made
              const decisions = liveState?.plan?.decisionLog;
              if (decisions && decisions.length > 0) {
                const humanCount = decisions.filter((d) => d.answeredBy === 'human').length;
                const agentCount = decisions.length - humanCount;
                if (isAgentOutput) {
                  agentLog('DECISION_LOG', `total=${decisions.length}`, `human=${humanCount}`, `agent=${agentCount}`);
                  for (const d of decisions) {
                    agentLog('DECISION', `id=${d.questionId}`, `by=${d.answeredBy}`, `"${d.answer}"`);
                  }
                } else {
                  console.log(`\n${c(cyan + bold, '📋 Planning Decisions')}  ${c(dim, `${decisions.length} resolved (${humanCount} human · ${agentCount} AI assumed)`)}`);
                  for (const d of decisions) {
                    const tag = d.answeredBy === 'human' ? c(green, '●') : c(yellow, '◐');
                    console.log(`  ${tag}  ${c(dim, d.question.slice(0, 80))}${d.question.length > 80 ? '…' : ''}`);
                    console.log(`     ${c(bold, d.answer)}${d.reasoning ? `  ${c(dim, `— ${d.reasoning}`)}` : ''}`);
                  }
                }
              }

              if (isAgentOutput) {
                const cost = event.summary.totalEstimatedUsd > 0 ? `cost=$${event.summary.totalEstimatedUsd.toFixed(4)}` : '';
                agentLog('RUN:DONE', cost);
              } else {
                console.log('\n' + formatCostSummary(event.summary));
                const cost = event.summary.totalEstimatedUsd > 0
                  ? `  ${c(dim, `~$${event.summary.totalEstimatedUsd.toFixed(4)}`)}`
                  : '';
                console.log(`\n${c(green, '✅')}  ${c(green + bold, 'all done!')}${cost}`);
              }
              break;
            }

            case 'run_failed':
              if (isAgentOutput) {
                agentLog('RUN:FAILED', event.error.split('\n')[0]);
              } else {
                console.error(`\n${c(red, '❌')}  ${c(red + bold, 'run failed:')}  ${c(red, event.error)}`);
              }
              break;

            case 'run_status':
              if (event.status === 'stopped') {
                if (isAgentOutput) {
                  agentLog('RUN:STOPPED', 'halted');
                } else {
                  console.log(`\n${c(yellow, '⏸️')}  ${c(yellow, 'halted by user')}`);
                }
              }
              break;

            case 'review_started':
              if (isAgentOutput) {
                agentLog('REVIEW:STARTED', `model=${event.model}`);
              } else {
                console.log(`\n${c(cyan, '🔎')}  ${c(cyan + bold, 'holistic review')}  ${c(dim, `model: ${event.model}`)}`);
              }
              break;

            case 'review_output':
              if (opts.verbose && taskFormatter) {
                taskFormatter(event.text);
              }
              break;

            case 'review_completed': {
              lastReviewResult = event.result;
              const { result } = event;
              if (isAgentOutput) {
                agentLog('REVIEW:RESULT', `verdict=${result.verdict}`, `cost=$${result.costUsd.toFixed(4)}`);
                agentLog('REVIEW:SUMMARY', result.summary);
                for (const issue of result.issues) {
                  const loc = issue.location ? ` location=${issue.location}` : '';
                  agentLog('REVIEW:ISSUE', `severity=${issue.severity}${loc}`, issue.description);
                }
                for (const v of result.conventionViolations) {
                  agentLog('REVIEW:CONVENTION', v);
                }
              } else {
                const verdictColor = result.verdict === 'PASS'
                  ? green
                  : result.verdict === 'FAIL'
                    ? red
                    : yellow;
                const verdictIcon = result.verdict === 'PASS' ? '✅' : result.verdict === 'FAIL' ? '❌' : '⚠️';
                console.log(`\n${c(verdictColor, verdictIcon)}  ${c(verdictColor + bold, `Review: ${result.verdict}`)}`);
                console.log(`    ${c(dim, result.summary)}`);
                if (result.issues.length > 0) {
                  for (const issue of result.issues) {
                    const ic = issue.severity === 'critical' ? red : issue.severity === 'major' ? yellow : dim;
                    console.log(`    ${c(ic, `[${issue.severity}] ${issue.description}`)}${issue.location ? c(dim, `  (${issue.location})`) : ''}`);
                  }
                }
                if (result.conventionViolations.length > 0) {
                  for (const v of result.conventionViolations) {
                    console.log(`    ${c(yellow, `⚠ ${v}`)}`);
                  }
                }
                console.log(`    ${c(dim, `cost: ~$${result.costUsd.toFixed(4)}  ·  ${Math.round(result.durationMs / 1000)}s`)}`);
              }
              break;
            }

            case 'review_failed':
              if (isAgentOutput) {
                agentLog('REVIEW:FAILED', event.error.split('\n')[0]);
              } else {
                console.log(`\n${c(red, '❌')}  ${c(red, 'Review failed:')}  ${c(dim, event.error)}`);
              }
              break;

            case 'review_model_requested':
              // In non-TUI mode, no interactive model selection — proceed with configured model
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

        if (isAgentOutput) {
          agentLog('RUN:STARTED', `tasks=${pending.length}`, `exec=${executionModel}`, `validate=${config.models.validation}`, parallelLabel);
        } else {
          console.log(`\n${c(cyan + bold, '☁️  cloudy')}  ${c(dim, '·')}  ${c(bold, `${pending.length} task${pending.length !== 1 ? 's' : ''}`)}`);
          console.log(`    ${c(dim, `🤖 exec:${executionModel}  ·  validate:${config.models.validation}  ·  ${parallelLabel}`)}`);
          console.log('');
        }

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

        // ── Heartbeat: write status.json every N seconds ──────────────────────
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        if (opts.heartbeatInterval && opts.heartbeatInterval > 0) {
          const { getCurrentRunDir } = await import('../../utils/run-dir.js');
          const writeHeartbeat = async () => {
            try {
              const tasks = freshState.plan?.tasks ?? [];
              const completed = tasks.filter((t) => t.status === 'completed').length;
              const failed = tasks.filter((t) => t.status === 'failed').length;
              const inProgress = tasks.find((t) => t.status === 'in_progress');
              const status = {
                timestamp: new Date().toISOString(),
                runId: freshState.runName,
                totalTasks: tasks.length,
                completedTasks: completed,
                failedTasks: failed,
                skippedTasks: tasks.filter((t) => t.status === 'skipped').length,
                inProgressTaskId: inProgress?.id ?? null,
                inProgressTaskTitle: inProgress?.title ?? null,
                inProgressSince: inProgress?.startedAt ?? null,
                costUsd: freshState.costSummary?.totalEstimatedUsd ?? 0,
                elapsedMs: freshState.startedAt ? Date.now() - new Date(freshState.startedAt).getTime() : 0,
                pipelineContext: freshState.plan?.pipelineContext ?? null,
              };
              const runDir = await getCurrentRunDir(cwd);
              await import('node:fs/promises').then((fs) =>
                fs.writeFile(`${runDir}/status.json`, JSON.stringify(status, null, 2), 'utf-8'),
              );
            } catch { /* non-fatal */ }
          };
          heartbeatTimer = setInterval(() => { void writeHeartbeat(); }, opts.heartbeatInterval * 1000);
          void writeHeartbeat(); // immediate first write
        }

        try {
          await orchestrator.run();
          if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
          isRunning = false;
          currentOrchestrator = null;
          abortCurrentRun = null;
          if (!orchestrator.aborted) {
            broadcast?.({ type: 'run_status', status: 'completed' });
            const completedCount = freshState.plan!.tasks.filter((t) => t.status === 'completed').length;
            void notifyRunComplete(completedCount, freshState.costSummary.totalEstimatedUsd, config.notifications);

            // Re-run recovery is now handled automatically inside the orchestrator
          }
        } catch (err) {
          if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
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
      if (config.dashboard && !isNonInteractive) {
        dashboardBroadcast?.({ type: 'run_status', status: isRunning ? 'running' : 'completed' });
        console.log(`\n${c(cyan, '🌐')}  ${c(dim, 'dashboard still active  ·  q or ctrl+c to exit')}\n`);
        await keepAliveUntilSignal(() => { abortCurrentRun?.(); });
        await dashboardClose?.();
      }
    },
  );
