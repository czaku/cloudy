import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import type {
  ClaudeModel,
  Task,
  ValidationConfig,
  ValidationReport,
  ValidationResult,
} from '../core/types.js';
import { runTypeCheck } from './strategies/type-check.js';
import { runLintCheck } from './strategies/lint-check.js';
import { runBuildCheck } from './strategies/build-check.js';
import { runTestRunner } from './strategies/test-runner.js';
import { runAiReview } from './strategies/ai-review.js';
import { runArtifactCheck } from './strategies/artifact-check.js';
import { getGitDiff, getChangedFiles } from '../git/git.js';
import { log } from '../utils/logger.js';
import type { PriorArtifact } from '../planner/prompts.js';

const MAX_FILES_FOR_REVIEW = 20;
const CONTEXT_LINES = 40;          // lines of context around each changed hunk
const MAX_SECTION_CHARS = 40_000;  // per-file budget (covers even large files like orchestrator.py)

/**
 * Parse a unified diff and return changed line ranges (in the new file) per file path.
 * Hunk header format: @@ -old_start[,old_count] +new_start[,new_count] @@
 */
export function parseDiffHunks(diff: string): Map<string, Array<{ start: number; end: number }>> {
  const result = new Map<string, Array<{ start: number; end: number }>>();
  let currentFile: string | null = null;

  for (const line of diff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }
    if (currentFile && line.startsWith('@@')) {
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        const start = parseInt(hunkMatch[1], 10);
        const count = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        result.get(currentFile)!.push({ start, end: start + Math.max(count - 1, 0) });
      }
    }
  }

  return result;
}

/** Merge overlapping or adjacent line ranges into minimal non-overlapping set. */
export function mergeRanges(
  ranges: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 1) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

/**
 * For each changed source file, extract the sections of the file that actually changed
 * (identified from the diff hunks) plus surrounding context lines.
 *
 * For a 125 KB file where only lines 2330-2410 changed, this returns those 80 lines
 * (plus context) instead of the first 8000 characters of the file.
 */
async function readChangedFileSections(
  changedFiles: string[],
  cwd: string,
  diff: string,
): Promise<Array<{ path: string; content: string; note?: string }>> {
  const hunksByFile = parseDiffHunks(diff);
  const results: Array<{ path: string; content: string; note?: string }> = [];

  const sourceFiles = changedFiles
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ['.ts', '.tsx', '.py', '.js', '.jsx', '.go', '.rs', '.swift', '.kt', '.prisma', '.sql', '.graphql', '.proto'].includes(ext);
    })
    .slice(0, MAX_FILES_FOR_REVIEW);

  for (const relPath of sourceFiles) {
    try {
      const fullPath = path.join(cwd, relPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const hunks = hunksByFile.get(relPath) ?? [];

      if (hunks.length === 0) {
        // No hunk info (e.g. binary or new file with no @@ headers) — use file head
        results.push({
          path: relPath,
          content: content.length > 8000
            ? content.slice(0, 8000) + '\n... (truncated, first 8000 chars only)'
            : content,
        });
        continue;
      }

      // Expand each hunk range with context, then merge overlapping ranges
      const expanded = hunks.map((h) => ({
        start: Math.max(1, h.start - CONTEXT_LINES),
        end: Math.min(lines.length, h.end + CONTEXT_LINES),
      }));
      const merged = mergeRanges(expanded);

      const parts: string[] = [];
      for (const range of merged) {
        if (parts.length > 0 || range.start > 1) {
          parts.push(`... (lines 1–${range.start - 1} omitted) ...`);
        }
        // Add line numbers for orientation in large files
        const section = lines
          .slice(range.start - 1, range.end)
          .map((l, i) => `${String(range.start + i).padStart(5)}: ${l}`)
          .join('\n');
        parts.push(section);
        if (range.end < lines.length) {
          parts.push(`... (lines ${range.end + 1}–${lines.length} omitted) ...`);
        }
      }

      let extracted = parts.join('\n');
      if (extracted.length > MAX_SECTION_CHARS) {
        extracted = extracted.slice(0, MAX_SECTION_CHARS) + '\n... (further truncated)';
      }

      const totalChangedLines = hunks.reduce((acc, h) => acc + (h.end - h.start + 1), 0);
      results.push({
        path: relPath,
        content: extracted,
        note: `${hunks.length} changed section(s), ~${totalChangedLines} lines changed, ${CONTEXT_LINES}-line context shown`,
      });
    } catch {
      // File removed or unreadable — skip
    }
  }

  return results;
}

/** Parse a shell command string into [program, ...args], respecting quoted strings. */
function parseShellArgs(cmd: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === ' ' && !inDouble && !inSingle) {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

const VALIDATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per validation command

async function runShellCommand(cmd: string, cwd: string): Promise<ValidationResult> {
  const start = Date.now();
  const parts = parseShellArgs(cmd.trim());
  const [program, ...args] = parts;

  try {
    const result = await execa(program, args, { cwd, reject: false, timeout: VALIDATION_TIMEOUT_MS });
    const passed = result.exitCode === 0;
    return {
      strategy: 'command' as const,
      passed,
      output: passed
        ? `Command "${cmd}" passed`
        : `Command "${cmd}" failed (exit ${result.exitCode}):\n${result.stdout}\n${result.stderr}`.trim(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      strategy: 'command' as const,
      passed: false,
      output: `Command "${cmd}" failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

export interface ValidateOptions {
  task: Task;
  config: ValidationConfig;
  model: ClaudeModel;
  cwd: string;
  checkpointSha?: string;
  /** Artifacts created by upstream dependency tasks — not expected in this task's diff */
  priorArtifacts?: PriorArtifact[];
}

/**
 * Run multi-strategy validation on a task.
 * Deterministic checks run first; AI review only if all pass.
 */
export async function validateTask(
  options: ValidateOptions,
): Promise<ValidationReport> {
  const { task, config, model, cwd, checkpointSha, priorArtifacts } = options;
  const results: ValidationResult[] = [];

  await log.info(`Validating task "${task.id}": ${task.title}`);

  // Phase 0: Artifact check (must exist before running other checks)
  if (task.outputArtifacts && task.outputArtifacts.length > 0) {
    await log.info('  Running artifact check...');
    const artifactResult = await runArtifactCheck(task.outputArtifacts, cwd);
    if (!artifactResult.passed) {
      await log.warn('  Artifact check FAILED');
      return { taskId: task.id, passed: false, results: [artifactResult] };
    }
    results.push(artifactResult);
    await log.info('  Artifact check passed');
  }

  // Phase 1: Deterministic checks (fast, free, concrete errors)
  const deterministicStrategies: Array<{
    enabled: boolean;
    name: string;
    run: () => Promise<ValidationResult>;
  }> = [
    { enabled: config.typecheck, name: 'typecheck', run: () => runTypeCheck(cwd) },
    { enabled: config.lint, name: 'lint', run: () => runLintCheck(cwd) },
    { enabled: config.build, name: 'build', run: () => runBuildCheck(cwd) },
    { enabled: config.test, name: 'test', run: () => runTestRunner(cwd) },
  ];

  let deterministicPassed = true;

  for (const strategy of deterministicStrategies) {
    if (!strategy.enabled) continue;

    await log.info(`  Running ${strategy.name}...`);
    const result = await strategy.run();
    results.push(result);

    if (!result.passed) {
      deterministicPassed = false;
      await log.warn(`  ${strategy.name} FAILED`);
      // Don't run further checks - return concrete error immediately
      break;
    }

    await log.info(`  ${strategy.name} passed`);
  }

  // Phase 1b: Custom shell commands (run after built-in deterministic checks)
  if (deterministicPassed && config.commands && config.commands.length > 0) {
    for (const cmd of config.commands) {
      if (!deterministicPassed) break;
      await log.info(`  Running command: ${cmd}`);
      const result = await runShellCommand(cmd, cwd);
      results.push(result);
      if (!result.passed) {
        deterministicPassed = false;
        await log.warn(`  Command "${cmd}" FAILED`);
      } else {
        await log.info(`  Command "${cmd}" passed`);
      }
    }
  }

  // Phase 2: AI review (only if deterministic checks pass)
  if (deterministicPassed && config.aiReview) {
    await log.info('  Running AI review...');

    const rawDiff = await getGitDiff(cwd, checkpointSha);
    // Split diff into per-file chunks, filter noise files, then prioritise source code
    // before truncating so the AI reviewer always sees the most important changes.
    const LOW_VALUE_FILE_RE = /^diff --git a\/[^\n]*?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock|\.log|\.tsbuildinfo|\.pbxproj|(?:^|\/)dist\/|(?:^|\/)build\/|\.next\/|\.nuxt\/)/m;
    const allChunks = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);
    // Separate high-value source chunks from low-value build/lock chunks
    const sourceChunks = allChunks.filter((c) => !LOW_VALUE_FILE_RE.test(c));
    const otherChunks = allChunks.filter((c) => LOW_VALUE_FILE_RE.test(c));
    // Source-first ordering ensures we hit the important code before any truncation
    const orderedDiff = [...sourceChunks, ...otherChunks].join('');
    const MAX_DIFF_CHARS = 160_000;
    const truncatedDiff = orderedDiff.length > MAX_DIFF_CHARS
      ? orderedDiff.slice(0, MAX_DIFF_CHARS) + '\n... (diff truncated at 160 KB for AI review)'
      : orderedDiff;
    const changedFiles = await getChangedFiles(cwd, checkpointSha);
    const changedFileSections = await readChangedFileSections(changedFiles, cwd, truncatedDiff);
    const artifactCheckPassed = results.find((r) => r.strategy === 'artifacts')?.passed;

    // Collect deterministic command results to give the AI reviewer ground-truth evidence.
    // If a smoke test confirms "POST /api/v1/skills → 200", the reviewer shouldn't
    // fail on "endpoint missing" just because it can't find it in the diff.
    const commandResults = results
      .filter((r) => r.strategy === 'command' || r.strategy === 'typecheck' || r.strategy === 'lint')
      .map((r) => ({ label: r.strategy, passed: r.passed, output: r.output }));

    await log.info(
      `  AI review: diff + ${changedFileSections.length} file section(s)` +
      (priorArtifacts?.length ? ` + ${priorArtifacts.length} prior artifact(s)` : '') +
      (commandResults.length ? ` + ${commandResults.length} command result(s)` : ''),
    );

    const result = await runAiReview(
      task.title,
      task.acceptanceCriteria,
      truncatedDiff,
      model,
      cwd,
      changedFileSections,
      priorArtifacts,
      artifactCheckPassed,
      task.outputArtifacts,
      commandResults,
    );
    results.push(result);

    if (!result.passed) {
      await log.warn('  AI review FAILED');
    } else {
      await log.info('  AI review passed');
    }
  }

  const passed = results.every((r) => r.passed);

  return { taskId: task.id, passed, results };
}

/**
 * Format validation errors into a string suitable for retry prompts.
 *
 * Uses a differentiated format per failure type:
 * - ai-review: extracts only the failing criteria + reasons (not the raw JSON blob)
 * - artifacts: shows a clean "missing files" list
 * - typecheck/lint/build/test/command: uses raw output (already structured)
 */
export function formatValidationErrors(report: ValidationReport): string {
  const failed = report.results.filter((r) => !r.passed);
  return failed.map((r) => {
    if (r.strategy === 'ai-review') {
      return formatAiReviewFailure(r.output);
    }
    if (r.strategy === 'artifacts') {
      return formatArtifactFailure(r.output);
    }
    return `[${r.strategy}]\n${r.output}`;
  }).join('\n\n---\n\n');
}

/**
 * For ai-review failures, parse the JSON output and extract only the failing criteria.
 * The full JSON blob is noisy — the executor only needs to know what failed and why.
 */
function formatAiReviewFailure(output: string): string {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const failing = (parsed.criteriaResults ?? []).filter(
        (cr: { met: boolean }) => !cr.met,
      );
      if (failing.length > 0) {
        const items = failing.map(
          (cr: { criterion: string; reason: string }) =>
            `  ✗ ${cr.criterion}\n    Reason: ${cr.reason ?? 'no reason given'}`,
        ).join('\n');
        const verdict = parsed.verdict ?? 'FAIL';
        const summary = parsed.summary ?? '';
        return `[ai-review] ${verdict}${summary ? ` — ${summary}` : ''}\n\nFailing criteria:\n${items}`;
      }
    }
  } catch {
    // Fall through to raw output if JSON parse fails
  }
  // Fallback: truncate raw output to avoid overwhelming the retry prompt
  return `[ai-review] ${output.slice(0, 2000)}${output.length > 2000 ? '\n... (truncated)' : ''}`;
}

/**
 * For artifact failures, format as a clean list of missing files.
 */
function formatArtifactFailure(output: string): string {
  // Output is typically: "Missing required output artifacts:\n- path/to/file\n- ..."
  return `[artifacts — missing files]\n${output}`;
}
