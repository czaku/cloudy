import { Command } from 'commander';
import { loadConfig } from '../../config/config.js';
import { mergeModelConfig, parseModelFlag } from '../../config/model-config.js';
import { initLogger } from '../../utils/logger.js';
import { runLoop, type LoopEvent } from '../../core/loop-runner.js';
import {
  c,
  bold,
  dim,
  green,
  red,
  yellow,
  cyan,
  cyanBright,
} from '../../utils/colors.js';

export const loopCommand = new Command('watch')
  .alias('loop')
  .description(
    'Run a convergence loop toward a goal (Ralph Loop style) — iterate with fresh context until --until passes',
  )
  .argument('<goal>', 'Goal to work toward in each iteration')
  .option(
    '--until <command>',
    'Shell command to check convergence (loop stops when it exits 0)',
  )
  .option('--max-iterations <n>', 'Maximum iterations before giving up', parseInt, 10)
  .option('--model <model>', 'Claude model to use (opus|sonnet|haiku)')
  .action(
    async (
      goal: string,
      opts: {
        until?: string;
        maxIterations: number;
        model?: string;
      },
    ) => {
      const cwd = process.cwd();
      await initLogger(cwd);

      const config = await loadConfig(cwd);
      const modelOverride = opts.model ? parseModelFlag(opts.model) : undefined;
      const model = mergeModelConfig(config.models, { model: modelOverride }).execution;

      console.log(`\n${c(cyanBright + bold, '☁️  cloudy loop')}\n`);
      console.log(`  ${c(bold, 'goal:')}     ${goal}`);
      if (opts.until) {
        console.log(`  ${c(bold, 'until:')}    ${c(dim, opts.until)}`);
      }
      console.log(`  ${c(bold, 'max:')}      ${opts.maxIterations} iterations`);
      console.log(`  ${c(bold, 'model:')}    ${model}`);
      console.log('');

      const result = await runLoop({
        goal,
        untilCommand: opts.until,
        maxIterations: opts.maxIterations,
        model,
        cwd,
        onProgress: (event: LoopEvent) => {
          switch (event.type) {
            case 'iteration_start':
              console.log(
                `\n${c(yellow, '●')} ${c(bold, `Iteration ${event.iteration}`)} ${c(dim, `/ ${event.maxIterations}`)}`,
              );
              break;

            case 'until_failed': {
              if (event.output.trim()) {
                // Show a few lines of context from the failing command
                const lines = event.output.trim().split('\n').slice(0, 5);
                const preview = lines.map((l) => `     ${l}`).join('\n');
                console.log(c(dim, preview));
              }
              break;
            }

            case 'until_passed':
              console.log(`  ${c(green, '✔')} convergence check passed`);
              break;

            case 'no_progress':
              console.log(
                `  ${c(yellow, '⚠')}  no file changes detected ` +
                  c(dim, `(${event.staleCount}/2 stale)`),
              );
              break;

            case 'claude_output':
              // Suppress raw stream — orchestrator style keeps it quiet
              break;

            case 'done':
              break;
          }
        },
      });

      console.log('');

      if (result.succeeded) {
        console.log(
          c(
            green,
            `✅ succeeded after ${result.iterations} iteration${result.iterations !== 1 ? 's' : ''}`,
          ),
        );
        process.exit(0);
      } else {
        const reason = result.reason === 'until_passed'
          ? 'until passed'
          : result.reason === 'max_iterations'
            ? `max iterations (${result.iterations}) reached`
            : result.reason === 'no_progress'
              ? 'no progress — Claude is stuck'
              : result.error ?? result.reason;

        console.log(c(red, `✖  stopped: ${reason}`));
        process.exit(1);
      }
    },
  );
