import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { execa } from 'execa';
import type {
  ClaudeModel,
  PhaseRuntimeConfig,
  Task,
  ValidationConfig,
  ValidationReport,
  ValidationResult,
} from '../core/types.js';
import { runTypeCheck } from './strategies/type-check.js';
import { runLintCheck } from './strategies/lint-check.js';
import { runBuildCheck, detectPlatformBuildNeeds, runIosBuildCheck, runAndroidBuildCheck } from './strategies/build-check.js';
import { runTestRunner } from './strategies/test-runner.js';
import { runAiReview } from './strategies/ai-review.js';
import { runAiQualityReview } from './strategies/ai-review-quality.js';
import { runArtifactCheck } from './strategies/artifact-check.js';
import { getGitDiff, getChangedFiles } from '../git/git.js';
import { log } from '../utils/logger.js';
import type { PriorArtifact } from '../planner/prompts.js';

const MAX_FILES_FOR_REVIEW = 20;
const CONTEXT_LINES = 40;          // lines of context around each changed hunk
const MAX_SECTION_CHARS = 40_000;  // per-file budget (covers even large files like orchestrator.py)
const ARTIFACT_PATH_RE = /(?:~\/[^\s,;:'"`]+|(?:\/[^\s,;:'"`]+)+|(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{2,8}|[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif|pdf|json|md|txt|html|csv|xml|svg))/g;

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

export function inferArtifactsFromAcceptanceCriteria(criteria: string[]): string[] {
  const artifacts = new Set<string>();

  for (const criterion of criteria) {
    const homeDir = process.env.HOME ?? '~';
    const matches = (criterion.match(ARTIFACT_PATH_RE) ?? [])
      .map((rawMatch) => rawMatch
        .replace(/[),.;:]+$/, '')
        .replace(/^["'`]+/, '')
        .replace(/["'`]+$/, ''))
      .filter(Boolean)
      .map((cleaned) => cleaned.startsWith('~/') ? cleaned.replace(/^~\//, `${homeDir}/`) : cleaned);

    const baseDir = matches.find((match) => match.startsWith(`${homeDir}/`) && match.endsWith('/'));
    const bareFiles = matches.filter((match) => !match.includes('/') && /\.[A-Za-z0-9]{2,8}$/.test(match));

    if (baseDir) {
      for (const bareFile of bareFiles) {
        artifacts.add(path.join(baseDir, bareFile));
      }
    }

    for (const cleaned of matches) {
      if (baseDir && cleaned === baseDir) continue;
      if (baseDir && !cleaned.includes('/') && /\.[A-Za-z0-9]{2,8}$/.test(cleaned)) continue;
      artifacts.add(cleaned);
    }
  }

  return [...artifacts].sort();
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
  /**
   * Model for Phase 2b code quality review. Defaults to `model` if not provided.
   * You can pass a cheaper model (e.g. haiku) for spec compliance (Phase 2a)
   * and a stronger model here for quality review.
   */
  qualityModel?: ClaudeModel;
  runtime?: PhaseRuntimeConfig;
  cwd: string;
  checkpointSha?: string;
  /** Artifacts created by upstream dependency tasks — not expected in this task's diff */
  priorArtifacts?: PriorArtifact[];
}

/**
 * Run multi-strategy validation on a task.
 * Deterministic checks run first; AI review is split into two phases:
 *   Phase 2a: spec compliance (did it meet every AC? any extras added?)
 *   Phase 2b: code quality (only runs if 2a passes)
 */
export async function validateTask(
  options: ValidateOptions,
): Promise<ValidationReport> {
  const { task, config, model, qualityModel, runtime, cwd, checkpointSha, priorArtifacts } = options;
  const resolvedQualityModel: ClaudeModel = qualityModel ?? model;
  const results: ValidationResult[] = [];
  const artifactPaths = [...new Set([...(task.outputArtifacts ?? []), ...inferArtifactsFromAcceptanceCriteria(task.acceptanceCriteria)])];

  await log.info(`Validating task "${task.id}": ${task.title}`);

  // Phase 0: Artifact check (must exist before running other checks)
  if (artifactPaths.length > 0) {
    await log.info('  Running artifact check...');
    const artifactResult = await runArtifactCheck(artifactPaths, cwd);
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

  // Phase 1c: Auto platform build checks — injected when changed files include .swift or .kt
  // This is additive: only runs if the equivalent check isn't already in config.commands.
  if (deterministicPassed) {
    const changedFilesForBuild = checkpointSha
      ? await getChangedFiles(cwd, checkpointSha).catch(() => [] as string[])
      : (task.filesWritten ?? []);
    const { ios, android } = detectPlatformBuildNeeds(changedFilesForBuild);
    const existingLabels = config.commands ?? [];

    if (ios) {
      const iosResult = await runIosBuildCheck(cwd, existingLabels);
      if (iosResult) {
        results.push(iosResult);
        if (!iosResult.passed) {
          deterministicPassed = false;
          await log.warn('  iOS auto-build check FAILED');
        } else {
          await log.info('  iOS auto-build check passed');
        }
      }
    }

    if (android && deterministicPassed) {
      const androidResult = await runAndroidBuildCheck(cwd, existingLabels);
      if (androidResult) {
        results.push(androidResult);
        if (!androidResult.passed) {
          deterministicPassed = false;
          await log.warn('  Android auto-build check FAILED');
        } else {
          await log.info('  Android auto-build check passed');
        }
      }
    }
  }

  // Phase 2a: Spec compliance review (only if deterministic checks pass)
  // Checks: did it meet every AC? did it add anything not asked for?
  let specCompliancePassed = false;
  if (deterministicPassed && config.aiReview) {
    await log.info('  Phase 2a: spec compliance review...');

    const rawDiff = await getGitDiff(cwd, checkpointSha);
    const LOW_VALUE_FILE_RE = /^diff --git a\/[^\n]*?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock|\.log|\.tsbuildinfo|\.pbxproj|(?:^|\/)dist\/|(?:^|\/)build\/|\.next\/|\.nuxt\/)/m;
    const allChunks = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);
    const sourceChunks = allChunks.filter((c) => !LOW_VALUE_FILE_RE.test(c));
    const otherChunks = allChunks.filter((c) => LOW_VALUE_FILE_RE.test(c));

    const artifactCheckPassedEarly = results.find((r) => r.strategy === 'artifacts')?.passed;
    if (sourceChunks.length === 0 && artifactCheckPassedEarly) {
      await log.info('  No source changes in diff but artifacts verified — skipping spec review (previously merged)');
      results.push({
        strategy: 'ai-review',
        passed: true,
        output: 'Skipped: no source diff detected, all output artifacts verified present.',
        durationMs: 0,
      });
      specCompliancePassed = true;
    } else if (sourceChunks.length === 0) {
      await log.info('  No source changes detected — reviewing existing files to confirm already complete');

      const alreadyDoneNote = 'No changes were made. The agent determined this task was already implemented.';
      const fileSections: Array<{ path: string; content: string; note?: string }> = [];

      const artifactPaths = task.outputArtifacts ?? [];
      const patternPaths: string[] = [];
      for (const pattern of (task.contextPatterns ?? [])) {
        try {
          const matched = await glob(pattern, { cwd, nodir: true });
          patternPaths.push(...matched);
        } catch { /* non-fatal */ }
      }
      const SOURCE_EXTS = new Set(['.ts', '.tsx', '.py', '.js', '.jsx', '.go', '.rs', '.swift', '.kt', '.prisma', '.sql', '.graphql']);
      const filesToRead = [...new Set([...artifactPaths, ...patternPaths])].filter(
        (f) => SOURCE_EXTS.has(path.extname(f).toLowerCase())
      );
      for (const relPath of filesToRead.slice(0, MAX_FILES_FOR_REVIEW)) {
        try {
          const fullPath = path.join(cwd, relPath);
          const content = await fs.readFile(fullPath, 'utf-8');
          const ext = path.extname(relPath).toLowerCase();
          if (['.ts', '.tsx', '.py', '.js', '.jsx', '.go', '.rs', '.swift', '.kt', '.prisma', '.sql', '.graphql'].includes(ext)) {
            fileSections.push({
              path: relPath,
              content: content.length > 8000 ? content.slice(0, 8000) + '\n... (truncated)' : content,
              note: 'existing file — no diff (agent found work already complete)',
            });
          }
        } catch { /* file missing or unreadable — skip */ }
      }

      const commandResults = results
        .filter((r) => r.strategy === 'command' || r.strategy === 'typecheck' || r.strategy === 'lint')
        .map((r) => ({ label: r.strategy, passed: r.passed, output: r.output }));

      await log.info(
        `  Spec review (already-done check): ${fileSections.length} file(s)` +
        (commandResults.length ? ` + ${commandResults.length} command result(s)` : ''),
      );

      const result = await runAiReview(
        task.title,
        task.acceptanceCriteria,
        alreadyDoneNote,
        model,
        cwd,
        fileSections,
        priorArtifacts,
        artifactCheckPassedEarly,
        artifactPaths,
        commandResults,
        runtime,
      );
      results.push(result);
      specCompliancePassed = result.passed;

      if (!result.passed) {
        await log.warn('  Spec review FAILED (work not yet complete despite no changes)');
      } else {
        await log.info('  Spec review passed (work was already complete)');
      }
    } else {
      const orderedDiff = [...sourceChunks, ...otherChunks].join('');
      const MAX_DIFF_CHARS = 160_000;
      const truncatedDiff = orderedDiff.length > MAX_DIFF_CHARS
        ? orderedDiff.slice(0, MAX_DIFF_CHARS) + '\n... (diff truncated at 160 KB for AI review)'
        : orderedDiff;
      const changedFiles = await getChangedFiles(cwd, checkpointSha);
      const changedFileSections = await readChangedFileSections(changedFiles, cwd, truncatedDiff);
      const artifactCheckPassed = results.find((r) => r.strategy === 'artifacts')?.passed;

      const commandResults = results
        .filter((r) => r.strategy === 'command' || r.strategy === 'typecheck' || r.strategy === 'lint')
        .map((r) => ({ label: r.strategy, passed: r.passed, output: r.output }));

      await log.info(
        `  Spec review: diff + ${changedFileSections.length} file section(s)` +
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
        artifactPaths,
        commandResults,
        runtime,
      );
      results.push(result);
      specCompliancePassed = result.passed;

      if (!result.passed) {
        await log.warn('  Spec review FAILED');
      } else {
        await log.info('  Spec review passed');
        // Log any extras the reviewer flagged (over-building)
        try {
          const json = result.output.match(/\{[\s\S]*\}/)?.[0];
          if (json) {
            const parsed = JSON.parse(json);
            if (parsed.extras && parsed.extras.length > 0) {
              await log.warn(`  Extras flagged (built beyond AC): ${parsed.extras.join('; ')}`);
            }
          }
        } catch { /* non-fatal */ }
      }
    }
  }

  // Phase 2b: Code quality review (only runs if spec compliance passed)
  if (specCompliancePassed && config.aiReview) {
    await log.info('  Phase 2b: code quality review...');

    const rawDiff = await getGitDiff(cwd, checkpointSha);
    const LOW_VALUE_FILE_RE = /^diff --git a\/[^\n]*?(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock|\.log|\.tsbuildinfo|\.pbxproj|(?:^|\/)dist\/|(?:^|\/)build\/|\.next\/|\.nuxt\/)/m;
    const allChunks = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);
    const sourceChunks = allChunks.filter((c) => !LOW_VALUE_FILE_RE.test(c));
    const otherChunks = allChunks.filter((c) => LOW_VALUE_FILE_RE.test(c));

    if (sourceChunks.length > 0) {
      const orderedDiff = [...sourceChunks, ...otherChunks].join('');
      const MAX_DIFF_CHARS = 160_000;
      const truncatedDiff = orderedDiff.length > MAX_DIFF_CHARS
        ? orderedDiff.slice(0, MAX_DIFF_CHARS) + '\n... (diff truncated at 160 KB for quality review)'
        : orderedDiff;
      const changedFiles = await getChangedFiles(cwd, checkpointSha);
      const changedFileSections = await readChangedFileSections(changedFiles, cwd, truncatedDiff);

      const qualityResult = await runAiQualityReview(
        task.title,
        truncatedDiff,
        resolvedQualityModel,
        cwd,
        changedFileSections,
        runtime,
      );

      if (!qualityResult.passed) {
        // Phase 2b is advisory — log warnings but don't fail the task.
        // The code is already spec-compliant (Phase 2a passed). Quality issues
        // are worth noting but shouldn't trigger a full retry that rewrites
        // working, spec-compliant code.
        await log.warn('  Code quality review: issues found (advisory, not blocking)');
        await log.warn(`  Quality notes: ${qualityResult.output ?? ''}`);
        // Push as passed=true so it doesn't block — the warning is in the logs
        results.push({ ...qualityResult, passed: true });
      } else {
        await log.info('  Code quality review passed');
        results.push(qualityResult);
      }
    } else {
      await log.info('  Code quality review skipped (no source changes)');
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
    if (r.strategy === 'ai-review-quality') {
      return formatQualityReviewFailure(r.output);
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
 * For quality review failures, extract only critical issues from the JSON response.
 */
function formatQualityReviewFailure(output: string): string {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const critical = (parsed.issues ?? []).filter(
        (i: { severity: string }) => i.severity === 'critical',
      );
      if (critical.length > 0) {
        const items = critical.map(
          (i: { location: string; description: string }) =>
            `  ✗ ${i.location}: ${i.description}`,
        ).join('\n');
        return `[code-quality] FAIL — ${parsed.summary ?? ''}\n\nCritical issues:\n${items}`;
      }
    }
  } catch { /* fall through */ }
  return `[code-quality] ${output.slice(0, 2000)}${output.length > 2000 ? '\n... (truncated)' : ''}`;
}

/**
 * For artifact failures, format as a clean list of missing files.
 */
function formatArtifactFailure(output: string): string {
  // Output is typically: "Missing required output artifacts:\n- path/to/file\n- ..."
  return `[artifacts — missing files]\n${output}`;
}
