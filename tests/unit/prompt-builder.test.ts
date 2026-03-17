import { describe, it, expect } from 'vitest';
import {
  buildExecutionPrompt,
  buildRetryPrompt,
} from '../../src/executor/prompt-builder.js';
import type { Task, Plan } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Build the login page',
    description: 'Create a login page with email and password fields.',
    acceptanceCriteria: ['Has email input', 'Has password input', 'Has submit button'],
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

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    goal: 'Build a user authentication system',
    tasks: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildExecutionPrompt', () => {
  it('includes the project goal', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('# Project Goal');
    expect(prompt).toContain('Build a user authentication system');
  });

  it('includes the task title and description', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('Build the login page');
    expect(prompt).toContain('Create a login page with email and password fields.');
  });

  it('includes acceptance criteria', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('# Acceptance Criteria');
    expect(prompt).toContain('- Has email input');
    expect(prompt).toContain('- Has password input');
    expect(prompt).toContain('- Has submit button');
  });

  it('includes proof requirements, non-goals, and surface scope when present', () => {
    const prompt = buildExecutionPrompt(makeTask({
      proofRequirements: ['Capture the updated command output'],
      nonGoals: ['Do not change auth persistence'],
      surfaceScope: ['apps/cli/src/commands/login.ts'],
      collisionRisks: ['shared auth session handling'],
      definitionOfDone: ['Login command passes integration tests'],
    }), makePlan(), []);
    expect(prompt).toContain('# Proof Requirements');
    expect(prompt).toContain('Capture the updated command output');
    expect(prompt).toContain('# Non-Goals');
    expect(prompt).toContain('Do not change auth persistence');
    expect(prompt).toContain('# Surface Scope');
    expect(prompt).toContain('apps/cli/src/commands/login.ts');
    expect(prompt).toContain('# Collision Risks');
    expect(prompt).toContain('shared auth session handling');
    expect(prompt).toContain('# Definition of Done');
    expect(prompt).toContain('Login command passes integration tests');
  });

  it('includes completed task titles', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), [
      'Set up project structure',
      'Configure database',
    ]);
    expect(prompt).toContain('# Already Completed Tasks');
    expect(prompt).toContain('- Set up project structure');
    expect(prompt).toContain('- Configure database');
  });

  it('omits completed tasks section when empty', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).not.toContain('# Already Completed Tasks');
  });

  it('includes context files when provided', () => {
    const contextFiles = [
      { path: 'src/app.ts', content: 'const app = express();' },
    ];
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), [], contextFiles);
    expect(prompt).toContain('# Context Files');
    expect(prompt).toContain('src/app.ts');
    expect(prompt).toContain('const app = express();');
  });

  it('includes instructions section', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('# Instructions');
    expect(prompt).toContain('Implement this task completely');
  });

  it('instructs the executor to verify proof tasks before exploring and to allow no-code-change completion', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('If the task is primarily proof, parity, verification, or task closure, start by checking the required artifacts');
    expect(prompt).toContain('If all acceptance criteria are already satisfied, do not invent code changes.');
    expect(prompt).toContain('Do not delegate repo discovery to subagents.');
  });

  it('includes API-specific execution guidance for endpoint work', () => {
    const prompt = buildExecutionPrompt(makeTask({
      title: 'Implement app version-check API endpoint',
      description: 'Add route, DTO, and tests.',
      allowedWritePaths: ['api/src/version'],
    }), makePlan(), []);
    expect(prompt).toContain('API implementation policy');
    expect(prompt).toContain('Do not broaden into UI');
  });

  it('includes CLI-specific execution guidance for command work', () => {
    const prompt = buildExecutionPrompt(makeTask({
      title: 'Implement doctor CLI command',
      description: 'Add flags, help output, and tests.',
      allowedWritePaths: ['apps/cli/src/commands/doctor.ts'],
    }), makePlan(), []);
    expect(prompt).toContain('CLI implementation policy');
    expect(prompt).toContain('stdout/stderr');
  });

  it('omits acceptance criteria section when empty', () => {
    const task = makeTask({ acceptanceCriteria: [] });
    const prompt = buildExecutionPrompt(task, makePlan(), []);
    expect(prompt).not.toContain('# Acceptance Criteria');
  });

  it('includes verification gate section', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('Verification Gate');
  });

  it('verification gate instructs Claude to run a command before claiming done', () => {
    const prompt = buildExecutionPrompt(makeTask(), makePlan(), []);
    expect(prompt).toContain('verification');
    expect(prompt).toMatch(/run.*command|command.*run/i);
  });
});

describe('buildRetryPrompt', () => {
  it('includes the base prompt content', () => {
    const prompt = buildRetryPrompt(
      makeTask(),
      makePlan(),
      [],
      'TypeError: x is not a function',
    );
    expect(prompt).toContain('# Project Goal');
    expect(prompt).toContain('Build the login page');
    expect(prompt).toContain('# Instructions');
  });

  it('includes RETRY header and validation errors', () => {
    const errors = 'TypeError: x is not a function\nLint error on line 42';
    const prompt = buildRetryPrompt(makeTask(), makePlan(), [], errors);
    expect(prompt).toContain('# RETRY');
    expect(prompt).toContain('TypeError: x is not a function');
    expect(prompt).toContain('Lint error on line 42');
  });

  it('includes context files in retry prompt', () => {
    const contextFiles = [
      { path: 'src/login.ts', content: 'export function login() {}' },
    ];
    const prompt = buildRetryPrompt(makeTask(), makePlan(), [], 'error', contextFiles);
    expect(prompt).toContain('src/login.ts');
    expect(prompt).toContain('export function login() {}');
  });
});
