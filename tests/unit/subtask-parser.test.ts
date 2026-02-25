import { describe, it, expect } from 'vitest';
import { parseSubtasks } from '../../src/core/subtask-parser.js';
import type { Task } from '../../src/core/types.js';

function makeParent(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-2',
    title: 'OAuth integration',
    description: 'Implement OAuth',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: ['src/**'],
    status: 'completed',
    retries: 0,
    maxRetries: 3,
    ifFailed: 'skip',
    timeout: 1800000,
    ...overrides,
  };
}

describe('parseSubtasks', () => {
  it('returns empty array when no SUBTASKS section', () => {
    const output = 'I implemented the feature.\n\n## LEARNINGS\n- used Express';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(0);
  });

  it('parses a single subtask', () => {
    const output = 'Done.\n\n## SUBTASKS\n- [task-2-a] Add OAuth provider configuration (depends: task-2)';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0].id).toBe('task-2-a');
    expect(subtasks[0].title).toBe('Add OAuth provider configuration');
    expect(subtasks[0].dependencies).toEqual(['task-2']);
  });

  it('parses a chain of subtasks', () => {
    const output = [
      'Done.',
      '',
      '## SUBTASKS',
      '- [task-2-a] Add OAuth provider configuration (depends: task-2)',
      '- [task-2-b] Implement token refresh endpoint (depends: task-2-a)',
    ].join('\n');
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(2);
    expect(subtasks[0].id).toBe('task-2-a');
    expect(subtasks[1].id).toBe('task-2-b');
    expect(subtasks[1].dependencies).toEqual(['task-2-a']);
  });

  it('inherits maxRetries from parent', () => {
    const output = '## SUBTASKS\n- [task-2-a] Something (depends: task-2)';
    const parent = makeParent({ maxRetries: 5 });
    const subtasks = parseSubtasks(output, parent);
    expect(subtasks[0].maxRetries).toBe(5);
  });

  it('inherits ifFailed from parent', () => {
    const output = '## SUBTASKS\n- [task-2-a] Something (depends: task-2)';
    const parent = makeParent({ ifFailed: 'skip' });
    const subtasks = parseSubtasks(output, parent);
    expect(subtasks[0].ifFailed).toBe('skip');
  });

  it('inherits timeout from parent', () => {
    const output = '## SUBTASKS\n- [task-2-a] Something (depends: task-2)';
    const parent = makeParent({ timeout: 7200000 });
    const subtasks = parseSubtasks(output, parent);
    expect(subtasks[0].timeout).toBe(7200000);
  });

  it('sets parentTaskId to parent id', () => {
    const output = '## SUBTASKS\n- [task-2-a] Something (depends: task-2)';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks[0].parentTaskId).toBe('task-2');
  });

  it('sets status to pending', () => {
    const output = '## SUBTASKS\n- [task-2-a] Something (depends: task-2)';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks[0].status).toBe('pending');
  });

  it('handles subtask with no depends clause', () => {
    const output = '## SUBTASKS\n- [task-2-a] Stand-alone work';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0].dependencies).toEqual([]);
  });

  it('handles multiple deps in depends clause', () => {
    const output = '## SUBTASKS\n- [task-2-c] Merge work (depends: task-2-a, task-2-b)';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks[0].dependencies).toEqual(['task-2-a', 'task-2-b']);
  });

  it('skips malformed lines', () => {
    const output = [
      '## SUBTASKS',
      'not a valid line',
      '- [task-2-a] Valid subtask (depends: task-2)',
      '  random text',
    ].join('\n');
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0].id).toBe('task-2-a');
  });

  it('returns empty array for empty SUBTASKS section', () => {
    const output = '## SUBTASKS\n';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(0);
  });

  it('is case-insensitive for section header', () => {
    const output = '## subtasks\n- [task-2-a] Something (depends: task-2)';
    const subtasks = parseSubtasks(output, makeParent());
    expect(subtasks).toHaveLength(1);
  });
});
