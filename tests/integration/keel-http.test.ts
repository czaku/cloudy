import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
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

interface CapturedRequest {
  method: string
  url: string
  body: string
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

async function startRecorder(): Promise<{ server: Server; port: number; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readBody(req)
    requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      body,
    })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind recorder server')
  }

  return { server, port: address.port, requests }
}

describe('keel integration over HTTP', () => {
  let server: Server | undefined

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      server = undefined
    }
  })

  it('writes blocked outcomes through the real HTTP path', async () => {
    const recorder = await startRecorder()
    server = recorder.server

    const { writeRunOutcome } = await import('../../src/integrations/keel.js')

    await writeRunOutcome(
      { slug: 'fitkind', taskId: 'T-123', port: recorder.port },
      {
        success: false,
        tasksDone: 2,
        tasksFailed: 1,
        topError: 'validator exploded',
        costUsd: 3.21,
        durationMs: 91000,
      },
      '/tmp/project',
    )

    expect(recorder.requests).toHaveLength(3)

    expect(recorder.requests[0]).toMatchObject({
      method: 'PATCH',
      url: '/api/projects/fitkind/tasks/T-123',
    })
    expect(JSON.parse(recorder.requests[0].body)).toEqual({
      status: 'blocked',
      run_status: 'failed',
      cloudy_run: {
        runName: 'run-20260314-fitkind',
        taskId: 'T-123',
      },
    })

    expect(recorder.requests[1]).toMatchObject({
      method: 'POST',
      url: '/api/projects/fitkind/tasks/T-123/notes',
    })
    expect(JSON.parse(recorder.requests[1].body)).toMatchObject({
      by: 'cloudy',
      text: expect.stringContaining('Cloudy run run-20260314-fitkind failed.'),
    })

    expect(recorder.requests[2]).toMatchObject({
      method: 'POST',
      url: '/api/projects/fitkind/decisions',
    })
    expect(JSON.parse(recorder.requests[2].body)).toMatchObject({
      title: 'Cloudy run blocked T-123',
      status: 'proposed',
      affects: ['T-123'],
      outcome: expect.stringContaining('Investigate the failed cloudy run'),
    })

    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('Updated fitkind/T-123'))
    expect(logWarn).not.toHaveBeenCalled()
  })
})
