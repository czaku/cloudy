import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock execa before any imports
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { runPi } from '../../src/executor/pi-runner.js';

const mockExeca = vi.mocked(execa);

function makeProc(overrides: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  stdoutLines?: string[];
}) {
  const lines = overrides.stdoutLines ?? (overrides.stdout ? [overrides.stdout] : []);
  const mockProc = {
    exitCode: overrides.exitCode ?? 0,
    stdout: {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data') {
          for (const line of lines) {
            cb(Buffer.from(line));
          }
        }
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (chunk: Buffer) => void) => {
        if (event === 'data' && overrides.stderr) {
          cb(Buffer.from(overrides.stderr));
        }
      }),
    },
    then: (resolve: (v: { exitCode: number; stderr: string }) => void) => {
      resolve({ exitCode: overrides.exitCode ?? 0, stderr: overrides.stderr ?? '' });
      return mockProc;
    },
    catch: () => mockProc,
    finally: () => mockProc,
  } as unknown as ReturnType<typeof execa>;

  return mockProc;
}

// Pass an explicit piPath so findPiBinary returns immediately without calling execa('which',...)
const PI_PATH = '/mock/bin/pi';

describe('runPi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns pi with provider and model flags', async () => {
    mockExeca.mockReturnValueOnce(makeProc({ stdout: '{"type":"result","content":"done"}' }));

    await runPi({ prompt: 'hello', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toContain('--provider');
    expect(args).toContain('openai');
    expect(args).toContain('--model');
    expect(args).toContain('gpt-4o-mini');
    expect(args).toContain('--output-format');
    expect(args).toContain('json');
  });

  it('includes --base-url when provided', async () => {
    mockExeca.mockReturnValueOnce(makeProc({ stdout: '' }));

    await runPi({
      prompt: 'test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      piPath: PI_PATH,
      baseUrl: 'https://api.moonshot.cn/v1',
      cwd: '/tmp',
    });

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toContain('--base-url');
    expect(args).toContain('https://api.moonshot.cn/v1');
  });

  it('omits --base-url when not provided', async () => {
    mockExeca.mockReturnValueOnce(makeProc({ stdout: '' }));

    await runPi({ prompt: 'test', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', piPath: PI_PATH, cwd: '/tmp' });

    const [, args] = mockExeca.mock.calls[0];
    expect(args).not.toContain('--base-url');
  });

  it('parses text event and returns output', async () => {
    const line = JSON.stringify({ type: 'text', content: 'Hello from pi' });
    mockExeca.mockReturnValueOnce(makeProc({ stdout: line }));

    const result = await runPi({ prompt: 'hi', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('Hello from pi');
  });

  it('prefers result event content over text events', async () => {
    const lines = [
      JSON.stringify({ type: 'text', content: 'intermediate' }),
      JSON.stringify({ type: 'result', content: 'final answer', total_cost_usd: 0.002 }),
    ].join('\n');
    mockExeca.mockReturnValueOnce(makeProc({ stdout: lines }));

    const result = await runPi({ prompt: 'hi', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    expect(result.output).toBe('final answer');
    expect(result.costUsd).toBe(0.002);
  });

  it('extracts usage tokens when present', async () => {
    const line = JSON.stringify({
      type: 'result',
      content: 'done',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    mockExeca.mockReturnValueOnce(makeProc({ stdout: line }));

    const result = await runPi({ prompt: 'hi', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
  });

  it('returns success=false when process exits with non-zero', async () => {
    mockExeca.mockReturnValueOnce(makeProc({ exitCode: 1, stderr: 'rate limit exceeded' }));

    const result = await runPi({ prompt: 'hi', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('rate limit exceeded');
  });

  it('calls onOutput callback for each stdout chunk', async () => {
    const lines = [
      JSON.stringify({ type: 'text', content: 'chunk1' }),
      JSON.stringify({ type: 'text', content: 'chunk2' }),
    ];
    mockExeca.mockReturnValueOnce(makeProc({ stdoutLines: lines }));

    const received: string[] = [];
    await runPi({
      prompt: 'hi',
      provider: 'openai',
      model: 'gpt-4o-mini',
      piPath: PI_PATH,
      cwd: '/tmp',
      onOutput: (text) => received.push(text),
    });

    expect(received.length).toBeGreaterThan(0);
  });

  it('handles non-JSON lines gracefully', async () => {
    const raw = 'plain text line\n' + JSON.stringify({ type: 'result', content: 'done' });
    mockExeca.mockReturnValueOnce(makeProc({ stdout: raw }));

    const result = await runPi({ prompt: 'hi', provider: 'openai', model: 'gpt-4o-mini', piPath: PI_PATH, cwd: '/tmp' });

    expect(result.success).toBe(true);
    expect(result.output).toBeTruthy();
  });
});
