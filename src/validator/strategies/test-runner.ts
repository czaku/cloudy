import type { ValidationResult } from '../../core/types.js';

/**
 * Test runner strategy — intentionally a no-op.
 *
 * Hardcoding `npm test` assumes Node.js. Cloudy works with any language.
 * Use the `commands` array in your validation config:
 *
 *   "commands": ["cd web && bun test"]
 *   "commands": ["cargo test"]
 *   "commands": ["pytest api/tests/"]
 */
export async function runTestRunner(_cwd: string): Promise<ValidationResult> {
  return {
    strategy: 'test',
    passed: true,
    output: 'Skipped: use validation.commands for project-specific test running',
    durationMs: 0,
  };
}
