import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../src/config/config.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { CloudyConfig } from '../../src/core/types.js';

function makeConfig(overrides: Partial<CloudyConfig> = {}): CloudyConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe('validateConfig', () => {
  it('returns no errors for default config', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
  });

  it('errors on invalid planning model', () => {
    const errors = validateConfig(makeConfig({ models: { ...DEFAULT_CONFIG.models, planning: 'gpt-4' as never } }));
    expect(errors.some((e) => e.includes('models.planning'))).toBe(true);
  });

  it('errors on invalid execution model', () => {
    const errors = validateConfig(makeConfig({ models: { ...DEFAULT_CONFIG.models, execution: 'gemini' as never } }));
    expect(errors.some((e) => e.includes('models.execution'))).toBe(true);
  });

  it('errors on invalid engine', () => {
    const errors = validateConfig(makeConfig({ engine: 'made-up-engine' as never }));
    expect(errors.some((e) => e.includes('engine'))).toBe(true);
  });

  it('errors on invalid validation model', () => {
    const errors = validateConfig(makeConfig({ models: { ...DEFAULT_CONFIG.models, validation: 'turbo' as never } }));
    expect(errors.some((e) => e.includes('models.validation'))).toBe(true);
  });

  it('errors on negative maxRetries', () => {
    const errors = validateConfig(makeConfig({ maxRetries: -1 }));
    expect(errors.some((e) => e.includes('maxRetries'))).toBe(true);
  });

  it('errors on maxRetries over 10', () => {
    const errors = validateConfig(makeConfig({ maxRetries: 11 }));
    expect(errors.some((e) => e.includes('maxRetries'))).toBe(true);
  });

  it('accepts maxRetries at boundary values (0 and 10)', () => {
    expect(validateConfig(makeConfig({ maxRetries: 0 }))).toEqual([]);
    expect(validateConfig(makeConfig({ maxRetries: 10 }))).toEqual([]);
  });

  it('errors on taskTimeoutMs below 60000', () => {
    const errors = validateConfig(makeConfig({ taskTimeoutMs: 30000 }));
    expect(errors.some((e) => e.includes('taskTimeoutMs'))).toBe(true);
  });

  it('accepts taskTimeoutMs at 60000', () => {
    expect(validateConfig(makeConfig({ taskTimeoutMs: 60000 }))).toEqual([]);
  });

  it('errors on dashboardPort below 1024', () => {
    const errors = validateConfig(makeConfig({ dashboardPort: 80 }));
    expect(errors.some((e) => e.includes('dashboardPort'))).toBe(true);
  });

  it('errors on dashboardPort above 65535', () => {
    const errors = validateConfig(makeConfig({ dashboardPort: 99999 }));
    expect(errors.some((e) => e.includes('dashboardPort'))).toBe(true);
  });

  it('errors on invalid approval mode', () => {
    const errors = validateConfig(makeConfig({
      approval: { ...DEFAULT_CONFIG.approval, mode: 'auto' as never },
    }));
    expect(errors.some((e) => e.includes('approval.mode'))).toBe(true);
  });

  it('errors on invalid autoAction', () => {
    const errors = validateConfig(makeConfig({
      approval: { ...DEFAULT_CONFIG.approval, autoAction: 'skip' as never },
    }));
    expect(errors.some((e) => e.includes('approval.autoAction'))).toBe(true);
  });

  it('errors on approval timeoutSec below 10', () => {
    const errors = validateConfig(makeConfig({
      approval: { ...DEFAULT_CONFIG.approval, timeoutSec: 5 },
    }));
    expect(errors.some((e) => e.includes('approval.timeoutSec'))).toBe(true);
  });

  it('accepts all valid approval modes', () => {
    for (const mode of ['never', 'always', 'on-failure'] as const) {
      const errors = validateConfig(makeConfig({ approval: { ...DEFAULT_CONFIG.approval, mode } }));
      expect(errors).toEqual([]);
    }
  });

  it('returns multiple errors when multiple fields are invalid', () => {
    const errors = validateConfig(makeConfig({
      maxRetries: -5,
      dashboardPort: 0,
    }));
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('errors on invalid keel port', () => {
    const errors = validateConfig(makeConfig({
      keel: { slug: 'fitkind', port: 70000 },
    }));
    expect(errors.some((e) => e.includes('keel.port'))).toBe(true);
  });
});
