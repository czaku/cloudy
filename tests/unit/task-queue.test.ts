import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/core/task-queue.js';
import type { Task } from '../../src/core/types.js';

function makeTasks(): Task[] {
  return [
    {
      id: 'task-1',
      title: 'First',
      description: 'First task',
      acceptanceCriteria: [],
      dependencies: [],
      contextPatterns: [],
      status: 'pending',
      retries: 0,
      maxRetries: 2,
      ifFailed: 'halt',
      timeout: 3600000,
    },
    {
      id: 'task-2',
      title: 'Second',
      description: 'Depends on first',
      acceptanceCriteria: [],
      dependencies: ['task-1'],
      contextPatterns: [],
      status: 'pending',
      retries: 0,
      maxRetries: 2,
      ifFailed: 'halt',
      timeout: 3600000,
    },
    {
      id: 'task-3',
      title: 'Third',
      description: 'Depends on first',
      acceptanceCriteria: [],
      dependencies: ['task-1'],
      contextPatterns: [],
      status: 'pending',
      retries: 0,
      maxRetries: 2,
      ifFailed: 'halt',
      timeout: 3600000,
    },
  ];
}

describe('TaskQueue', () => {
  it('returns all tasks', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.getAllTasks()).toHaveLength(3);
  });

  it('gets a task by ID', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.getTask('task-1')?.title).toBe('First');
    expect(q.getTask('nonexistent')).toBeUndefined();
  });

  it('only returns tasks with all deps completed as ready', () => {
    const q = new TaskQueue(makeTasks());
    const ready = q.getReadyTasks();
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('task-1');
  });

  it('unlocks dependent tasks when dep completes', () => {
    const q = new TaskQueue(makeTasks());
    q.updateStatus('task-1', 'completed');
    const ready = q.getReadyTasks();
    expect(ready).toHaveLength(2);
    expect(ready.map((t) => t.id).sort()).toEqual(['task-2', 'task-3']);
  });

  it('updates status correctly', () => {
    const q = new TaskQueue(makeTasks());
    q.updateStatus('task-1', 'in_progress');
    expect(q.getTask('task-1')?.status).toBe('in_progress');
    expect(q.getTask('task-1')?.startedAt).toBeDefined();
  });

  it('tracks completion', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.isComplete()).toBe(false);
    q.updateStatus('task-1', 'completed');
    q.updateStatus('task-2', 'completed');
    q.updateStatus('task-3', 'completed');
    expect(q.isComplete()).toBe(true);
  });

  it('detects failures', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.hasFailures()).toBe(false);
    q.updateStatus('task-1', 'failed');
    expect(q.hasFailures()).toBe(true);
  });

  it('increments retries and respects maxRetries', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.incrementRetry('task-1')).toBe(true); // 1 <= 2
    expect(q.incrementRetry('task-1')).toBe(true); // 2 <= 2
    expect(q.incrementRetry('task-1')).toBe(false); // 3 > 2
  });

  it('calculates progress', () => {
    const q = new TaskQueue(makeTasks());
    expect(q.getProgress()).toEqual({ completed: 0, total: 3, percentage: 0 });

    q.updateStatus('task-1', 'completed');
    expect(q.getProgress()).toEqual({ completed: 1, total: 3, percentage: 33 });
  });

  it('sets checkpoint and error', () => {
    const q = new TaskQueue(makeTasks());
    q.setCheckpoint('task-1', 'abc123');
    expect(q.getTask('task-1')?.checkpointSha).toBe('abc123');

    q.setError('task-1', 'something broke');
    expect(q.getTask('task-1')?.error).toBe('something broke');
  });

  it('throws on unknown task ID', () => {
    const q = new TaskQueue(makeTasks());
    expect(() => q.updateStatus('nope', 'completed')).toThrow('not found');
  });
});
