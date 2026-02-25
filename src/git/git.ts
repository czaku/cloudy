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
 */
export async function getGitDiff(
  cwd: string,
  fromSha?: string,
): Promise<string> {
  if (fromSha) {
    const { stdout } = await execa('git', [...GIT_OPTS, 'diff', fromSha], { cwd });
    return stdout;
  }

  // Get all uncommitted changes
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
    const ref = fromSha ? fromSha : 'HEAD';
    const args = fromSha
      ? [...GIT_OPTS, 'diff', '--name-only', fromSha]
      : [...GIT_OPTS, 'diff', '--name-only', 'HEAD'];
    const { stdout } = await execa('git', args, { cwd });
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
