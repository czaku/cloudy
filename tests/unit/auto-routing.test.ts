import { describe, it, expect } from 'vitest';
import { computeComplexityScore, routeModelForTask } from '../../src/config/auto-routing.js';
import type { Task } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    description: 'short',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
    ...overrides,
  };
}

describe('computeComplexityScore', () => {
  it('returns low score for simple tasks', () => {
    const task = makeTask({ description: 'fix typo' });
    const score = computeComplexityScore(task);
    // description < 200 chars -> tier 1, weight 2 -> 2
    // 0 criteria, 0 deps, 0 context -> total 2
    expect(score).toBe(2);
  });

  it('increases score with acceptance criteria', () => {
    const task = makeTask({
      acceptanceCriteria: ['test passes', 'no regressions', 'types check'],
    });
    const score = computeComplexityScore(task);
    // desc: 1*2=2, criteria: 3*3=9, deps: 0, context: 0 -> 11
    expect(score).toBe(11);
  });

  it('increases score with long description', () => {
    const task = makeTask({ description: 'x'.repeat(600) });
    const score = computeComplexityScore(task);
    // desc: 5*2=10
    expect(score).toBe(10);
  });

  it('accounts for dependencies and context patterns', () => {
    const task = makeTask({
      dependencies: ['a', 'b'],
      contextPatterns: ['src/**/*.ts', 'tests/**/*.ts', 'package.json'],
    });
    const score = computeComplexityScore(task);
    // desc: 1*2=2, criteria: 0, deps: 2*1=2, context: 3*1=3 -> 7
    expect(score).toBe(7);
  });
});

describe('routeModelForTask', () => {
  it('routes simple tasks to haiku', () => {
    const task = makeTask({ description: 'fix typo' });
    expect(routeModelForTask(task)).toBe('haiku');
  });

  it('routes medium tasks to sonnet', () => {
    const task = makeTask({
      description: 'x'.repeat(300),
      acceptanceCriteria: ['a', 'b'],
    });
    // desc: 3*2=6, criteria: 2*3=6 -> 12 (< 25, >= 10)
    expect(routeModelForTask(task)).toBe('sonnet');
  });

  it('routes complex tasks to opus', () => {
    const task = makeTask({
      description: 'x'.repeat(600),
      acceptanceCriteria: ['a', 'b', 'c', 'd', 'e'],
      dependencies: ['t1', 't2'],
      contextPatterns: ['src/**/*.ts'],
    });
    // desc: 5*2=10, criteria: 5*3=15, deps: 2*1=2, context: 1*1=1 -> 28
    expect(routeModelForTask(task)).toBe('opus');
  });

  it('uses task-shape defaults for bounded ui tasks', () => {
    const task = makeTask({
      title: 'Implement Dashboard screen',
      description: 'Update the screen UI and cards.',
      allowedWritePaths: ['src/dashboard/client'],
    });
    expect(routeModelForTask(task)).toBe('sonnet');
  });
});
