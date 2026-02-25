import path from 'node:path';
import {
  CLAWDASH_DIR,
  CHECKPOINTS_DIR,
} from '../config/defaults.js';
import { ensureDir, writeJson, readJson } from '../utils/fs.js';
import { commitAll, getCurrentSha, hasUncommittedChanges } from './git.js';
import { log } from '../utils/logger.js';

interface CheckpointData {
  taskId: string;
  sha: string;
  createdAt: string;
}

function checkpointPath(cwd: string, taskId: string): string {
  return path.join(cwd, CLAWDASH_DIR, CHECKPOINTS_DIR, `${taskId}.json`);
}

/**
 * Create a checkpoint before a task starts.
 * Commits any pending changes first, then records the SHA.
 */
export async function createCheckpoint(
  cwd: string,
  taskId: string,
): Promise<string> {
  await ensureDir(
    path.join(cwd, CLAWDASH_DIR, CHECKPOINTS_DIR),
  );

  // Commit any pending changes so we have a clean checkpoint
  if (await hasUncommittedChanges(cwd)) {
    await commitAll(cwd, `[cloudy] checkpoint before ${taskId}`);
  }

  const sha = await getCurrentSha(cwd);

  const data: CheckpointData = {
    taskId,
    sha,
    createdAt: new Date().toISOString(),
  };

  await writeJson(checkpointPath(cwd, taskId), data);
  await log.info(`Checkpoint created for ${taskId}: ${sha.slice(0, 8)}`);

  return sha;
}

/**
 * Get the checkpoint SHA for a task.
 */
export async function getCheckpointSha(
  cwd: string,
  taskId: string,
): Promise<string | null> {
  const data = await readJson<CheckpointData>(checkpointPath(cwd, taskId));
  return data?.sha ?? null;
}
