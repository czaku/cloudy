import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, ValidationConfig } from '../../src/core/types.js';

// Mock all external calls
vi.mock('../../src/validator/strategies/type-check.js', () => ({
  runTypeCheck: vi.fn(async () => ({ strategy: 'typecheck', passed: true, output: 'No type errors', durationMs: 100 })),
}));
vi.mock('../../src/validator/strategies/lint-check.js', () => ({
  runLintCheck: vi.fn(async () => ({ strategy: 'lint', passed: true, output: 'No lint errors', durationMs: 50 })),
}));
vi.mock('../../src/validator/strategies/build-check.js', () => ({
  runBuildCheck: vi.fn(async () => ({ strategy: 'build', passed: true, output: 'Build succeeded', durationMs: 200 })),
  detectPlatformBuildNeeds: vi.fn(() => ({ ios: false, android: false })),
  runIosBuildCheck: vi.fn(async () => null),
  runAndroidBuildCheck: vi.fn(async () => null),
}));
vi.mock('../../src/validator/strategies/test-runner.js', () => ({
  runTestRunner: vi.fn(async () => ({ strategy: 'test', passed: true, output: 'All tests passed', durationMs: 500 })),
}));
vi.mock('../../src/validator/strategies/ai-review.js', () => ({
  runAiReview: vi.fn(async () => ({ strategy: 'ai-review', passed: true, output: JSON.stringify({ passed: true, summary: 'Looks good', criteriaResults: [] }), durationMs: 300 })),
}));
vi.mock('../../src/validator/strategies/ai-review-quality.js', () => ({
  runAiQualityReview: vi.fn(async () => ({ strategy: 'ai-review-quality', passed: true, output: 'Code quality good', durationMs: 200 })),
}));
vi.mock('../../src/validator/strategies/artifact-check.js', () => ({
  runArtifactCheck: vi.fn(async () => ({ strategy: 'artifacts', passed: true, output: 'All artifacts present', durationMs: 10 })),
}));
vi.mock('../../src/git/git.js', () => ({
  getGitDiff: vi.fn(async () => 'diff --git a/file.ts b/file.ts'),
  getChangedFiles: vi.fn(async () => []),
}));
vi.mock('../../src/utils/logger.js', () => ({
  log: { info: vi.fn(async () => {}), warn: vi.fn(async () => {}), error: vi.fn(async () => {}) },
}));

import { validateTask } from '../../src/validator/validator.js';
import { inferArtifactsFromAcceptanceCriteria } from '../../src/planner/planner.js';
import { runArtifactCheck } from '../../src/validator/strategies/artifact-check.js';
import { runTypeCheck } from '../../src/validator/strategies/type-check.js';
import { runAiReview } from '../../src/validator/strategies/ai-review.js';
import { runAiQualityReview } from '../../src/validator/strategies/ai-review-quality.js';
import { runIosBuildCheck } from '../../src/validator/strategies/build-check.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    description: 'A test task',
    acceptanceCriteria: ['It works'],
    dependencies: [],
    contextPatterns: [],
    status: 'completed',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
    ...overrides,
  };
}

const ALL_ON: ValidationConfig = {
  typecheck: true,
  lint: true,
  build: true,
  test: true,
  aiReview: true,
  commands: [],
};

const ALL_OFF: ValidationConfig = {
  typecheck: false,
  lint: false,
  build: false,
  test: false,
  aiReview: false,
  commands: [],
};

describe('validateTask — full pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes when all checks are enabled and all pass', async () => {
    const report = await validateTask({
      task: makeTask(),
      config: ALL_ON,
      model: 'haiku',
      cwd: '/tmp',
    });
    expect(report.passed).toBe(true);
    expect(report.results.length).toBeGreaterThan(0);
  });

  it('skips all checks when all disabled', async () => {
    const report = await validateTask({
      task: makeTask(),
      config: ALL_OFF,
      model: 'haiku',
      cwd: '/tmp',
    });
    expect(report.passed).toBe(true);
    expect(report.results).toHaveLength(0);
  });

  it('phase 0: runs artifact check when outputArtifacts present', async () => {
    const task = makeTask({ outputArtifacts: ['src/foo.ts'] });
    await validateTask({ task, config: ALL_OFF, model: 'haiku', cwd: '/tmp' });
    expect(runArtifactCheck).toHaveBeenCalledWith(['src/foo.ts'], '/tmp');
  });

  it('phase 0: infers artifact paths from acceptance criteria when outputArtifacts are omitted', async () => {
    const task = makeTask({
      acceptanceCriteria: [
        'android-shell-journey.png and /tmp/fake-proof.json exist under ~/Desktop/screenshots/fitkind/',
      ],
    });
    await validateTask({ task, config: ALL_OFF, model: 'haiku', cwd: '/tmp' });
    expect(runArtifactCheck).toHaveBeenCalledWith(expect.arrayContaining([
      '/tmp/fake-proof.json',
      `${process.env.HOME ?? '~'}/Desktop/screenshots/fitkind/android-shell-journey.png`,
    ]), '/tmp');
  });

  it('phase 0: short-circuits on missing artifacts without running later phases', async () => {
    vi.mocked(runArtifactCheck).mockResolvedValueOnce({
      strategy: 'artifacts',
      passed: false,
      output: 'Missing: src/foo.ts',
      durationMs: 5,
    });
    const task = makeTask({ outputArtifacts: ['src/foo.ts'] });
    const report = await validateTask({ task, config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(report.passed).toBe(false);
    expect(runTypeCheck).not.toHaveBeenCalled();
    expect(runAiReview).not.toHaveBeenCalled();
  });

  it('short-circuits after first deterministic failure without running AI review', async () => {
    vi.mocked(runTypeCheck).mockResolvedValueOnce({
      strategy: 'typecheck',
      passed: false,
      output: 'error TS2345: ...',
      durationMs: 100,
    });
    const report = await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(report.passed).toBe(false);
    expect(runAiReview).not.toHaveBeenCalled();
  });

  it('skips AI review when aiReview is disabled', async () => {
    const config = { ...ALL_ON, aiReview: false };
    await validateTask({ task: makeTask(), config, model: 'haiku', cwd: '/tmp' });
    expect(runAiReview).not.toHaveBeenCalled();
  });

  it('only runs AI review when all deterministic checks pass', async () => {
    const report = await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(runAiReview).toHaveBeenCalledOnce();
    expect(report.passed).toBe(true);
  });

  it('marks report as alreadySatisfied when no diff exists and artifacts are present', async () => {
    const { getGitDiff } = await import('../../src/git/git.js');
    vi.mocked(getGitDiff).mockResolvedValueOnce('');
    const task = makeTask({
      acceptanceCriteria: ['android-shell-journey.png exists under ~/Desktop/screenshots/fitkind/'],
    });
    const report = await validateTask({ task, config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(report.passed).toBe(true);
    expect(report.alreadySatisfied).toBe(true);
  });

  it('runs task-level validation override commands in addition to config commands', async () => {
    const report = await validateTask({
      task: makeTask({
        validationOverrides: {
          commands: ['echo task-level-check'],
        },
      }),
      config: {
        ...ALL_OFF,
        commands: ['echo config-check'],
      },
      model: 'haiku',
      cwd: '/tmp',
    });

    expect(report.passed).toBe(true);
    const commandResults = report.results.filter((result) => result.strategy === 'command');
    expect(commandResults).toHaveLength(2);
  });

  it('forwards task-level iOS build override to auto platform build checks', async () => {
    const { detectPlatformBuildNeeds } = await import('../../src/validator/strategies/build-check.js');
    vi.mocked(detectPlatformBuildNeeds).mockReturnValueOnce({ ios: true, android: false });

    await validateTask({
      task: makeTask({
        filesWritten: ['apple/FitKind/Features/Vault/TrainingPlansView.swift'],
        validationOverrides: {
          iosBuildCommand: "xcodebuild -project apple/FitKind.xcodeproj -scheme 'FitKind (Dev)' build",
        },
      }),
      config: ALL_OFF,
      model: 'haiku',
      cwd: '/tmp',
    });

    expect(runIosBuildCheck).toHaveBeenCalledWith(
      '/tmp',
      [],
      expect.objectContaining({
        iosBuildCommand: "xcodebuild -project apple/FitKind.xcodeproj -scheme 'FitKind (Dev)' build",
      }),
    );
  });

  it('report contains taskId matching the task', async () => {
    const task = makeTask({ id: 'task-42' });
    const report = await validateTask({ task, config: ALL_OFF, model: 'haiku', cwd: '/tmp' });
    expect(report.taskId).toBe('task-42');
  });

  it('AI review failure marks report as failed', async () => {
    vi.mocked(runAiReview).mockResolvedValueOnce({
      strategy: 'ai-review',
      passed: false,
      output: 'Criterion not met: ...',
      durationMs: 300,
    });
    const report = await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(report.passed).toBe(false);
  });
});

describe('inferArtifactsFromAcceptanceCriteria', () => {
  it('extracts screenshot and repo-relative artifacts from acceptance criteria', () => {
    expect(inferArtifactsFromAcceptanceCriteria([
      'android-shell-journey.png exists under ~/Desktop/screenshots/fitkind/ and reports/state.json is written',
    ])).toEqual([
      `${process.env.HOME ?? '~'}/Desktop/screenshots/fitkind/android-shell-journey.png`,
      'reports/state.json',
    ]);
  });
});

describe('validateTask — two-stage AI review (Phase 2a → 2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAiReview).mockResolvedValue({
      strategy: 'ai-review',
      passed: true,
      output: JSON.stringify({ passed: true, summary: 'ok', criteriaResults: [] }),
      durationMs: 300,
    });
    vi.mocked(runAiQualityReview).mockResolvedValue({
      strategy: 'ai-review-quality',
      passed: true,
      output: 'Code quality good',
      durationMs: 200,
    });
  });

  it('runs Phase 2b quality review after Phase 2a spec compliance passes', async () => {
    await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(runAiReview).toHaveBeenCalledOnce();
    expect(runAiQualityReview).toHaveBeenCalledOnce();
  });

  it('forwards validation runtime overrides to both AI review phases', async () => {
    const runtime = { engine: 'codex', provider: 'codex', modelId: 'o3' } as const;

    await validateTask({
      task: makeTask(),
      config: ALL_ON,
      model: 'haiku',
      runtime,
      cwd: '/tmp',
    });

    expect(runAiReview).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(String),
      'haiku',
      '/tmp',
      expect.any(Array),
      undefined,
      undefined,
      expect.any(Array),
      expect.any(Array),
      runtime,
    );
    expect(runAiQualityReview).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'haiku',
      '/tmp',
      expect.any(Array),
      runtime,
    );
  });

  it('skips Phase 2b when Phase 2a spec compliance fails', async () => {
    vi.mocked(runAiReview).mockResolvedValueOnce({
      strategy: 'ai-review',
      passed: false,
      output: JSON.stringify({ passed: false, summary: 'criterion not met', criteriaResults: [] }),
      durationMs: 300,
    });
    await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    expect(runAiQualityReview).not.toHaveBeenCalled();
  });

  it('Phase 2b failure is advisory — overall report still passes', async () => {
    vi.mocked(runAiQualityReview).mockResolvedValueOnce({
      strategy: 'ai-review-quality',
      passed: false,
      output: JSON.stringify({ passed: false, summary: 'critical issue found', issues: [{ severity: 'critical', location: 'src/foo.ts', description: 'SQL injection' }] }),
      durationMs: 200,
    });
    const report = await validateTask({ task: makeTask(), config: ALL_ON, model: 'haiku', cwd: '/tmp' });
    // Phase 2b is advisory — spec-compliant code shouldn't be retried for quality nits
    expect(report.passed).toBe(true);
    const qualityResult = report.results.find((r) => r.strategy === 'ai-review-quality');
    expect(qualityResult).toBeDefined();
    // The result is coerced to passed=true (advisory) but logged as a warning
    expect(qualityResult?.passed).toBe(true);
  });

  it('skips Phase 2b when aiReview is disabled', async () => {
    await validateTask({ task: makeTask(), config: { ...ALL_ON, aiReview: false }, model: 'haiku', cwd: '/tmp' });
    expect(runAiQualityReview).not.toHaveBeenCalled();
  });
});
