import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  resolveContextFiles,
  buildContextSection,
  expandContext,
} from '../../src/executor/context-resolver.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-test-'));
  // Create a simple project structure
  await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;');
  await fs.writeFile(path.join(tmpDir, 'src', 'utils.ts'), 'export function add(a: number, b: number) { return a + b; }');
  await fs.writeFile(path.join(tmpDir, 'tests', 'index.test.ts'), 'import { x } from "../src/index.js";');
  await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test Project');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('resolveContextFiles', () => {
  it('returns empty array for empty patterns', async () => {
    const result = await resolveContextFiles([], tmpDir);
    expect(result).toEqual([]);
  });

  it('resolves literal file paths', async () => {
    const result = await resolveContextFiles(['src/index.ts'], tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/index.ts');
    expect(result[0].content).toContain('export const x');
  });

  it('resolves glob patterns', async () => {
    const result = await resolveContextFiles(['src/*.ts'], tmpDir);
    expect(result).toHaveLength(2);
    const paths = result.map((f) => f.path).sort();
    expect(paths).toEqual(['src/index.ts', 'src/utils.ts']);
  });

  it('deduplicates files', async () => {
    const result = await resolveContextFiles(
      ['src/index.ts', 'src/index.ts'],
      tmpDir,
    );
    expect(result).toHaveLength(1);
  });

  it('skips files larger than 100KB', async () => {
    await fs.writeFile(path.join(tmpDir, 'large.txt'), 'x'.repeat(200_000));
    const result = await resolveContextFiles(['large.txt'], tmpDir);
    expect(result).toHaveLength(0);
  });
});

describe('buildContextSection', () => {
  it('returns empty string for no files', () => {
    expect(buildContextSection([])).toBe('');
  });

  it('formats files with syntax highlighting', () => {
    const section = buildContextSection([
      { path: 'src/index.ts', content: 'const x = 1;' },
    ]);
    expect(section).toContain('# Context Files');
    expect(section).toContain('## src/index.ts');
    expect(section).toContain('```typescript');
    expect(section).toContain('const x = 1;');
  });
});

describe('expandContext', () => {
  it('adds sibling patterns for resolved files', async () => {
    const expanded = await expandContext(['src/index.ts'], tmpDir);
    expect(expanded).toContain('src/index.ts');
    // Should add sibling pattern for the directory
    expect(expanded.some((p) => p.includes('src'))).toBe(true);
    expect(expanded.length).toBeGreaterThan(1);
  });
});
