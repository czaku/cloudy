import { describe, it, expect } from 'vitest';
import { sanitizeStaleTasks } from '../../src/core/state.js';
import type { Plan, Task } from '../../src/core/types.js';

function makeTask(id: string, status: Task['status']): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status,
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
    startedAt: status === 'in_progress' ? new Date().toISOString() : undefined,
  };
}

function makePlan(tasks: Task[]): Plan {
  return {
    goal: 'test',
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('sanitizeStaleTasks', () => {
  it('resets in_progress tasks to pending', () => {
    const plan = makePlan([
      makeTask('task-1', 'in_progress'),
      makeTask('task-2', 'pending'),
    ]);

    const reset = sanitizeStaleTasks(plan);

    expect(reset).toEqual(['task-1']);
    expect(plan.tasks[0].status).toBe('pending');
    expect(plan.tasks[0].startedAt).toBeUndefined();
  });

  it('returns all reset task IDs when multiple are in_progress', () => {
    const plan = makePlan([
      makeTask('task-1', 'in_progress'),
      makeTask('task-2', 'in_progress'),
      makeTask('task-3', 'pending'),
    ]);

    const reset = sanitizeStaleTasks(plan);

    expect(reset).toHaveLength(2);
    expect(reset).toContain('task-1');
    expect(reset).toContain('task-2');
    expect(plan.tasks[0].status).toBe('pending');
    expect(plan.tasks[1].status).toBe('pending');
  });

  it('returns empty array when no tasks are in_progress', () => {
    const plan = makePlan([
      makeTask('task-1', 'pending'),
      makeTask('task-2', 'completed'),
    ]);

    const reset = sanitizeStaleTasks(plan);

    expect(reset).toHaveLength(0);
  });

  it('leaves completed tasks untouched', () => {
    const plan = makePlan([
      makeTask('task-1', 'completed'),
      makeTask('task-2', 'in_progress'),
    ]);

    sanitizeStaleTasks(plan);

    expect(plan.tasks[0].status).toBe('completed');
    expect(plan.tasks[1].status).toBe('pending');
  });

  it('leaves failed tasks untouched', () => {
    const plan = makePlan([
      makeTask('task-1', 'failed'),
      makeTask('task-2', 'in_progress'),
    ]);

    sanitizeStaleTasks(plan);

    expect(plan.tasks[0].status).toBe('failed');
    expect(plan.tasks[1].status).toBe('pending');
  });

  it('leaves skipped tasks untouched', () => {
    const plan = makePlan([
      makeTask('task-1', 'skipped'),
      makeTask('task-2', 'in_progress'),
    ]);

    sanitizeStaleTasks(plan);

    expect(plan.tasks[0].status).toBe('skipped');
    expect(plan.tasks[1].status).toBe('pending');
  });

  it('clears startedAt when resetting', () => {
    const task = makeTask('task-1', 'in_progress');
    expect(task.startedAt).toBeDefined();

    const plan = makePlan([task]);
    sanitizeStaleTasks(plan);

    expect(plan.tasks[0].startedAt).toBeUndefined();
  });
});
