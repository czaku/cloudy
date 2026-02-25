import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { loadState } from '../../core/state.js';
import { formatCostSummary, formatCostInline } from '../../cost/reporter.js';
import { CLAWDASH_DIR, TASK_LOGS_DIR } from '../../config/defaults.js';
import { c, bold, dim, green, red, yellow, cyan } from '../../utils/colors.js';

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '⚡',
  completed: '✅',
  failed: '✗',
  skipped: '⊘',
  rolled_back: '↺',
};

function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

async function readLastLines(filePath: string, n: number): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

async function render(
  cwd: string,
  tailN: number,
  watchMode: boolean,
): Promise<boolean> {
  const state = await loadState(cwd);

  if (!state?.plan) {
    console.log('No plan found. Run "cloudy init <goal>" first.');
    return false;
  }

  const plan = state.plan;
  const tasks = plan.tasks;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  const now = Date.now();

  const lines: string[] = [];

  // Pipeline context header (shown when run is part of a pipeline)
  const pctx = plan.pipelineContext;
  const pipelineHeader = pctx
    ? `  ${c(dim, `Phase ${pctx.phaseIndex}/${pctx.totalPhases}:`)}  ${c(bold, pctx.phaseLabel)}  ${c(dim, `[${pctx.pipelineId}]`)}`
    : '';

  if (watchMode) {
    const timeStr = new Date().toLocaleTimeString();
    lines.push(`\n${c(cyan + bold, '☁️  ' + plan.goal.slice(0, 40))}  ${c(dim, '·')}  ${c(dim, 'watching  (ctrl+c to exit)')}  ${c(dim, timeStr)}`);
    if (pipelineHeader) lines.push(pipelineHeader);
    if (state.runName) lines.push(`  ${c(dim, `run: ${state.runName}`)}`);
  } else {
    lines.push(`\nGoal: ${plan.goal}`);
    if (state.runName) lines.push(`Run:  ${state.runName}`);
    if (pipelineHeader) lines.push(pipelineHeader);
    lines.push(`Progress: ${completed}/${tasks.length} (${pct}%) | ${tasks.filter((t) => t.status === 'pending').length} pending | ${failed} failed`);
    lines.push(`Total cost: ${formatCostInline(state.costSummary.totalEstimatedUsd)}`);
  }

  lines.push('');

  // Progress bar
  const width = 28;
  const filled = tasks.length > 0 ? Math.round((completed / tasks.length) * width) : 0;
  const empty = width - filled;
  const bar = c(green, '█'.repeat(filled)) + c(dim, '░'.repeat(empty));
  lines.push(`  ${bar}  ${c(bold, `${completed} / ${tasks.length}`)}  ${c(dim, `${pct}%`)}`);
  lines.push('');

  // Task list
  let inProgressTask: string | null = null;
  for (const task of tasks) {
    const icon = STATUS_ICONS[task.status] ?? '?';
    let elapsed = '—';
    let displayLabel: string = task.status;

    if (task.status === 'completed' && task.durationMs != null) {
      elapsed = formatElapsed(task.durationMs);
      displayLabel = 'done';
    } else if (task.status === 'in_progress' && task.startedAt) {
      const ms = now - Date.parse(task.startedAt);
      elapsed = formatElapsed(ms);
      displayLabel = 'running';
      inProgressTask = task.id;
    } else if (task.status === 'failed') {
      displayLabel = 'failed';
    } else if (task.status === 'pending') {
      displayLabel = 'waiting';
    } else if (task.status === 'skipped') {
      displayLabel = 'skipped';
    }

    const titlePad = task.title.slice(0, 28).padEnd(28);
    const elapsedPad = elapsed.padStart(8);
    const statusPad = displayLabel.padEnd(10);

    let line: string;
    if (task.status === 'completed') {
      const taskCost = task.costData?.estimatedUsd
        ? c(dim, `$${task.costData.estimatedUsd.toFixed(3)}`.padStart(7))
        : c(dim, '       ');
      line = `  ${c(green, icon)}   ${c(dim, task.id)}  ${titlePad}  ${c(dim, elapsedPad)}  ${taskCost}  ${c(dim, statusPad)}`;
    } else if (task.status === 'in_progress') {
      line = `  ${c(yellow, icon)}   ${c(bold, task.id)}  ${c(bold, titlePad)}  ${c(yellow, elapsedPad)}  ${c(dim, '       ')}  ${c(yellow, statusPad)}`;
    } else if (task.status === 'failed') {
      line = `  ${c(red, icon)}   ${c(red, task.id)}  ${titlePad}  ${c(dim, elapsedPad)}  ${c(dim, '       ')}  ${c(red, statusPad)}`;
    } else {
      line = `  ${icon}   ${c(dim, task.id)}  ${c(dim, titlePad)}  ${c(dim, elapsedPad)}  ${c(dim, '       ')}  ${c(dim, statusPad)}`;
    }

    lines.push(line);
  }

  lines.push('');
  lines.push(`  💰  ${formatCostInline(state.costSummary.totalEstimatedUsd)}`);

  // Tail output for in-progress task
  if (tailN > 0 && inProgressTask) {
    const logPath = path.join(cwd, CLAWDASH_DIR, TASK_LOGS_DIR, `${inProgressTask}.log`);
    const tailLines = await readLastLines(logPath, tailN);
    if (tailLines.length > 0) {
      lines.push('');
      lines.push(`  ${c(dim, `── ${inProgressTask} last output ${'─'.repeat(36)}`)}`);
      for (const l of tailLines) {
        lines.push(`  ${c(dim, l)}`);
      }
    }
  }

  lines.push('');

  const output = lines.join('\n');
  process.stdout.write(output);
  return true;
}

export const statusCommand = new Command('status')
  .description('Show current plan status and progress')
  .option('--json', 'Output as JSON')
  .option('--cost', 'Show detailed cost breakdown')
  .option('--watch', 'Re-render every 2s until ctrl+c')
  .option('--tail <n>', 'Show last N lines of in-progress task log (default 10 in watch mode)', parseInt)
  .action(async (opts: { json?: boolean; cost?: boolean; watch?: boolean; tail?: number }) => {
    const cwd = process.cwd();
    const state = await loadState(cwd);

    if (!state?.plan) {
      console.log('No plan found. Run "cloudy init <goal>" first.');
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }

    const tailN = opts.tail ?? (opts.watch ? 10 : 0);

    if (opts.watch) {
      // Clear screen and render immediately
      process.stdout.write('\x1b[2J\x1b[H');
      await render(cwd, tailN, true);

      const interval = setInterval(async () => {
        process.stdout.write('\x1b[2J\x1b[H');
        await render(cwd, tailN, true);
      }, 2000);

      process.once('SIGINT', () => {
        clearInterval(interval);
        console.log('\n');
        process.exit(0);
      });

      // Keep process alive
      await new Promise<void>(() => {/* runs until SIGINT */});
      return;
    }

    await render(cwd, tailN, false);

    if (opts.cost) {
      console.log('\n' + formatCostSummary(state.costSummary));
    }
  });
