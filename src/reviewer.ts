import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plan, ClaudeModel } from './core/types.js';
import { runClaude } from './executor/claude-runner.js';
import { getGitDiff } from './git/git.js';
import { ensureDir, readJson, writeJson } from './utils/fs.js';
import { CLAWDASH_DIR, CHECKPOINTS_DIR } from './config/defaults.js';

export interface ReviewResult {
  verdict: 'PASS' | 'PASS_WITH_NOTES' | 'FAIL';
  summary: string;
  criteriaResults: Array<{ criterion: string; passed: boolean; note: string }>;
  issues: Array<{ severity: 'critical' | 'major' | 'minor'; description: string; location?: string }>;
  conventionViolations: string[];
  suggestions: string[];
  /** Task IDs that should be re-run (skipped, failed, or missing implementation) */
  rerunTaskIds: string[];
  specCoverageScore?: number;
  costUsd: number;
  durationMs: number;
  model: string;
}

interface CheckpointData {
  taskId: string;
  sha: string;
  createdAt: string;
}

/**
 * Find the oldest checkpoint SHA in .cloudy/checkpoints/.
 * This is the "before any task ran" state.
 */
async function findPhaseStartSha(cwd: string): Promise<string | undefined> {
  const checkpointsDir = path.join(cwd, CLAWDASH_DIR, CHECKPOINTS_DIR);
  let files: string[];
  try {
    files = await fs.readdir(checkpointsDir);
  } catch {
    return undefined;
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  if (jsonFiles.length === 0) return undefined;

  let oldestSha: string | undefined;
  let oldestTime: number = Infinity;

  for (const file of jsonFiles) {
    const data = await readJson<CheckpointData>(path.join(checkpointsDir, file));
    if (!data) continue;
    const t = new Date(data.createdAt).getTime();
    if (t < oldestTime) {
      oldestTime = t;
      oldestSha = data.sha;
    }
  }

  return oldestSha;
}

/**
 * Build task summary block for the review prompt.
 */
function buildTaskSummary(plan: Plan): string {
  return plan.tasks
    .map((task) => {
      const acResults = task.acceptanceCriteriaResults && task.acceptanceCriteriaResults.length > 0
        ? '\nAcceptance Criteria Results:\n' +
          task.acceptanceCriteriaResults
            .map((cr) => `  - [${cr.passed ? 'PASS' : 'FAIL'}] ${cr.criterion}${cr.explanation ? `: ${cr.explanation}` : ''}`)
            .join('\n')
        : '';
      return `### ${task.id}: ${task.title}\nStatus: ${task.status} | Retries: ${task.retries}${acResults}`;
    })
    .join('\n\n');
}

/**
 * Build all acceptance criteria from the plan, numbered, for holistic review grading.
 */
function buildAllAcceptanceCriteria(plan: Plan): string {
  const lines: string[] = ['## All Acceptance Criteria'];
  let n = 0;
  for (const task of plan.tasks) {
    for (const criterion of task.acceptanceCriteria) {
      n++;
      lines.push(`${n}. [${task.id}] ${criterion}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build the review prompt.
 */
function buildReviewPrompt(
  claudeMdContent: string | undefined,
  specContent: string | undefined,
  plan: Plan,
  taskSummary: string,
  gitDiff: string,
): string {
  const specSection = specContent
    ? specContent
    : `(spec not saved — reviewing from task descriptions only)\n\nGoal: ${plan.goal}\n\n${plan.tasks.map((t) => `### ${t.id}: ${t.title}\n${t.description}`).join('\n\n')}`;

  const conventionsSection = claudeMdContent ?? '(CLAUDE.md not found)';
  const allCriteria = buildAllAcceptanceCriteria(plan);

  return `You are performing a holistic post-run review of a completed implementation batch.

## Project Conventions (CLAUDE.md)
${conventionsSection}

## Original Specification
${specSection}

## Task Execution Summary
${taskSummary}

## Full Implementation Changes
\`\`\`diff
${gitDiff}
\`\`\`

${allCriteria}

## Review Instructions

Review this implementation HOLISTICALLY — not task by task, but as a whole batch. Check:

1. **Spec completeness**: Every acceptance criterion in the spec satisfied?
2. **Convention adherence**: Does code follow CLAUDE.md conventions (naming, patterns, ports, file structure)?
3. **Integration**: Do the pieces fit together? Are WS event names consistent? Are API routes proxied correctly in Next.js?
4. **Bugs**: Any field name mismatches, missing imports, wrong endpoints, dead code?
5. **Missing pieces**: Anything mentioned in spec not implemented?

Respond ONLY with valid JSON (no markdown wrapper):
{
  "verdict": "PASS" | "PASS_WITH_NOTES" | "FAIL",
  "summary": "2-3 sentence overall assessment",
  "specCoverageScore": 0-100,  // percentage of acceptance criteria fully passing
  "criteriaResults": [{ "criterion": "...", "passed": true, "note": "..." }],
  "issues": [{ "severity": "critical"|"major"|"minor", "description": "...", "location": "file:line or component name" }],
  "conventionViolations": ["..."],
  "suggestions": ["..."],
  "rerunTaskIds": ["task-N", ...]  // IDs of tasks that were skipped, failed, or have missing implementation — empty array if all tasks completed successfully
}`;
}

/**
 * Run a holistic post-batch review using Claude.
 */
export async function runHolisticReview(
  cwd: string,
  plan: Plan,
  model: ClaudeModel,
  onOutput?: (text: string) => void,
  fromSha?: string,
): Promise<ReviewResult> {
  const startMs = Date.now();

  // 1. Read spec from .cloudy/spec.md if available
  let specContent: string | undefined;
  try {
    specContent = await fs.readFile(path.join(cwd, CLAWDASH_DIR, 'spec.md'), 'utf-8');
  } catch {
    specContent = undefined;
  }

  // 2. Read CLAUDE.md from cwd if available
  let claudeMdContent: string | undefined;
  const claudeMdCandidates = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md', 'CONVENTIONS.md'];
  for (const name of claudeMdCandidates) {
    try {
      const content = await fs.readFile(path.join(cwd, name), 'utf-8');
      if (content.trim()) {
        claudeMdContent = content.trim();
        break;
      }
    } catch {
      // Not found, try next
    }
  }

  // 3. Find phase-start SHA from oldest checkpoint (or use provided fromSha)
  const phaseSha = fromSha ?? await findPhaseStartSha(cwd);

  // 4. Get full git diff since phase start
  let gitDiff = '';
  try {
    gitDiff = await getGitDiff(cwd, phaseSha);
  } catch {
    gitDiff = '(unable to retrieve git diff)';
  }

  // Filter noise files and sort source code first so the reviewer always sees
  // the most important changes within the budget, not lock files or build artifacts.
  const LOW_VALUE_FILE_RE = /^diff --git a\/[^\n]*?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock|\.log|\.tsbuildinfo|\.pbxproj|(?:^|\/)dist\/|(?:^|\/)build\/|\.next\/|\.nuxt\/)/m;
  const allChunks = gitDiff.split(/(?=^diff --git )/m).filter(Boolean);
  const sourceChunks = allChunks.filter((c) => !LOW_VALUE_FILE_RE.test(c));
  const otherChunks  = allChunks.filter((c) =>  LOW_VALUE_FILE_RE.test(c));
  const orderedDiff  = [...sourceChunks, ...otherChunks].join('');

  const MAX_DIFF_CHARS = 80_000;
  const totalKb = Math.round(orderedDiff.length / 1024);
  const shownKb = Math.round(MAX_DIFF_CHARS / 1024);
  gitDiff = orderedDiff.length > MAX_DIFF_CHARS
    ? orderedDiff.slice(0, MAX_DIFF_CHARS) +
        `\n\n... [diff truncated — ${totalKb}KB total, showing first ${shownKb}KB of source files]`
    : orderedDiff;

  // 5. Build task summary
  const taskSummary = buildTaskSummary(plan);

  // 6. Build review prompt
  const prompt = buildReviewPrompt(claudeMdContent, specContent, plan, taskSummary, gitDiff);

  // 7. Call runClaude
  const claudeResult = await runClaude({
    prompt,
    model,
    cwd,
    onOutput,
  });

  const durationMs = Date.now() - startMs;

  // 8. Parse JSON response into ReviewResult
  let result: ReviewResult;
  const rawOutput = claudeResult.output ?? '';

  // If Claude returned an error (e.g. "Prompt is too long"), surface it as FAIL
  if (claudeResult.error || !rawOutput.trim()) {
    const errMsg = claudeResult.error || 'Review produced no output';
    result = {
      verdict: 'FAIL',
      summary: `Review could not run: ${errMsg}`,
      criteriaResults: [],
      issues: [{ severity: 'critical', description: errMsg }],
      conventionViolations: [],
      suggestions: [],
      rerunTaskIds: [],
      costUsd: claudeResult.costUsd,
      durationMs,
      model: String(model),
    };
  } else try {
    // Try to extract the review JSON from the response.
    // Look for a JSON object containing "verdict" to avoid matching reasoning text.
    let jsonStr: string | null = null;
    const verdictIdx = rawOutput.indexOf('"verdict"');
    if (verdictIdx !== -1) {
      // Walk backwards from "verdict" to find the opening brace
      let braceStart = rawOutput.lastIndexOf('{', verdictIdx);
      if (braceStart !== -1) {
        // Find matching closing brace by counting nesting
        let depth = 0;
        for (let i = braceStart; i < rawOutput.length; i++) {
          if (rawOutput[i] === '{') depth++;
          else if (rawOutput[i] === '}') depth--;
          if (depth === 0) {
            jsonStr = rawOutput.slice(braceStart, i + 1);
            break;
          }
        }
      }
    }
    // Fallback: try the old greedy regex if verdict-based search failed
    if (!jsonStr) {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      jsonStr = jsonMatch?.[0] ?? null;
    }
    if (!jsonStr) {
      throw new Error('No JSON found in response');
    }
    const parsed = JSON.parse(jsonStr) as {
      verdict?: string;
      summary?: string;
      specCoverageScore?: number;
      criteriaResults?: Array<{ criterion: string; passed: boolean; note: string }>;
      issues?: Array<{ severity: 'critical' | 'major' | 'minor'; description: string; location?: string }>;
      conventionViolations?: string[];
      suggestions?: string[];
      rerunTaskIds?: string[];
    };

    const verdict = parsed.verdict === 'PASS' || parsed.verdict === 'FAIL' || parsed.verdict === 'PASS_WITH_NOTES'
      ? parsed.verdict
      : 'PASS_WITH_NOTES';

    result = {
      verdict,
      summary: parsed.summary ?? rawOutput.slice(0, 300),
      specCoverageScore: typeof parsed.specCoverageScore === 'number' ? parsed.specCoverageScore : undefined,
      criteriaResults: parsed.criteriaResults ?? [],
      issues: parsed.issues ?? [],
      conventionViolations: parsed.conventionViolations ?? [],
      suggestions: parsed.suggestions ?? [],
      rerunTaskIds: parsed.rerunTaskIds ?? [],
      costUsd: claudeResult.costUsd,
      durationMs,
      model: String(model),
    };
  } catch {
    // Malformed JSON — return PASS_WITH_NOTES so an unparseable review doesn't block the run.
    // The summary preserves whatever Claude said so it's visible to the user.
    result = {
      verdict: 'PASS_WITH_NOTES',
      summary: rawOutput.slice(0, 300) || 'Review completed but response could not be parsed.',
      criteriaResults: [],
      issues: [],
      conventionViolations: [],
      suggestions: [],
      rerunTaskIds: [],
      costUsd: claudeResult.costUsd,
      durationMs,
      model: String(model),
    };
  }

  // 9. Save result to .cloudy/review-latest.json
  const cloudyDir = path.join(cwd, CLAWDASH_DIR);
  await ensureDir(cloudyDir);
  await writeJson(path.join(cloudyDir, 'review-latest.json'), result);

  return result;
}
