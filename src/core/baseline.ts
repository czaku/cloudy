/**
 * Test baseline capture — records which tests were already failing before a run.
 *
 * The validator uses this to ignore pre-existing failures so tasks aren't blamed
 * for breakage they didn't introduce.
 */

import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '../utils/logger.js';

export interface TestBaseline {
  failingTests: string[];  // test names/IDs that were red before the run
  capturedAt: string;      // ISO timestamp
  command: string;         // command that was run
  timedOut: boolean;       // true if the command exceeded the timeout
}

const BASELINE_FILE = '.cloudy/baseline.json';
const TIMEOUT_MS = 120_000; // 2 min max — skip if test suite is slow

/**
 * Run `testCommand` and record which tests fail, writing to `.cloudy/baseline.json`.
 *
 * Non-blocking: on timeout or error, writes an empty baseline and continues.
 * Caches per branch — re-uses an existing baseline captured within the last hour.
 */
export async function captureTestBaseline(testCommand: string, cwd: string): Promise<TestBaseline | null> {
  if (!testCommand.trim()) return null;

  // Check for a fresh cached baseline (within 1 hour on the same branch)
  const baselinePath = path.join(cwd, BASELINE_FILE);
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    const cached = JSON.parse(raw) as TestBaseline;
    const age = Date.now() - new Date(cached.capturedAt).getTime();
    if (age < 60 * 60 * 1000) {
      await log.info(`Using cached test baseline from ${cached.capturedAt} (${cached.failingTests.length} pre-existing failures)`);
      return cached;
    }
  } catch { /* no cache — proceed */ }

  await log.info(`Capturing test baseline: ${testCommand}`);

  const [cmd, ...args] = testCommand.trim().split(/\s+/);
  let timedOut = false;
  let output = '';

  try {
    const result = await execa(cmd, args, { cwd, reject: false, all: true, timeout: TIMEOUT_MS });
    output = result.all ?? result.stdout ?? '';
    timedOut = result.timedOut ?? false;
  } catch (err) {
    await log.warn(`Test baseline capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (timedOut) {
    await log.warn(`Test baseline timed out after ${TIMEOUT_MS / 1000}s — proceeding without baseline`);
  }

  // Extract failing test names from output — look for common failure patterns
  const failingTests = extractFailingTests(output);

  const baseline: TestBaseline = {
    failingTests,
    capturedAt: new Date().toISOString(),
    command: testCommand,
    timedOut,
  };

  // Write to .cloudy/baseline.json
  try {
    await fs.mkdir(path.join(cwd, '.cloudy'), { recursive: true });
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
    await log.info(`Baseline captured: ${failingTests.length} pre-existing failing test(s)`);
    if (failingTests.length > 0) {
      await log.info(`  Pre-existing failures: ${failingTests.slice(0, 5).join(', ')}${failingTests.length > 5 ? ` (+${failingTests.length - 5} more)` : ''}`);
    }
  } catch (err) {
    await log.warn(`Could not write baseline file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return baseline;
}

/**
 * Load a previously captured baseline, or return null if none exists.
 */
export async function loadBaseline(cwd: string): Promise<TestBaseline | null> {
  try {
    const raw = await fs.readFile(path.join(cwd, BASELINE_FILE), 'utf8');
    return JSON.parse(raw) as TestBaseline;
  } catch {
    return null;
  }
}

/**
 * Extract failing test identifiers from test runner output.
 * Supports Jest, Vitest, pytest, go test, and bun test output formats.
 */
function extractFailingTests(output: string): string[] {
  const failing = new Set<string>();

  for (const line of output.split('\n')) {
    // Jest/Vitest: "✕ test name" or "✗ test name" or "FAIL src/foo.test.ts"
    const jestFail = line.match(/^\s*[✕✗×]\s+(.+)$/) ?? line.match(/^FAIL\s+(\S+)/);
    if (jestFail) { failing.add(jestFail[1].trim()); continue; }

    // pytest: "FAILED test_file.py::test_name"
    const pytestFail = line.match(/^FAILED\s+(\S+::\S+)/);
    if (pytestFail) { failing.add(pytestFail[1].trim()); continue; }

    // go test: "--- FAIL: TestName"
    const goFail = line.match(/^--- FAIL:\s+(\S+)/);
    if (goFail) { failing.add(goFail[1].trim()); continue; }

    // bun test: "× test name"
    const bunFail = line.match(/^\s+×\s+(.+)$/);
    if (bunFail) { failing.add(bunFail[1].trim()); continue; }
  }

  return Array.from(failing);
}
