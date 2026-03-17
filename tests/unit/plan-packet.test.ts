import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../../src/cli/index.js';
import { loadState } from '../../src/core/state.js';

const tempDirs: string[] = [];
let originalCwd = process.cwd();

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-plan-packet-'));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  originalCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('plan command with adjacent task packets', () => {
  it('preserves explicit packet fields and does not rewrite config.json', { timeout: 10000 }, async () => {
    const cwd = await makeTempProject();
    process.chdir(cwd);

    const specPath = path.join(cwd, 'micro-spec.md');
    const graphPath = path.join(cwd, 'micro-spec.tasks.json');
    await fs.writeFile(specPath, '# Packet spec\n', 'utf8');
    await fs.writeFile(
      graphPath,
      JSON.stringify({
        goal: 'Micro packet',
        tasks: [
          {
            id: 'task-1',
            title: 'Implement detail route',
            description: 'Split the detail route and preserve deterministic proof later',
            executionMode: 'implement_ui_surface',
            acceptanceCriteria: [
              'TrainingPlanDetailRoute exists',
            ],
            proofRequirements: [
              'RootNavigation remains unchanged in this slice',
            ],
            nonGoals: [
              'Do not touch screenshot plumbing',
            ],
            surfaceScope: [
              'Google detail route/content split',
            ],
            collisionRisks: [
              'Training-plan detail hierarchy',
            ],
            contextPatterns: [
              'google/app/src/main/kotlin/com/example/TrainingPlanDetailScreen.kt',
            ],
            allowedWritePaths: [
              'google/app/src/main/kotlin/com/example/TrainingPlanDetailScreen.kt',
            ],
            implementationSteps: [
              'Add the route wrapper',
            ],
            timeoutMinutes: 30,
          },
        ],
      }),
      'utf8',
    );

    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const program = createProgram();
    await program.parseAsync(
      ['plan', '--spec', specPath, '--run-name', 'packet-test', '--no-review', '--model', 'sonnet'],
      { from: 'user' },
    );

    const state = await loadState(cwd);
    expect(state?.plan?.tasks[0].executionMode).toBe('implement_ui_surface');
    expect(state?.plan?.tasks[0].proofRequirements).toEqual(['RootNavigation remains unchanged in this slice']);
    expect(state?.plan?.tasks[0].nonGoals).toEqual(['Do not touch screenshot plumbing']);
    expect(state?.plan?.tasks[0].surfaceScope).toEqual(['Google detail route/content split']);
    expect(state?.plan?.tasks[0].collisionRisks).toEqual(['Training-plan detail hierarchy']);

    await expect(fs.access(path.join(cwd, '.cloudy', 'config.json'))).rejects.toThrow();

    stdout.mockRestore();
    stderr.mockRestore();
  });
});
