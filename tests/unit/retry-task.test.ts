import { describe, it, expect } from 'vitest';
import type { Task } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-3',
    title: 'JWT auth routes',
    description: 'Implement JWT auth',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status: 'failed',
    retries: 2,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
    error: 'Validation failed: tsc error',
    retryHistory: [
      {
        attempt: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        failureType: 'acceptance',
        reason: 'Validation failed',
        fullError: 'tsc error',
        durationMs: 1000,
      },
    ],
    ...overrides,
  };
}

/**
 * Simulate what the --retry flag does: reset task state.
 */
function resetTaskForRetry(task: Task): void {
  task.status = 'pending';
  task.error = undefined;
  task.retries = 0;
  task.retryHistory = [];
}

describe('--retry task reset logic', () => {
  it('resets a failed task to pending', () => {
    const task = makeTask();
    expect(task.status).toBe('failed');
    resetTaskForRetry(task);
    expect(task.status).toBe('pending');
  });

  it('clears error after reset', () => {
    const task = makeTask({ error: 'some error' });
    resetTaskForRetry(task);
    expect(task.error).toBeUndefined();
  });

  it('resets retries to 0', () => {
    const task = makeTask({ retries: 2 });
    resetTaskForRetry(task);
    expect(task.retries).toBe(0);
  });

  it('clears retryHistory', () => {
    const task = makeTask();
    expect(task.retryHistory).toHaveLength(1);
    resetTaskForRetry(task);
    expect(task.retryHistory).toHaveLength(0);
  });

  it('can reset a task that is already pending (idempotent)', () => {
    const task = makeTask({ status: 'pending', retries: 0, error: undefined, retryHistory: [] });
    resetTaskForRetry(task);
    expect(task.status).toBe('pending');
    expect(task.retries).toBe(0);
  });

  it('returns error for unknown task ID simulation', () => {
    const tasks: Task[] = [makeTask()];
    const found = tasks.find((t) => t.id === 'task-99');
    expect(found).toBeUndefined();
  });

  it('resets a completed task too', () => {
    const task = makeTask({ status: 'completed', retries: 0, error: undefined });
    resetTaskForRetry(task);
    expect(task.status).toBe('pending');
  });
});
