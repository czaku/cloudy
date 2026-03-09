/**
 * Ralph Loop — convergence-first execution.
 *
 * Instead of planning N tasks upfront, iterate with a fresh Claude context
 * each time until a user-supplied shell criterion passes (or max iterations
 * is reached).
 *
 * Inspired by the snarktank/ralph pattern: tight feedback loop, fresh context,
 * no upfront planning.
 */

import { execa } from 'execa';
import { runClaude } from '../executor/claude-runner.js';
import { getGitDiff } from '../git/git.js';
import type { ClaudeModel } from './types.js';

export interface LoopRunnerOptions {
  goal: string;
  untilCommand?: string;
  maxIterations: number;
  model: ClaudeModel;
  cwd: string;
  onProgress?: (event: LoopEvent) => void;
}

export type LoopEvent =
  | { type: 'iteration_start'; iteration: number; maxIterations: number }
  | { type: 'until_passed'; iteration: number }
  | { type: 'until_failed'; iteration: number; output: string }
  | { type: 'claude_output'; iteration: number; text: string }
  | { type: 'no_progress'; iteration: number; staleCount: number }
  | { type: 'done'; succeeded: boolean; iterations: number; reason: string };

export interface LoopResult {
  succeeded: boolean;
  iterations: number;
  reason: 'until_passed' | 'max_iterations' | 'no_progress' | 'error';
  error?: string;
}

export interface CheckUntilResult {
  passed: boolean;
  output: string;
}

/**
 * Run a shell command and return whether it exited 0 plus its combined output.
 * Exported for testing.
 */
export async function checkUntil(
  command: string,
  cwd: string,
): Promise<CheckUntilResult> {
  const [cmd, ...args] = command.split(/\s+/);
  try {
    const result = await execa(cmd, args, { cwd, reject: false });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    return { passed: result.exitCode === 0, output };
  } catch (err) {
    return { passed: false, output: String(err) };
  }
}

/** Extract ## LEARNINGS bullet points from Claude's output. */
function extractLearnings(output: string): string[] {
  const idx = output.search(/^##\s+LEARNINGS\s*$/m);
  if (idx === -1) return [];
  const after = output.slice(idx).split('\n').slice(1);
  const lines: string[] = [];
  for (const line of after) {
    if (/^##\s/.test(line)) break;
    lines.push(line);
  }
  return lines.map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
}

function buildLoopPrompt(
  goal: string,
  iteration: number,
  maxIterations: number,
  failureOutput: string,
  diffSoFar: string,
  accumulatedLearnings: string[],
): string {
  const parts: string[] = ['# Goal', goal, ''];

  if (iteration > 1) {
    parts.push('# Progress Context');
    parts.push(
      `This is iteration ${iteration} of ${maxIterations}. ` +
        'Previous iterations have already made changes to the codebase.',
    );
    if (diffSoFar.trim()) {
      parts.push('');
      parts.push('## Changes Made So Far');
      parts.push('```diff');
      // Cap diff context to avoid overwhelming the prompt
      parts.push(diffSoFar.trim().slice(0, 3000));
      parts.push('```');
    }
    if (accumulatedLearnings.length > 0) {
      parts.push('');
      parts.push('## Discoveries from Previous Iterations');
      parts.push('(Key facts found during prior iterations — use these to avoid repeating work)');
      for (const l of accumulatedLearnings) {
        parts.push(`- ${l}`);
      }
    }
    parts.push('');
  }

  if (failureOutput.trim()) {
    parts.push('# Current Failures (what still needs to be fixed)');
    parts.push('```');
    parts.push(failureOutput.trim().slice(0, 2000));
    parts.push('```');
    parts.push('');
  }

  parts.push('# Instructions');
  parts.push(
    'Examine the codebase and make the necessary changes to achieve the goal above.',
  );
  if (failureOutput.trim()) {
    parts.push('Focus on fixing the specific errors shown in "Current Failures".');
  }
  parts.push('Do NOT explain what you will do — just make the changes.');
  parts.push('Write actual code. Edit or create files as needed.');
  parts.push('');
  parts.push(
    'If you discover any project-specific facts (libraries, file locations, patterns, conventions) ' +
    'that future iterations should know, end your response with:',
  );
  parts.push('## LEARNINGS');
  parts.push('- <one or two bullet points of key facts discovered>');

  return parts.join('\n');
}

/**
 * Run the convergence loop.
 *
 * Each iteration:
 *  1. Check --until command → return immediately if it passes.
 *  2. Build prompt with failure output + progress diff.
 *  3. Run Claude.
 *  4. Check git diff — if no new changes, increment stale counter.
 *     Two consecutive stale iterations → bail.
 *  5. Repeat up to maxIterations.
 */
export async function runLoop(opts: LoopRunnerOptions): Promise<LoopResult> {
  const { goal, untilCommand, maxIterations, model, cwd, onProgress } = opts;

  let staleCount = 0;
  // Snapshot the diff at loop start so we can track incremental progress
  let prevDiff = await getGitDiff(cwd).catch(() => '');
  // Accumulate LEARNINGS across iterations so each iteration builds on prior discoveries
  const accumulatedLearnings: string[] = [];

  for (let i = 1; i <= maxIterations; i++) {
    onProgress?.({ type: 'iteration_start', iteration: i, maxIterations });

    // Check convergence criterion before each iteration
    let failureOutput = '';
    if (untilCommand) {
      const check = await checkUntil(untilCommand, cwd);
      if (check.passed) {
        onProgress?.({ type: 'until_passed', iteration: i });
        onProgress?.({
          type: 'done',
          succeeded: true,
          iterations: i - 1,
          reason: 'Convergence criterion passed',
        });
        return { succeeded: true, iterations: i - 1, reason: 'until_passed' };
      }
      failureOutput = check.output;
      onProgress?.({ type: 'until_failed', iteration: i, output: failureOutput });
    }

    const prompt = buildLoopPrompt(goal, i, maxIterations, failureOutput, prevDiff, accumulatedLearnings);

    const result = await runClaude({
      prompt,
      model,
      cwd,
      onOutput: (text) =>
        onProgress?.({ type: 'claude_output', iteration: i, text }),
    });

    if (!result.success) {
      const errMsg = result.error ?? 'Claude process failed';
      onProgress?.({
        type: 'done',
        succeeded: false,
        iterations: i,
        reason: errMsg,
      });
      return { succeeded: false, iterations: i, reason: 'error', error: errMsg };
    }

    // Extract LEARNINGS from this iteration's output and accumulate for the next
    const newLearnings = extractLearnings(result.output);
    for (const l of newLearnings) {
      if (!accumulatedLearnings.includes(l)) {
        accumulatedLearnings.push(l);
      }
    }

    // Measure progress: did Claude change any files this iteration?
    const newDiff = await getGitDiff(cwd).catch(() => '');
    const madeChanges = newDiff.trim() !== prevDiff.trim();

    if (!madeChanges) {
      staleCount++;
      onProgress?.({ type: 'no_progress', iteration: i, staleCount });
      if (staleCount >= 2) {
        onProgress?.({
          type: 'done',
          succeeded: false,
          iterations: i,
          reason: 'No progress after 2 consecutive iterations — Claude is stuck',
        });
        return { succeeded: false, iterations: i, reason: 'no_progress' };
      }
    } else {
      staleCount = 0;
      prevDiff = newDiff;
    }
  }

  // Final convergence check after last iteration
  if (untilCommand) {
    const final = await checkUntil(untilCommand, cwd);
    if (final.passed) {
      onProgress?.({ type: 'until_passed', iteration: maxIterations });
      onProgress?.({
        type: 'done',
        succeeded: true,
        iterations: maxIterations,
        reason: 'Convergence criterion passed on final check',
      });
      return { succeeded: true, iterations: maxIterations, reason: 'until_passed' };
    }
  }

  onProgress?.({
    type: 'done',
    succeeded: false,
    iterations: maxIterations,
    reason: `Max iterations (${maxIterations}) reached without convergence`,
  });
  return { succeeded: false, iterations: maxIterations, reason: 'max_iterations' };
}
