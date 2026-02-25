import { describe, it, expect } from 'vitest';
import {
  validateDependencyGraph,
  topologicalSort,
  getReadyTasks,
  getTransitiveDeps,
} from '../../src/planner/dependency-graph.js';
import type { Task } from '../../src/core/types.js';

function makeTask(id: string, deps: string[] = [], status = 'pending'): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: deps,
    status: status as Task['status'],
    retries: 0,
    maxRetries: 2,
  };
}

describe('validateDependencyGraph', () => {
  it('validates a simple chain', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-2']),
    ];
    const result = validateDependencyGraph(tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing dependencies', () => {
    const tasks = [makeTask('task-1', ['nonexistent'])];
    const result = validateDependencyGraph(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('nonexistent');
  });

  it('detects self-dependency', () => {
    const tasks = [makeTask('task-1', ['task-1'])];
    const result = validateDependencyGraph(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('itself');
  });

  it('detects cycles', () => {
    const tasks = [
      makeTask('task-1', ['task-2']),
      makeTask('task-2', ['task-1']),
    ];
    const result = validateDependencyGraph(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('validates diamond dependencies', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-1']),
      makeTask('task-4', ['task-2', 'task-3']),
    ];
    const result = validateDependencyGraph(tasks);
    expect(result.valid).toBe(true);
  });
});

describe('topologicalSort', () => {
  it('sorts a simple chain', () => {
    const tasks = [
      makeTask('task-3', ['task-2']),
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
    ];
    const sorted = topologicalSort(tasks);
    expect(sorted).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('handles tasks with no dependencies', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const sorted = topologicalSort(tasks);
    expect(sorted).toHaveLength(3);
  });

  it('respects diamond dependencies', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-1']),
      makeTask('task-4', ['task-2', 'task-3']),
    ];
    const sorted = topologicalSort(tasks);
    expect(sorted.indexOf('task-1')).toBeLessThan(sorted.indexOf('task-2'));
    expect(sorted.indexOf('task-1')).toBeLessThan(sorted.indexOf('task-3'));
    expect(sorted.indexOf('task-2')).toBeLessThan(sorted.indexOf('task-4'));
    expect(sorted.indexOf('task-3')).toBeLessThan(sorted.indexOf('task-4'));
  });
});

describe('getTransitiveDeps', () => {
  it('returns just target when no deps', () => {
    const tasks = [makeTask('task-1'), makeTask('task-2')];
    const deps = getTransitiveDeps(tasks, 'task-1');
    expect(deps).toEqual(new Set(['task-1']));
  });

  it('returns target + direct deps', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
    ];
    const deps = getTransitiveDeps(tasks, 'task-2');
    expect(deps).toEqual(new Set(['task-1', 'task-2']));
  });

  it('returns full transitive closure', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-2']),
    ];
    const deps = getTransitiveDeps(tasks, 'task-3');
    expect(deps).toEqual(new Set(['task-1', 'task-2', 'task-3']));
  });

  it('handles diamond dependencies', () => {
    const tasks = [
      makeTask('task-1'),
      makeTask('task-2', ['task-1']),
      makeTask('task-3', ['task-1']),
      makeTask('task-4', ['task-2', 'task-3']),
    ];
    const deps = getTransitiveDeps(tasks, 'task-4');
    expect(deps).toEqual(new Set(['task-1', 'task-2', 'task-3', 'task-4']));
  });
});

describe('getReadyTasks', () => {
  it('returns tasks with all deps completed', () => {
    const tasks = [
      makeTask('task-1', [], 'completed'),
      makeTask('task-2', ['task-1'], 'pending'),
      makeTask('task-3', ['task-1', 'task-2'], 'pending'),
    ];
    const ready = getReadyTasks(tasks);
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('task-2');
  });

  it('returns multiple ready tasks when possible', () => {
    const tasks = [
      makeTask('task-1', [], 'completed'),
      makeTask('task-2', ['task-1'], 'pending'),
      makeTask('task-3', ['task-1'], 'pending'),
    ];
    const ready = getReadyTasks(tasks);
    expect(ready).toHaveLength(2);
  });

  it('returns no-dep pending tasks', () => {
    const tasks = [makeTask('task-1'), makeTask('task-2')];
    const ready = getReadyTasks(tasks);
    expect(ready).toHaveLength(2);
  });
});
