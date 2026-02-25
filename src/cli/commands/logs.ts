import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR } from '../../config/defaults.js';

const TASK_LOGS_DIR = 'logs/tasks';
const RUNS_DIR = 'runs';

function parseLine(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const type = obj['type'] as string | undefined;

    // Assistant text chunks
    if (type === 'assistant') {
      const msg = obj['message'] as Record<string, unknown> | undefined;
      const content = msg?.['content'] as Array<Record<string, unknown>> | undefined;
      if (content) {
        return content
          .filter((b) => b['type'] === 'text')
          .map((b) => b['text'] as string)
          .join('')
          .trim() || null;
      }
    }

    // Final result
    if (type === 'result') {
      const output = obj['result'] as string | undefined;
      if (output) return `\x1b[32m✓ Result:\x1b[0m ${output.trim()}`;
    }

    // Errors
    if (type === 'error') {
      const msg = obj['error'] as string | undefined;
      return msg ? `\x1b[31m✗ Error:\x1b[0m ${msg}` : null;
    }

    return null;
  } catch {
    // Not JSON — raw text line
    return raw.trim() || null;
  }
}

export const logsCommand = new Command('logs')
  .description('Show output log for a specific task')
  .argument('<task-id>', 'Task ID (e.g. task-3)')
  .option('--raw', 'Print raw log without parsing')
  .option('--run', 'Show structured run event from latest.jsonl instead')
  .action(async (taskId: string, opts: { raw?: boolean; run?: boolean }) => {
    const cwd = process.cwd();

    if (opts.run) {
      // Show structured run event from latest.jsonl
      const jsonlPath = path.join(cwd, CLAWDASH_DIR, RUNS_DIR, 'latest.jsonl');
      let content: string;
      try {
        content = await fs.readFile(jsonlPath, 'utf-8');
      } catch {
        console.error(`No run log found at ${jsonlPath}`);
        process.exit(1);
      }

      const lines = content.split('\n').filter(Boolean);
      const entries = lines
        .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } })
        .filter((e): e is Record<string, unknown> => e !== null && e['taskId'] === taskId);

      if (entries.length === 0) {
        console.error(`No run events found for task "${taskId}" in latest.jsonl`);
        process.exit(1);
      }

      for (const entry of entries) {
        console.log(JSON.stringify(entry, null, 2));
      }
      return;
    }

    // Show task output log
    const logPath = path.join(cwd, CLAWDASH_DIR, TASK_LOGS_DIR, `${taskId}.log`);
    let content: string;
    try {
      content = await fs.readFile(logPath, 'utf-8');
    } catch {
      console.error(`No log found for task "${taskId}" at ${logPath}`);
      process.exit(1);
    }

    if (opts.raw) {
      process.stdout.write(content);
      return;
    }

    console.log(`\x1b[1m\x1b[36m── cloudy logs: ${taskId} ──\x1b[0m\n`);

    const lines = content.split('\n');
    let lastWasBlank = false;
    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed === null) continue;
      // Collapse consecutive blank lines
      if (parsed === '') {
        if (!lastWasBlank) console.log('');
        lastWasBlank = true;
      } else {
        console.log(parsed);
        lastWasBlank = false;
      }
    }
  });
