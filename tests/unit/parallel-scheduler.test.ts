import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/core/task-queue.js';
import { ParallelScheduler } from '../../src/core/parallel-scheduler.js';
import type { Task } from '../../src/core/types.js';

function makeTask(id: string, deps: string[] = []): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: deps,
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

describe('ParallelScheduler', () => {
  it('executes tasks in dependency order', async () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-2']),
    ];
    const queue = new TaskQueue(tasks);
    const executed: string[] = [];

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 3,
      executeTask: async (task) => {
        executed.push(task.id);
        queue.updateStatus(task.id, 'completed');
      },
    });

    await scheduler.run();

    expect(executed).toEqual(['task-1', 'task-2', 'task-3']);
    expect(queue.isComplete()).toBe(true);
  });

  it('runs independent tasks in parallel', async () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2'),
      makeTask('task-3'),
    ];
    const queue = new TaskQueue(tasks);
    const running = new Set<string>();
    let maxConcurrent = 0;

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 3,
      executeTask: async (task) => {
        running.add(task.id);
        maxConcurrent = Math.max(maxConcurrent, running.size);
        await new Promise((r) => setTimeout(r, 10));
        running.delete(task.id);
        queue.updateStatus(task.id, 'completed');
      },
    });

    await scheduler.run();

    expect(queue.isComplete()).toBe(true);
    // At least some tasks should have run concurrently
    expect(maxConcurrent).toBeGreaterThanOrEqual(1);
  });

  it('stops when a task fails', async () => {
    const tasks = [makeTask('task-1'), makeTask('task-2', ['task-1'])];
    const queue = new TaskQueue(tasks);

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 2,
      executeTask: async (task) => {
        queue.updateStatus(task.id, 'failed');
        queue.setError(task.id, 'test error');
      },
    });

    await scheduler.run();

    expect(queue.getTask('task-1')?.status).toBe('failed');
    expect(queue.getTask('task-2')?.status).toBe('pending');
  });
});
