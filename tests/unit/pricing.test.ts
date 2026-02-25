import { describe, it, expect } from 'vitest';
import { estimateCost, getPricing } from '../../src/cost/pricing.js';

describe('getPricing', () => {
  it('returns correct pricing for sonnet', () => {
    const p = getPricing('sonnet');
    expect(p.inputPerMillion).toBe(3);
    expect(p.outputPerMillion).toBe(15);
    expect(p.cacheReadPerMillion).toBe(0.3);
    expect(p.cacheWritePerMillion).toBe(3.75);
  });

  it('returns correct pricing for haiku', () => {
    const p = getPricing('haiku');
    expect(p.inputPerMillion).toBe(0.8);
    expect(p.outputPerMillion).toBe(4);
    expect(p.cacheReadPerMillion).toBe(0.08);
    expect(p.cacheWritePerMillion).toBe(1);
  });

  it('returns correct pricing for opus', () => {
    const p = getPricing('opus');
    expect(p.inputPerMillion).toBe(15);
    expect(p.outputPerMillion).toBe(75);
    expect(p.cacheReadPerMillion).toBe(1.5);
    expect(p.cacheWritePerMillion).toBe(18.75);
  });

  it('output price >= input price for all models (output is more expensive)', () => {
    for (const model of ['opus', 'sonnet', 'haiku'] as const) {
      const p = getPricing(model);
      expect(p.outputPerMillion, `${model}: output >= input`).toBeGreaterThanOrEqual(p.inputPerMillion);
    }
  });

  it('haiku is cheaper than sonnet per token', () => {
    const haiku = getPricing('haiku');
    const sonnet = getPricing('sonnet');
    expect(haiku.inputPerMillion).toBeLessThan(sonnet.inputPerMillion);
    expect(haiku.outputPerMillion).toBeLessThan(sonnet.outputPerMillion);
  });

  it('sonnet is cheaper than opus per token', () => {
    const sonnet = getPricing('sonnet');
    const opus = getPricing('opus');
    expect(sonnet.inputPerMillion).toBeLessThan(opus.inputPerMillion);
    expect(sonnet.outputPerMillion).toBeLessThan(opus.outputPerMillion);
  });
});

describe('estimateCost', () => {
  it('returns 0 for zero tokens', () => {
    const cost = estimateCost('sonnet', 0, 0, 0, 0);
    expect(cost).toBe(0);
  });

  it('calculates cost from input tokens only', () => {
    const p = getPricing('sonnet');
    // 1M input tokens should cost exactly inputPerMillion
    const cost = estimateCost('sonnet', 1_000_000, 0, 0, 0);
    expect(cost).toBeCloseTo(p.inputPerMillion, 6);
  });

  it('calculates cost from output tokens only', () => {
    const p = getPricing('sonnet');
    const cost = estimateCost('sonnet', 0, 1_000_000, 0, 0);
    expect(cost).toBeCloseTo(p.outputPerMillion, 6);
  });

  it('calculates combined input + output cost', () => {
    const p = getPricing('sonnet');
    const cost = estimateCost('sonnet', 1_000_000, 1_000_000, 0, 0);
    expect(cost).toBeCloseTo(p.inputPerMillion + p.outputPerMillion, 6);
  });

  it('includes cache read tokens in cost calculation', () => {
    const p = getPricing('sonnet');
    const cost = estimateCost('sonnet', 0, 0, 1_000_000, 0);
    expect(cost).toBeCloseTo(p.cacheReadPerMillion, 6);
  });

  it('includes cache write tokens in cost calculation', () => {
    const p = getPricing('sonnet');
    const cost = estimateCost('sonnet', 0, 0, 0, 1_000_000);
    expect(cost).toBeCloseTo(p.cacheWritePerMillion, 6);
  });

  it('scales linearly with token count', () => {
    const half = estimateCost('sonnet', 500_000, 500_000, 0, 0);
    const full = estimateCost('sonnet', 1_000_000, 1_000_000, 0, 0);
    expect(full).toBeCloseTo(half * 2, 6);
  });

  it('haiku costs less than sonnet for same token count', () => {
    const haiku = estimateCost('haiku', 100_000, 50_000, 0, 0);
    const sonnet = estimateCost('sonnet', 100_000, 50_000, 0, 0);
    expect(haiku).toBeLessThan(sonnet);
  });

  it('opus costs more than sonnet for same token count', () => {
    const opus = estimateCost('opus', 100_000, 50_000, 0, 0);
    const sonnet = estimateCost('sonnet', 100_000, 50_000, 0, 0);
    expect(opus).toBeGreaterThan(sonnet);
  });

  it('typical task cost is in a reasonable range (< $0.50 for 100K tokens on haiku)', () => {
    // Real-world sanity check: 100K input + 50K output on the cheapest model should cost cents
    const cost = estimateCost('haiku', 100_000, 50_000, 0, 0);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.5);
  });

  it('cache read is cheaper than fresh input', () => {
    const inputCost = estimateCost('sonnet', 1_000_000, 0, 0, 0);
    const cacheReadCost = estimateCost('sonnet', 0, 0, 1_000_000, 0);
    expect(cacheReadCost).toBeLessThan(inputCost);
  });
});
