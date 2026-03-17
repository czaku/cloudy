import { describe, expect, it } from 'vitest';
import { assessTaskRisk, getExecutionDefaults, getTaskToolPolicy, inferExecutionMode, isTerminalFailureType } from '../../src/core/task-shape.js';
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

  it('classifies bounded api work as implement_api_endpoint', () => {
    expect(inferExecutionMode(makeTask({
      title: 'Implement version-check API endpoint',
      description: 'Add the route, DTO validation, and handler.',
      allowedWritePaths: ['api/src/version-check'],
    }))).toBe('implement_api_endpoint');
  });

  it('classifies bounded cli work as implement_cli_command', () => {
    expect(inferExecutionMode(makeTask({
      title: 'Implement doctor CLI command',
      description: 'Add the command, help output, and exit code behaviour.',
      allowedWritePaths: ['apps/cli/src/commands/doctor.ts'],
    }))).toBe('implement_cli_command');
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

  it('uses low-effort sonnet with no subagents for bounded api work', () => {
    expect(getExecutionDefaults(makeTask({
      title: 'Implement account endpoint',
      description: 'Add API route and DTOs',
      allowedWritePaths: ['api/src/account'],
    }))).toMatchObject({
      executionMode: 'implement_api_endpoint',
      model: 'sonnet',
      effort: 'low',
      disallowSubagents: true,
      requireFirstWrite: true,
    });
  });
});

describe('task tool policy', () => {
  it('disallows discovery tools for tightly scoped implementation tasks', () => {
    const policy = getTaskToolPolicy(makeTask({
      title: 'Add route hooks',
      description: 'Update the UI routes only',
      allowedWritePaths: ['src/RootNavigation.kt', 'src/PrototypeScreenshotTests.kt'],
      contextPatterns: ['src/RootNavigation.kt', 'src/PrototypeScreenshotTests.kt'],
      implementationSteps: ['Edit the route table', 'Edit the screenshot tests'],
    }));

    expect(policy.allowedTools).toEqual(['Read', 'Edit', 'MultiEdit', 'Write']);
    expect(policy.disallowedTools).toEqual(expect.arrayContaining(['Agent', 'Bash', 'Glob', 'Grep', 'LS', 'Find']));
    expect(policy.disallowedTools).toContain('ToolSearch');
  });

  it('keeps broader bounded tasks on subagent-only restrictions', () => {
    const policy = getTaskToolPolicy(makeTask({
      title: 'Implement API endpoint',
      description: 'Add route and DTOs',
      allowedWritePaths: ['api/src/version'],
      contextPatterns: ['api/src/version/**'],
      implementationSteps: [],
    }));

    expect(policy.allowedTools).toBeUndefined();
    expect(policy.disallowedTools).toEqual(['Agent']);
  });

  it('allows strict tool fences for two-file tasks with larger concrete context', () => {
    const policy = getTaskToolPolicy(makeTask({
      title: 'Create foundation files',
      description: 'Add a repository and view model using exact existing analog files',
      allowedWritePaths: ['src/TrainingPlansRepository.kt', 'src/TrainingPlansViewModel.kt'],
      contextPatterns: [
        'src/VaultRepository.kt',
        'src/VaultViewModel.kt',
        'src/TrainingPlansScreen.kt',
        'src/TrainingPlanDetailScreen.kt',
        'src/RootNavigation.kt',
      ],
      implementationSteps: ['Mirror the repository pattern', 'Mirror the view-model pattern'],
    }));

    expect(policy.allowedTools).toEqual(['Read', 'Edit', 'MultiEdit', 'Write']);
    expect(policy.disallowedTools).toContain('Bash');
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
