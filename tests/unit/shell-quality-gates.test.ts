import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('../../src/validator/strategies/type-check.js', () => ({
  runTypeCheck: vi.fn().mockResolvedValue({ strategy: 'typecheck', passed: true, output: '', durationMs: 10 }),
}));
vi.mock('../../src/validator/strategies/lint-check.js', () => ({
  runLintCheck: vi.fn().mockResolvedValue({ strategy: 'lint', passed: true, output: '', durationMs: 10 }),
}));
vi.mock('../../src/validator/strategies/build-check.js', () => ({
  runBuildCheck: vi.fn().mockResolvedValue({ strategy: 'build', passed: true, output: '', durationMs: 10 }),
  detectPlatformBuildNeeds: vi.fn(() => ({ ios: false, android: false })),
  runIosBuildCheck: vi.fn(async () => null),
  runAndroidBuildCheck: vi.fn(async () => null),
}));
vi.mock('../../src/validator/strategies/test-runner.js', () => ({
  runTestRunner: vi.fn().mockResolvedValue({ strategy: 'test', passed: true, output: '', durationMs: 10 }),
}));
vi.mock('../../src/validator/strategies/ai-review.js', () => ({
  runAiReview: vi.fn().mockResolvedValue({ strategy: 'ai-review', passed: true, output: JSON.stringify({ passed: true, summary: 'ok', criteriaResults: [] }), durationMs: 10 }),
}));
vi.mock('../../src/validator/strategies/ai-review-quality.js', () => ({
  runAiQualityReview: vi.fn().mockResolvedValue({ strategy: 'ai-review-quality', passed: true, output: 'Code quality good', durationMs: 10 }),
}));
vi.mock('../../src/git/git.js', () => ({
  getGitDiff: vi.fn().mockResolvedValue(''),
}));
vi.mock('../../src/utils/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeTask() {
  return {
    id: 'task-1',
    title: 'Test task',
    description: '',
    acceptanceCriteria: ['It works'],
    dependencies: [],
    contextPatterns: [],
    status: 'completed' as const,
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt' as const,
    timeout: 3600000,
  };
}

describe('validateTask — shell command gates', () => {
  let mockExeca: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    mockExeca.mockClear();
  });

  it('runs configured shell commands and passes when they succeed', async () => {
    mockExeca.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const { validateTask } = await import('../../src/validator/validator.js');
    const report = await validateTask({
      task: makeTask(),
      config: {
        typecheck: false,
        lint: false,
        build: false,
        test: false,
        aiReview: false,
        commands: ['npx tsc --noEmit', 'npm test'],
      },
      model: 'haiku',
      cwd: '/project',
    });

    expect(report.passed).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith('npx', ['tsc', '--noEmit'], expect.any(Object));
    expect(mockExeca).toHaveBeenCalledWith('npm', ['test'], expect.any(Object));
  });

  it('fails validation when a shell command exits non-zero', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: 'error output', stderr: '' });

    const { validateTask } = await import('../../src/validator/validator.js');
    const report = await validateTask({
      task: makeTask(),
      config: {
        typecheck: false,
        lint: false,
        build: false,
        test: false,
        aiReview: false,
        commands: ['npm test'],
      },
      model: 'haiku',
      cwd: '/project',
    });

    expect(report.passed).toBe(false);
    const cmdResult = report.results.find((r) => r.strategy === 'command');
    expect(cmdResult).toBeDefined();
    expect(cmdResult?.passed).toBe(false);
    expect(cmdResult?.output).toContain('npm test');
  });

  it('short-circuits after the first failing command', async () => {
    mockExeca.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'fail' });

    const { validateTask } = await import('../../src/validator/validator.js');
    await validateTask({
      task: makeTask(),
      config: {
        typecheck: false,
        lint: false,
        build: false,
        test: false,
        aiReview: false,
        commands: ['cmd1', 'cmd2', 'cmd3'],
      },
      model: 'haiku',
      cwd: '/project',
    });

    // Should only have called the first failing command
    expect(mockExeca).toHaveBeenCalledTimes(1);
  });

  it('skips commands when no commands are configured', async () => {
    const { validateTask } = await import('../../src/validator/validator.js');
    await validateTask({
      task: makeTask(),
      config: {
        typecheck: false,
        lint: false,
        build: false,
        test: false,
        aiReview: false,
        commands: [],
      },
      model: 'haiku',
      cwd: '/project',
    });

    expect(mockExeca).not.toHaveBeenCalled();
  });
});
