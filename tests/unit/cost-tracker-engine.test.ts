import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../src/cost/tracker.js';
import type { ClaudeRunResult } from '../../src/core/types.js';

function makeResult(overrides: Partial<ClaudeRunResult> = {}): ClaudeRunResult {
  return {
    success: true,
    output: 'done',
    usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 },
    durationMs: 5000,
    costUsd: 0.05,
    ...overrides,
  };
}

describe('CostTracker — engine field', () => {
  it('defaults engine to claude-code when not specified', () => {
    const tracker = new CostTracker();
    const entry = tracker.record('sonnet', 'execution', makeResult());
    expect(entry.engine).toBe('claude-code');
  });

  it('stores pi-mono engine when specified', () => {
    const tracker = new CostTracker();
    const entry = tracker.record('haiku', 'execution', makeResult(), 'pi-mono');
    expect(entry.engine).toBe('pi-mono');
  });

  it('stores claude-code engine when explicitly specified', () => {
    const tracker = new CostTracker();
    const entry = tracker.record('opus', 'planning', makeResult(), 'claude-code');
    expect(entry.engine).toBe('claude-code');
  });

  it('existing cost tracking still works after engine field addition', () => {
    const tracker = new CostTracker();
    tracker.record('sonnet', 'execution', makeResult({ costUsd: 0.05 }), 'claude-code');
    tracker.record('haiku', 'validation', makeResult({ costUsd: 0.01 }), 'pi-mono');

    const summary = tracker.getSummary();
    expect(summary.totalEstimatedUsd).toBeCloseTo(0.06);
    expect(summary.byModel['sonnet']).toBeCloseTo(0.05);
    expect(summary.byModel['haiku']).toBeCloseTo(0.01);
  });

  it('getEntries returns entries with engine field', () => {
    const tracker = new CostTracker();
    tracker.record('sonnet', 'execution', makeResult(), 'pi-mono');

    const entries = tracker.getEntries();
    expect(entries[0].engine).toBe('pi-mono');
  });
});
