import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClaudeRunResult } from '../../src/core/types.js';

// Mock both runners
vi.mock('../../src/executor/claude-runner.js', () => ({
  runClaude: vi.fn(),
}));
vi.mock('../../src/executor/pi-runner.js', () => ({
  runPi: vi.fn(),
}));

import { runEngine } from '../../src/executor/engine.js';
import { runClaude } from '../../src/executor/claude-runner.js';
import { runPi } from '../../src/executor/pi-runner.js';

const mockRunClaude = vi.mocked(runClaude);
const mockRunPi = vi.mocked(runPi);

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
    mockRunClaude.mockResolvedValue(SUCCESS_RESULT);
    mockRunPi.mockResolvedValue(SUCCESS_RESULT);
  });

  it('routes to runClaude when engine is claude-code', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'claude-code',
      claudeModel: 'sonnet',
      cwd: '/tmp',
    });

    expect(mockRunClaude).toHaveBeenCalledOnce();
    expect(mockRunPi).not.toHaveBeenCalled();
  });

  it('routes to runPi when engine is pi-mono', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'pi-mono',
      piMono: { provider: 'openai', model: 'gpt-4o-mini' },
      cwd: '/tmp',
    });

    expect(mockRunPi).toHaveBeenCalledOnce();
    expect(mockRunClaude).not.toHaveBeenCalled();
  });

  it('falls back to runClaude when engine is pi-mono but piMono is undefined', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'pi-mono',
      claudeModel: 'haiku',
      cwd: '/tmp',
    });

    expect(mockRunClaude).toHaveBeenCalledOnce();
    expect(mockRunPi).not.toHaveBeenCalled();
  });

  it('passes claudeModel to runClaude', async () => {
    await runEngine({
      prompt: 'hello',
      engine: 'claude-code',
      claudeModel: 'opus',
      cwd: '/tmp',
    });

    expect(mockRunClaude).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'opus' }),
    );
  });

  it('passes piMono config to runPi', async () => {
    const piMono = { provider: 'google', model: 'gemini-2.0-flash', baseUrl: 'https://example.com' };

    await runEngine({
      prompt: 'hello',
      engine: 'pi-mono',
      piMono,
      cwd: '/tmp',
    });

    expect(mockRunPi).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        model: 'gemini-2.0-flash',
        baseUrl: 'https://example.com',
      }),
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

    expect(mockRunClaude).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/my/project', onOutput, abortSignal }),
    );
  });

  it('defaults claudeModel to sonnet when not specified', async () => {
    await runEngine({ prompt: 'hello', engine: 'claude-code', cwd: '/tmp' });

    expect(mockRunClaude).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'sonnet' }),
    );
  });

  it('returns the result from the underlying runner', async () => {
    const customResult: ClaudeRunResult = { ...SUCCESS_RESULT, output: 'custom output' };
    mockRunClaude.mockResolvedValueOnce(customResult);

    const result = await runEngine({ prompt: 'hi', engine: 'claude-code', cwd: '/tmp' });

    expect(result.output).toBe('custom output');
  });
});
