import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const {
  mockLoadConfig,
  mockLoadKeelTaskRuntime,
  mockExeca,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockLoadKeelTaskRuntime: vi.fn(async () => null),
  mockExeca: vi.fn(),
}));

vi.mock('../../src/config/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

vi.mock('../../src/integrations/keel-task-runtime.js', () => ({
  loadKeelTaskRuntime: mockLoadKeelTaskRuntime,
  applyKeelTaskRuntime: (config: Record<string, unknown>) => config,
}));

vi.mock('../../src/utils/logger.js', () => ({
  initLogger: vi.fn(async () => {}),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

vi.mock('open', () => ({
  default: vi.fn(async () => {}),
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
    maxCostPerTaskUsd: 0,
    maxCostPerRunUsd: 0,
    worktrees: false,
    runBranch: false,
    approval: { mode: 'never', timeoutSec: 300, autoAction: 'continue' },
    engine: 'claude-code',
    provider: 'claude',
    account: 'claude-main',
    review: { enabled: false, model: 'opus', failBlocksRun: false },
    planningRuntime: { engine: 'claude-code', provider: 'claude', account: 'claude-main', modelId: 'claude-sonnet-4-6' },
    validationRuntime: { engine: 'claude-code', provider: 'claude', account: 'claude-main', modelId: 'claude-haiku-4-5' },
    reviewRuntime: { engine: 'claude-code', provider: 'claude', account: 'claude-main', modelId: 'claude-opus-4-6' },
  };
}

describe('pipeline command', () => {
  let tempDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    previousCwd = process.cwd();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-pipeline-'));
    process.chdir(tempDir);
    mockLoadConfig.mockResolvedValue(makeConfig());

    mockExeca.mockImplementation(async (_cmd: string, args: string[]) => {
      const runNameIndex = args.indexOf('--run-name');
      if (runNameIndex >= 0) {
        const runName = args[runNameIndex + 1];
        const runDir = path.join(tempDir, '.clawdash', 'runs', runName);
        await fs.mkdir(runDir, { recursive: true });
        await fs.writeFile(path.join(runDir, 'state.json'), JSON.stringify({
          plan: {
            goal: 'Goal',
            tasks: [{
              id: 'task-1',
              title: 'Task 1',
              description: 'Desc',
              acceptanceCriteria: [],
              dependencies: [],
              contextPatterns: [],
              status: 'pending',
              retries: 0,
              maxRetries: 1,
              ifFailed: 'halt',
              timeout: 3_600_000,
            }],
          },
          costSummary: { totalEstimatedUsd: 0 },
        }, null, 2));
      }

      return { exitCode: 0, stdout: '', stderr: '' };
    });
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('passes strict batch through to the spawned run', async () => {
    const specPath = path.join(tempDir, 'phase-1.md');
    await fs.writeFile(specPath, '# Phase 1\n');

    const program = createProgram();
    await program.parseAsync([
      'chain',
      '--spec', specPath,
      '--build-model', 'sonnet',
      '--task-review-model', 'haiku',
      '--run-review-model', 'opus',
      '--strict-batch',
    ], { from: 'user' });

    const runInvocation = mockExeca.mock.calls.find((call) => call[1]?.includes('run'));
    expect(runInvocation).toBeTruthy();
    expect(runInvocation?.[1]).toContain('--strict-batch');
  });
});
