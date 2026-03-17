import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const logInfo = vi.fn(async () => {});
const logWarn = vi.fn(async () => {});
let mockedRunDir = '/tmp/project/.cloudy/runs/run-20260314-demo-project';

vi.mock('../../src/utils/logger.js', () => ({
  log: {
    info: logInfo,
    warn: logWarn,
    error: vi.fn(async () => {}),
    debug: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/run-dir.js', () => ({
  getCurrentRunDir: vi.fn(async () => mockedRunDir),
}));

describe('keel integration', () => {
  let projectDir = '/tmp/project';
  let runDir = mockedRunDir;

  beforeEach(() => {
    vi.clearAllMocks();
    projectDir = '';
    runDir = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function prepareRunDir(): Promise<void> {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-keel-unit-'));
    runDir = path.join(projectDir, '.cloudy', 'runs', 'run-20260314-demo-project');
    mockedRunDir = runDir;
    await fs.mkdir(runDir, { recursive: true });
  }

  it('updates keel task state, note, and cloudy run on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');

    await prepareRunDir();
    await fs.writeFile(
      path.join(runDir, 'review.json'),
      JSON.stringify({ verdict: 'PASS_WITH_NOTES', issues: [{ severity: 'major', description: 'Needs one more acceptance pass' }] }),
      'utf-8',
    );
    await fs.writeFile(
      path.join(runDir, 'verification.json'),
      JSON.stringify({ checks: [{ command: 'bun run test', passed: true }, { command: 'bun run build', passed: false }] }),
      'utf-8',
    );

    await writeRunOutcome(
      { slug: 'demo-project', taskId: 'T-123', port: 7842 },
      { success: true, tasksDone: 4, tasksFailed: 0, costUsd: 1.23, durationMs: 65000, filesTouched: ['src/foo.ts'], artifactsProduced: ['docs/proof.md'] },
      projectDir,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:7842/api/projects/demo-project/tasks/T-123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'done',
          run_status: 'succeeded',
          cloudy_run: {
            runName: 'run-20260314-demo-project',
            taskId: 'T-123',
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7842/api/projects/demo-project/tasks/T-123/notes',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Quality verdict: yellow'),
      }),
    );
    const assessment = JSON.parse(await fs.readFile(path.join(runDir, 'assessment.json'), 'utf-8'));
    expect(assessment.acceptanceStatus).toBe('needs_review');
    expect(assessment.checksPassed).toContain('bun run test');
    expect(assessment.checksFailed).toContain('bun run build');
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Updated demo-project/T-123'));
  });

  it('updates the task and adds a note when a run fails without creating a decision draft', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');
    await prepareRunDir();

    await writeRunOutcome(
      { slug: 'demo-project', taskId: 'T-123', port: 9000 },
      { success: false, tasksDone: 1, tasksFailed: 2, topError: 'validator exploded', costUsd: 4.56, durationMs: 120000 },
      projectDir,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:9000/api/projects/demo-project/tasks/T-123',
      expect.objectContaining({
        body: JSON.stringify({
          status: 'blocked',
          run_status: 'failed',
          cloudy_run: {
            runName: 'run-20260314-demo-project',
            taskId: 'T-123',
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:9000/api/projects/demo-project/tasks/T-123/notes',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Acceptance status: blocked'),
      }),
    );
  });

  it('logs and skips write-back when no keel task id is provided', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');
    await prepareRunDir();

    await writeRunOutcome(
      { slug: 'demo-project', port: 7842 },
      { success: true, tasksDone: 2, tasksFailed: 0, costUsd: 0.5, durationMs: 5000 },
      projectDir,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('No task id provided'));
  });

  it('logs write-back failures before rethrowing', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'Boom', text: async () => 'bad patch' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');
    await prepareRunDir();

    await expect(writeRunOutcome(
      { slug: 'demo-project', taskId: 'T-123', port: 7842 },
      { success: true, tasksDone: 1, tasksFailed: 0, costUsd: 0.25, durationMs: 1000 },
      projectDir,
    )).rejects.toThrow(/500 Boom/);

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Write-back failed for demo-project/T-123'));
  });
});
