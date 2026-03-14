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
  };
}

function makeState() {
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
          status: 'pending',
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
  };
}

describe('run command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(makeConfig());
    mockLoadState.mockResolvedValue(makeState());
    mockSelectViaDaemon.mockResolvedValue({ engine: 'codex' });
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
});
