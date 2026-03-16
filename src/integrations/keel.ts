/**
 * Keel integration — writes run outcomes back to a keel project.
 *
 * Uses the keel dashboard API to update task execution state and append notes.
 */

import path from 'node:path';
import { getCurrentRunDir } from '../utils/run-dir.js';
import { log } from '../utils/logger.js';
import { readJson, writeJson } from '../utils/fs.js';

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
  reviewVerdict?: 'PASS' | 'PASS_WITH_NOTES' | 'FAIL';
  filesTouched?: string[];
  artifactsProduced?: string[];
}

interface ReviewArtifact {
  verdict?: 'PASS' | 'PASS_WITH_NOTES' | 'FAIL';
  issues?: Array<{ severity?: 'critical' | 'major' | 'minor'; description?: string }>;
  suggestions?: string[];
}

interface VerificationArtifact {
  checks?: Array<{ command: string; passed: boolean }>;
}

interface RunAssessment {
  runName: string;
  summary: string;
  tasksDone: number;
  tasksFailed: number;
  checksPassed: string[];
  checksFailed: string[];
  artifactsProduced: string[];
  filesTouched: string[];
  acceptanceStatus: 'accepted' | 'needs_review' | 'blocked';
  qualityVerdict: 'green' | 'yellow' | 'red';
  risks: string[];
  recommendedNextAction: string;
}

interface KeelTaskPatch {
  status?: 'done' | 'blocked';
  run_status?: 'succeeded' | 'failed';
  cloudy_run?: {
    runName: string;
    taskId: string;
  };
}

function baseUrl(ctx: KeelContext): string {
  return `http://127.0.0.1:${ctx.port ?? 7842}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function requestJson(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
  }
}

async function patchTask(ctx: KeelContext, taskId: string, patch: KeelTaskPatch): Promise<void> {
  await requestJson(`${baseUrl(ctx)}/api/projects/${ctx.slug}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

async function addTaskNote(ctx: KeelContext, taskId: string, text: string): Promise<void> {
  await requestJson(`${baseUrl(ctx)}/api/projects/${ctx.slug}/tasks/${taskId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ by: 'cloudy', text }),
  });
}

async function createDecisionDraft(ctx: KeelContext, taskId: string, outcome: RunOutcome, runName: string): Promise<void> {
  const title = `Cloudy run blocked ${taskId}`;
  const context = [
    `Run ${runName} failed while updating ${ctx.slug}/${taskId}.`,
    `Completed tasks: ${outcome.tasksDone}.`,
    `Failed tasks: ${outcome.tasksFailed}.`,
    `Cost: $${outcome.costUsd.toFixed(4)}.`,
    `Duration: ${formatDuration(outcome.durationMs)}.`,
    outcome.topError ? `Top error: ${outcome.topError}` : null,
  ].filter(Boolean).join('\n');

  await requestJson(`${baseUrl(ctx)}/api/projects/${ctx.slug}/decisions`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      context,
      outcome: 'Investigate the failed cloudy run, then decide whether to retry, split the task, or revise the spec.',
      affects: [taskId],
      status: 'proposed',
    }),
  });
}

function buildSummary(outcome: RunOutcome, runName: string): string {
  const parts = [
    `Cloudy run ${runName} ${outcome.success ? 'completed successfully' : 'failed'}.`,
    `${outcome.tasksDone} task(s) completed.`,
    `${outcome.tasksFailed} task(s) failed.`,
    `Cost: $${outcome.costUsd.toFixed(4)}.`,
    `Duration: ${formatDuration(outcome.durationMs)}.`,
  ];
  if (outcome.topError) {
    parts.push(`Top error: ${outcome.topError}`);
  }
  return parts.join(' ');
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))].sort();
}

async function buildAssessment(outcome: RunOutcome, cwd: string, runDir: string, runName: string): Promise<RunAssessment> {
  const review = await readJson<ReviewArtifact>(path.join(runDir, 'review.json'));
  const verification = await readJson<VerificationArtifact>(path.join(runDir, 'verification.json'));

  const checksPassed = uniqueSorted((verification?.checks ?? []).filter((check) => check.passed).map((check) => check.command));
  const checksFailed = uniqueSorted((verification?.checks ?? []).filter((check) => !check.passed).map((check) => check.command));
  const filesTouched = uniqueSorted(outcome.filesTouched ?? []);
  const artifactsProduced = uniqueSorted([
    ...(outcome.artifactsProduced ?? []),
    review ? 'review.json' : undefined,
    verification ? 'verification.json' : undefined,
  ]);

  const reviewVerdict = review?.verdict ?? outcome.reviewVerdict;

  const risks = uniqueSorted([
    outcome.topError,
    ...(review?.issues ?? [])
      .filter((issue) => issue.severity === 'critical' || issue.severity === 'major')
      .map((issue) => issue.description),
    ...(checksFailed.length > 0 ? checksFailed.map((command) => `Verification check failed: ${command}`) : []),
  ]);

  const acceptanceStatus: RunAssessment['acceptanceStatus'] = !outcome.success
    ? 'blocked'
    : reviewVerdict === 'PASS'
      ? 'accepted'
      : 'needs_review';

  const qualityVerdict: RunAssessment['qualityVerdict'] = !outcome.success || reviewVerdict === 'FAIL'
    ? 'red'
    : reviewVerdict === 'PASS_WITH_NOTES' || checksFailed.length > 0 || risks.length > 0
      ? 'yellow'
      : 'green';

  const recommendedNextAction =
    acceptanceStatus === 'blocked'
      ? 'Investigate the blocking failure, update Keel with the root cause, and decide whether to retry or re-plan.'
      : acceptanceStatus === 'needs_review'
        ? 'Review the remaining notes and evidence before marking the task done.'
        : 'Task is accepted; advance the next ready task if lane rules allow it.';

  const assessment: RunAssessment = {
    runName,
    summary: buildSummary(outcome, runName),
    tasksDone: outcome.tasksDone,
    tasksFailed: outcome.tasksFailed,
    checksPassed,
    checksFailed,
    artifactsProduced,
    filesTouched,
    acceptanceStatus,
    qualityVerdict,
    risks,
    recommendedNextAction,
  };

  await writeJson(path.join(runDir, 'assessment.json'), assessment);
  return assessment;
}

function buildAssessmentNote(assessment: RunAssessment): string {
  const lines = [
    `Cloudy run ${assessment.runName} assessment`,
    '',
    `Summary: ${assessment.summary}`,
    `Quality verdict: ${assessment.qualityVerdict}`,
    `Acceptance status: ${assessment.acceptanceStatus}`,
    `Tasks done: ${assessment.tasksDone}`,
    `Tasks failed: ${assessment.tasksFailed}`,
    `Checks passed: ${assessment.checksPassed.length > 0 ? assessment.checksPassed.join(', ') : 'none recorded'}`,
    `Checks failed: ${assessment.checksFailed.length > 0 ? assessment.checksFailed.join(', ') : 'none'}`,
    `Artifacts: ${assessment.artifactsProduced.length > 0 ? assessment.artifactsProduced.join(', ') : 'none recorded'}`,
    `Files touched: ${assessment.filesTouched.length > 0 ? assessment.filesTouched.join(', ') : 'none recorded'}`,
    `Risks: ${assessment.risks.length > 0 ? assessment.risks.join(' | ') : 'none'}`,
    `Next action: ${assessment.recommendedNextAction}`,
  ];
  return lines.join('\n');
}

export async function writeRunOutcome(ctx: KeelContext, outcome: RunOutcome, cwd: string): Promise<void> {
  const runDir = await getCurrentRunDir(cwd);
  const runName = path.basename(runDir);
  const status = outcome.success ? 'done' : 'blocked';
  const runStatus = outcome.success ? 'succeeded' : 'failed';
  const summary = buildSummary(outcome, runName);

  try {
    if (!ctx.taskId) {
      await log.warn(`[keel] No task id provided for ${ctx.slug}; skipping write-back. ${summary}`);
      return;
    }

    const assessment = await buildAssessment(outcome, cwd, runDir, runName);

    await patchTask(ctx, ctx.taskId, {
      status,
      run_status: runStatus,
      cloudy_run: {
        runName,
        taskId: ctx.taskId,
      },
    });
    await addTaskNote(ctx, ctx.taskId, buildAssessmentNote(assessment));

    if (!outcome.success) {
      await createDecisionDraft(ctx, ctx.taskId, outcome, runName);
    }

    await log.info(`[keel] Updated ${ctx.slug}/${ctx.taskId} → ${status} (${outcome.tasksDone} done, ${outcome.tasksFailed} failed, $${outcome.costUsd.toFixed(4)})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await log.warn(`[keel] Write-back failed for ${ctx.slug}${ctx.taskId ? `/${ctx.taskId}` : ''}: ${message}`)
    throw error
  }
}
