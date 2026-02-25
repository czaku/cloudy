import { Command } from 'commander';
import { loadConfig } from '../../config/config.js';
import { loadState } from '../../core/state.js';
import { validateTask, formatValidationErrors } from '../../validator/validator.js';
import { initLogger } from '../../utils/logger.js';
import { c, bold, dim, green, red, yellow } from '../../utils/colors.js';

export const validateCommand = new Command('validate')
  .description('Re-run acceptance criteria against already-completed work')
  .argument('[taskId]', 'Task ID to validate (default: all completed tasks)')
  .option('--no-ai-review', 'Skip AI review phase, run deterministic checks only (typecheck, lint, build, test)')
  .action(async (taskId: string | undefined, opts: { aiReview: boolean }) => {
    const cwd = process.cwd();
    await initLogger(cwd);

    const state = await loadState(cwd);
    if (!state?.plan) {
      console.error('No plan found. Run "cloudy init <goal>" first.');
      process.exit(1);
    }

    const config = await loadConfig(cwd);
    if (!opts.aiReview) {
      config.validation.aiReview = false;
    }

    const tasks = taskId
      ? state.plan.tasks.filter((t) => t.id === taskId)
      : state.plan.tasks.filter((t) => t.status === 'completed');

    if (tasks.length === 0) {
      if (taskId) {
        console.error(c(red, `✖  task "${taskId}" not found or not completed`));
      } else {
        console.log(c(dim, 'No completed tasks to validate.'));
      }
      process.exit(1);
    }

    console.log(`\n${c(bold, '🔍 cloudy validate')}  ${c(dim, `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`)}\n`);

    let anyFailed = false;

    for (const task of tasks) {
      console.log(`${c(yellow, '⚡')}  ${c(bold, task.id)}  ${task.title}`);

      const report = await validateTask({
        task,
        config: config.validation,
        model: config.models.validation,
        cwd,
        checkpointSha: task.checkpointSha,
      });

      if (report.passed) {
        console.log(`${c(green, '✅')}  ${c(green, 'passed')}\n`);
      } else {
        anyFailed = true;
        const errors = formatValidationErrors(report);
        console.log(`${c(red, '❌')}  ${c(red, 'failed')}`);
        for (const line of errors.split('\n').filter(Boolean)) {
          console.log(`    ${c(dim, line)}`);
        }
        console.log('');
      }
    }

    if (anyFailed) process.exit(1);
  });
