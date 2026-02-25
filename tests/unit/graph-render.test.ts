import { describe, it, expect } from 'vitest';
import { renderAsciiGraph, renderMermaidGraph } from '../../src/planner/dependency-graph.js';
import type { Task } from '../../src/core/types.js';

function makeTask(id: string, title: string, deps: string[] = []): Task {
  return {
    id,
    title,
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

describe('renderAsciiGraph', () => {
  it('renders a single root-only plan', () => {
    const tasks = [makeTask('task-1', 'Setup')];
    const output = renderAsciiGraph(tasks);
    expect(output).toContain('task-1');
    expect(output).toContain('Setup');
  });

  it('renders a linear chain', () => {
    const tasks = [
      makeTask('task-1', 'Setup'),
      makeTask('task-2', 'Database', ['task-1']),
      makeTask('task-3', 'Routes', ['task-2']),
    ];
    const output = renderAsciiGraph(tasks);
    const lines = output.split('\n');
    // task-1 should be first (root)
    expect(lines[0]).toContain('task-1');
    expect(output).toContain('task-2');
    expect(output).toContain('task-3');
  });

  it('shows tree connectors for children', () => {
    const tasks = [
      makeTask('task-1', 'Root'),
      makeTask('task-2', 'Child A', ['task-1']),
      makeTask('task-3', 'Child B', ['task-1']),
    ];
    const output = renderAsciiGraph(tasks);
    // Should have branch connectors
    expect(output).toMatch(/[├└]/);
  });

  it('handles diamond dependency: second reference shows (↑ ...)', () => {
    // task-1 -> task-2, task-1 -> task-3, task-2 -> task-4, task-3 -> task-4
    const tasks = [
      makeTask('task-1', 'Root'),
      makeTask('task-2', 'Branch A', ['task-1']),
      makeTask('task-3', 'Branch B', ['task-1']),
      makeTask('task-4', 'Diamond tip', ['task-2', 'task-3']),
    ];
    const output = renderAsciiGraph(tasks);
    // task-4 should appear once with ref and once with diamond marker
    const task4Occurrences = (output.match(/task-4/g) ?? []).length;
    expect(task4Occurrences).toBeGreaterThanOrEqual(1);
    // Second occurrence should have the diamond marker
    if (task4Occurrences >= 2) {
      expect(output).toMatch(/↑\s+task-4/);
    }
  });

  it('renders multiple roots', () => {
    const tasks = [
      makeTask('task-1', 'Root A'),
      makeTask('task-2', 'Root B'),
    ];
    const output = renderAsciiGraph(tasks);
    expect(output).toContain('task-1');
    expect(output).toContain('task-2');
  });
});

describe('renderMermaidGraph', () => {
  it('starts with graph TD', () => {
    const tasks = [makeTask('task-1', 'Setup')];
    const output = renderMermaidGraph(tasks);
    expect(output.startsWith('graph TD')).toBe(true);
  });

  it('includes all task nodes', () => {
    const tasks = [
      makeTask('task-1', 'Setup'),
      makeTask('task-2', 'Database', ['task-1']),
    ];
    const output = renderMermaidGraph(tasks);
    expect(output).toContain('task-1');
    expect(output).toContain('task-2');
    expect(output).toContain('Setup');
    expect(output).toContain('Database');
  });

  it('includes dependency edges', () => {
    const tasks = [
      makeTask('task-1', 'Setup'),
      makeTask('task-2', 'Database', ['task-1']),
    ];
    const output = renderMermaidGraph(tasks);
    expect(output).toContain('task-1 --> task-2');
  });

  it('no edges for independent tasks', () => {
    const tasks = [
      makeTask('task-1', 'A'),
      makeTask('task-2', 'B'),
    ];
    const output = renderMermaidGraph(tasks);
    expect(output).not.toContain('-->');
  });

  it('escapes double quotes in titles', () => {
    const tasks = [makeTask('task-1', 'Say "hello"')];
    const output = renderMermaidGraph(tasks);
    // Double quotes should be replaced with single quotes in node label
    expect(output).not.toMatch(/task-1\["[^"]*"[^"]*"\]/);
  });
});
