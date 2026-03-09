/**
 * Keel integration — writes run outcomes back to a keel project.
 *
 * Stub: logs the outcome but does not actually call keel.
 * TODO: implement HTTP calls to keel dashboard API when keel is ready.
 */

import { log } from '../utils/logger.js';

export interface KeelContext {
  slug: string;
  taskId?: string;
  port?: number;
}

export interface RunOutcome {
  success: boolean;
  tasksDone: number;
  tasksFailed: number;
  topError?: string;
  costUsd: number;
  durationMs: number;
}

export async function writeRunOutcome(ctx: KeelContext, outcome: RunOutcome, _cwd: string): Promise<void> {
  const status = outcome.success ? 'done' : 'blocked';
  await log.info(`[keel] Would update ${ctx.slug}${ctx.taskId ? `/${ctx.taskId}` : ''} → ${status} (${outcome.tasksDone} done, ${outcome.tasksFailed} failed, $${outcome.costUsd.toFixed(4)})`);
}
