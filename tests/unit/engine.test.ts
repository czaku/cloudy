import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClaudeRunResult } from '../../src/core/types.js';

vi.mock('../../src/executor/model-runner.js', () => ({
  runModel: vi.fn(),
}));

import { runEngine } from '../../src/executor/engine.js';
import { runModel } from '../../src/executor/model-runner.js';

const mockRunModel = vi.mocked(runModel);

const SUCCESS_RESULT: ClaudeRunResult = {
  success: true,
  output: 'done',
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
  durationMs: 1000,
  costUsd: 0.01,
};

describe('runEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunModel.mockResolvedValue(SUCCESS_RESULT);
  });

  it('routes to omnai execution when engine is claude-code', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'claude-code',
      claudeModel: 'sonnet',
      cwd: '/tmp',
    });

    expect(mockRunModel).toHaveBeenCalledOnce();
  });

  it('maps claudeModel to a Claude model ID for claude-code', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'claude-code',
      claudeModel: 'opus',
      cwd: '/tmp',
    });

    expect(mockRunModel).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'claude-opus-4-6' }),
    );
  });

  it('passes cwd, onOutput, abortSignal through to the runner', async () => {
    const onOutput = vi.fn();
    const abortSignal = new AbortController().signal;

    await runEngine({
      prompt: 'hello',
      engine: 'claude-code',
      claudeModel: 'sonnet',
      cwd: '/my/project',
      onOutput,
      abortSignal,
    });

    expect(mockRunModel).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/my/project', onOutput, abortSignal }),
    );
  });

  it('defaults claudeModel to sonnet for claude-code when not specified', async () => {
    await runEngine({ prompt: 'hello', engine: 'claude-code', cwd: '/tmp' });

    expect(mockRunModel).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'claude-sonnet-4-6' }),
    );
  });

  it('passes provider-native settings through for non-claude engines', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'codex',
      provider: 'codex',
      modelId: 'o3',
      cwd: '/tmp',
    });

    expect(mockRunModel).toHaveBeenCalledWith(
      expect.objectContaining({ engine: 'codex', provider: 'codex', modelId: 'o3' }),
    );
  });

  it('returns the result from the underlying runner', async () => {
    const customResult: ClaudeRunResult = { ...SUCCESS_RESULT, output: 'custom output' };
    mockRunModel.mockResolvedValueOnce(customResult);

    const result = await runEngine({ prompt: 'hi', engine: 'claude-code', cwd: '/tmp' });

    expect(result.output).toBe('custom output');
  });
});
