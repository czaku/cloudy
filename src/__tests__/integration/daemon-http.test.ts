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

// ── Imports after mocks ───────────────────────────────────────────────────────

import { startDaemonServer } from '../../daemon/server.js';
import { listProjects, addProject, removeProject, findProject } from '../../daemon/registry.js';
import { detectSpecFiles, scanClaudeCodeSessions } from '../../daemon/scanner.js';

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
