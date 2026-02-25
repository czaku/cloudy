import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runArtifactCheck } from '../../src/validator/strategies/artifact-check.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-artifact-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runArtifactCheck', () => {
  it('passes when artifact array is empty', async () => {
    const result = await runArtifactCheck([], tmpDir);
    expect(result.passed).toBe(true);
    expect(result.strategy).toBe('artifacts');
  });

  it('passes when all artifacts exist', async () => {
    const file1 = path.join(tmpDir, 'src', 'auth.ts');
    const file2 = path.join(tmpDir, 'migrations', '001.ts');
    await fs.mkdir(path.dirname(file1), { recursive: true });
    await fs.mkdir(path.dirname(file2), { recursive: true });
    await fs.writeFile(file1, 'export {};');
    await fs.writeFile(file2, 'export {};');

    const result = await runArtifactCheck(
      ['src/auth.ts', 'migrations/001.ts'],
      tmpDir,
    );
    expect(result.passed).toBe(true);
    expect(result.output).toContain('2 artifact');
  });

  it('fails when one artifact is missing', async () => {
    const file1 = path.join(tmpDir, 'src', 'auth.ts');
    await fs.mkdir(path.dirname(file1), { recursive: true });
    await fs.writeFile(file1, 'export {};');

    const result = await runArtifactCheck(
      ['src/auth.ts', 'src/missing.ts'],
      tmpDir,
    );
    expect(result.passed).toBe(false);
    expect(result.output).toContain('src/missing.ts');
    expect(result.strategy).toBe('artifacts');
  });

  it('fails when all artifacts are missing', async () => {
    const result = await runArtifactCheck(
      ['src/nonexistent.ts', 'migrations/also-missing.ts'],
      tmpDir,
    );
    expect(result.passed).toBe(false);
    expect(result.output).toContain('src/nonexistent.ts');
    expect(result.output).toContain('migrations/also-missing.ts');
  });

  it('reports all missing files, not just the first', async () => {
    const result = await runArtifactCheck(
      ['a.ts', 'b.ts', 'c.ts'],
      tmpDir,
    );
    expect(result.passed).toBe(false);
    expect(result.output).toContain('a.ts');
    expect(result.output).toContain('b.ts');
    expect(result.output).toContain('c.ts');
  });

  it('includes durationMs', async () => {
    const result = await runArtifactCheck([], tmpDir);
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('resolves relative paths against cwd', async () => {
    await fs.writeFile(path.join(tmpDir, 'output.js'), 'ok');
    const result = await runArtifactCheck(['output.js'], tmpDir);
    expect(result.passed).toBe(true);
  });
});
