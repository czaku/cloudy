import { Command } from 'commander';
import { loadConfig } from '../../config/config.js';
import { mergeModelConfig, parseModelFlag, resolveModelId } from '../../config/model-config.js';
import { loadState } from '../../core/state.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { initLogger } from '../../utils/logger.js';
import { topologicalSort, getTransitiveDeps } from '../../planner/dependency-graph.js';
import { resolveContextFiles } from '../../executor/context-resolver.js';
import { c, bold, dim, yellow, cyan, green } from '../../utils/colors.js';
import type { Task } from '../../core/types.js';
import type { CloudyConfig } from '../../core/types.js';

// ─── cost estimation ────────────────────────────────────────────────────────

/** USD per million tokens, roughly matching public Anthropic pricing. */
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.25, outputPer1M: 1.25 },
};
const DEFAULT_PRICING = { inputPer1M: 3, outputPer1M: 15 };

const PROMPT_OVERHEAD_TOKENS = 2_000;  // system prompt, task description, instructions
const EXPECTED_OUTPUT_TOKENS = 3_000;  // typical code output per task

/** Look up per-token pricing for a resolved model ID string. */
export function getPricing(modelId: string) {
  return MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
}

/** Estimate cost in USD for a single task given context size in chars. */
export function estimateTaskCost(
  contextChars: number,
  modelId: string,
): { inputTokens: number; outputTokens: number; costUsd: number } {
  const inputTokens = Math.round(contextChars / 4) + PROMPT_OVERHEAD_TOKENS;
  const outputTokens = EXPECTED_OUTPUT_TOKENS;
  const { inputPer1M, outputPer1M } = getPricing(modelId);
  const costUsd =
    (inputTokens / 1_000_000) * inputPer1M +
    (outputTokens / 1_000_000) * outputPer1M;
  return { inputTokens, outputTokens, costUsd };
}

async function printCostEstimate(
  tasks: Task[],
  config: CloudyConfig,
  cwd: string,
): Promise<void> {
  const execModelId = resolveModelId(config.models.execution);
  const pendingTasks = tasks.filter((t) => t.status === 'pending');

  console.log(`\n${c(bold, '── Cost Estimate ──────────────────────────────────')}`);
  console.log(c(dim, `  model: ${execModelId}  (per-task overhead: ~${PROMPT_OVERHEAD_TOKENS} tokens, ~${EXPECTED_OUTPUT_TOKENS} output)`));
  console.log('');

  let totalCost = 0;
  let totalInputTokens = 0;

  for (const task of pendingTasks) {
    // Resolve context files to get actual sizes
    const contextFiles = await resolveContextFiles(
      task.contextPatterns,
      cwd,
      0, // no budget limit for estimation
    ).catch(() => []);

    const contextChars = contextFiles.reduce((sum, f) => sum + f.content.length, 0);
    const { inputTokens, outputTokens, costUsd } = estimateTaskCost(contextChars, execModelId);

    totalCost += costUsd;
    totalInputTokens += inputTokens;

    const taskLabel = `${task.id}`.padEnd(12);
    const ctxLabel = contextFiles.length > 0
      ? c(dim, `${contextFiles.length} file${contextFiles.length !== 1 ? 's' : ''}`)
      : c(dim, 'no context');
    const tokenLabel = c(dim, `~${(inputTokens + outputTokens).toLocaleString()} tok`);
    const costLabel = `$${costUsd.toFixed(4)}`;

    console.log(`  ${c(yellow, taskLabel)}  ${ctxLabel.padEnd(20)}  ${tokenLabel.padEnd(20)}  ${costLabel}`);
  }

  console.log('');
  console.log(`  ${c(bold, 'Total estimate:')}  ${c(green, `$${totalCost.toFixed(4)}`)}  ${c(dim, `(~${totalInputTokens.toLocaleString()} input tokens across ${pendingTasks.length} tasks)`)}`);
  console.log(c(dim, `  Note: actual costs vary with retry count and real context usage.`));
  console.log(c(dim, '─'.repeat(52)));
  console.log('');
}

// ─── command ────────────────────────────────────────────────────────────────

export const dryRunCommand = new Command('preview')
  .alias('dry-run')
  .description('Preview what would execute without running')
  .option('--model <model>', 'Model for all phases')
  .option('--execution-model <model>', 'Model for execution phase')
  .option('--task-review-model <model>', 'Model for per-task validation')
  .option('--parallel', 'Enable parallel execution')
  .option('--only-task <id>', 'Preview only this task and its transitive dependencies')
  .option('--start-from <id>', 'Preview tasks starting from this one in topological order')
  .option('--estimate', 'Show rough cost estimate based on context file sizes')
  .action(
    async (opts: {
      model?: string;
      executionModel?: string;
      taskReviewModel?: string;
      parallel?: boolean;
      onlyTask?: string;
      startFrom?: string;
      estimate?: boolean;
    }) => {
      const cwd = process.cwd();
      await initLogger(cwd);

      const state = await loadState(cwd);
      if (!state?.plan) {
        console.error('No plan found. Run "cloudy init <goal>" first.');
        process.exit(1);
      }

      if (opts.onlyTask && opts.startFrom) {
        console.error('Cannot use --only-task and --start-from together');
        process.exit(1);
      }

      const config = await loadConfig(cwd);
      config.models = mergeModelConfig(config.models, {
        model: opts.model ? parseModelFlag(opts.model) : undefined,
        executionModel: opts.executionModel
          ? parseModelFlag(opts.executionModel)
          : undefined,
        taskReviewModel: opts.taskReviewModel
          ? parseModelFlag(opts.taskReviewModel)
          : undefined,
      });

      if (opts.parallel) config.parallel = true;

      // Apply filter and print summary block
      const allTasks = state.plan.tasks;

      if (opts.onlyTask) {
        if (!allTasks.some((t) => t.id === opts.onlyTask)) {
          console.error(`Task "${opts.onlyTask}" not found in plan`);
          process.exit(1);
        }
        const needed = getTransitiveDeps(allTasks, opts.onlyTask);
        const wouldRun = allTasks.filter((t) => needed.has(t.id) && t.status === 'pending');
        const wouldSkip = allTasks.filter((t) => !needed.has(t.id) && t.status === 'pending');
        const line = '─'.repeat(52);
        console.log(`\n${c(dim, line)}`);
        console.log(`${c(yellow, `── filter: --only-task ${opts.onlyTask}`)}`);
        console.log(`  would run:   ${c(bold, wouldRun.map((t) => t.id).join(', '))}  (${wouldRun.length} task${wouldRun.length !== 1 ? 's' : ''})`);
        console.log(`  would skip:  ${c(dim, wouldSkip.map((t) => t.id).join(', '))}  (${wouldSkip.length} task${wouldSkip.length !== 1 ? 's' : ''})`);
        console.log(`${c(dim, line)}\n`);

        for (const task of allTasks) {
          if (!needed.has(task.id) && task.status === 'pending') {
            task.status = 'skipped';
            task.resultSummary = 'Skipped (--only-task)';
          }
        }
      }

      if (opts.startFrom) {
        if (!allTasks.some((t) => t.id === opts.startFrom)) {
          console.error(`Task "${opts.startFrom}" not found in plan`);
          process.exit(1);
        }
        const sorted = topologicalSort(allTasks);
        const startIndex = sorted.indexOf(opts.startFrom);
        const predecessors = new Set(sorted.slice(0, startIndex));
        const wouldRun = allTasks.filter((t) => !predecessors.has(t.id) && t.status === 'pending');
        const wouldSkip = allTasks.filter((t) => predecessors.has(t.id) && t.status === 'pending');
        const line = '─'.repeat(52);
        console.log(`\n${c(dim, line)}`);
        console.log(`${c(cyan, `── filter: --start-from ${opts.startFrom}`)}`);
        console.log(`  would run:   ${c(bold, wouldRun.map((t) => t.id).join(', '))}  (${wouldRun.length} task${wouldRun.length !== 1 ? 's' : ''})`);
        console.log(`  would skip:  ${c(dim, wouldSkip.map((t) => t.id).join(', '))}  (${wouldSkip.length} task${wouldSkip.length !== 1 ? 's' : ''})`);
        console.log(`${c(dim, line)}\n`);

        for (const task of allTasks) {
          if (predecessors.has(task.id) && task.status === 'pending') {
            task.status = 'completed';
            task.resultSummary = 'Skipped (--start-from)';
          }
        }
      }

      // --estimate: print cost table and exit without running orchestrator
      if (opts.estimate) {
        await printCostEstimate(allTasks, config, cwd);
        return;
      }

      const orchestrator = new Orchestrator({
        cwd,
        state,
        config,
        dryRun: true,
      });

      await orchestrator.run();
    },
  );
