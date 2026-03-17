import { describe, expect, it } from 'vitest';
import { assessTaskRisk, getExecutionDefaults, inferExecutionMode, isTerminalFailureType } from '../../src/core/task-shape.js';
import type { Task } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task title',
    description: 'Task description',
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

describe('inferExecutionMode', () => {
  it('classifies proof tasks as verify_proof', () => {
    expect(inferExecutionMode(makeTask({
      title: 'Verify Android parity screenshots',
      description: 'Capture proof screenshots and verify shell parity.',
    }))).toBe('verify_proof');
  });

  it('classifies bounded ui work as implement_ui_surface', () => {
    expect(inferExecutionMode(makeTask({
      title: 'Implement Training Plan screen',
      description: 'Update the SwiftUI surface and cards.',
      allowedWritePaths: ['apple/FitKind/Features/Vault'],
    }))).toBe('implement_ui_surface');
  });

  it('classifies bounded generic implementation as write_or_stop', () => {
    expect(inferExecutionMode(makeTask({
      title: 'Implement shared repository update',
      type: 'implement',
      allowedWritePaths: ['src/core'],
    }))).toBe('write_or_stop');
  });
});

describe('task execution defaults', () => {
  it('uses low-effort sonnet with no subagents for bounded ui work', () => {
    expect(getExecutionDefaults(makeTask({
      title: 'Update Compose screen layout',
      allowedWritePaths: ['android/app/src/main'],
    }))).toMatchObject({
      executionMode: 'implement_ui_surface',
      model: 'sonnet',
      effort: 'low',
      disallowSubagents: true,
      requireFirstWrite: true,
    });
  });
});

describe('task risk assessment', () => {
  it('flags broad ui tasks as high risk', () => {
    const risk = assessTaskRisk(makeTask({
      title: 'Implement dashboard UI',
      description: 'Update the screen layout and cards',
      allowedWritePaths: Array.from({ length: 9 }, (_, i) => `src/path-${i}`),
      contextPatterns: Array.from({ length: 13 }, (_, i) => `src/${i}/**/*`),
    }));

    expect(risk.level).toBe('high');
    expect(risk.reasons).toContain('wide_write_scope');
    expect(risk.reasons).toContain('wide_context_scope');
    expect(risk.reasons).toContain('missing_validation_override');
  });
});

describe('terminal failure classification', () => {
  it('marks executor_nonperformance as terminal', () => {
    expect(isTerminalFailureType('executor_nonperformance')).toBe(true);
    expect(isTerminalFailureType('implementation_failure')).toBe(false);
  });
});
