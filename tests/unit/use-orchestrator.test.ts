/**
 * Tests for useOrchestrator state logic.
 *
 * Rather than rendering the React hook (requires @testing-library/react),
 * we test the state transition logic directly by simulating the reducer
 * operations that handleEvent performs.
 */
import { describe, it, expect } from 'vitest';
import type { Task, OrchestratorEvent, CostSummary } from '../../src/core/types.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 60000,
    ...overrides,
  };
}

const EMPTY_COST: CostSummary = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalEstimatedUsd: 0,
  byPhase: {},
  byModel: {},
};

// Inline state shape matching useOrchestrator
interface State {
  tasks: Task[];
  activeTaskId: string | null;
  selectedTaskId: string | null;
  outputByTask: Record<string, string[]>;
  costByTask: Record<string, number>;
  durationByTask: Record<string, number>;
  engineByTask: Record<string, string>;
  modelByTask: Record<string, string>;
  costSummary: CostSummary;
  status: 'idle' | 'running' | 'completed' | 'failed';
  paused: boolean;
  error: string | null;
  prevTaskCostUsd: number;
}

function initialState(tasks: Task[]): State {
  return {
    tasks,
    activeTaskId: null,
    selectedTaskId: null,
    outputByTask: {},
    costByTask: {},
    durationByTask: {},
    engineByTask: {},
    modelByTask: {},
    costSummary: EMPTY_COST,
    status: 'idle',
    paused: false,
    error: null,
    prevTaskCostUsd: 0,
  };
}

// Mirror of the reducer inside useOrchestrator
function reduce(prev: State, event: OrchestratorEvent): State {
  switch (event.type) {
    case 'task_started':
      return {
        ...prev,
        activeTaskId: event.taskId,
        selectedTaskId: event.taskId,
        status: 'running',
        prevTaskCostUsd: prev.costSummary.totalEstimatedUsd,
        tasks: prev.tasks.map((t) =>
          t.id === event.taskId ? { ...t, status: 'in_progress' as const } : t,
        ),
        engineByTask: { ...prev.engineByTask, [event.taskId]: event.engine ?? 'cc' },
        modelByTask: { ...prev.modelByTask, [event.taskId]: event.model ?? '' },
      };

    case 'task_output':
      return {
        ...prev,
        outputByTask: {
          ...prev.outputByTask,
          [event.taskId]: [...(prev.outputByTask[event.taskId] ?? []), event.text].slice(-200),
        },
      };

    case 'task_completed':
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === event.taskId ? { ...t, status: 'completed' as const } : t,
        ),
        durationByTask: { ...prev.durationByTask, [event.taskId]: event.durationMs },
        costByTask: {
          ...prev.costByTask,
          [event.taskId]: prev.costSummary.totalEstimatedUsd - prev.prevTaskCostUsd,
        },
      };

    case 'task_failed':
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === event.taskId ? { ...t, status: 'failed' as const, error: event.error } : t,
        ),
      };

    case 'cost_update':
      return { ...prev, costSummary: event.summary };

    case 'run_completed':
      return { ...prev, status: 'completed', activeTaskId: null, costSummary: event.summary };

    case 'run_failed':
      return { ...prev, status: 'failed', error: event.error };

    default:
      return prev;
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('useOrchestrator state logic', () => {
  it('initializes with correct defaults', () => {
    const state = initialState([makeTask('t1')]);
    expect(state.activeTaskId).toBeNull();
    expect(state.selectedTaskId).toBeNull();
    expect(state.status).toBe('idle');
    expect(state.paused).toBe(false);
    expect(state.outputByTask).toEqual({});
  });

  it('task_started: sets activeTaskId, selectedTaskId, engine, model', () => {
    const state = reduce(initialState([makeTask('t1')]), {
      type: 'task_started',
      taskId: 't1',
      title: 'Task t1',
      attempt: 1,
      maxAttempts: 3,
      contextFileCount: 5,
      engine: 'pi-mono',
      model: 'gpt-4o-mini',
    });

    expect(state.activeTaskId).toBe('t1');
    expect(state.selectedTaskId).toBe('t1');
    expect(state.status).toBe('running');
    expect(state.engineByTask['t1']).toBe('pi-mono');
    expect(state.modelByTask['t1']).toBe('gpt-4o-mini');
    expect(state.tasks[0].status).toBe('in_progress');
  });

  it('task_started: defaults engine to cc when not provided', () => {
    const state = reduce(initialState([makeTask('t1')]), {
      type: 'task_started',
      taskId: 't1',
      title: 'Task t1',
      attempt: 1,
      maxAttempts: 1,
      contextFileCount: 0,
    });

    expect(state.engineByTask['t1']).toBe('cc');
  });

  it('task_started: snapshots prevTaskCostUsd from current summary', () => {
    let state = initialState([makeTask('t1')]);
    state = reduce(state, {
      type: 'cost_update',
      summary: { ...EMPTY_COST, totalEstimatedUsd: 0.42 },
    });
    state = reduce(state, {
      type: 'task_started',
      taskId: 't1',
      title: 'Task t1',
      attempt: 1,
      maxAttempts: 1,
      contextFileCount: 0,
    });

    expect(state.prevTaskCostUsd).toBe(0.42);
  });

  it('task_output: stores lines per task independently', () => {
    let state = initialState([makeTask('t1'), makeTask('t2')]);
    state = reduce(state, { type: 'task_output', taskId: 't1', text: 'A' });
    state = reduce(state, { type: 'task_output', taskId: 't2', text: 'B' });
    state = reduce(state, { type: 'task_output', taskId: 't1', text: 'C' });

    expect(state.outputByTask['t1']).toEqual(['A', 'C']);
    expect(state.outputByTask['t2']).toEqual(['B']);
  });

  it('task_output: caps buffer at 200 lines', () => {
    let state = initialState([makeTask('t1')]);
    for (let i = 0; i < 250; i++) {
      state = reduce(state, { type: 'task_output', taskId: 't1', text: `line ${i}` });
    }
    expect(state.outputByTask['t1']).toHaveLength(200);
    expect(state.outputByTask['t1'][199]).toBe('line 249');
  });

  it('task_completed: records duration and cost delta', () => {
    let state = initialState([makeTask('t1')]);
    // task starts with cost at 0
    state = reduce(state, {
      type: 'task_started',
      taskId: 't1',
      title: 'Task t1',
      attempt: 1,
      maxAttempts: 1,
      contextFileCount: 0,
    });
    // cost rises during task
    state = reduce(state, {
      type: 'cost_update',
      summary: { ...EMPTY_COST, totalEstimatedUsd: 0.07 },
    });
    // task finishes
    state = reduce(state, { type: 'task_completed', taskId: 't1', title: 'Task t1', durationMs: 8000 });

    expect(state.tasks[0].status).toBe('completed');
    expect(state.durationByTask['t1']).toBe(8000);
    expect(state.costByTask['t1']).toBeCloseTo(0.07);
  });

  it('task_failed: marks task failed with error message', () => {
    let state = initialState([makeTask('t1')]);
    state = reduce(state, {
      type: 'task_failed',
      taskId: 't1',
      title: 'Task t1',
      error: 'type check failed',
      attempt: 2,
      maxAttempts: 3,
      willRetry: true,
    });

    expect(state.tasks[0].status).toBe('failed');
    expect(state.tasks[0].error).toBe('type check failed');
  });

  it('run_completed: status=completed, clears activeTaskId, updates cost', () => {
    let state = initialState([makeTask('t1')]);
    state = { ...state, activeTaskId: 't1', status: 'running' };
    state = reduce(state, {
      type: 'run_completed',
      summary: { ...EMPTY_COST, totalEstimatedUsd: 2.50 },
    });

    expect(state.status).toBe('completed');
    expect(state.activeTaskId).toBeNull();
    expect(state.costSummary.totalEstimatedUsd).toBe(2.50);
  });

  it('run_failed: status=failed, stores error', () => {
    const state = reduce(initialState([]), {
      type: 'run_failed',
      error: 'orchestration aborted',
    });

    expect(state.status).toBe('failed');
    expect(state.error).toBe('orchestration aborted');
  });

  it('cost_update: updates running cost summary', () => {
    let state = initialState([]);
    state = reduce(state, {
      type: 'cost_update',
      summary: { ...EMPTY_COST, totalEstimatedUsd: 1.11, totalInputTokens: 5000 },
    });

    expect(state.costSummary.totalEstimatedUsd).toBe(1.11);
    expect(state.costSummary.totalInputTokens).toBe(5000);
  });

  it('unknown events return state unchanged', () => {
    const state = initialState([makeTask('t1')]);
    const after = reduce(state, { type: 'progress', completed: 1, total: 5, percentage: 20 });
    expect(after).toBe(state); // same reference
  });
});
