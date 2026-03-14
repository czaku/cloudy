import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the model runner so we don't spawn real processes
vi.mock('../executor/model-runner.js', () => {
  const runPhaseModel = vi.fn();
  return { runPhaseModel, runAbstractModel: runPhaseModel, runClaude: runPhaseModel };
});

// Mock filesystem operations
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock git diff
vi.mock('../git/git.js', () => ({
  getGitDiff: vi.fn(),
}));

// Mock utils/fs writeJson/readJson/ensureDir
vi.mock('../utils/fs.js', () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  ensureDir: vi.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import type { Plan, Task } from '../core/types.js';
import { runPhaseModel } from '../executor/model-runner.js';
import { getGitDiff } from '../git/git.js';
import { readJson, writeJson, ensureDir } from '../utils/fs.js';
import { runHolisticReview } from '../reviewer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlan(overrides?: Partial<Plan>): Plan {
  return {
    goal: 'Build a test feature',
    tasks: [
      {
        id: 'task-1',
        title: 'Implement API',
        description: 'Build the REST API endpoints',
        acceptanceCriteria: ['POST /api/v1/items returns 201', 'GET /api/v1/items returns list'],
        dependencies: [],
        contextPatterns: [],
        status: 'completed',
        retries: 0,
        maxRetries: 2,
        ifFailed: 'skip',
        timeout: 3600000,
        acceptanceCriteriaResults: [
          { criterion: 'POST /api/v1/items returns 201', passed: true, explanation: 'Endpoint implemented' },
          { criterion: 'GET /api/v1/items returns list', passed: true, explanation: 'List endpoint works' },
        ],
      } as Task,
      {
        id: 'task-2',
        title: 'Add UI component',
        description: 'Build the React component',
        acceptanceCriteria: ['Component renders without errors'],
        dependencies: ['task-1'],
        contextPatterns: [],
        status: 'completed',
        retries: 1,
        maxRetries: 2,
        ifFailed: 'skip',
        timeout: 3600000,
      } as Task,
    ],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T01:00:00Z',
    ...overrides,
  };
}

function makePassResponse() {
  return JSON.stringify({
    verdict: 'PASS',
    summary: 'All tasks completed successfully. Code follows conventions.',
    criteriaResults: [
      { criterion: 'POST /api/v1/items returns 201', passed: true, note: 'Implemented correctly' },
    ],
    issues: [],
    conventionViolations: [],
    suggestions: ['Consider adding rate limiting'],
  });
}

function makeFailResponse() {
  return JSON.stringify({
    verdict: 'FAIL',
    summary: 'Critical bugs detected. Missing imports and wrong endpoints.',
    criteriaResults: [
      { criterion: 'POST /api/v1/items returns 201', passed: false, note: 'Endpoint missing' },
    ],
    issues: [
      { severity: 'critical', description: 'Missing import for React', location: 'src/App.tsx:1' },
      { severity: 'major', description: 'Wrong API port used (3000 instead of 47821)', location: 'src/api.ts:5' },
    ],
    conventionViolations: ['Used npm instead of bun'],
    suggestions: [],
  });
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: getGitDiff returns a simple diff
  vi.mocked(getGitDiff).mockResolvedValue('diff --git a/src/api.ts b/src/api.ts\n+++ b/src/api.ts\n+export const handler = () => {};');

  // Default: writeJson and ensureDir succeed
  vi.mocked(writeJson).mockResolvedValue(undefined);
  vi.mocked(ensureDir).mockResolvedValue(undefined);

  // Default: fs.mkdir succeeds
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);

  // Default: readdir returns empty (no checkpoints)
  vi.mocked(fs.readdir).mockResolvedValue([] as any);

  // Default: no spec file or CLAUDE.md
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

  // Default: readJson returns null (no checkpoint files)
  vi.mocked(readJson).mockResolvedValue(null);

  // Default: runPhaseModel returns a PASS verdict
  vi.mocked(runPhaseModel).mockResolvedValue({
    success: true,
    output: makePassResponse(),
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    durationMs: 1500,
    costUsd: 0.001,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runHolisticReview', () => {
  const cwd = '/fake/project';

  it('reads spec from .cloudy/spec.md when available', async () => {
    const specContent = '# My Spec\n\n## Task 1\nBuild the API';
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.cloudy/spec.md')) return specContent;
      throw new Error('ENOENT');
    });

    await runHolisticReview(cwd, makePlan(), 'sonnet');

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('# My Spec');
    expect(callArgs.prompt).toContain('Build the API');
  });

  it('falls back to plan.goal + task descriptions when no spec file', async () => {
    // All readFile calls throw (no spec.md, no CLAUDE.md)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const plan = makePlan();
    await runHolisticReview(cwd, plan, 'sonnet');

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain(plan.goal);
    expect(callArgs.prompt).toContain('spec not saved');
    expect(callArgs.prompt).toContain('Implement API');
  });

  it('reads CLAUDE.md when present', async () => {
    const claudeMdContent = '# CLAUDE.md\n\nUse bun, not npm.\nPorts: 47820, 47821, 47822.';
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('CLAUDE.md') && !p.includes('.cloudy')) return claudeMdContent;
      throw new Error('ENOENT');
    });

    await runHolisticReview(cwd, makePlan(), 'sonnet');

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('Use bun, not npm.');
    expect(callArgs.prompt).toContain('47820, 47821, 47822');
  });

  it('omits CLAUDE.md section when not found', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    await runHolisticReview(cwd, makePlan(), 'sonnet');

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0];
    expect(callArgs.prompt).toContain('CLAUDE.md not found');
  });

  it('forwards review runtime overrides to the abstract runner', async () => {
    await runHolisticReview(
      cwd,
      makePlan(),
      'sonnet',
      undefined,
      undefined,
      { engine: 'codex', provider: 'codex', modelId: 'o3' },
    );

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0] as any;
    expect(callArgs.engine).toBe('codex');
    expect(callArgs.provider).toBe('codex');
    expect(callArgs.modelId).toBe('o3');
    expect(callArgs.taskType).toBe('review');
  });

  it('uses earliest checkpoint as phase-start SHA', async () => {
    const checkpointsDir = path.join(cwd, '.cloudy', 'checkpoints');

    vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
      if (String(dirPath) === checkpointsDir) {
        return ['task-1.json', 'task-2.json'] as any;
      }
      return [] as any;
    });

    vi.mocked(readJson).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('task-1.json')) {
        return { taskId: 'task-1', sha: 'abc123def456', createdAt: '2025-01-01T00:00:00Z' };
      }
      if (p.endsWith('task-2.json')) {
        return { taskId: 'task-2', sha: 'bbb222ccc333', createdAt: '2025-01-01T00:30:00Z' };
      }
      return null;
    });

    await runHolisticReview(cwd, makePlan(), 'sonnet');

    // Should use the OLDEST checkpoint SHA (task-1 created earlier)
    expect(vi.mocked(getGitDiff)).toHaveBeenCalledWith(cwd, 'abc123def456');
  });

  it('correctly builds prompt containing spec content, CLAUDE.md, and task summary', async () => {
    const specContent = '# Phase 7 Spec\n\n## Task 1\nBuild the API endpoint';
    const claudeMdContent = '# CLAUDE.md\n\nbun not npm';

    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.cloudy/spec.md')) return specContent;
      if (p.endsWith('CLAUDE.md') && !p.includes('.cloudy')) return claudeMdContent;
      throw new Error('ENOENT');
    });

    const plan = makePlan();
    await runHolisticReview(cwd, plan, 'sonnet');

    const callArgs = vi.mocked(runPhaseModel).mock.calls[0][0];
    const prompt = callArgs.prompt;

    // Should include CLAUDE.md content
    expect(prompt).toContain('bun not npm');
    // Should include spec content
    expect(prompt).toContain('# Phase 7 Spec');
    // Should include task summary
    expect(prompt).toContain('task-1: Implement API');
    expect(prompt).toContain('Status: completed');
    // Should include git diff
    expect(prompt).toContain('diff --git');
    // Should include holistic review instructions
    expect(prompt).toContain('holistic post-run review');
    expect(prompt).toContain('Review Protocol');
  });

  it('parses PASS verdict from Claude response', async () => {
    vi.mocked(runPhaseModel).mockResolvedValue({
      success: true,
      output: makePassResponse(),
      usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 2000,
      costUsd: 0.002,
    });

    const result = await runHolisticReview(cwd, makePlan(), 'sonnet');

    expect(result.verdict).toBe('PASS');
    expect(result.summary).toContain('All tasks completed successfully');
    expect(result.issues).toHaveLength(0);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toContain('rate limiting');
    expect(result.criteriaResults).toHaveLength(1);
    expect(result.criteriaResults[0].passed).toBe(true);
    expect(result.costUsd).toBe(0.002);
    expect(result.model).toBe('sonnet');
  });

  it('parses FAIL verdict with issues', async () => {
    vi.mocked(runPhaseModel).mockResolvedValue({
      success: true,
      output: makeFailResponse(),
      usage: { inputTokens: 300, outputTokens: 150, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 3000,
      costUsd: 0.003,
    });

    const result = await runHolisticReview(cwd, makePlan(), 'haiku');

    expect(result.verdict).toBe('FAIL');
    expect(result.summary).toContain('Critical bugs detected');
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].severity).toBe('critical');
    expect(result.issues[0].description).toContain('Missing import');
    expect(result.issues[0].location).toBe('src/App.tsx:1');
    expect(result.issues[1].severity).toBe('major');
    expect(result.conventionViolations).toHaveLength(1);
    expect(result.conventionViolations[0]).toContain('bun');
    expect(result.model).toBe('haiku');
  });

  it('handles malformed JSON from Claude gracefully', async () => {
    vi.mocked(runPhaseModel).mockResolvedValue({
      success: true,
      output: 'This is not JSON at all! The implementation looks good overall.',
      usage: { inputTokens: 50, outputTokens: 25, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 500,
      costUsd: 0.0005,
    });

    const result = await runHolisticReview(cwd, makePlan(), 'sonnet');

    // Should gracefully return PASS_WITH_NOTES
    expect(result.verdict).toBe('PASS_WITH_NOTES');
    expect(result.summary).toContain('The implementation looks good');
    expect(result.issues).toHaveLength(0);
    expect(result.criteriaResults).toHaveLength(0);
    expect(result.costUsd).toBe(0.0005);
  });

  it('saves result to review.json inside the run dir', async () => {
    await runHolisticReview(cwd, makePlan(), 'sonnet');

    const calls = vi.mocked(writeJson).mock.calls;
    const reviewCall = calls.find(([p]) => String(p).endsWith('review.json'));
    expect(reviewCall).toBeDefined();
    expect(reviewCall![1]).toMatchObject({
      verdict: expect.any(String),
      summary: expect.any(String),
    });
  });

  it('ReviewResult has all required fields', async () => {
    const result = await runHolisticReview(cwd, makePlan(), 'opus');

    expect(result).toMatchObject({
      verdict: expect.stringMatching(/^(PASS|PASS_WITH_NOTES|FAIL)$/),
      summary: expect.any(String),
      criteriaResults: expect.any(Array),
      issues: expect.any(Array),
      conventionViolations: expect.any(Array),
      suggestions: expect.any(Array),
      costUsd: expect.any(Number),
      durationMs: expect.any(Number),
      model: expect.any(String),
    });
  });
});
