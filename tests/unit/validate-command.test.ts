import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  mockLoadConfig,
  mockLoadState,
  mockValidateTask,
  mockInitLogger,
  mockSelectViaDaemon,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockLoadState: vi.fn(),
  mockValidateTask: vi.fn(),
  mockInitLogger: vi.fn(async () => {}),
  mockSelectViaDaemon: vi.fn(),
}));

vi.mock('../../src/config/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/core/state.js', () => ({
  loadState: mockLoadState,
}));

vi.mock('../../src/validator/validator.js', () => ({
  validateTask: mockValidateTask,
  formatValidationErrors: vi.fn(() => 'failed'),
}));

vi.mock('../../src/utils/logger.js', () => ({
  initLogger: mockInitLogger,
}));

vi.mock('@sweech/engine', () => ({
  selectViaDaemon: mockSelectViaDaemon,
}));

import { validateCommand } from '../../src/cli/commands/validate.js';

function makeConfig() {
  return {
    models: { planning: 'sonnet', execution: 'sonnet', validation: 'haiku' },
    validation: { typecheck: false, lint: false, build: false, test: false, aiReview: true, commands: [] },
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
    validationRuntime: {},
    review: { enabled: false, model: 'sonnet', failBlocksRun: false },
  };
}

function makeState() {
  return {
    version: 1,
    plan: {
      goal: 'Validate the feature',
      tasks: [
        {
          id: 'task-1',
          title: 'Completed task',
          description: 'Done',
          acceptanceCriteria: ['It works'],
          dependencies: [],
          contextPatterns: [],
          status: 'completed',
          retries: 0,
          maxRetries: 1,
          ifFailed: 'halt',
          timeout: 3_600_000,
        },
      ],
    },
  };
}

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  program.addCommand(validateCommand);
  return program;
}

describe('validate command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(makeConfig());
    mockLoadState.mockResolvedValue(makeState());
    mockSelectViaDaemon.mockResolvedValue({ engine: 'codex' });
    mockValidateTask.mockResolvedValue({ taskId: 'task-1', passed: true, results: [] });
  });

  it('passes validation runtime overrides through preflight and validateTask', async () => {
    const program = makeProgram();

    await program.parseAsync([
      'check',
      '--task-review-engine', 'codex',
      '--task-review-provider', 'codex',
      '--task-review-model-id', 'o3',
    ], { from: 'user' });

    expect(mockSelectViaDaemon).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'review',
    });
    expect(mockValidateTask).toHaveBeenCalledWith(expect.objectContaining({
      runtime: {
        engine: 'codex',
        provider: 'codex',
        modelId: 'o3',
      },
    }));
  });

  it('skips AI runtime preflight when --no-ai-review is used', async () => {
    const program = makeProgram();

    await program.parseAsync([
      'check',
      '--no-ai-review',
      '--task-review-engine', 'codex',
      '--task-review-provider', 'codex',
      '--task-review-model-id', 'o3',
    ], { from: 'user' });

    expect(mockSelectViaDaemon).not.toHaveBeenCalled();
    expect(mockValidateTask).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ aiReview: false }),
      runtime: {
        engine: 'codex',
        provider: 'codex',
        modelId: 'o3',
      },
    }));
  });
});
