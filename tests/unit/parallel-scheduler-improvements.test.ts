import { describe, it, expect, vi } from 'vitest';
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
    maxRetries: 1,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

describe('ParallelScheduler — event-driven scheduling (no polling)', () => {
  it('completes without polling delay', async () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const queue = new TaskQueue(tasks);
    const order: string[] = [];
    const start = Date.now();

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 3,
      executeTask: async (task) => {
        order.push(task.id);
        queue.updateStatus(task.id, 'completed');
      },
    });

    await scheduler.run();

    const elapsed = Date.now() - start;
    expect(queue.isComplete()).toBe(true);
    expect(order.sort()).toEqual(['a', 'b', 'c']);
    // Should finish well under 100ms (old polling would take at least 100ms per step)
    expect(elapsed).toBeLessThan(200);
  });

  it('respects dependency ordering without polling', async () => {
    const tasks = [makeTask('a'), makeTask('b', ['a']), makeTask('c', ['b'])];
    const queue = new TaskQueue(tasks);
    const order: string[] = [];

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 3,
      executeTask: async (task) => {
        order.push(task.id);
        queue.updateStatus(task.id, 'completed');
      },
    });

    await scheduler.run();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('runs truly parallel tasks concurrently', async () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const queue = new TaskQueue(tasks);
    const running = new Set<string>();
    let maxConcurrent = 0;

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 3,
      executeTask: async (task) => {
        running.add(task.id);
        maxConcurrent = Math.max(maxConcurrent, running.size);
        await new Promise((r) => setTimeout(r, 5));
        running.delete(task.id);
        queue.updateStatus(task.id, 'completed');
      },
    });

    await scheduler.run();
    expect(maxConcurrent).toBe(3);
    expect(queue.isComplete()).toBe(true);
  });

  it('aborts cleanly without running new tasks after abort', async () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const queue = new TaskQueue(tasks);
    const started: string[] = [];

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 1,
      executeTask: async (task) => {
        started.push(task.id);
        queue.updateStatus(task.id, 'completed');
        scheduler.abort();
      },
    });

    await scheduler.run();
    // Only one task should have started since abort was called immediately
    expect(started).toHaveLength(1);
    expect(started[0]).toBe('a');
  });

  it('waits for in-flight tasks to complete after abort', async () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const queue = new TaskQueue(tasks);
    const completed: string[] = [];

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 2,
      executeTask: async (task) => {
        // Abort mid-execution
        if (task.id === 'a') scheduler.abort();
        await new Promise((r) => setTimeout(r, 5));
        queue.updateStatus(task.id, 'completed');
        completed.push(task.id);
      },
    });

    await scheduler.run();
    // 'a' was in-flight when abort was called, it should still complete
    expect(completed).toContain('a');
  });
});

describe('ParallelScheduler — error propagation', () => {
  it('propagates errors thrown by executeTask through scheduler.run()', async () => {
    const tasks = [makeTask('task-1')];
    const queue = new TaskQueue(tasks);

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 1,
      executeTask: async () => {
        throw new Error('Merge conflict for task "task-1": changes remain on branch "cloudy/task-1". Resolve the conflict and re-run.');
      },
    });

    await expect(scheduler.run()).rejects.toThrow(/Merge conflict/);
  });

  it('propagates the first error when multiple tasks fail', async () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const queue = new TaskQueue(tasks);

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 2,
      executeTask: async (task) => {
        throw new Error(`Task ${task.id} failed`);
      },
    });

    await expect(scheduler.run()).rejects.toThrow(/Task (a|b) failed/);
  });

  it('still runs other tasks when one fails (no worktrees)', async () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c', ['a', 'b'])];
    const queue = new TaskQueue(tasks);
    const completed: string[] = [];

    const scheduler = new ParallelScheduler(queue, {
      maxParallel: 2,
      executeTask: async (task) => {
        if (task.id === 'a') {
          throw new Error('Task a failed');
        }
        queue.updateStatus(task.id, 'completed');
        completed.push(task.id);
      },
    });

    try {
      await scheduler.run();
    } catch {
      // expected
    }

    // 'b' should have run (it's independent of 'a'), 'c' should not (dep on 'a')
    expect(completed).toContain('b');
    expect(completed).not.toContain('c');
  });
});
