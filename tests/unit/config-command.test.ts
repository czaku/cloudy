import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockSaveConfig: vi.fn(async () => {}),
}));

vi.mock('../../src/config/config.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/config.js')>('../../src/config/config.js');
  return {
    ...actual,
    loadConfig: mockLoadConfig,
    saveConfig: mockSaveConfig,
  };
});

import { createProgram } from '../../src/cli/index.js';

function makeConfig() {
  return {
    models: { planning: 'sonnet', execution: 'opus', validation: 'haiku', qualityReview: 'haiku' },
    validation: { typecheck: true, lint: true, build: true, test: true, aiReview: true, commands: [] },
    maxRetries: 2,
    parallel: false,
    maxParallel: 3,
    retryDelaySec: 30,
    taskTimeoutMs: 3_600_000,
    autoModelRouting: false,
    dashboard: true,
    dashboardPort: 1510,
    notifications: { desktop: false, sound: true },
    contextBudgetTokens: 60_000,
    contextBudgetMode: 'warn',
    preflightCommands: [],
    maxCostPerTaskUsd: 0,
    maxCostPerRunUsd: 0,
    worktrees: true,
    runBranch: false,
    approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
    engine: 'claude-code',
    provider: 'claude',
    executionModelId: 'claude-opus-4-5',
    executionEffort: 'high',
    planningRuntime: { engine: 'codex', provider: 'codex', modelId: 'gpt-5.4', effort: 'medium' },
    validationRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-sonnet-4-6', effort: 'high' },
    reviewRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-opus-4-6', effort: 'max' },
    review: { enabled: true, model: 'opus', failBlocksRun: false },
    keel: { slug: 'demo-project' },
  } as const;
}

describe('config command', () => {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(makeConfig());
  });

  afterEach(() => {
    stdout.mockClear();
    stderr.mockClear();
  });

  it('writes runReview via external model key', async () => {
    const program = createProgram();

    await program.parseAsync(['config', '--set', 'models.runReview=sonnet'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      review: expect.objectContaining({ model: 'sonnet' }),
    }));
  });

  it('prints external config shape as json', async () => {
    const program = createProgram();

    await program.parseAsync(['config', '--json'], { from: 'user' });

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"plan": "sonnet"'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"buildEngine": "claude-code"'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"planRuntime"'));
    expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining('"planning": "sonnet"'));
    expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining('"executionModelId"'));
  });
});
