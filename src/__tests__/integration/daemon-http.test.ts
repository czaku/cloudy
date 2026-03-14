/**
 * Lightweight HTTP integration tests for the daemon server.
 *
 * Strategy:
 * - Start a real http.Server on port 0 (OS assigns a free port)
 * - Mock the registry (listProjects / addProject / removeProject / findProject)
 *   so tests are isolated from ~/.cloudy/projects.json
 * - Mock detectSpecFiles to return controlled data
 * - Make real fetch() calls and assert JSON responses
 * - Close the server after each test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type http from 'node:http';

const {
  stopFed,
  stopBrowsing,
  spawnMock,
  execFileMock,
  childProcesses,
  childControl,
  selectViaDaemonMock,
  loadConfigMock,
} = vi.hoisted(() => ({
  stopFed: vi.fn(),
  stopBrowsing: vi.fn(),
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
  childProcesses: [] as Array<{ emit: (event: string, ...args: unknown[]) => boolean }>,
  childControl: { autoExit: true },
  selectViaDaemonMock: vi.fn(),
  loadConfigMock: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../daemon/registry.js', () => ({
  listProjects: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  findProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock('../../daemon/scanner.js', () => ({
  detectSpecFiles: vi.fn(),
  scanClaudeCodeSessions: vi.fn(),
  loadClaudeCodeMessages: vi.fn(),
  computeSessionStats: vi.fn(),
}));

vi.mock('../../config/config.js', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('@vykeai/fed', () => ({
  registerTool: vi.fn(async () => stopFed),
  discoverTools: vi.fn(() => stopBrowsing),
}));

vi.mock('omnai', () => ({
  selectViaDaemon: selectViaDaemonMock,
}));

vi.mock('node:child_process', () => {
  class MiniEmitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    on(event: string, listener: (...args: unknown[]) => void) {
      const existing = this.listeners.get(event) ?? [];
      existing.push(listener);
      this.listeners.set(event, existing);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    }
  }

  class MockStream extends MiniEmitter {
    write(_chunk: unknown) {
      return true;
    }
  }

  class MockChildProcess extends MiniEmitter {
    stdout = new MockStream();
    stderr = new MockStream();
    stdin = new MockStream();
    pid = 12345;
    killed = false;

    kill() {
      if (this.killed) return true;
      this.killed = true;
      queueMicrotask(() => this.emit('exit', 0));
      return true;
    }
  }

  return {
    spawn: vi.fn((...args: unknown[]) => {
      const child = new MockChildProcess();
      childProcesses.push(child);
      spawnMock(...args);
      if (childControl.autoExit) {
        queueMicrotask(() => child.emit('exit', 0));
      }
      return child;
    }),
    execFile: vi.fn((...args: unknown[]) => {
      execFileMock(...args);
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null, '', ''));
      }
    }),
  };
});

// ── Imports after mocks ───────────────────────────────────────────────────────

import { startDaemonServer } from '../../daemon/server.js';
import { listProjects, addProject, removeProject, findProject } from '../../daemon/registry.js';
import { detectSpecFiles, scanClaudeCodeSessions } from '../../daemon/scanner.js';
import { registerTool, discoverTools } from '@vykeai/fed';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProject(overrides?: object) {
  return {
    id: 'test-project',
    name: 'Test Project',
    path: '/fake/test-project',
    registeredAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function startServer(): Promise<{ server: http.Server; base: string }> {
  const server = await startDaemonServer(0, '/nonexistent/bundle/dir');
  const addr = server.address() as { port: number };
  return { server, base: `http://127.0.0.1:${addr.port}` };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(base: string, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(base: string, path: string, data: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function del(base: string, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`, { method: 'DELETE' });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let server: http.Server;
let base: string;

beforeEach(async () => {
  vi.clearAllMocks();

  // Default: empty registry
  vi.mocked(listProjects).mockResolvedValue([]);
  vi.mocked(addProject).mockResolvedValue(undefined);
  vi.mocked(removeProject).mockResolvedValue(undefined);
  vi.mocked(findProject).mockResolvedValue(undefined);
  vi.mocked(detectSpecFiles).mockResolvedValue([]);
  vi.mocked(scanClaudeCodeSessions).mockResolvedValue([]);
  spawnMock.mockReset();
  execFileMock.mockReset();
  selectViaDaemonMock.mockReset();
  loadConfigMock.mockReset();
  selectViaDaemonMock.mockResolvedValue({ engine: 'codex' });
  loadConfigMock.mockResolvedValue({
    engine: 'claude-code',
    provider: 'claude',
    planningRuntime: {},
    validationRuntime: {},
    reviewRuntime: {},
  });
  childProcesses.length = 0;
  childControl.autoExit = true;

  ({ server, base } = await startServer());
});

afterEach(async () => {
  await closeServer(server);
});

// ── GET /api/projects ─────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  it('returns empty array when no projects registered', async () => {
    const { status, body } = await get(base, '/api/projects');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns project snapshots for registered projects', async () => {
    vi.mocked(listProjects).mockResolvedValue([makeProject()]);

    const { status, body } = await get(base, '/api/projects');
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('test-project');
    expect(body[0].name).toBe('Test Project');
  });

  it('includes status field in each snapshot', async () => {
    vi.mocked(listProjects).mockResolvedValue([makeProject()]);

    const { body } = await get(base, '/api/projects');
    expect(body[0]).toHaveProperty('status');
    expect(['idle', 'running', 'completed', 'failed']).toContain(body[0].status);
  });

  it('includes activeProcess field in each snapshot', async () => {
    vi.mocked(listProjects).mockResolvedValue([makeProject()]);

    const { body } = await get(base, '/api/projects');
    expect(body[0]).toHaveProperty('activeProcess');
  });
});

// ── POST /api/projects/register ───────────────────────────────────────────────

describe('POST /api/projects/register', () => {
  it('registers a new project and returns ok', async () => {
    const { status, body } = await post(base, '/api/projects/register', {
      id: 'my-project',
      name: 'My Project',
      path: '/home/user/dev/my-project',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(addProject)).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'my-project',
        name: 'My Project',
        path: '/home/user/dev/my-project',
      }),
    );
  });

  it('returns 400 when id is missing', async () => {
    const { status, body } = await post(base, '/api/projects/register', {
      name: 'My Project',
      path: '/some/path',
    });

    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(vi.mocked(addProject)).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const { status, body } = await post(base, '/api/projects/register', {
      id: 'my-project',
      path: '/some/path',
    });

    expect(status).toBe(400);
    expect(vi.mocked(addProject)).not.toHaveBeenCalled();
  });

  it('returns 400 when path is missing', async () => {
    const { status, body } = await post(base, '/api/projects/register', {
      id: 'my-project',
      name: 'My Project',
    });

    expect(status).toBe(400);
    expect(vi.mocked(addProject)).not.toHaveBeenCalled();
  });

  it('includes registeredAt timestamp', async () => {
    await post(base, '/api/projects/register', {
      id: 'ts-project',
      name: 'TS Project',
      path: '/some/path',
    });

    const call = vi.mocked(addProject).mock.calls[0][0];
    expect(call.registeredAt).toBeTruthy();
    expect(() => new Date(call.registeredAt)).not.toThrow();
  });
});

// ── GET /api/projects/:id ─────────────────────────────────────────────────────

describe('GET /api/projects/:id', () => {
  it('returns project snapshot for known id', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await get(base, '/api/projects/test-project');
    expect(status).toBe(200);
    expect(body.id).toBe('test-project');
  });

  it('returns 404 for unknown project id', async () => {
    vi.mocked(findProject).mockResolvedValue(undefined);

    const { status } = await get(base, '/api/projects/nonexistent');
    expect(status).toBe(404);
  });
});

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────

describe('DELETE /api/projects/:id', () => {
  it('removes project and returns ok', async () => {
    const { status, body } = await del(base, '/api/projects/test-project');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(vi.mocked(removeProject)).toHaveBeenCalledWith('test-project');
  });
});

// ── GET /api/projects/:id/specs ───────────────────────────────────────────────

describe('GET /api/projects/:id/specs', () => {
  it('returns spec files for a known project', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    vi.mocked(detectSpecFiles).mockResolvedValue([
      {
        path: '/fake/test-project/SPEC.md',
        relativePath: 'SPEC.md',
        title: 'My Spec',
        headings: ['Goals', 'Tasks'],
        sizeBytes: 1024,
      },
    ]);

    const { status, body } = await get(base, '/api/projects/test-project/specs');
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('My Spec');
    expect(body[0].relativePath).toBe('SPEC.md');
  });

  it('returns 404 when project does not exist', async () => {
    vi.mocked(findProject).mockResolvedValue(undefined);

    const { status } = await get(base, '/api/projects/ghost/specs');
    expect(status).toBe(404);
  });

  it('returns empty array when no spec files found', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    vi.mocked(detectSpecFiles).mockResolvedValue([]);

    const { status, body } = await get(base, '/api/projects/test-project/specs');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ── GET /api/projects/:id/runs ────────────────────────────────────────────────

describe('GET /api/projects/:id/runs', () => {
  it('returns empty array when no runs exist', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await get(base, '/api/projects/test-project/runs');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns 404 when project does not exist', async () => {
    vi.mocked(findProject).mockResolvedValue(undefined);

    const { status } = await get(base, '/api/projects/ghost/runs');
    expect(status).toBe(404);
  });
});

// ── GET /api/projects/:id/state ───────────────────────────────────────────────

describe('GET /api/projects/:id/state', () => {
  it('returns empty object when no state file exists', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await get(base, '/api/projects/test-project/state');
    expect(status).toBe(200);
    expect(body).toEqual({});
  });

  it('returns 404 when project does not exist', async () => {
    vi.mocked(findProject).mockResolvedValue(undefined);

    const { status } = await get(base, '/api/projects/ghost/state');
    expect(status).toBe(404);
  });
});

describe('GET /api/projects/:id/config', () => {
  it('returns effective project config for a known project', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'codex',
      provider: 'codex',
      executionModelId: 'o3',
      planningRuntime: { engine: 'claude-code', provider: 'claude', modelId: 'claude-sonnet-4-6' },
      validationRuntime: { engine: 'pi-mono', provider: 'openai', modelId: 'gpt-5-mini' },
      reviewRuntime: { engine: 'codex', provider: 'codex', modelId: 'codex-mini' },
    });

    const { status, body } = await get(base, '/api/projects/test-project/config');
    expect(status).toBe(200);
    expect(body.engine).toBe('codex');
    expect(body.provider).toBe('codex');
    expect(body.executionModelId).toBe('o3');
    expect(body.planningRuntime.engine).toBe('claude-code');
  });

  it('returns 404 when project does not exist', async () => {
    vi.mocked(findProject).mockResolvedValue(undefined);

    const { status } = await get(base, '/api/projects/ghost/config');
    expect(status).toBe(404);
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────

describe('CORS preflight', () => {
  it('OPTIONS returns 204 with CORS headers', async () => {
    const res = await fetch(`${base}/api/projects`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
  });
});

describe('fed lifecycle', () => {
  it('stops fed registration and discovery when the daemon server closes', async () => {
    vi.clearAllMocks();
    const local = await startServer();
    await closeServer(local.server);

    expect(vi.mocked(registerTool)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(discoverTools)).toHaveBeenCalledTimes(1);
    expect(stopFed).toHaveBeenCalledTimes(1);
    expect(stopBrowsing).toHaveBeenCalledTimes(1);
  });
});

describe('runtime routing via daemon HTTP', () => {
  it('forwards planning runtime fields from POST /plan into spawned CLI args', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await post(base, '/api/projects/test-project/plan', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      model: 'sonnet',
      planningEngine: 'codex',
      planningProvider: 'codex',
      planningModelId: 'codex-mini',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [, argv] = spawnMock.mock.calls[0] as [string, string[]];
    expect(argv).toContain('plan');
    expect(argv).toContain('--planning-engine');
    expect(argv).toContain('codex');
    expect(argv).toContain('--planning-provider');
    expect(argv).toContain('--planning-model-id');
    expect(argv).toContain('codex-mini');
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'planning',
    });
  });

  it('preflights planning runtime from project config defaults when the request omits overrides', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'claude-code',
      provider: 'claude',
      planningRuntime: {
        engine: 'codex',
        provider: 'codex',
      },
      validationRuntime: {},
      reviewRuntime: {},
    });

    const { status, body } = await post(base, '/api/projects/test-project/plan', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      model: 'sonnet',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'planning',
    });
  });

  it('forwards execution, validation, and review runtime fields from POST /run into spawned CLI args', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await post(base, '/api/projects/test-project/run', {
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      engine: 'codex',
      provider: 'codex',
      executionModelId: 'o3',
      validationEngine: 'claude-code',
      validationProvider: 'claude',
      validationModelId: 'claude-sonnet-4-6',
      reviewEngine: 'openai',
      reviewProvider: 'openai',
      reviewModelId: 'gpt-5',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [, argv] = spawnMock.mock.calls[0] as [string, string[]];
    expect(argv).toContain('run');
    expect(argv).toContain('--engine');
    expect(argv).toContain('codex');
    expect(argv).toContain('--provider');
    expect(argv).toContain('--execution-model-id');
    expect(argv).toContain('o3');
    expect(argv).toContain('--validation-engine');
    expect(argv).toContain('claude-code');
    expect(argv).toContain('--validation-provider');
    expect(argv).toContain('claude');
    expect(argv).toContain('--validation-model-id');
    expect(argv).toContain('claude-sonnet-4-6');
    expect(argv).toContain('--review-engine');
    expect(argv).toContain('openai');
    expect(argv).toContain('--review-provider');
    expect(argv).toContain('--review-model-id');
    expect(argv).toContain('gpt-5');
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'claude-code',
      provider: 'claude',
      taskType: 'review',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'openai',
      provider: 'openai',
      taskType: 'review',
    });
  });

  it('preflights execution, validation, and review runtimes from project config defaults when the request omits overrides', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'codex',
      provider: 'codex',
      planningRuntime: {},
      validationRuntime: {
        engine: 'claude-code',
        provider: 'claude',
      },
      reviewRuntime: {
        engine: 'openai',
        provider: 'openai',
      },
    });

    const { status, body } = await post(base, '/api/projects/test-project/run', {
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'claude-code',
      provider: 'claude',
      taskType: 'review',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'openai',
      provider: 'openai',
      taskType: 'review',
    });
  });

  it('forwards runtime fields from POST /retry into spawned CLI args', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await post(base, '/api/projects/test-project/retry', {
      taskId: 'task-7',
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      engine: 'codex',
      provider: 'codex',
      executionModelId: 'o3',
      validationEngine: 'claude-code',
      validationProvider: 'claude',
      validationModelId: 'claude-sonnet-4-6',
      reviewEngine: 'pi-mono',
      reviewProvider: 'openai',
      reviewModelId: 'gpt-5',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [, argv] = spawnMock.mock.calls[0] as [string, string[]];
    expect(argv).toContain('run');
    expect(argv).toContain('--retry');
    expect(argv).toContain('task-7');
    expect(argv).toContain('--engine');
    expect(argv).toContain('codex');
    expect(argv).toContain('--validation-engine');
    expect(argv).toContain('claude-code');
    expect(argv).toContain('--review-engine');
    expect(argv).toContain('pi-mono');
  });

  it('preflights retry runtimes from project config defaults when the request omits overrides', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'codex',
      provider: 'codex',
      planningRuntime: {},
      validationRuntime: {
        engine: 'claude-code',
        provider: 'claude',
      },
      reviewRuntime: {
        engine: 'openai',
        provider: 'openai',
      },
    });

    const { status, body } = await post(base, '/api/projects/test-project/retry', {
      taskId: 'task-7',
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'claude-code',
      provider: 'claude',
      taskType: 'review',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'openai',
      provider: 'openai',
      taskType: 'review',
    });
  });

  it('forwards planning, validation, and review runtime fields from POST /chain into spawned CLI args', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());

    const { status, body } = await post(base, '/api/projects/test-project/chain', {
      specPaths: ['/fake/test-project/specs/auth.md', '/fake/test-project/specs/payments.md'],
      executionModel: 'sonnet',
      planningModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      planningEngine: 'codex',
      planningProvider: 'codex',
      planningModelId: 'o3-mini',
      validationEngine: 'claude-code',
      validationProvider: 'claude',
      validationModelId: 'claude-sonnet-4-6',
      reviewEngine: 'pi-mono',
      reviewProvider: 'openai',
      reviewModelId: 'gpt-5',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const [, argv] = spawnMock.mock.calls[0] as [string, string[]];
    expect(argv).toContain('chain');
    expect(argv).toContain('--planning-engine');
    expect(argv).toContain('codex');
    expect(argv).toContain('--planning-provider');
    expect(argv).toContain('--planning-model-id');
    expect(argv).toContain('o3-mini');
    expect(argv).toContain('--validation-engine');
    expect(argv).toContain('claude-code');
    expect(argv).toContain('--review-engine');
    expect(argv).toContain('pi-mono');
  });

  it('preflights chain runtimes from project config defaults when the request omits overrides', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'claude-code',
      provider: 'claude',
      planningRuntime: {
        engine: 'codex',
        provider: 'codex',
      },
      validationRuntime: {
        engine: 'claude-code',
        provider: 'claude',
      },
      reviewRuntime: {
        engine: 'openai',
        provider: 'openai',
      },
    });

    const { status, body } = await post(base, '/api/projects/test-project/chain', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      executionModel: 'sonnet',
      planningModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'codex',
      provider: 'codex',
      taskType: 'planning',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'claude-code',
      provider: 'claude',
      taskType: 'review',
    });
    expect(selectViaDaemonMock).toHaveBeenCalledWith({
      engine: 'openai',
      provider: 'openai',
      taskType: 'review',
    });
  });

  it('returns 400 and does not spawn when planning runtime preflight fails', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    selectViaDaemonMock.mockRejectedValueOnce(new Error('codex not found'));

    const { status, body } = await post(base, '/api/projects/test-project/plan', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      planningEngine: 'codex',
      planningProvider: 'codex',
    });

    expect(status).toBe(400);
    expect(body.error).toContain('codex not found');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 400 and does not spawn when project config planning runtime preflight fails', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    loadConfigMock.mockResolvedValue({
      engine: 'claude-code',
      provider: 'claude',
      planningRuntime: {
        engine: 'codex',
        provider: 'codex',
      },
      validationRuntime: {},
      reviewRuntime: {},
    });
    selectViaDaemonMock.mockRejectedValueOnce(new Error('codex not found'));

    const { status, body } = await post(base, '/api/projects/test-project/plan', {
      specPaths: ['/fake/test-project/specs/auth.md'],
    });

    expect(status).toBe(400);
    expect(body.error).toContain('codex not found');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 400 and does not spawn when run runtime preflight fails', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    selectViaDaemonMock.mockRejectedValueOnce(new Error('provider unavailable'));

    const { status, body } = await post(base, '/api/projects/test-project/run', {
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      engine: 'codex',
      provider: 'codex',
    });

    expect(status).toBe(400);
    expect(body.error).toContain('provider unavailable');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 400 and does not spawn when retry runtime preflight fails', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    selectViaDaemonMock.mockRejectedValueOnce(new Error('provider unavailable'));

    const { status, body } = await post(base, '/api/projects/test-project/retry', {
      taskId: 'task-7',
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      engine: 'codex',
      provider: 'codex',
    });

    expect(status).toBe(400);
    expect(body.error).toContain('provider unavailable');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 400 and does not spawn when chain runtime preflight fails', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    selectViaDaemonMock.mockRejectedValueOnce(new Error('planning provider unavailable'));

    const { status, body } = await post(base, '/api/projects/test-project/chain', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      executionModel: 'sonnet',
      planningModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      planningEngine: 'codex',
      planningProvider: 'codex',
    });

    expect(status).toBe(400);
    expect(body.error).toContain('planning provider unavailable');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('tracks activeProcess through planning and run lifecycle in a single daemon flow', async () => {
    vi.mocked(findProject).mockResolvedValue(makeProject());
    vi.mocked(listProjects).mockResolvedValue([makeProject()]);
    childControl.autoExit = false;

    const planRes = await post(base, '/api/projects/test-project/plan', {
      specPaths: ['/fake/test-project/specs/auth.md'],
      model: 'sonnet',
      planningEngine: 'codex',
    });
    expect(planRes.status).toBe(200);
    expect(planRes.body.started).toBe(true);
    expect(childProcesses).toHaveLength(1);

    await waitFor(async () => {
      const snapshot = await get(base, '/api/projects/test-project');
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.activeProcess).toBe('init');
      expect(snapshot.body.status).toBe('running');
    });

    childProcesses[0].emit('exit', 0);

    await waitFor(async () => {
      const snapshot = await get(base, '/api/projects/test-project');
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.activeProcess).toBeNull();
    });

    const runRes = await post(base, '/api/projects/test-project/run', {
      executionModel: 'sonnet',
      taskReviewModel: 'haiku',
      runReviewModel: 'sonnet',
      engine: 'codex',
      provider: 'codex',
    });
    expect(runRes.status).toBe(200);
    expect(runRes.body.started).toBe(true);
    expect(childProcesses).toHaveLength(2);

    await waitFor(async () => {
      const snapshot = await get(base, '/api/projects/test-project');
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.activeProcess).toBe('run');
      expect(snapshot.body.status).toBe('running');
    });

    childProcesses[1].emit('exit', 0);

    await waitFor(async () => {
      const snapshot = await get(base, '/api/projects/test-project');
      expect(snapshot.status).toBe(200);
      expect(snapshot.body.activeProcess).toBeNull();
    });
  });
});

// ── Dashboard root ────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns HTML with a root div', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });
});

// ── 404 handling ──────────────────────────────────────────────────────────────

describe('unknown routes', () => {
  it('returns 404 for an unknown path', async () => {
    const { status } = await get(base, '/api/does-not-exist');
    expect(status).toBe(404);
  });

  it('returns 404 for a deeply nested unknown path', async () => {
    const { status } = await get(base, '/api/projects/foo/bar/baz/qux');
    expect(status).toBe(404);
  });
});

// ── Content-Type ──────────────────────────────────────────────────────────────

describe('response headers', () => {
  it('JSON endpoints return application/json content-type', async () => {
    const res = await fetch(`${base}/api/projects`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
