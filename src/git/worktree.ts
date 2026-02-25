import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';
import { CLAWDASH_DIR } from '../config/defaults.js';
import { log } from '../utils/logger.js';
import { commitAll, hasUncommittedChanges } from './git.js';

const WORKTREES_DIR = 'worktrees';

export interface WorktreeInfo {
  path: string;
  branch: string;
  taskId: string;
}

function worktreesBase(cwd: string): string {
  return path.join(cwd, CLAWDASH_DIR, WORKTREES_DIR);
}

function worktreePath(cwd: string, taskId: string): string {
  return path.join(worktreesBase(cwd), taskId);
}

function branchName(taskId: string): string {
  return `cloudy/${taskId}`;
}

/**
 * Create a git worktree for isolated task execution.
 */
export async function createWorktree(
  cwd: string,
  taskId: string,
): Promise<WorktreeInfo> {
  const wtPath = worktreePath(cwd, taskId);
  const branch = branchName(taskId);

  await fs.mkdir(worktreesBase(cwd), { recursive: true });
  await log.info(`Creating worktree for task "${taskId}" at ${wtPath}`);

  await execa('git', ['worktree', 'add', '-b', branch, wtPath], { cwd });
  await log.info(`Worktree created: branch=${branch}, path=${wtPath}`);

  return { path: wtPath, branch, taskId };
}

/**
 * Merge changes from a worktree branch back into the main branch.
 */
export async function mergeWorktree(
  cwd: string,
  worktree: WorktreeInfo,
): Promise<{ merged: boolean; conflict: boolean }> {
  if (await hasUncommittedChanges(worktree.path)) {
    await commitAll(
      worktree.path,
      `[cloudy] auto-commit task ${worktree.taskId}`,
    );
    await log.info(`Auto-committed pending changes in worktree for task "${worktree.taskId}"`);
  }

  const message = `[cloudy] merge ${worktree.taskId}`;

  try {
    await execa('git', ['merge', '--no-ff', worktree.branch, '-m', message], { cwd });
    await log.info(`Merged worktree branch "${worktree.branch}" into main`);
    return { merged: true, conflict: false };
  } catch {
    // Abort the failed merge before trying anything else
    try { await execa('git', ['merge', '--abort'], { cwd }); } catch { /* ignore */ }

    // Fallback: try a rebase so worktree changes land on top of main
    await log.warn(`Merge conflict for task "${worktree.taskId}" — attempting rebase fallback`);
    try {
      await execa('git', ['rebase', 'HEAD', worktree.branch], { cwd: worktree.path });
      // Rebase succeeded — fast-forward merge now
      await execa('git', ['merge', '--ff-only', worktree.branch, '-m', message], { cwd });
      await log.info(`Rebase+FF merged worktree branch "${worktree.branch}"`);
      return { merged: true, conflict: false };
    } catch (rebaseErr) {
      try { await execa('git', ['rebase', '--abort'], { cwd: worktree.path }); } catch { /* ignore */ }
      await log.warn(`Rebase fallback also failed for task "${worktree.taskId}": ${rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr)}`);
      return { merged: false, conflict: true };
    }
  }
}

/**
 * Remove a worktree and clean up its branch.
 */
export async function removeWorktree(
  cwd: string,
  worktree: WorktreeInfo,
): Promise<void> {
  await log.info(`Removing worktree for task "${worktree.taskId}" at ${worktree.path}`);

  try {
    await execa('git', ['worktree', 'remove', worktree.path, '--force'], { cwd });
  } catch {
    await log.warn(`git worktree remove failed for "${worktree.taskId}", cleaning up manually`);
    try {
      await fs.rm(worktree.path, { recursive: true, force: true });
    } catch {
      // Directory may already be gone
    }
  }

  try {
    await execa('git', ['branch', '-D', worktree.branch], { cwd });
  } catch {
    // Branch may already be deleted
  }

  await log.info(`Worktree removed for task "${worktree.taskId}"`);
}

/**
 * List all active cloudy worktrees.
 */
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], { cwd });

  const worktrees: WorktreeInfo[] = [];
  const base = worktreesBase(cwd);
  const entries = stdout.split('\n\n');

  for (const entry of entries) {
    const lines = entry.trim().split('\n');
    let wtPath = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        wtPath = line.slice('worktree '.length);
      }
      if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length).replace('refs/heads/', '');
      }
    }

    if (wtPath && wtPath.startsWith(base)) {
      const taskId = path.basename(wtPath);
      worktrees.push({ path: wtPath, branch, taskId });
    }
  }

  return worktrees;
}

/**
 * Clean up all cloudy worktrees (used on reset).
 */
export async function cleanupAllWorktrees(cwd: string): Promise<void> {
  await log.info('Cleaning up all cloudy worktrees');

  const worktrees = await listWorktrees(cwd).catch(() => []);

  for (const wt of worktrees) {
    await removeWorktree(cwd, wt);
  }

  try {
    await execa('git', ['worktree', 'prune'], { cwd });
  } catch {
    // Ignore prune failures
  }

  try {
    await fs.rmdir(worktreesBase(cwd));
  } catch {
    // Directory may not be empty or may not exist
  }

  await log.info(`Cleaned up ${worktrees.length} worktree(s)`);
}
