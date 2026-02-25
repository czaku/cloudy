import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrchestratorEvent, ProjectState, CloudyConfig, Plan, Task } from '../../src/core/types.js';

// Mock external dependencies
vi.mock('../../src/executor/claude-runner.js', () => ({
  runClaude: vi.fn(async ({ onOutput }: { onOutput?: (text: string) => void }) => {
    onOutput?.('mock output');
    return {
      success: true,
      output: 'Task completed successfully',
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 1000,
      costUsd: 0.01,
    };
  }),
}));

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
    validation: { typecheck: false, lint: false, build: false, test: false, aiReview: false },
    maxRetries: 1,
    parallel: false,
    maxParallel: 2,
    retryDelaySec: 0,
    taskTimeoutMs: 3600000,
    autoModelRouting: false,
    dashboard: false,
    dashboardPort: 3456,
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes tasks in sequential order and emits events', async () => {
    const tasks = [makeTask('task-1'), makeTask('task-2', ['task-1'])];
    const events: OrchestratorEvent[] = [];

    const orchestrator = new Orchestrator({
      cwd: '/tmp/test',
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

  it('stops on task failure when ifFailed is halt', async () => {
    const { runClaude } = await import('../../src/executor/claude-runner.js');
    const mockedRunClaude = vi.mocked(runClaude);

    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
    ];
    // Make task-1 fail
    mockedRunClaude.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Execution error',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });
    // Retry also fails
    mockedRunClaude.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Execution error again',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });

    const events: OrchestratorEvent[] = [];
    const orchestrator = new Orchestrator({
      cwd: '/tmp/test',
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
    const { runClaude } = await import('../../src/executor/claude-runner.js');
    const mockedRunClaude = vi.mocked(runClaude);

    const tasks = [
      makeTask('task-1'),
      makeTask('task-2'),
      makeTask('task-3'),
    ];

    let orchestratorRef: InstanceType<typeof Orchestrator> | null = null;

    // First call succeeds, second call will never start because we abort
    mockedRunClaude.mockImplementation(async ({ onOutput }) => {
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
      cwd: '/tmp/test',
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
      cwd: '/tmp/test',
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
      cwd: '/tmp/test',
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
});
