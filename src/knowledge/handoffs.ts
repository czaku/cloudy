/**
 * Inter-task knowledge sharing:
 *
 * 1. Handoff files  — `.cloudy/runs/{name}/handoffs/{taskId}.md`
 *    Written after each task completes. Contains what was built, key decisions,
 *    files changed, caveats, and acceptance criteria results. Automatically
 *    included in the prompt of any downstream task that depends on it.
 *
 * 2. Learnings file — `.cloudy/LEARNINGS.md`
 *    A running log of project-specific facts discovered during execution
 *    (e.g. "project uses Bun", "auth via middleware X"). Included in every
 *    task's prompt so later tasks inherit knowledge from earlier ones.
 *    Stays at .cloudy/ root — accumulated across all runs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR } from '../config/defaults.js';
import { ensureDir } from '../utils/fs.js';
import type { AcceptanceCriterionResult } from '../core/types.js';
import { getCurrentRunDir } from '../utils/run-dir.js';

const HANDOFFS_DIR = 'handoffs';
const LEARNINGS_FILE = 'LEARNINGS.md';

async function getHandoffsDir(cwd: string): Promise<string> {
  const runDir = await getCurrentRunDir(cwd);
  return path.join(runDir, HANDOFFS_DIR);
}

function learningsPath(cwd: string): string {
  // LEARNINGS.md is global — accumulated across all runs
  return path.join(cwd, CLAWDASH_DIR, LEARNINGS_FILE);
}

export interface HandoffData {
  taskId: string;
  title: string;
  resultSummary: string;
  criteriaResults: AcceptanceCriterionResult[];
  filesChanged?: string[];    // from git diff --name-only
  keyDecisions?: string;      // extracted from Claude's summary
}

/**
 * Write a structured handoff summary for a completed task.
 */
export async function writeHandoff(
  taskId: string,
  title: string,
  resultSummary: string,
  criteriaResults: AcceptanceCriterionResult[],
  cwd: string,
  filesChanged?: string[],
): Promise<void> {
  const handoffsDir = await getHandoffsDir(cwd);
  await ensureDir(handoffsDir);

  const lines: string[] = [
    `# Handoff: ${taskId} — ${title}`,
    '',
    '## What was implemented',
    resultSummary || '*(no summary)*',
    '',
  ];

  if (filesChanged && filesChanged.length > 0) {
    lines.push('## Files changed');
    for (const f of filesChanged) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  // Extract key decisions from the result summary
  const decisions = extractDecisions(resultSummary);
  if (decisions) {
    lines.push('## Key decisions');
    lines.push(decisions);
    lines.push('');
  }

  if (criteriaResults.length > 0) {
    lines.push('## Acceptance criteria');
    for (const cr of criteriaResults) {
      const icon = cr.passed ? '✅' : '❌';
      lines.push(`- ${icon} ${cr.criterion}`);
    }
    lines.push('');
  }

  lines.push('## Important for downstream tasks');
  lines.push(extractCaveats(resultSummary) || '*(none noted)*');
  lines.push('');

  // Surface stubs/TODOs so downstream tasks know what was left incomplete
  const gaps = extractKnownGaps(resultSummary);
  if (gaps) {
    lines.push('## Known gaps / stubs (finish in downstream tasks)');
    lines.push(gaps);
    lines.push('');
  }

  await fs.writeFile(path.join(handoffsDir, `${taskId}.md`), lines.join('\n'), 'utf-8');
}

/**
 * Read handoff summaries for the given task IDs and format them
 * as a single markdown section for prompt injection.
 */
export async function readHandoffs(
  taskIds: string[],
  cwd: string,
): Promise<string> {
  const handoffsDir = await getHandoffsDir(cwd);
  const sections: string[] = [];

  for (const id of taskIds) {
    try {
      const content = await fs.readFile(path.join(handoffsDir, `${id}.md`), 'utf-8');
      sections.push(content.trim());
    } catch {
      // Handoff not yet written (task completed without handoff) — skip
    }
  }

  if (sections.length === 0) return '';

  return `# Dependency Handoffs\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Append a one-line learning to `.cloudy/LEARNINGS.md`.
 * The learning is extracted from Claude's output or result summary.
 */
export async function appendLearning(
  taskId: string,
  learning: string,
  cwd: string,
): Promise<void> {
  const lPath = learningsPath(cwd);
  const exists = await fs.access(lPath).then(() => true).catch(() => false);

  if (!exists) {
    await ensureDir(path.dirname(lPath));
    await fs.writeFile(
      lPath,
      '# Project Learnings\n\n<!-- Auto-updated by cloudy -->\n\n',
      'utf-8',
    );
  }

  const line = `- [${taskId}] ${learning.slice(0, 300).replace(/\n/g, ' ')}\n`;
  await fs.appendFile(lPath, line, 'utf-8');
}

/**
 * Read the full learnings file content, or null if it doesn't exist.
 */
export async function readLearnings(cwd: string): Promise<string | null> {
  try {
    return await fs.readFile(learningsPath(cwd), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Extract a concise learning from Claude's result output.
 * Looks for a "## LEARNINGS" section first; falls back to the first
 * non-empty line of the result summary.
 */
export function extractLearning(output: string): string {
  // Look for explicit LEARNINGS section written by Claude
  const learningsMatch = output.match(/##\s*LEARNINGS?\s*\n+([\s\S]*?)(?:\n##|$)/i);
  if (learningsMatch) {
    const content = learningsMatch[1].trim();
    // Take just the first line/bullet
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
    return firstLine.replace(/^[-*]\s*/, '').trim();
  }

  // Fallback: first meaningful line of result
  const firstLine = output.split('\n').find((l) => l.trim().length > 10) ?? '';
  return firstLine.trim().slice(0, 200);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extract lines that indicate incomplete work: stubs, TODOs, placeholders.
 * These are surfaced in the handoff so downstream tasks know what to finish.
 */
function extractKnownGaps(summary: string): string {
  if (!summary) return '';
  const lines = summary.split('\n');
  const gapLines = lines.filter((l) => {
    const lower = l.toLowerCase();
    return (
      lower.includes('todo') ||
      lower.includes('stub') ||
      lower.includes('not implemented') ||
      lower.includes('placeholder') ||
      lower.includes('left for') ||
      lower.includes('skipped for now') ||
      lower.includes('future work') ||
      lower.includes('not yet') ||
      lower.includes('hardcoded') ||
      lower.includes('mock') && lower.includes('replace')
    );
  });
  return gapLines.slice(0, 6).join('\n').trim();
}

/**
 * Extract key design decisions from Claude's summary.
 * Looks for decision/approach/chose/used patterns.
 */
function extractDecisions(summary: string): string {
  if (!summary) return '';
  const lines = summary.split('\n');
  const decisionLines = lines.filter((l) => {
    const lower = l.toLowerCase();
    return (
      lower.includes('decided') ||
      lower.includes('chose') ||
      lower.includes('used ') ||
      lower.includes('approach:') ||
      lower.includes('pattern:') ||
      lower.includes('note:') ||
      lower.includes('important:')
    );
  });
  return decisionLines.slice(0, 4).join('\n').trim();
}

/**
 * Extract caveats and limitations from Claude's summary.
 */
function extractCaveats(summary: string): string {
  if (!summary) return '';
  const lines = summary.split('\n');
  const caveatLines = lines.filter((l) => {
    const lower = l.toLowerCase();
    return (
      lower.includes('caveat') ||
      lower.includes('limitation') ||
      lower.includes('only works') ||
      lower.includes('requires') ||
      lower.includes('assumes') ||
      lower.includes('known issue') ||
      lower.includes('todo') ||
      lower.includes('future')
    );
  });
  return caveatLines.slice(0, 4).join('\n').trim();
}
