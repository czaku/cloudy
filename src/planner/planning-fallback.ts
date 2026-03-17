import type { ClaudeModel } from '../core/types.js';

export function resolvePlanningRetryModel(model: ClaudeModel, error: unknown): ClaudeModel | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const timedOut = /Planning timed out/i.test(message);

  if (!timedOut) return null;
  if (model === 'opus') return 'sonnet';

  return null;
}
