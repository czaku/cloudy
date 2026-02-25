import { getCheckpointSha } from './checkpoint.js';
import { resetToSha, shaExists } from './git.js';
import { log } from '../utils/logger.js';

/**
 * Rollback a task to its pre-execution checkpoint.
 */
export async function rollbackTask(
  cwd: string,
  taskId: string,
): Promise<{ success: boolean; message: string }> {
  const sha = await getCheckpointSha(cwd, taskId);

  if (!sha) {
    return {
      success: false,
      message: `No checkpoint found for task "${taskId}"`,
    };
  }

  const exists = await shaExists(cwd, sha);
  if (!exists) {
    return {
      success: false,
      message: `Checkpoint SHA ${sha.slice(0, 8)} no longer exists in git history`,
    };
  }

  await log.info(`Rolling back task "${taskId}" to ${sha.slice(0, 8)}`);
  await resetToSha(cwd, sha);

  return {
    success: true,
    message: `Rolled back to checkpoint ${sha.slice(0, 8)} (before task "${taskId}")`,
  };
}
