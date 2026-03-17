import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyKeelTaskRuntime, loadKeelTaskRuntime } from '../../src/integrations/keel-task-runtime.js';

const tempDirs: string[] = [];

async function makeTempProject(taskId: string, body: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-keel-runtime-'));
  tempDirs.push(dir);
  await fs.mkdir(path.join(dir, 'keel', 'tasks'), { recursive: true });
  await fs.writeFile(path.join(dir, 'keel', 'tasks', `${taskId}.json`), JSON.stringify(body, null, 2));
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('keel task runtime', () => {
  it('loads task-specific cloudy runtime defaults from keel task metadata', async () => {
    const cwd = await makeTempProject('T-029', {
      id: 'T-029',
      title: 'Notifications inbox + route correction',
      cloudy: {
        models: {
          planning: 'sonnet',
          execution: 'opus',
          taskReview: 'haiku',
          runReview: 'sonnet',
          qualityReview: 'haiku',
        },
        execution: { engine: 'codex', provider: 'codex', modelId: 'o3' },
        planning: { engine: 'codex', provider: 'codex', modelId: 'o3-mini' },
        validation: { engine: 'codex', provider: 'codex', modelId: 'o4-mini' },
        review: { engine: 'pi-mono', provider: 'openai', modelId: 'gpt-5' },
      },
    });

    await expect(loadKeelTaskRuntime(cwd, 'T-029')).resolves.toEqual({
      models: {
        planning: 'sonnet',
        execution: 'opus',
        taskReview: 'haiku',
        runReview: 'sonnet',
        qualityReview: 'haiku',
      },
      execution: { engine: 'codex', provider: 'codex', modelId: 'o3' },
      planning: { engine: 'codex', provider: 'codex', modelId: 'o3-mini' },
      validation: { engine: 'codex', provider: 'codex', modelId: 'o4-mini' },
      review: { engine: 'pi-mono', provider: 'openai', modelId: 'gpt-5' },
    });
  });

  it('merges keel task runtime defaults into a cloudy config', () => {
    const merged = applyKeelTaskRuntime(
      {
        models: { planning: 'sonnet', execution: 'sonnet', validation: 'haiku' },
        validation: { typecheck: true, lint: true, build: true, test: true, aiReview: true, commands: [] },
        maxRetries: 2,
        parallel: true,
        maxParallel: 3,
        retryDelaySec: 30,
        taskTimeoutMs: 3_600_000,
        autoModelRouting: false,
        dashboard: true,
        dashboardPort: 1510,
        notifications: { desktop: false, sound: true },
        contextBudgetTokens: 60000,
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
        planningRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-sonnet-4-6' },
        validationRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-haiku-4-5-20251001' },
        reviewRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-sonnet-4-6' },
        review: { enabled: true, model: 'sonnet', failBlocksRun: false },
        keel: { slug: 'demo-project', taskId: 'T-029', port: 7842 },
      },
      {
        models: {
          execution: 'opus',
          taskReview: 'sonnet',
          runReview: 'haiku',
        },
        execution: { engine: 'codex', provider: 'codex', modelId: 'o3' },
        validation: { engine: 'codex', provider: 'codex', modelId: 'o4-mini' },
      },
    );

    expect(merged).toEqual(expect.objectContaining({
      engine: 'codex',
      provider: 'codex',
      executionModelId: 'o3',
      models: expect.objectContaining({
        execution: 'opus',
        validation: 'sonnet',
      }),
      validationRuntime: expect.objectContaining({
        engine: 'codex',
        provider: 'codex',
        modelId: 'o4-mini',
      }),
      review: expect.objectContaining({
        model: 'haiku',
      }),
    }));
  });

  it('throws on invalid abstract models in keel task metadata', async () => {
    const cwd = await makeTempProject('T-777', {
      id: 'T-777',
      cloudy: {
        models: {
          execution: 'gpt-5',
        },
      },
    });

    await expect(loadKeelTaskRuntime(cwd, 'T-777')).rejects.toThrow('Invalid keel cloudy model');
  });
});
