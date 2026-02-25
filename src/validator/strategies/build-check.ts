import type { ValidationResult } from '../../core/types.js';

/**
 * Build strategy — intentionally a no-op.
 *
 * Hardcoding `npm run build` assumes Node.js. Cloudy works with any language.
 * Use the `commands` array in your validation config:
 *
 *   "commands": ["cd web && bun run build"]
 *   "commands": ["cargo build"]
 *   "commands": ["make"]
 */
export async function runBuildCheck(_cwd: string): Promise<ValidationResult> {
  return {
    strategy: 'build',
    passed: true,
    output: 'Skipped: use validation.commands for project-specific build checks',
    durationMs: 0,
  };
}
