import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.fn(async () => {});
const logWarn = vi.fn(async () => {});

vi.mock('../../src/utils/logger.js', () => ({
  log: {
    info: logInfo,
    warn: logWarn,
    error: vi.fn(async () => {}),
    debug: vi.fn(async () => {}),
  },
}));

vi.mock('../../src/utils/run-dir.js', () => ({
  getCurrentRunDir: vi.fn(async () => '/tmp/project/.cloudy/runs/run-20260314-fitkind'),
}));

describe('keel integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates keel task state, note, and cloudy run on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');

    await writeRunOutcome(
      { slug: 'fitkind', taskId: 'T-123', port: 7842 },
      { success: true, tasksDone: 4, tasksFailed: 0, costUsd: 1.23, durationMs: 65000 },
      '/tmp/project',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:7842/api/projects/fitkind/tasks/T-123',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'done',
          run_status: 'succeeded',
          cloudy_run: {
            runName: 'run-20260314-fitkind',
            taskId: 'T-123',
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:7842/api/projects/fitkind/tasks/T-123/notes',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Cloudy run run-20260314-fitkind completed successfully.'),
      }),
    );
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Updated fitkind/T-123'));
  });

  it('adds a proposed decision when a run fails', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');

    await writeRunOutcome(
      { slug: 'fitkind', taskId: 'T-123', port: 9000 },
      { success: false, tasksDone: 1, tasksFailed: 2, topError: 'validator exploded', costUsd: 4.56, durationMs: 120000 },
      '/tmp/project',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:9000/api/projects/fitkind/tasks/T-123',
      expect.objectContaining({
        body: JSON.stringify({
          status: 'blocked',
          run_status: 'failed',
          cloudy_run: {
            runName: 'run-20260314-fitkind',
            taskId: 'T-123',
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:9000/api/projects/fitkind/decisions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"title":"Cloudy run blocked T-123"'),
      }),
    );
  });

  it('logs and skips write-back when no keel task id is provided', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');

    await writeRunOutcome(
      { slug: 'fitkind', port: 7842 },
      { success: true, tasksDone: 2, tasksFailed: 0, costUsd: 0.5, durationMs: 5000 },
      '/tmp/project',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('No task id provided'));
  });

  it('logs write-back failures before rethrowing', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'Boom', text: async () => 'bad patch' }));
    vi.stubGlobal('fetch', fetchMock);

    const { writeRunOutcome } = await import('../../src/integrations/keel.js');

    await expect(writeRunOutcome(
      { slug: 'fitkind', taskId: 'T-123', port: 7842 },
      { success: true, tasksDone: 1, tasksFailed: 0, costUsd: 0.25, durationMs: 1000 },
      '/tmp/project',
    )).rejects.toThrow(/500 Boom/);

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Write-back failed for fitkind/T-123'));
  });
});
