import type { ValidationResult } from '../../core/types.js';

/**
 * Lint strategy — intentionally a no-op.
 *
 * Hardcoding `npx eslint .` assumes JavaScript/TypeScript. Cloudy works with
 * any language. Use the `commands` array in your validation config:
 *
 *   "commands": ["bunx eslint src/"]
 *   "commands": ["cargo clippy"]
 *   "commands": ["pylint api/"]
 */
export async function runLintCheck(_cwd: string): Promise<ValidationResult> {
  return {
    strategy: 'lint',
    passed: true,
    output: 'Skipped: use validation.commands for project-specific linting',
    durationMs: 0,
  };
}
