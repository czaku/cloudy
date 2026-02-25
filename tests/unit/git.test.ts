import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execa before importing git functions
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const { execa } = await import('execa');
const mockedExeca = vi.mocked(execa);

const {
  getCurrentSha,
  isGitRepo,
  hasUncommittedChanges,
  commitAll,
  getGitDiff,
  resetToSha,
  shaExists,
} = await import('../../src/git/git.js');

function makeExecaResult(stdout: string) {
  return { stdout, stderr: '' } as ReturnType<typeof execa>;
}

// git.ts prepends these opts to every git call to avoid submodule recursion issues
const G = ['-c', 'submodule.recurse=false'];

describe('git.ts — uses array args (no shell injection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCurrentSha calls git rev-parse HEAD with array args', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('abc123\n'));
    const sha = await getCurrentSha('/tmp/repo');
    expect(sha).toBe('abc123');
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'rev-parse', 'HEAD'], { cwd: '/tmp/repo' });
  });

  it('isGitRepo returns true on success', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('true'));
    expect(await isGitRepo('/tmp/repo')).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'rev-parse', '--is-inside-work-tree'], { cwd: '/tmp/repo' });
  });

  it('isGitRepo returns false on error', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('not a git repo'));
    expect(await isGitRepo('/tmp/repo')).toBe(false);
  });

  it('hasUncommittedChanges returns true when porcelain output is non-empty', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult(' M src/foo.ts\n'));
    expect(await hasUncommittedChanges('/tmp/repo')).toBe(true);
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'status', '--porcelain', '--ignore-submodules'], { cwd: '/tmp/repo' });
  });

  it('hasUncommittedChanges returns false when porcelain output is empty', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult(''));
    expect(await hasUncommittedChanges('/tmp/repo')).toBe(false);
  });

  it('commitAll uses array args — message with special chars is not shell-interpolated', async () => {
    // git add -A
    mockedExeca.mockResolvedValueOnce(makeExecaResult(''));
    // git diff --cached --stat (non-empty → something to commit)
    mockedExeca.mockResolvedValueOnce(makeExecaResult('1 file changed'));
    // git commit -m message
    mockedExeca.mockResolvedValueOnce(makeExecaResult(''));
    // git rev-parse HEAD
    mockedExeca.mockResolvedValueOnce(makeExecaResult('def456'));

    const message = 'feat: support $(evil) `command` injection; rm -rf /';
    await commitAll('/tmp/repo', message);

    // commit call must pass the message as a plain string arg, NOT via shell
    const commitCall = mockedExeca.mock.calls.find(
      (c) => c[0] === 'git' && Array.isArray(c[1]) && (c[1] as string[]).includes('commit'),
    );
    expect(commitCall).toBeDefined();
    const args = commitCall![1] as string[];
    // message must appear verbatim as an element (not shell-expanded)
    expect(args).toContain(message);
    // must use -m flag separately (array form, not concatenated string)
    expect(args).toContain('-m');
    expect(args.indexOf('-m')).toBe(args.indexOf(message) - 1);
  });

  it('commitAll skips commit when nothing staged', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('')); // add -A
    mockedExeca.mockResolvedValueOnce(makeExecaResult('')); // diff --cached --stat: empty
    mockedExeca.mockResolvedValueOnce(makeExecaResult('abc123')); // getCurrentSha

    const sha = await commitAll('/tmp/repo', 'msg');
    expect(sha).toBe('abc123');
    // commit should NOT be called
    const commitCalled = mockedExeca.mock.calls.some(
      (c) => c[0] === 'git' && Array.isArray(c[1]) && (c[1] as string[]).includes('commit'),
    );
    expect(commitCalled).toBe(false);
  });

  it('getGitDiff with fromSha uses array args', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('diff output'));
    const diff = await getGitDiff('/tmp/repo', 'abc123');
    expect(diff).toBe('diff output');
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'diff', 'abc123'], { cwd: '/tmp/repo' });
  });

  it('getGitDiff without fromSha diffs HEAD', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('diff output'));
    await getGitDiff('/tmp/repo');
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'diff', 'HEAD'], { cwd: '/tmp/repo' });
  });

  it('resetToSha uses array args with --hard', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult(''));
    await resetToSha('/tmp/repo', 'abc123');
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'reset', '--hard', 'abc123'], { cwd: '/tmp/repo' });
  });

  it('resetToSha uses --soft when hard=false', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult(''));
    await resetToSha('/tmp/repo', 'abc123', false);
    expect(mockedExeca).toHaveBeenCalledWith('git', [...G, 'reset', '--soft', 'abc123'], { cwd: '/tmp/repo' });
  });

  it('shaExists returns true when cat-file succeeds', async () => {
    mockedExeca.mockResolvedValueOnce(makeExecaResult('commit'));
    expect(await shaExists('/tmp/repo', 'abc123')).toBe(true);
  });

  it('shaExists returns false when cat-file fails', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('bad object'));
    expect(await shaExists('/tmp/repo', 'badhash')).toBe(false);
  });
});
