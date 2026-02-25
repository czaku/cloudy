import { Command } from 'commander';
import { loadState, saveState } from '../../core/state.js';
import { rollbackTask } from '../../git/rollback.js';
import { initLogger, log } from '../../utils/logger.js';

export const rollbackCommand = new Command('rollback')
  .description('Rollback a task to its pre-execution checkpoint')
  .argument('<taskId>', 'The task ID to rollback (e.g., task-1)')
  .action(async (taskId: string) => {
    const cwd = process.cwd();
    await initLogger(cwd);

    const state = await loadState(cwd);
    if (!state?.plan) {
      console.error('No plan found.');
      process.exit(1);
    }

    const task = state.plan.tasks.find((t) => t.id === taskId);
    if (!task) {
      console.error(`Task "${taskId}" not found in plan.`);
      process.exit(1);
    }

    console.log(`Rolling back task "${taskId}": ${task.title}...`);

    const result = await rollbackTask(cwd, taskId);

    if (result.success) {
      // Update task status
      task.status = 'rolled_back';
      task.completedAt = undefined;
      state.plan.updatedAt = new Date().toISOString();
      await saveState(cwd, state);
      await log.info(result.message);
      console.log(result.message);
    } else {
      await log.error(result.message);
      console.error(result.message);
      process.exit(1);
    }
  });
