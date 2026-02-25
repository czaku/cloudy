import { describe, it, expect } from 'vitest';
import { updatePlan } from '../../src/core/state.js';
import type { ProjectState, Plan, Task } from '../../src/core/types.js';

function makeTask(id: string): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

function makePlan(tasks: Task[]): Plan {
  return {
    goal: 'test goal',
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    version: 2,
    plan: null,
    config: {} as any,
    costSummary: {
      totalInputTokens: 500,
      totalOutputTokens: 300,
      totalCacheReadTokens: 100,
      totalCacheWriteTokens: 50,
      totalEstimatedUsd: 7.89,
      byPhase: { execution: 7.89 },
      byModel: { 'claude-sonnet-4-6': 7.89 },
    },
    startedAt: '2026-03-01T10:00:00.000Z',
    completedAt: '2026-03-01T11:30:00.000Z',
    ...overrides,
  };
}

describe('updatePlan', () => {
  it('sets the new plan on state', () => {
    const state = makeState();
    const plan = makePlan([makeTask('task-1')]);
    updatePlan(state, plan);
    expect(state.plan).toBe(plan);
    expect(state.plan?.tasks).toHaveLength(1);
  });

  it('clears startedAt from the previous run', () => {
    const state = makeState({ startedAt: '2026-03-01T10:00:00.000Z' });
    updatePlan(state, makePlan([]));
    expect(state.startedAt).toBeUndefined();
  });

  it('clears completedAt from the previous run', () => {
    const state = makeState({ completedAt: '2026-03-01T11:30:00.000Z' });
    updatePlan(state, makePlan([]));
    expect(state.completedAt).toBeUndefined();
  });

  it('resets costSummary totals to zero', () => {
    const state = makeState();
    updatePlan(state, makePlan([]));
    expect(state.costSummary.totalEstimatedUsd).toBe(0);
    expect(state.costSummary.totalInputTokens).toBe(0);
    expect(state.costSummary.totalOutputTokens).toBe(0);
    expect(state.costSummary.byPhase).toEqual({});
    expect(state.costSummary.byModel).toEqual({});
  });

  it('does not carry over stale timestamps into the new run — regression for Phase18→19 bug', () => {
    // Simulate: Phase 18 completed, cloudy init creates Phase 19 plan
    const state = makeState({
      startedAt: '2026-03-02T16:21:17.677Z',  // Phase 19 started
      completedAt: '2026-03-02T15:32:20.157Z', // Phase 18 finished (earlier!)
    });
    const phase19Plan = makePlan([makeTask('task-1'), makeTask('task-2')]);
    updatePlan(state, phase19Plan);

    // Dashboard must NOT see completedAt — it would render the run as "complete"
    expect(state.completedAt).toBeUndefined();
    expect(state.startedAt).toBeUndefined();
    expect(state.plan?.tasks).toHaveLength(2);
  });

  it('replaces an existing plan with the new one', () => {
    const state = makeState({
      plan: makePlan([makeTask('old-task-1')]),
    });
    const newPlan = makePlan([makeTask('task-1'), makeTask('task-2'), makeTask('task-3')]);
    updatePlan(state, newPlan);
    expect(state.plan?.tasks).toHaveLength(3);
    expect(state.plan?.tasks[0].id).toBe('task-1');
  });

  it('works when state had no previous plan', () => {
    const state = makeState({ plan: null, startedAt: undefined, completedAt: undefined });
    updatePlan(state, makePlan([makeTask('task-1')]));
    expect(state.plan?.tasks).toHaveLength(1);
    expect(state.startedAt).toBeUndefined();
    expect(state.completedAt).toBeUndefined();
  });
});
