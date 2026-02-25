import type { ValidationResult } from '../../core/types.js';

/**
 * Type-check strategy — intentionally a no-op.
 *
 * Hardcoding `tsc --noEmit` here assumes TypeScript. Cloudy works with any
 * language (Swift, Rust, C, Python, etc.). Use the `commands` array in your
 * validation config for project-specific type checking:
 *
 *   "commands": ["cd web && bunx tsc --noEmit"]
 *   "commands": ["cargo check"]
 *   "commands": ["swiftc -typecheck Sources/**"]
 */
export async function runTypeCheck(_cwd: string): Promise<ValidationResult> {
  return {
    strategy: 'typecheck',
    passed: true,
    output: 'Skipped: use validation.commands for project-specific type checking',
    durationMs: 0,
  };
}
