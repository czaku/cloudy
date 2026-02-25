import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/core/task-queue.js';
import type { Task } from '../../src/core/types.js';

function makeTask(id: string, deps: string[] = [], status: Task['status'] = 'pending'): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: deps,
    contextPatterns: [],
    status,
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

describe('TaskQueue.isDeadlocked / getDeadlockedTasks', () => {
  it('returns false when no tasks are pending', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'completed'),
      makeTask('task-2', [], 'completed'),
    ]);
    expect(queue.isDeadlocked()).toBe(false);
    expect(queue.getDeadlockedTasks()).toHaveLength(0);
  });

  it('returns false when pending tasks have no failed deps', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'completed'),
      makeTask('task-2', ['task-1'], 'pending'),
    ]);
    expect(queue.isDeadlocked()).toBe(false);
  });

  it('returns false when there are pending tasks with no deps at all', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'pending'),
      makeTask('task-2', [], 'pending'),
    ]);
    expect(queue.isDeadlocked()).toBe(false);
  });

  it('detects deadlock when a direct dep has failed', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'failed'),
      makeTask('task-2', ['task-1'], 'pending'),
    ]);
    expect(queue.isDeadlocked()).toBe(true);
    const blocked = queue.getDeadlockedTasks();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].id).toBe('task-2');
  });

  it('detects transitive deadlock (chain of deps through a failed task)', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'failed'),
      makeTask('task-2', ['task-1'], 'pending'),
      makeTask('task-3', ['task-2'], 'pending'),
    ]);
    expect(queue.isDeadlocked()).toBe(true);
    const blocked = queue.getDeadlockedTasks();
    expect(blocked.map((t) => t.id).sort()).toEqual(['task-2', 'task-3']);
  });

  it('does not deadlock tasks that depend on completed tasks even if siblings failed', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'completed'),
      makeTask('task-2', [], 'failed'),
      makeTask('task-3', ['task-1'], 'pending'), // depends only on completed
      makeTask('task-4', ['task-2'], 'pending'), // depends on failed
    ]);
    expect(queue.isDeadlocked()).toBe(false); // task-3 is still reachable
    const blocked = queue.getDeadlockedTasks();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].id).toBe('task-4');
  });

  it('detects deadlock in diamond dependency when root fails', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'failed'),
      makeTask('task-2', ['task-1'], 'pending'),
      makeTask('task-3', ['task-1'], 'pending'),
      makeTask('task-4', ['task-2', 'task-3'], 'pending'),
    ]);
    expect(queue.isDeadlocked()).toBe(true);
    const blocked = queue.getDeadlockedTasks();
    expect(blocked.map((t) => t.id).sort()).toEqual(['task-2', 'task-3', 'task-4']);
  });

  it('does not count failed tasks themselves as deadlocked', () => {
    const queue = new TaskQueue([
      makeTask('task-1', [], 'failed'),
      makeTask('task-2', ['task-1'], 'pending'),
    ]);
    const blocked = queue.getDeadlockedTasks();
    expect(blocked.every((t) => t.id !== 'task-1')).toBe(true);
  });
});
