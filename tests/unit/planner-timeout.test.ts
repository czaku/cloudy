import { describe, it, expect, vi } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../src/executor/claude-runner.js', () => ({
  runClaude: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  log: { info: vi.fn(), error: vi.fn() },
  initLogger: vi.fn(),
}));

vi.mock('../../src/utils/claude-path.js', () => ({
  findClaudeBinary: vi.fn().mockResolvedValue('/usr/bin/claude'),
}));

function makePlanResponse(tasks: Array<{ id: string; timeoutMinutes?: number }>): string {
  return JSON.stringify({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: `Task ${t.id}`,
      description: 'A task',
      acceptanceCriteria: ['It works'],
      dependencies: [],
      contextPatterns: [],
      ...(t.timeoutMinutes !== undefined ? { timeoutMinutes: t.timeoutMinutes } : {}),
    })),
  });
}

describe('createPlan — per-task timeout', () => {
  it('maps timeoutMinutes to timeout in ms', async () => {
    const { runClaude } = await import('../../src/executor/claude-runner.js');
    const mockRunClaude = runClaude as ReturnType<typeof vi.fn>;

    mockRunClaude.mockResolvedValueOnce({
      success: true,
      output: makePlanResponse([{ id: 'task-1', timeoutMinutes: 30 }]),
      error: undefined,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 1000,
      costUsd: 0.001,
    });

    const { createPlan } = await import('../../src/planner/planner.js');
    const plan = await createPlan('Build something', 'sonnet', '/tmp');

    expect(plan.tasks[0].timeout).toBe(30 * 60_000); // 1_800_000 ms
  });

  it('uses 60 min default when timeoutMinutes is missing', async () => {
    const { runClaude } = await import('../../src/executor/claude-runner.js');
    const mockRunClaude = runClaude as ReturnType<typeof vi.fn>;

    mockRunClaude.mockResolvedValueOnce({
      success: true,
      output: makePlanResponse([{ id: 'task-1' }]),
      error: undefined,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 1000,
      costUsd: 0.001,
    });

    const { createPlan } = await import('../../src/planner/planner.js');
    const plan = await createPlan('Build something', 'sonnet', '/tmp');

    expect(plan.tasks[0].timeout).toBe(60 * 60_000); // 3_600_000 ms
  });

  it('handles different timeoutMinutes per task', async () => {
    const { runClaude } = await import('../../src/executor/claude-runner.js');
    const mockRunClaude = runClaude as ReturnType<typeof vi.fn>;

    mockRunClaude.mockResolvedValueOnce({
      success: true,
      output: makePlanResponse([
        { id: 'task-1', timeoutMinutes: 15 },
        { id: 'task-2', timeoutMinutes: 120 },
        { id: 'task-3' },
      ]),
      error: undefined,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 1000,
      costUsd: 0.001,
    });

    const { createPlan } = await import('../../src/planner/planner.js');
    const plan = await createPlan('Build something', 'sonnet', '/tmp');

    expect(plan.tasks[0].timeout).toBe(15 * 60_000);
    expect(plan.tasks[1].timeout).toBe(60 * 60_000); // capped at 60 min
    expect(plan.tasks[2].timeout).toBe(60 * 60_000); // default
  });
});
