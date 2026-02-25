import path from 'node:path';
import {
  CHECKPOINTS_DIR,
} from '../config/defaults.js';
import { ensureDir, writeJson, readJson } from '../utils/fs.js';
import { commitAll, getCurrentSha, hasUncommittedChanges } from './git.js';
import { log } from '../utils/logger.js';
import { getCurrentRunDir } from '../utils/run-dir.js';

interface CheckpointData {
  taskId: string;
  sha: string;
  createdAt: string;
}

/**
 * Per-cwd mutex: serialises concurrent createCheckpoint() calls so that
 * parallel tasks don't race on `git add -A && git commit`.
 * Each entry is a Promise that resolves when the previous checkpoint
 * for that directory has completed.
 */
const checkpointMutex = new Map<string, Promise<unknown>>();

/**
 * Create a checkpoint before a task starts.
 * Commits any pending changes first, then records the SHA.
 *
 * Thread-safe: concurrent calls for the same cwd are serialised so that
 * two parallel tasks cannot race on the underlying git commit.
 */
export async function createCheckpoint(
  cwd: string,
  taskId: string,
): Promise<string> {
  // Chain onto any in-flight checkpoint for this cwd so git operations
  // are always sequential, even when tasks start concurrently.
  const previous = checkpointMutex.get(cwd) ?? Promise.resolve();
  const current = previous.then(() => _createCheckpoint(cwd, taskId));
  // Store a version that swallows errors so the chain never breaks.
  checkpointMutex.set(cwd, current.catch(() => {}));
  return current;
}

async function _createCheckpoint(
  cwd: string,
  taskId: string,
): Promise<string> {
  const runDir = await getCurrentRunDir(cwd);
  const checkpointsDir = path.join(runDir, CHECKPOINTS_DIR);
  await ensureDir(checkpointsDir);

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

  await writeJson(path.join(checkpointsDir, `${taskId}.json`), data);
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
  const runDir = await getCurrentRunDir(cwd);
  const data = await readJson<CheckpointData>(
    path.join(runDir, CHECKPOINTS_DIR, `${taskId}.json`),
  );
  return data?.sha ?? null;
}
