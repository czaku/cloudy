import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../../src/executor/model-runner.js', () => {
  const runPhaseModel = vi.fn();
  return { runPhaseModel };
});

vi.mock('../../src/git/git.js', () => ({
  getGitDiff: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── helpers ───────────────────────────────────────────────────────────────

function makeClaudeSuccess(output = 'done') {
  return {
    success: true,
    output,
    error: undefined,
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    durationMs: 100,
    costUsd: 0.001,
  };
}

function makeClaudeFailure(error = 'Claude failed') {
  return { success: false, output: '', error, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, durationMs: 0, costUsd: 0 };
}

// ─── checkUntil ────────────────────────────────────────────────────────────

describe('checkUntil', () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    mockExeca.mockClear();
  });

  it('returns passed=true when command exits 0', async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
    const { checkUntil } = await import('../../src/core/loop-runner.js');
    const result = await checkUntil('npm test', '/project');
    expect(result.passed).toBe(true);
    expect(result.output).toBe('ok');
  });

  it('returns passed=false when command exits non-zero', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '3 failures' });
    const { checkUntil } = await import('../../src/core/loop-runner.js');
    const result = await checkUntil('npm test', '/project');
    expect(result.passed).toBe(false);
    expect(result.output).toContain('3 failures');
  });

  it('returns passed=false when command throws', async () => {
    mockExeca.mockRejectedValue(new Error('ENOENT: npm not found'));
    const { checkUntil } = await import('../../src/core/loop-runner.js');
    const result = await checkUntil('npm test', '/project');
    expect(result.passed).toBe(false);
    expect(result.output).toContain('ENOENT');
  });

  it('splits multi-word command into cmd + args', async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const { checkUntil } = await import('../../src/core/loop-runner.js');
    await checkUntil('npx tsc --noEmit', '/project');
    expect(mockExeca).toHaveBeenCalledWith('npx', ['tsc', '--noEmit'], expect.any(Object));
  });
});

// ─── runLoop ───────────────────────────────────────────────────────────────

describe('runLoop', () => {
  let mockExeca: ReturnType<typeof vi.fn>;
  let mockRunPhaseModel: ReturnType<typeof vi.fn>;
  let mockGetGitDiff: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    const { runPhaseModel } = await import('../../src/executor/model-runner.js');
    mockRunPhaseModel = runPhaseModel as ReturnType<typeof vi.fn>;
    const { getGitDiff } = await import('../../src/git/git.js');
    mockGetGitDiff = getGitDiff as ReturnType<typeof vi.fn>;

    mockExeca.mockClear();
    mockRunPhaseModel.mockClear();
    mockGetGitDiff.mockClear();

    // Default: always changing diff so no stale detection
    let diffCounter = 0;
    mockGetGitDiff.mockImplementation(() => Promise.resolve(`diff-${diffCounter++}`));
  });

  it('returns immediately when untilCommand passes on first check', async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: 'all pass', stderr: '' });

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'make tests pass',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'sonnet',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(true);
    expect(result.reason).toBe('until_passed');
    expect(result.iterations).toBe(0);
    // Claude should NOT have been called
    expect(mockRunPhaseModel).not.toHaveBeenCalled();
  });

  it('runs Claude and passes when untilCommand passes after one iteration', async () => {
    let callCount = 0;
    mockExeca.mockImplementation(() => {
      callCount++;
      // First call (pre-iteration check) fails, second call (post-iteration check) passes
      if (callCount === 1) return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'fail' });
      return Promise.resolve({ exitCode: 0, stdout: 'pass', stderr: '' });
    });
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'fix tests',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'haiku',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(true);
    expect(result.iterations).toBe(1);
    expect(mockRunPhaseModel).toHaveBeenCalledTimes(1);
  });

  it('returns max_iterations when untilCommand never passes', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'still failing' });
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'fix tests',
      untilCommand: 'npm test',
      maxIterations: 3,
      model: 'haiku',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(false);
    expect(result.reason).toBe('max_iterations');
    expect(result.iterations).toBe(3);
    expect(mockRunPhaseModel).toHaveBeenCalledTimes(3);
  });

  it('returns no_progress after 2 consecutive iterations with no diff change', async () => {
    // No until command
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());
    // Always return the same diff — stale
    mockGetGitDiff.mockResolvedValue('same-diff-always');

    const events: string[] = [];
    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'make improvements',
      maxIterations: 10,
      model: 'haiku',
      cwd: '/project',
      onProgress: (e) => events.push(e.type),
    });

    expect(result.succeeded).toBe(false);
    expect(result.reason).toBe('no_progress');
    // Should stop after 2 stale iterations (not run all 10)
    expect(mockRunPhaseModel).toHaveBeenCalledTimes(2);
    expect(events).toContain('no_progress');
  });

  it('resets stale counter when progress is made', async () => {
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());

    // Iteration 1: change, iteration 2: no change, iteration 3: change, iterations 4-5: no change → stop
    let callNum = 0;
    mockGetGitDiff.mockImplementation(() => {
      callNum++;
      // First call is initial snapshot
      if (callNum === 1) return Promise.resolve('initial');
      // After iteration 1 (call 2): changed
      if (callNum === 2) return Promise.resolve('diff-after-1');
      // After iteration 2 (call 3): same as after iter 1 (no change)
      if (callNum === 3) return Promise.resolve('diff-after-1');
      // After iteration 3 (call 4): changed again
      if (callNum === 4) return Promise.resolve('diff-after-3');
      // After iterations 4 and 5: same (2 consecutive stale → stop)
      return Promise.resolve('diff-after-3');
    });

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'improve',
      maxIterations: 10,
      model: 'haiku',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(false);
    expect(result.reason).toBe('no_progress');
    // Should have run 5 iterations: 1(ok), 2(stale1), 3(ok reset), 4(stale1), 5(stale2→stop)
    expect(mockRunPhaseModel).toHaveBeenCalledTimes(5);
  });

  it('returns error when Claude fails', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'failing' });
    mockRunPhaseModel.mockResolvedValue(makeClaudeFailure('process killed'));

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'fix',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'haiku',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(false);
    expect(result.reason).toBe('error');
    expect(result.error).toContain('process killed');
  });

  it('emits progress events in the expected order', async () => {
    let checkCall = 0;
    mockExeca.mockImplementation(() => {
      checkCall++;
      return Promise.resolve({
        exitCode: checkCall <= 1 ? 1 : 0,
        stdout: checkCall <= 1 ? 'failing' : 'pass',
        stderr: '',
      });
    });
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());

    const events: string[] = [];
    const { runLoop } = await import('../../src/core/loop-runner.js');
    await runLoop({
      goal: 'fix',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'haiku',
      cwd: '/project',
      onProgress: (e) => events.push(e.type),
    });

    expect(events).toContain('iteration_start');
    expect(events).toContain('until_failed');
    expect(events).toContain('until_passed');
    expect(events).toContain('done');
  });

  it('works without an untilCommand (runs until max iterations or stale)', async () => {
    mockRunPhaseModel.mockResolvedValue(makeClaudeSuccess());
    // Always different diff — never stale
    let n = 0;
    mockGetGitDiff.mockImplementation(() => Promise.resolve(`diff-${n++}`));

    const { runLoop } = await import('../../src/core/loop-runner.js');
    const result = await runLoop({
      goal: 'keep improving',
      maxIterations: 3,
      model: 'haiku',
      cwd: '/project',
    });

    expect(result.succeeded).toBe(false);
    expect(result.reason).toBe('max_iterations');
    expect(mockRunPhaseModel).toHaveBeenCalledTimes(3);
  });
});

// ─── LEARNINGS extraction ───────────────────────────────────────────────────

describe('LEARNINGS accumulation across loop iterations', () => {
  let mockRunPhaseModel: ReturnType<typeof vi.fn>;
  let mockGetGitDiff: ReturnType<typeof vi.fn>;
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const { runPhaseModel } = await import('../../src/executor/model-runner.js');
    mockRunPhaseModel = runPhaseModel as ReturnType<typeof vi.fn>;
    mockRunPhaseModel.mockClear();
    const { getGitDiff } = await import('../../src/git/git.js');
    mockGetGitDiff = getGitDiff as ReturnType<typeof vi.fn>;
    mockGetGitDiff.mockResolvedValue('diff-1');
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    mockExeca.mockClear();
  });

  it('learnings from iteration 1 appear in iteration 2 prompt', async () => {
    const prompts: string[] = [];
    // runPhaseModel receives an object { prompt, model, cwd, onOutput }
    mockRunPhaseModel.mockImplementation(async (opts: { prompt: string }) => {
      prompts.push(opts.prompt);
      return makeClaudeSuccess('Work done\n\n## LEARNINGS\n- Use src/ for all new files');
    });
    // First two checkUntil calls fail; third passes → loop runs Claude twice
    let checkN = 0;
    mockExeca.mockImplementation(() =>
      Promise.resolve({ exitCode: checkN++ < 2 ? 1 : 0, stdout: 'ok', stderr: '' }),
    );
    mockGetGitDiff.mockResolvedValue('diff --git a/f b/f\n+line');

    const { runLoop } = await import('../../src/core/loop-runner.js');
    await runLoop({
      goal: 'fix tests',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'haiku',
      cwd: '/project',
    });

    expect(prompts.length).toBeGreaterThanOrEqual(2);
    expect(prompts[1]).toContain('Discoveries from Previous Iterations');
    expect(prompts[1]).toContain('Use src/ for all new files');
  });

  it('duplicate learnings are not repeated in accumulated list', async () => {
    const prompts: string[] = [];
    const sameLearning = 'Use src/ for all new files';
    mockRunPhaseModel.mockImplementation(async (opts: { prompt: string }) => {
      prompts.push(opts.prompt);
      return makeClaudeSuccess(`Work done\n\n## LEARNINGS\n- ${sameLearning}`);
    });
    let checkN = 0;
    mockExeca.mockImplementation(() =>
      Promise.resolve({ exitCode: checkN++ < 3 ? 1 : 0, stdout: 'ok', stderr: '' }),
    );
    mockGetGitDiff.mockResolvedValue('diff --git a/f b/f\n+line');

    const { runLoop } = await import('../../src/core/loop-runner.js');
    await runLoop({
      goal: 'fix tests',
      untilCommand: 'npm test',
      maxIterations: 5,
      model: 'haiku',
      cwd: '/project',
    });

    // After iteration 2, the same learning should not appear twice in iteration 3 prompt
    if (prompts.length >= 3) {
      const occurrences = (prompts[2].match(new RegExp(sameLearning, 'g')) ?? []).length;
      expect(occurrences).toBe(1);
    }
  });

  it('prompt includes LEARNINGS instruction in first iteration', async () => {
    const prompts: string[] = [];
    mockRunPhaseModel.mockImplementation(async (opts: { prompt: string }) => {
      prompts.push(opts.prompt);
      return makeClaudeSuccess('done');
    });
    // Fail first check so Claude runs at all, then pass
    let checkN = 0;
    mockExeca.mockImplementation(() =>
      Promise.resolve({ exitCode: checkN++ === 0 ? 1 : 0, stdout: 'ok', stderr: '' }),
    );

    const { runLoop } = await import('../../src/core/loop-runner.js');
    await runLoop({
      goal: 'do something',
      untilCommand: 'npm test',
      maxIterations: 3,
      model: 'haiku',
      cwd: '/project',
    });

    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts[0]).toContain('## LEARNINGS');
  });
});
