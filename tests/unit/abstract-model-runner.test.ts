import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('omnai', () => ({
  selectViaDaemon: vi.fn(),
}));

import { selectViaDaemon } from 'omnai';
import { rewritePromptForWorktree, runAbstractModel, runOmnai } from '../../src/executor/claude-runner.js';

const mockSelectViaDaemon = vi.mocked(selectViaDaemon);

function makeRunner(engine: string, runImpl?: (prompt: string, opts: unknown) => AsyncGenerator<unknown>) {
  return {
    engine,
    run: runImpl ?? (async function* () {
      yield {
        type: 'result',
        output: 'done',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        durationMs: 1,
      };
    }),
  };
}

describe('abstract model runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes abstract planning models through omnai with claude defaults', async () => {
    const run = vi.fn(async function* (_prompt: string, opts: any) {
      expect(opts.model).toBe('claude-sonnet-4-6');
      expect(opts.hooks).toBeDefined();
      yield {
        type: 'result',
        output: 'planned',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        durationMs: 1,
      };
    });
    mockSelectViaDaemon.mockResolvedValueOnce(makeRunner('claude-code', run as any) as any);

    const result = await runAbstractModel({
      prompt: 'plan this',
      model: 'sonnet',
      cwd: '/tmp',
      taskType: 'planning',
    });

    expect(result.success).toBe(true);
    expect(mockSelectViaDaemon).toHaveBeenCalledWith({
      provider: 'claude',
      engine: 'claude-code',
      taskType: 'planning',
    });
  });

  it('attaches allowed and disallowed tool policies through Claude hooks', async () => {
    const run = vi.fn(async function* (_prompt: string, opts: any) {
      expect(opts.allowedTools).toEqual(['Read', 'Edit']);
      expect(opts.disallowedTools).toEqual(['Bash', 'ToolSearch']);
      expect(opts.hooks?.PreToolUse).toEqual(
        expect.arrayContaining([expect.objectContaining({ matcher: '*' })]),
      );
      yield {
        type: 'result',
        output: 'done',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        durationMs: 1,
      };
    });
    mockSelectViaDaemon.mockResolvedValueOnce(makeRunner('claude-code', run as any) as any);

    const result = await runOmnai({
      prompt: 'do work',
      cwd: '/tmp',
      engine: 'claude-code',
      provider: 'claude',
      taskType: 'coding',
      allowedTools: ['Read', 'Edit'],
      disallowedTools: ['Bash', 'ToolSearch'],
    });

    expect(result.success).toBe(true);
  });

  it('does not attach Claude hooks for non-claude engines', async () => {
    const run = vi.fn(async function* (_prompt: string, opts: any) {
      expect(opts.model).toBe('o3');
      expect(opts.hooks).toBeUndefined();
      yield {
        type: 'result',
        output: 'done',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        durationMs: 1,
      };
    });
    mockSelectViaDaemon.mockResolvedValueOnce(makeRunner('codex', run as any) as any);

    const result = await runOmnai({
      prompt: 'do work',
      cwd: '/tmp',
      engine: 'codex',
      provider: 'codex',
      modelId: 'o3',
      taskType: 'coding',
    });

    expect(result.success).toBe(true);
    expect(mockSelectViaDaemon).toHaveBeenCalledWith({
      provider: 'codex',
      engine: 'codex',
      taskType: 'coding',
    });
  });

  it('rewrites main-repo absolute paths to worktree-local paths for non-hooked engines', async () => {
    const run = vi.fn(async function* (prompt: string, _opts: any) {
      expect(prompt).toContain('cd . && test -f SMOKE_RESULT.md');
      expect(prompt).not.toContain('/tmp/project/SMOKE_RESULT.md');
      yield {
        type: 'result',
        output: 'done',
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: 0,
        durationMs: 1,
      };
    });
    mockSelectViaDaemon.mockResolvedValueOnce(makeRunner('codex', run as any) as any);

    const result = await runOmnai({
      prompt: 'Run `cd /tmp/project && test -f /tmp/project/SMOKE_RESULT.md`.',
      cwd: '/tmp/project/.cloudy/worktrees/task-1',
      engine: 'codex',
      provider: 'codex',
      taskType: 'coding',
    });

    expect(result.success).toBe(true);
  });
});

describe('rewritePromptForWorktree', () => {
  it('leaves prompts untouched outside worktrees', () => {
    expect(rewritePromptForWorktree('cd /tmp/project && pwd', '/tmp/project')).toBe('cd /tmp/project && pwd');
  });

  it('rewrites absolute repo paths inside worktree prompts', () => {
    const rewritten = rewritePromptForWorktree(
      'Check `cd /tmp/project && test -f /tmp/project/SMOKE_RESULT.md`.',
      '/tmp/project/.cloudy/worktrees/task-1',
    );

    expect(rewritten).toBe('Check `cd . && test -f SMOKE_RESULT.md`.');
  });
});
