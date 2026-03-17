import { describe, expect, it } from 'vitest';
import { analyzePlanRisk, analyzeTaskRisk } from '../../src/core/risk-preflight.js';
import type { Plan, Task } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Implement screen',
    description: 'Implement the screen UI',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 1,
    ifFailed: 'halt',
    timeout: 3_600_000,
    ...overrides,
  };
}

describe('analyzeTaskRisk', () => {
  it('blocks high-risk bounded implementation tasks', () => {
    const result = analyzeTaskRisk(makeTask({
      allowedWritePaths: Array.from({ length: 9 }, (_, i) => `src/feature-${i}`),
      contextPatterns: Array.from({ length: 13 }, (_, i) => `src/${i}/**/*`),
    }));

    expect(result.executionMode).toBe('implement_ui_surface');
    expect(result.level).toBe('high');
    expect(result.shouldBlock).toBe(true);
  });

  it('does not block proof tasks without write scope', () => {
    const result = analyzeTaskRisk(makeTask({
      title: 'Verify screenshot proof',
      description: 'Verify parity screenshots exist',
      allowedWritePaths: [],
    }));

    expect(result.executionMode).toBe('verify_proof');
    expect(result.shouldBlock).toBe(false);
  });
});

describe('analyzePlanRisk', () => {
  it('only includes pending tasks', () => {
    const plan: Plan = {
      goal: 'Goal',
      tasks: [
        makeTask({ id: 'task-1', status: 'pending' }),
        makeTask({ id: 'task-2', status: 'completed' }),
      ],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const result = analyzePlanRisk(plan);
    expect(result.map((item) => item.taskId)).toEqual(['task-1']);
  });
});
