import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR, RUNS_DIR, CURRENT_FILE } from '../config/defaults.js';

/**
 * Returns the current run directory, or .cloudy/ root (legacy) if no current run is set.
 * Lightweight helper — no dependencies on state.ts, safe to import from logger/checkpoint/etc.
 */
export async function getCurrentRunDir(cwd: string): Promise<string> {
  try {
    const name = (
      await fs.readFile(path.join(cwd, CLAWDASH_DIR, CURRENT_FILE), 'utf-8')
    ).trim();
    if (name) return path.join(cwd, CLAWDASH_DIR, RUNS_DIR, name);
  } catch {
    // No current file — legacy mode
  }
  return path.join(cwd, CLAWDASH_DIR);
}
