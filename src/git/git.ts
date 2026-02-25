import { execa } from 'execa';

// Shared git options: never recurse into submodules (avoids broken submodule errors)
const GIT_OPTS = ['-c', 'submodule.recurse=false'];

/**
 * Get the current HEAD commit SHA.
 */
export async function getCurrentSha(cwd: string): Promise<string> {
  const { stdout } = await execa('git', [...GIT_OPTS, 'rev-parse', 'HEAD'], { cwd });
  return stdout.trim();
}

/**
 * Check if the working directory is a git repo.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execa('git', [...GIT_OPTS, 'rev-parse', '--is-inside-work-tree'], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if there are uncommitted changes.
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const { stdout } = await execa('git', [...GIT_OPTS, 'status', '--porcelain', '--ignore-submodules'], { cwd });
  return stdout.trim().length > 0;
}

/**
 * Stage all changes and commit.
 */
export async function commitAll(
  cwd: string,
  message: string,
): Promise<string> {
  await execa('git', [...GIT_OPTS, 'add', '-A'], { cwd });

  // Check if there's anything to commit
  const { stdout: status } = await execa('git', [...GIT_OPTS, 'diff', '--cached', '--stat', '--ignore-submodules'], { cwd });
  if (!status.trim()) {
    return await getCurrentSha(cwd);
  }

  await execa('git', [...GIT_OPTS, 'commit', '-m', message], { cwd });
  return await getCurrentSha(cwd);
}

/**
 * Get git diff from a reference point (or all uncommitted changes).
 *
 * Uses `git diff <sha> HEAD` (not `git diff <sha>`) so that changes
 * committed by Claude during execution are always captured — even when
 * the working tree is clean at validation time. Also appends any
 * remaining uncommitted changes on top of HEAD.
 */
export async function getGitDiff(
  cwd: string,
  fromSha?: string,
): Promise<string> {
  if (fromSha) {
    // Committed changes since checkpoint (what Claude already committed)
    const { stdout: committed } = await execa('git', [...GIT_OPTS, 'diff', fromSha, 'HEAD'], { cwd });
    // Any remaining uncommitted changes in the working tree
    const { stdout: uncommitted } = await execa('git', [...GIT_OPTS, 'diff', 'HEAD'], { cwd });
    return committed + (uncommitted ? '\n' + uncommitted : '');
  }

  // No checkpoint — get all uncommitted changes
  const { stdout } = await execa('git', [...GIT_OPTS, 'diff', 'HEAD'], { cwd });
  return stdout;
}

/**
 * Get list of files changed since a reference SHA (or uncommitted).
 */
export async function getChangedFiles(
  cwd: string,
  fromSha?: string,
): Promise<string[]> {
  try {
    if (fromSha) {
      // Files in commits since checkpoint + any uncommitted files
      const { stdout: committed } = await execa('git', [...GIT_OPTS, 'diff', '--name-only', fromSha, 'HEAD'], { cwd });
      const { stdout: uncommitted } = await execa('git', [...GIT_OPTS, 'diff', '--name-only', 'HEAD'], { cwd });
      const all = [...committed.trim().split('\n'), ...uncommitted.trim().split('\n')].filter(Boolean);
      return [...new Set(all)];
    }
    const { stdout } = await execa('git', [...GIT_OPTS, 'diff', '--name-only', 'HEAD'], { cwd });
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Reset to a specific commit SHA.
 */
export async function resetToSha(
  cwd: string,
  sha: string,
  hard = true,
): Promise<void> {
  const flag = hard ? '--hard' : '--soft';
  await execa('git', [...GIT_OPTS, 'reset', flag, sha], { cwd });
}

/**
 * Roll back the working directory to a checkpoint SHA.
 *
 * Hard-resets HEAD to the checkpoint and removes all untracked
 * (non-gitignored) files so Claude starts the retry from a clean slate.
 *
 * Safe to call in sequential mode or inside an isolated git worktree.
 * DO NOT call when multiple parallel tasks share the same working directory —
 * it will destroy uncommitted changes from concurrently running tasks.
 */
export async function rollbackToCheckpoint(
  cwd: string,
  sha: string,
): Promise<void> {
  await execa('git', [...GIT_OPTS, 'reset', '--hard', sha], { cwd });
  // Remove untracked files/directories (respects .gitignore, so build
  // artifacts and secrets are not touched).
  await execa('git', [...GIT_OPTS, 'clean', '-fd'], { cwd });
}

/**
 * Create and checkout a new branch for a cloudy run.
 *
 * All task commits go on this branch. The user can review and merge when ready.
 * Branch name: cloudy/run-YYYYMMDD-HHmmss
 */
export async function createRunBranch(cwd: string): Promise<string> {
  const stamp = new Date().toISOString()
    .replace('T', '-')
    .replace(/:/g, '')
    .slice(0, 15);
  const branch = `cloudy/run-${stamp}`;
  await execa('git', [...GIT_OPTS, 'checkout', '-b', branch], { cwd });
  return branch;
}

/**
 * Check if a commit SHA exists.
 */
export async function shaExists(cwd: string, sha: string): Promise<boolean> {
  try {
    await execa('git', [...GIT_OPTS, 'cat-file', '-t', sha], { cwd });
    return true;
  } catch {
    return false;
  }
}
