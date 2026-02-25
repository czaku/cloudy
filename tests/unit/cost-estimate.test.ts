import { describe, it, expect } from 'vitest';
import { getPricing, estimateTaskCost } from '../../src/cli/commands/dry-run.js';

describe('getPricing', () => {
  it('returns correct pricing for claude-sonnet-4-6', () => {
    const p = getPricing('claude-sonnet-4-6');
    expect(p.inputPer1M).toBe(3);
    expect(p.outputPer1M).toBe(15);
  });

  it('returns correct pricing for claude-haiku-4-5-20251001', () => {
    const p = getPricing('claude-haiku-4-5-20251001');
    expect(p.inputPer1M).toBe(0.25);
    expect(p.outputPer1M).toBe(1.25);
  });

  it('returns correct pricing for claude-opus-4-6', () => {
    const p = getPricing('claude-opus-4-6');
    expect(p.inputPer1M).toBe(15);
    expect(p.outputPer1M).toBe(75);
  });

  it('falls back to sonnet pricing for unknown model', () => {
    const p = getPricing('claude-unknown-future-model');
    expect(p.inputPer1M).toBe(3);
    expect(p.outputPer1M).toBe(15);
  });
});

describe('estimateTaskCost', () => {
  it('counts context chars / 4 as tokens plus overhead', () => {
    // 4000 chars of context = 1000 tokens + 2000 overhead = 3000 input tokens
    const { inputTokens } = estimateTaskCost(4000, 'claude-sonnet-4-6');
    expect(inputTokens).toBe(3000);
  });

  it('always adds 3000 output tokens', () => {
    const { outputTokens } = estimateTaskCost(0, 'claude-sonnet-4-6');
    expect(outputTokens).toBe(3000);
  });

  it('computes cost correctly for zero context (sonnet)', () => {
    // inputTokens = 0/4 + 2000 = 2000, outputTokens = 3000
    // cost = (2000/1_000_000)*3 + (3000/1_000_000)*15 = 0.006 + 0.045 = 0.051
    const { costUsd } = estimateTaskCost(0, 'claude-sonnet-4-6');
    expect(costUsd).toBeCloseTo(0.051, 4);
  });

  it('haiku is significantly cheaper than sonnet', () => {
    const haiku = estimateTaskCost(4000, 'claude-haiku-4-5-20251001');
    const sonnet = estimateTaskCost(4000, 'claude-sonnet-4-6');
    expect(haiku.costUsd).toBeLessThan(sonnet.costUsd);
  });

  it('opus is significantly more expensive than sonnet', () => {
    const opus = estimateTaskCost(4000, 'claude-opus-4-6');
    const sonnet = estimateTaskCost(4000, 'claude-sonnet-4-6');
    expect(opus.costUsd).toBeGreaterThan(sonnet.costUsd);
  });

  it('larger context means higher cost', () => {
    const small = estimateTaskCost(1000, 'claude-sonnet-4-6');
    const large = estimateTaskCost(100_000, 'claude-sonnet-4-6');
    expect(large.costUsd).toBeGreaterThan(small.costUsd);
  });
});
