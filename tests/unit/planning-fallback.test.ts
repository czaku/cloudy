import { describe, expect, it } from 'vitest';
import { resolvePlanningRetryModel } from '../../src/planner/planning-fallback.js';

describe('resolvePlanningRetryModel', () => {
  it('retries opus planning timeouts with sonnet', () => {
    expect(resolvePlanningRetryModel('opus', new Error('Planning timed out after 5 minutes'))).toBe('sonnet');
  });

  it('does not retry sonnet planning timeouts', () => {
    expect(resolvePlanningRetryModel('sonnet', new Error('Planning timed out after 5 minutes'))).toBeNull();
  });

  it('does not retry non-timeout errors', () => {
    expect(resolvePlanningRetryModel('opus', new Error('provider unavailable'))).toBeNull();
  });
});
