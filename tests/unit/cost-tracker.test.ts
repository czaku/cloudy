import { describe, it, expect } from 'vitest';
import { CostTracker } from '../../src/cost/tracker.js';
import type { ClaudeRunResult } from '../../src/core/types.js';

function makeResult(overrides: Partial<ClaudeRunResult> = {}): ClaudeRunResult {
  return {
    success: true,
    output: 'done',
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
    },
    durationMs: 5000,
    costUsd: 0,
    ...overrides,
  };
}

describe('CostTracker', () => {
  it('records an entry and uses costUsd when > 0', () => {
    const tracker = new CostTracker();
    const entry = tracker.record('sonnet', 'execution', makeResult({ costUsd: 0.05 }));

    expect(entry.model).toBe('sonnet');
    expect(entry.phase).toBe('execution');
    expect(entry.estimatedUsd).toBe(0.05);
    expect(entry.usage.inputTokens).toBe(1000);
  });

  it('falls back to estimateCost when costUsd is 0', () => {
    const tracker = new CostTracker();
    const entry = tracker.record('sonnet', 'execution', makeResult({ costUsd: 0 }));

    // estimateCost should produce a non-zero value from the token counts
    expect(entry.estimatedUsd).toBeGreaterThan(0);
  });

  it('getSummary accumulates totals', () => {
    const tracker = new CostTracker();
    tracker.record('sonnet', 'execution', makeResult({ costUsd: 0.05 }));
    tracker.record('haiku', 'validation', makeResult({ costUsd: 0.01 }));

    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(2000);
    expect(summary.totalOutputTokens).toBe(1000);
    expect(summary.totalCacheReadTokens).toBe(400);
    expect(summary.totalCacheWriteTokens).toBe(200);
    expect(summary.totalEstimatedUsd).toBeCloseTo(0.06);
  });

  it('getSummary groups by phase and model', () => {
    const tracker = new CostTracker();
    tracker.record('sonnet', 'execution', makeResult({ costUsd: 0.05 }));
    tracker.record('haiku', 'validation', makeResult({ costUsd: 0.01 }));
    tracker.record('sonnet', 'execution', makeResult({ costUsd: 0.03 }));

    const summary = tracker.getSummary();
    expect(summary.byPhase['execution']).toBeCloseTo(0.08);
    expect(summary.byPhase['validation']).toBeCloseTo(0.01);
    expect(summary.byModel['sonnet']).toBeCloseTo(0.08);
    expect(summary.byModel['haiku']).toBeCloseTo(0.01);
  });

  it('getSummary returns zeros when empty', () => {
    const tracker = new CostTracker();
    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalCacheReadTokens).toBe(0);
    expect(summary.totalCacheWriteTokens).toBe(0);
    expect(summary.totalEstimatedUsd).toBe(0);
    expect(summary.byPhase).toEqual({});
    expect(summary.byModel).toEqual({});
  });

  it('getEntries returns a copy', () => {
    const tracker = new CostTracker();
    tracker.record('opus', 'planning', makeResult({ costUsd: 0.10 }));

    const entries = tracker.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].model).toBe('opus');

    // Mutating the returned array should not affect the tracker
    entries.pop();
    expect(tracker.getEntries()).toHaveLength(1);
  });
});
