import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  mockLoadConfig,
  mockLoadState,
  mockSaveState,
  mockSelectViaDaemon,
  mockInitLogger,
  mockAcquireLock,
  mockNotifyRunComplete,
  mockNotifyRunFailed,
  mockExeca,
  mockAutoRegisterWithDaemon,
  mockOrchestratorRun,
  mockOrchestratorCtor,
  mockWriteRunOutcome,
  mockLoadKeelTaskRuntime,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockLoadState: vi.fn(),
  mockSaveState: vi.fn(),
  mockSelectViaDaemon: vi.fn(),
  mockInitLogger: vi.fn(async () => {}),
  mockAcquireLock: vi.fn(async () => () => {}),
  mockNotifyRunComplete: vi.fn(),
  mockNotifyRunFailed: vi.fn(),
  mockExeca: vi.fn(async () => ({ stdout: 'feature/test', exitCode: 0, stderr: '' })),
  mockAutoRegisterWithDaemon: vi.fn(async () => {}),
  mockOrchestratorRun: vi.fn(async () => {}),
  mockOrchestratorCtor: vi.fn(),
  mockWriteRunOutcome: vi.fn(async () => {}),
  mockLoadKeelTaskRuntime: vi.fn(async () => null),
}));

vi.mock('../../src/config/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/core/state.js', () => ({
  loadState: mockLoadState,
  loadOrCreateState: vi.fn(),
  saveState: mockSaveState,
  sanitizeStaleTasks: vi.fn(() => []),
  updatePlan: vi.fn(),
}));

vi.mock('omnai', () => ({
  selectViaDaemon: mockSelectViaDaemon,
}));

vi.mock('../../src/utils/logger.js', () => ({
  initLogger: mockInitLogger,
  log: {
    info: vi.fn(async () => {}),
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/lock.js', () => ({
  acquireLock: mockAcquireLock,
}));

vi.mock('../../src/notifications/notify.js', () => ({
  notifyRunComplete: mockNotifyRunComplete,
  notifyRunFailed: mockNotifyRunFailed,
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

vi.mock('../../src/cli/commands/daemon.js', () => ({
  daemonCommand: new Command('daemon'),
  autoRegisterWithDaemon: mockAutoRegisterWithDaemon,
}));

vi.mock('../../src/integrations/keel.js', () => ({
  writeRunOutcome: mockWriteRunOutcome,
}));

vi.mock('../../src/integrations/keel-task-runtime.js', () => ({
  loadKeelTaskRuntime: mockLoadKeelTaskRuntime,
  applyKeelTaskRuntime: (config: Record<string, unknown>, runtime: any) => {
    if (!runtime) return config;
    return {
      ...config,
      models: {
        ...(config.models as Record<string, unknown>),
        planning: runtime.models?.planning ?? (config.models as any)?.planning,
        execution: runtime.models?.execution ?? (config.models as any)?.execution,
        validation: runtime.models?.taskReview ?? (config.models as any)?.validation,
        qualityReview: runtime.models?.qualityReview ?? (config.models as any)?.qualityReview,
      },
      engine: runtime.execution?.engine ?? config.engine,
      provider: runtime.execution?.provider ?? config.provider,
      executionModelId: runtime.execution?.modelId ?? config.executionModelId,
      planningRuntime: { ...(config.planningRuntime as Record<string, unknown>), ...(runtime.planning ?? {}) },
      validationRuntime: { ...(config.validationRuntime as Record<string, unknown>), ...(runtime.validation ?? {}) },
      reviewRuntime: { ...(config.reviewRuntime as Record<string, unknown>), ...(runtime.review ?? {}) },
      review: {
        ...(config.review as Record<string, unknown>),
        model: runtime.models?.runReview ?? (config.review as any)?.model,
      },
    };
  },
}));

vi.mock('../../src/core/orchestrator.js', () => ({
  Orchestrator: class MockOrchestrator {
    aborted = false;

    constructor(options: unknown) {
      mockOrchestratorCtor(options);
    }

    async run() {
      return mockOrchestratorRun();
    }

    abort() {
      this.aborted = true;
    }
  },
}));

import { createProgram } from '../../src/cli/index.js';

function makeConfig() {
  return {
    models: { planning: 'sonnet', execution: 'sonnet', validation: 'haiku' },
    validation: { typecheck: false, lint: false, build: false, test: false, aiReview: false, commands: [] },
    maxRetries: 1,
    parallel: false,
    maxParallel: 2,
    retryDelaySec: 0,
    taskTimeoutMs: 3_600_000,
    autoModelRouting: false,
    dashboard: false,
    dashboardPort: 3456,
    notifications: { desktop: false, sound: false },
    contextBudgetTokens: 0,
    contextBudgetMode: 'warn',
    preflightCommands: [],
    maxCostPerTaskUsd: 0,
    maxCostPerRunUsd: 0,
    worktrees: false,
    runBranch: false,
    approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
    engine: 'claude-code',
    provider: 'claude',
    executionModelId: undefined,
    review: { enabled: false, model: 'sonnet', failBlocksRun: false },
    keel: undefined,
  };
}

function makeState(taskStatus: 'pending' | 'completed' | 'failed' = 'pending') {
  return {
    version: 1,
    plan: {
      goal: 'Ship the feature',
      tasks: [
        {
          id: 'task-1',
          title: 'Implement feature',
          description: 'Do the work',
          acceptanceCriteria: ['It works'],
          dependencies: [],
          contextPatterns: [],
          status: taskStatus,
          retries: 0,
          maxRetries: 1,
          ifFailed: 'halt',
          timeout: 3_600_000,
        },
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    costSummary: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalEstimatedUsd: 0,
      byPhase: {},
      byModel: {},
    },
    startedAt: '2025-01-01T00:00:00Z',
  };
}

describe('run command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(makeConfig());
    mockLoadState.mockResolvedValue(makeState());
    mockSelectViaDaemon.mockResolvedValue({ engine: 'codex' });
    mockLoadKeelTaskRuntime.mockResolvedValue(null);
  });

  it('passes engine, provider, and execution model ID through to selection and orchestration', async () => {
    const program = createProgram();

    await program.parseAsync([
      'run',
      '--non-interactive',
      '--execution-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'sonnet',
      '--planning-engine', 'codex',
      '--planning-provider', 'codex',
      '--planning-model-id', 'o3-mini',
      '--engine', 'codex',
      '--provider', 'codex',
      '--execution-model-id', 'o3',
      '--validation-engine', 'codex',
      '--validation-provider', 'codex',
      '--validation-model-id', 'o4-mini',
      '--review-engine', 'codex',
      '--review-provider', 'codex',
      '--review-model-id', 'gpt-4.1',
      '--no-dashboard',
    ], { from: 'user' });

    expect(mockSelectViaDaemon).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });
    expect(mockOrchestratorCtor).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        engine: 'codex',
        provider: 'codex',
        executionModelId: 'o3',
        planningRuntime: {
          engine: 'codex',
          provider: 'codex',
          modelId: 'o3-mini',
        },
        validationRuntime: {
          engine: 'codex',
          provider: 'codex',
          modelId: 'o4-mini',
        },
        reviewRuntime: {
          engine: 'codex',
          provider: 'codex',
          modelId: 'gpt-4.1',
        },
        dashboard: false,
        models: expect.objectContaining({
          execution: 'sonnet',
          validation: 'haiku',
        }),
        review: expect.objectContaining({
          model: 'sonnet',
        }),
      }),
    }));
    expect(mockOrchestratorRun).toHaveBeenCalledOnce();
  });

  it('applies keel task runtime defaults before orchestrating the run', async () => {
    mockLoadConfig.mockResolvedValue({
      ...makeConfig(),
      keel: { slug: 'fitkind', taskId: 'T-029', port: 7842 },
    });
    mockLoadKeelTaskRuntime.mockResolvedValue({
      models: {
        execution: 'opus',
        taskReview: 'sonnet',
        runReview: 'haiku',
      },
      execution: {
        engine: 'codex',
        provider: 'codex',
        modelId: 'o3',
      },
      validation: {
        engine: 'codex',
        provider: 'codex',
        modelId: 'o4-mini',
      },
      review: {
        engine: 'pi-mono',
        provider: 'openai',
        modelId: 'gpt-5',
      },
    });

    const program = createProgram();
    await program.parseAsync([
      'run',
      '--non-interactive',
      '--execution-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'sonnet',
      '--no-dashboard',
    ], { from: 'user' });

    expect(mockLoadKeelTaskRuntime).toHaveBeenCalledWith(process.cwd(), 'T-029');
    expect(mockSelectViaDaemon).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });
    expect(mockOrchestratorCtor).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        engine: 'codex',
        provider: 'codex',
        executionModelId: 'o3',
        validationRuntime: expect.objectContaining({
          engine: 'codex',
          provider: 'codex',
          modelId: 'o4-mini',
        }),
        reviewRuntime: expect.objectContaining({
          engine: 'pi-mono',
          provider: 'openai',
          modelId: 'gpt-5',
        }),
      }),
    }));
  });

  it('exits non-zero when the requested engine/provider is unavailable', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const program = createProgram();
    mockSelectViaDaemon.mockRejectedValueOnce(new Error('codex not found'));

    await expect(program.parseAsync([
      'run',
      '--non-interactive',
      '--execution-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'sonnet',
      '--engine', 'codex',
      '--provider', 'codex',
      '--no-dashboard',
    ], { from: 'user' })).rejects.toThrow('EXIT:1');

    expect(stderr).toHaveBeenCalled();
    expect(mockOrchestratorCtor).not.toHaveBeenCalled();

    exit.mockRestore();
    stderr.mockRestore();
  });

  it('writes a successful keel outcome when the run completes with no failed tasks', async () => {
    const state = makeState('completed');
    mockLoadConfig.mockResolvedValue({
      ...makeConfig(),
      keel: { slug: 'fitkind', taskId: 'T-7', port: 9000 },
    });
    mockLoadState.mockResolvedValue(state);

    const program = createProgram();
    await program.parseAsync([
      'run',
      '--non-interactive',
      '--execution-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'sonnet',
      '--no-dashboard',
    ], { from: 'user' });

    expect(mockWriteRunOutcome).toHaveBeenCalledWith(
      { slug: 'fitkind', taskId: 'T-7', port: 9000 },
      expect.objectContaining({
        success: true,
        tasksDone: 1,
        tasksFailed: 0,
      }),
      process.cwd(),
    );
  });

  it('writes a failed keel outcome when tasks failed even if orchestration did not throw', async () => {
    const state = makeState('failed');
    mockLoadConfig.mockResolvedValue({
      ...makeConfig(),
      keel: { slug: 'fitkind', taskId: 'T-9', port: 7842 },
    });
    mockLoadState.mockResolvedValue(state);

    const program = createProgram();
    await program.parseAsync([
      'run',
      '--non-interactive',
      '--execution-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'sonnet',
      '--no-dashboard',
    ], { from: 'user' });

    expect(mockWriteRunOutcome).toHaveBeenCalledWith(
      { slug: 'fitkind', taskId: 'T-9', port: 7842 },
      expect.objectContaining({
        success: false,
        tasksDone: 0,
        tasksFailed: 1,
        topError: '1 task(s) failed during the run.',
      }),
      process.cwd(),
    );
  });
});
