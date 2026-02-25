import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { CLAWDASH_DIR } from '../../config/defaults.js';

export const resetCommand = new Command('reset')
  .description('Clear all cloudy state (plan, logs, checkpoints)')
  .option('--force', 'Skip the confirmation prompt and delete immediately')
  .action(async (opts: { force?: boolean }) => {
    const cwd = process.cwd();
    const dir = path.join(cwd, CLAWDASH_DIR);

    try {
      await fs.access(dir);
    } catch {
      console.log('No .cloudy directory found. Nothing to reset.');
      return;
    }

    if (!opts.force) {
      console.log('This will delete all cloudy state including:');
      console.log('  - Plan and task state');
      console.log('  - Configuration');
      console.log('  - Logs');
      console.log('  - Checkpoint references');
      console.log('\nRun again with --force to confirm deletion.');
      return;
    }

    await fs.rm(dir, { recursive: true, force: true });
    console.log('Cleared .cloudy directory.');
  });
