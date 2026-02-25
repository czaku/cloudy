import fs from 'node:fs/promises';
import path from 'node:path';
import type { ValidationResult } from '../../core/types.js';

/**
 * Check that all expected output artifacts exist on disk.
 */
export async function runArtifactCheck(
  artifacts: string[],
  cwd: string,
): Promise<ValidationResult> {
  const start = Date.now();

  if (artifacts.length === 0) {
    return {
      strategy: 'artifacts',
      passed: true,
      output: 'No artifacts to check',
      durationMs: Date.now() - start,
    };
  }

  const missing: string[] = [];

  for (const artifact of artifacts) {
    const fullPath = path.isAbsolute(artifact) ? artifact : path.join(cwd, artifact);
    try {
      await fs.access(fullPath);
    } catch {
      missing.push(artifact);
    }
  }

  if (missing.length === 0) {
    return {
      strategy: 'artifacts',
      passed: true,
      output: `All ${artifacts.length} artifact(s) present`,
      durationMs: Date.now() - start,
    };
  }

  return {
    strategy: 'artifacts',
    passed: false,
    output: `Missing artifact(s):\n${missing.map((f) => `  - ${f}`).join('\n')}`,
    durationMs: Date.now() - start,
  };
}
