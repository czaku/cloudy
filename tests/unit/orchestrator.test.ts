import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OrchestratorEvent, ProjectState, CloudyConfig, Plan, Task } from '../../src/core/types.js';

// Mock external dependencies
vi.mock('../../src/executor/engine.js', () => {
  const runEngine = vi.fn(async ({ onOutput }: { onOutput?: (text: string) => void }) => {
    onOutput?.('mock output');
    return {
      success: true,
      output: 'Task completed successfully',
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 1000,
      costUsd: 0.01,
    };
  });
  return { runEngine };
});

vi.mock('../../src/executor/context-resolver.js', () => ({
  resolveContextFiles: vi.fn(async () => []),
  expandContext: vi.fn(async (patterns: string[]) => patterns),
  buildContextSection: vi.fn(() => ''),
}));

vi.mock('../../src/validator/validator.js', () => ({
  validateTask: vi.fn(async () => ({
    taskId: 'task-1',
    passed: true,
    results: [],
  })),
  formatValidationErrors: vi.fn(() => ''),
}));

vi.mock('../../src/git/checkpoint.js', () => ({
  createCheckpoint: vi.fn(async () => 'abc123'),
}));

vi.mock('../../src/git/git.js', () => ({
  isGitRepo: vi.fn(async () => false),
  commitAll: vi.fn(async () => {}),
  getChangedFiles: vi.fn(async () => []),
  getGitDiff: vi.fn(async () => 'diff --git a/SMOKE_RESULT.md b/SMOKE_RESULT.md\n+smoke route ok'),
}));

vi.mock('../../src/core/state.js', () => ({
  saveState: vi.fn(async () => {}),
}));

vi.mock('../../src/config/auto-routing.js', () => ({
  routeModelForTask: vi.fn(() => 'sonnet'),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
  logTaskOutput: vi.fn(async () => {}),
}));

vi.mock('../../src/reviewer.js', () => ({
  runHolisticReview: vi.fn(async () => ({
    verdict: 'PASS',
    summary: 'ok',
    criteriaResults: [],
    issues: [],
    conventionViolations: [],
    suggestions: [],
    rerunTaskIds: [],
    costUsd: 0,
    durationMs: 10,
    model: 'sonnet',
  })),
}));

function makeTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    acceptanceCriteria: ['It works'],
    dependencies: deps,
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 1,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

function makePlan(tasks: Task[]): Plan {
  return {
    goal: 'Test goal',
    tasks,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

function makeConfig(): CloudyConfig {
  return {
    models: { planning: 'sonnet', execution: 'sonnet', validation: 'haiku' },
    validation: { typecheck: false, lint: false, build: false, test: false, aiReview: false, commands: [] },
    maxRetries: 1,
    parallel: false,
    maxParallel: 2,
    retryDelaySec: 0,
    taskTimeoutMs: 3600000,
    autoModelRouting: false,
    dashboard: false,
    dashboardPort: 3456,
    notifications: { desktop: false, sound: false },
    contextBudgetTokens: 0,
    maxCostPerTaskUsd: 0,
    maxCostPerRunUsd: 0,
    worktrees: false,
    runBranch: false,
    approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
    engine: 'claude-code',
    piMono: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', piPath: 'pi' },
    review: { enabled: false, model: 'sonnet' },
  };
}

function makeState(tasks: Task[]): ProjectState {
  return {
    version: 1,
    plan: makePlan(tasks),
    config: makeConfig(),
    costSummary: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalEstimatedUsd: 0,
      byPhase: {},
      byModel: {},
    },
  };
}

// Import Orchestrator after mocks are set up
const { Orchestrator } = await import('../../src/core/orchestrator.js');

describe('Orchestrator', () => {
  let testCwd: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    testCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-orchestrator-'));
  });

  afterEach(async () => {
    await fs.rm(testCwd, { recursive: true, force: true });
  });

  it('executes tasks in sequential order and emits events', async () => {
    const tasks = [makeTask('task-1'), makeTask('task-2', ['task-1'])];
    const events: OrchestratorEvent[] = [];

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config: makeConfig(),
      onEvent: (e) => events.push(e),
    });

    await orchestrator.run();

    const startedEvents = events.filter((e) => e.type === 'task_started');
    expect(startedEvents).toHaveLength(2);
    expect((startedEvents[0] as { taskId: string }).taskId).toBe('task-1');
    expect((startedEvents[1] as { taskId: string }).taskId).toBe('task-2');

    const completedEvents = events.filter((e) => e.type === 'task_completed');
    expect(completedEvents).toHaveLength(2);

    const runCompleted = events.find((e) => e.type === 'run_completed');
    expect(runCompleted).toBeDefined();
  });

  it('marks already-satisfied tasks as completed_without_changes', async () => {
    const { validateTask } = await import('../../src/validator/validator.js');
    vi.mocked(validateTask).mockResolvedValueOnce({
      taskId: 'task-1',
      passed: true,
      alreadySatisfied: true,
      results: [],
    });

    const tasks = [makeTask('task-1')];
    const state = makeState(tasks);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('completed_without_changes');
  });

  it('stops on task failure when ifFailed is halt', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
    ];
    // Make task-1 fail
    mockedRunEngine.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Execution error',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });
    // Retry also fails
    mockedRunEngine.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Execution error again',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });

    const events: OrchestratorEvent[] = [];
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config: makeConfig(),
      onEvent: (e) => events.push(e),
    });

    await orchestrator.run();

    // task-1 should have failed
    const failEvents = events.filter((e) => e.type === 'task_failed');
    expect(failEvents.length).toBeGreaterThanOrEqual(1);

    // task-2 should never have started
    const startedIds = events
      .filter((e) => e.type === 'task_started')
      .map((e) => (e as { taskId: string }).taskId);
    expect(startedIds).not.toContain('task-2');

    // run_failed should be emitted
    const runFailed = events.find((e) => e.type === 'run_failed');
    expect(runFailed).toBeDefined();
  });

  it('abort() stops execution after current task', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    const tasks = [
      makeTask('task-1'),
      makeTask('task-2'),
      makeTask('task-3'),
    ];

    let orchestratorRef: InstanceType<typeof Orchestrator> | null = null;

    // First call succeeds, second call will never start because we abort
    mockedRunEngine.mockImplementation(async ({ onOutput }) => {
      onOutput?.('working...');
      // Abort after first task starts
      if (orchestratorRef && !orchestratorRef.aborted) {
        orchestratorRef.abort();
      }
      return {
        success: true,
        output: 'done',
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 500,
        costUsd: 0.01,
      };
    });

    const events: OrchestratorEvent[] = [];
    orchestratorRef = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config: makeConfig(),
      onEvent: (e) => events.push(e),
    });

    await orchestratorRef.run();

    // Should have the stopped status
    const stoppedEvent = events.find(
      (e) => e.type === 'run_status' && (e as { status: string }).status === 'stopped',
    );
    expect(stoppedEvent).toBeDefined();

    // Should not have completed all tasks
    const completedEvents = events.filter((e) => e.type === 'task_completed');
    expect(completedEvents.length).toBeLessThan(3);
  });

  it('dry run outputs preview without executing', async () => {
    const tasks = [makeTask('task-1')];
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config: makeConfig(),
      dryRun: true,
    });

    await orchestrator.run();

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Dry Run Preview');
    expect(output).toContain('task-1');
    expect(output).toContain('No changes will be made');

    consoleSpy.mockRestore();
  });

  it('emits events in correct order', async () => {
    const tasks = [makeTask('task-1')];
    const eventTypes: string[] = [];

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config: makeConfig(),
      onEvent: (e) => eventTypes.push(e.type),
    });

    await orchestrator.run();

    // task_started should come before task_completed
    const startIdx = eventTypes.indexOf('task_started');
    const completeIdx = eventTypes.indexOf('task_completed');
    expect(startIdx).toBeLessThan(completeIdx);

    // progress should appear
    expect(eventTypes).toContain('progress');

    // run_completed should be last-ish
    expect(eventTypes).toContain('run_completed');
  });

  it('passes the earliest checkpoint SHA into holistic review', async () => {
    const { createCheckpoint } = await import('../../src/git/checkpoint.js');
    const { isGitRepo } = await import('../../src/git/git.js');
    const { runHolisticReview } = await import('../../src/reviewer.js');
    const mockedCreateCheckpoint = vi.mocked(createCheckpoint);
    const mockedIsGitRepo = vi.mocked(isGitRepo);
    const mockedRunHolisticReview = vi.mocked(runHolisticReview);

    mockedIsGitRepo.mockResolvedValue(true);
    mockedCreateCheckpoint.mockResolvedValueOnce('sha-first').mockResolvedValueOnce('sha-second');

    const tasks = [makeTask('task-1'), makeTask('task-2', ['task-1'])];
    const config = makeConfig();
    config.review.enabled = true;

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state: makeState(tasks),
      config,
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(mockedRunHolisticReview).toHaveBeenCalled();
    expect(mockedRunHolisticReview.mock.calls[0]?.[4]).toBe('sha-first');
  });
});
