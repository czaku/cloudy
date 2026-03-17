import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OrchestratorEvent, ProjectState, CloudyConfig, Plan, Task } from '../../src/core/types.js';

// Mock external dependencies
vi.mock('../../src/executor/engine.js', () => {
  const runEngine = vi.fn(async ({ onOutput, onFilesWritten }: { onOutput?: (text: string) => void; onFilesWritten?: (paths: string[]) => void }) => {
    onOutput?.('mock output');
    onFilesWritten?.(['src/mock-output.ts']);
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

  it('short-circuits verify tasks before execution when validation says already satisfied', async () => {
    const { validateTask } = await import('../../src/validator/validator.js');
    const { runEngine } = await import('../../src/executor/engine.js');

    vi.mocked(validateTask).mockResolvedValueOnce({
      taskId: 'task-1',
      passed: true,
      alreadySatisfied: true,
      results: [],
    });

    const tasks = [makeTask('task-1')];
    tasks[0].type = 'verify';
    const state = makeState(tasks);

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('completed_without_changes');
    expect(vi.mocked(runEngine)).not.toHaveBeenCalled();
  });

  it('short-circuits verify tasks before execution when validation passes and there is no diff', async () => {
    const { validateTask } = await import('../../src/validator/validator.js');
    const { runEngine } = await import('../../src/executor/engine.js');
    const { getGitDiff } = await import('../../src/git/git.js');

    vi.mocked(validateTask).mockResolvedValueOnce({
      taskId: 'task-1',
      passed: true,
      alreadySatisfied: false,
      results: [],
    });
    vi.mocked(getGitDiff).mockResolvedValueOnce('');

    const tasks = [makeTask('task-1')];
    tasks[0].type = 'verify';
    const state = makeState(tasks);

    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('completed_without_changes');
    expect(vi.mocked(runEngine)).not.toHaveBeenCalled();
  });

  it('fails immediately on out-of-scope writes', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const { validateTask } = await import('../../src/validator/validator.js');
    const outOfScopePath = path.join(testCwd, '..', 'external', 'validator', 'build-check.ts');

    vi.mocked(runEngine).mockImplementationOnce(async ({ onFilesWritten, onOutput }: { onFilesWritten?: (paths: string[]) => void; onOutput?: (text: string) => void }) => {
      onOutput?.('writing outside scope');
      onFilesWritten?.([outOfScopePath]);
      return {
        success: true,
        output: 'wrote wrong file',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 100,
        costUsd: 0.001,
        filesWritten: [outOfScopePath],
      };
    });

    const task = makeTask('task-1');
    task.allowedWritePaths = ['apple/FitKind', 'sentinel/fixtures'];
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('failed');
    expect(state.plan?.tasks[0].error).toContain('Out-of-scope write detected');
    expect(vi.mocked(validateTask)).not.toHaveBeenCalled();
  });

  it('marks implementation candidate ready when validation config is wrong and does not retry', async () => {
    const { validateTask } = await import('../../src/validator/validator.js');
    vi.mocked(validateTask).mockResolvedValueOnce({
      taskId: 'task-1',
      passed: false,
      results: [
        {
          strategy: 'build',
          passed: false,
          output: 'iOS build (FitKind-Dev) failed (exit 65): xcodebuild: error: Scheme FitKind-Dev is not currently configured',
          durationMs: 100,
        },
      ],
    });

    const task = makeTask('task-1');
    task.maxRetries = 2;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('failed');
    expect(state.plan?.tasks[0].retries).toBe(0);
    expect(state.plan?.tasks[0].implementationCandidateReady).toBe(true);
    expect(state.plan?.tasks[0].implementationCandidateReason).toContain('Validation configuration error');
  });

  it('fails scoped implementation tasks that keep exploring without making a first write', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);
    let now = 1_700_000_000_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    mockedRunEngine.mockImplementationOnce(async ({ onToolUse, abortSignal }: { onToolUse?: (toolName: string, toolInput: unknown) => void; abortSignal?: AbortSignal }) => {
      onToolUse?.('Agent', { description: 'explore files' });
      onToolUse?.('Read', { file_path: 'app/features/plan/TrainingPlansView.swift' });
      onToolUse?.('Read', { file_path: 'app/features/plan/TrainingPlanDetailView.swift' });
      onToolUse?.('Read', { file_path: 'app/features/home/HomeViewModel.swift' });
      onToolUse?.('Read', { file_path: 'fixtures/home/today.json' });
      onToolUse?.('Read', { file_path: 'app/core/network/APIResponses.swift' });
      onToolUse?.('Read', { file_path: 'app/core/network/Fixtures.swift' });
      now += 76_000;

      onToolUse?.('Read', { file_path: 'app/features/plan/PlanViewModel.swift' });

      return {
        success: false,
        output: '',
        error: abortSignal?.aborted ? 'Task timed out' : 'should have aborted',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 100,
        costUsd: 0,
      };
    });

    const task = makeTask('task-1');
    task.allowedWritePaths = ['app/features/plan', 'app/features/home', 'app/core/network', 'fixtures/plans'];
    task.maxRetries = 0;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('failed');
    expect(state.plan?.tasks[0].error).toContain('Over-exploration detected');
    expect(state.plan?.tasks[0].retryHistory?.[0]?.failureType).toBe('executor_nonperformance');
    dateNowSpy.mockRestore();
  });

  it('does not retry terminal over-exploration failures', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Over-exploration detected: 9 discovery operations before any verification or file writes',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });

    const task = makeTask('task-1');
    task.maxRetries = 2;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(mockedRunEngine).toHaveBeenCalledTimes(1);
    expect(state.plan?.tasks[0].status).toBe('failed');
    expect(state.plan?.tasks[0].retries).toBe(0);
    expect(state.plan?.tasks[0].retryHistory?.[0]?.failureType).toBe('executor_nonperformance');
  });

  it('fails scoped tasks fast on repeated shell discovery before any write', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockImplementationOnce(async ({ onToolUse }: { onToolUse?: (toolName: string, toolInput: unknown) => void; abortSignal?: AbortSignal }) => {
      onToolUse?.('Bash', { command: 'find apple/FitKind/Features/Vault -name "*.swift" | head -20' });
      onToolUse?.('Bash', { command: 'grep -rn "TrainingPlan" apple/FitKind/Features/Vault' });
      return {
        success: false,
        output: '',
        error: 'Pre-write shell discovery is disallowed for scoped implementation tasks: 2 shell discovery operations without any file write',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 100,
        costUsd: 0,
      };
    });

    const task = makeTask('task-1');
    task.allowedWritePaths = ['apple/FitKind/Features/Vault', 'apple/FitKind/Features/Journey'];
    task.maxRetries = 0;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('failed');
    expect(state.plan?.tasks[0].failureClass).toBe('executor_nonperformance');
    expect(state.plan?.tasks[0].error).toContain('Pre-write shell discovery is disallowed');
  });

  it('passes strict allowed tools for tiny scoped implementation tasks', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockResolvedValueOnce({
      success: true,
      output: 'done',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });

    const task = makeTask('task-1');
    task.title = 'Add route hooks';
    task.description = 'Update the UI routes only';
    task.allowedWritePaths = ['src/RootNavigation.kt', 'src/PrototypeScreenshotTests.kt'];
    task.contextPatterns = ['src/RootNavigation.kt', 'src/PrototypeScreenshotTests.kt'];
    task.implementationSteps = ['Edit the route table', 'Edit the screenshot tests'];
    task.maxRetries = 0;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(mockedRunEngine).toHaveBeenCalledWith(expect.objectContaining({
      allowedTools: ['Read', 'Edit', 'MultiEdit', 'Write'],
      disallowedTools: ['Agent', 'Bash', 'Glob', 'Grep', 'LS', 'Find', 'ToolSearch'],
    }));
  });

  it('does not count provided context reads as exploration before first write', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockImplementationOnce(async ({ onToolUse, onToolResult }) => {
      onToolUse?.('Read', { file_path: 'src/VaultRepository.kt' });
      onToolUse?.('Read', { file_path: 'src/VaultViewModel.kt' });
      onToolUse?.('Read', { file_path: 'src/TrainingPlansScreen.kt' });
      onToolUse?.('Edit', { file_path: 'src/TrainingPlansRepository.kt' });
      onToolResult?.('Edit', 'applied', false);
      return {
        success: true,
        output: 'done',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 100,
        costUsd: 0,
      };
    });

    const task = makeTask('task-2');
    task.title = 'Create foundation files';
    task.description = 'Add a repository and view model using exact analog files';
    task.allowedWritePaths = ['src/TrainingPlansRepository.kt', 'src/TrainingPlansViewModel.kt'];
    task.contextPatterns = ['src/VaultRepository.kt', 'src/VaultViewModel.kt', 'src/TrainingPlansScreen.kt'];
    task.implementationSteps = ['Mirror the repository pattern', 'Mirror the view-model pattern'];
    task.maxRetries = 0;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('completed');
    expect(state.plan?.tasks[0].failureClass).toBeUndefined();
  });

  it('treats a successful edit tool result as first-write progress for scoped tasks', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockImplementationOnce(async ({ onToolUse, onToolResult }) => {
      onToolUse?.('Edit', { file_path: 'apple/FitKind/Core/Network/Fixtures.swift' });
      onToolResult?.('Edit', 'applied', false);
      return {
        success: true,
        output: 'done',
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        durationMs: 100,
        costUsd: 0,
      };
    });

    const task = makeTask('task-1');
    task.allowedWritePaths = ['apple/FitKind/Core/Network/Fixtures.swift'];
    task.maxRetries = 0;
    const state = makeState([task]);
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: makeConfig(),
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(state.plan?.tasks[0].status).toBe('completed');
    expect(state.plan?.tasks[0].executionMetrics?.timeToFirstWriteMs).toBeTypeOf('number');
    expect(state.plan?.tasks[0].executionMetrics?.writeCount).toBeGreaterThanOrEqual(1);
  });

  it('does not let holistic review rerun terminal failure tasks', async () => {
    const { runEngine } = await import('../../src/executor/engine.js');
    const { runHolisticReview } = await import('../../src/reviewer.js');
    const mockedRunEngine = vi.mocked(runEngine);

    mockedRunEngine.mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Over-exploration detected: no file writes after 75s for a scoped implementation task',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 100,
      costUsd: 0,
    });

    vi.mocked(runHolisticReview).mockResolvedValueOnce({
      verdict: 'FAIL',
      summary: 'retry it',
      criteriaResults: [],
      issues: [],
      conventionViolations: [],
      suggestions: [],
      rerunTaskIds: ['task-1'],
      costUsd: 0,
      durationMs: 10,
      model: 'opus',
    } as any);

    const task = makeTask('task-1');
    task.maxRetries = 2;
    const state = makeState([task]);
    state.config.review = { enabled: true, model: 'opus' };
    const orchestrator = new Orchestrator({
      cwd: testCwd,
      state,
      config: state.config,
      onEvent: () => {},
    });

    await orchestrator.run();

    expect(mockedRunEngine).toHaveBeenCalledTimes(1);
    expect(state.plan?.tasks[0].status).toBe('failed');
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
