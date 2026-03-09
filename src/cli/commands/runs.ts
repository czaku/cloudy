import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { CLAWDASH_DIR, RUNS_DIR } from '../../config/defaults.js';
import { c, bold, dim, green, red, yellow, cyan } from '../../utils/colors.js';
import { formatCostInline } from '../../cost/reporter.js';

const VERDICT_COLOR: Record<string, string> = {
  PASS: green,
  PASS_WITH_NOTES: yellow,
  FAIL: red,
};

function fmtVerdict(verdict: string): string {
  const color = VERDICT_COLOR[verdict] ?? '';
  return c(color, verdict ?? 'unknown');
}

function fmtAge(isoDate: string): string {
  if (!isoDate) return '—';
  const ms = Date.now() - Date.parse(isoDate);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

interface RunSummary {
  name: string;
  goal: string;
  verdict: string;
  coverage?: number;
  costUsd: number;
  taskCount: number;
  completedCount: number;
  createdAt: string;
  durationMs?: number;
  pipelineId?: string;
  phaseIndex?: number;
  totalPhases?: number;
  phaseLabel?: string;
  tasks: any[];
}

async function loadRunSummary(runsDir: string, name: string): Promise<RunSummary | null> {
  const statePath = path.join(runsDir, name, 'state.json');
  const reviewPath = path.join(runsDir, name, 'review.json');

  let state: any = null;
  let review: any = null;

  try {
    state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
  } catch {
    return null; // Can't read state — skip
  }

  try {
    review = JSON.parse(await fs.readFile(reviewPath, 'utf-8'));
  } catch { /* no review yet */ }

  const plan = state?.plan;
  const tasks: any[] = plan?.tasks ?? [];

  return {
    name,
    goal: plan?.goal ?? '(unknown)',
    verdict: review?.verdict ?? (tasks.some((t: any) => t.status === 'in_progress') ? 'running' : '—'),
    coverage: review?.specCoverageScore,
    costUsd: state?.costSummary?.totalEstimatedUsd ?? 0,
    taskCount: tasks.length,
    completedCount: tasks.filter((t: any) => t.status === 'completed').length,
    createdAt: plan?.createdAt ?? '',
    durationMs: review?.durationMs,
    pipelineId: plan?.pipelineContext?.pipelineId,
    phaseIndex: plan?.pipelineContext?.phaseIndex,
    totalPhases: plan?.pipelineContext?.totalPhases,
    phaseLabel: plan?.pipelineContext?.phaseLabel,
    tasks,
  };
}

export const runsCommand = new Command('history')
  .alias('runs')
  .description('List run history for this project')
  .option('--show <name>', 'Show full task breakdown for a specific run')
  .option('--json', 'Output as JSON')
  .action(async (opts: { show?: string; json?: boolean }) => {
    const cwd = process.cwd();
    const runsDir = path.join(cwd, CLAWDASH_DIR, RUNS_DIR);

    // ── Single run detail ──────────────────────────────────────────────────────
    if (opts.show) {
      const run = await loadRunSummary(runsDir, opts.show);
      if (!run) {
        console.error(c(red, `✖  Run not found: ${opts.show}`));
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(run, null, 2));
        return;
      }
      console.log(`\n${c(cyan + bold, '☁️  run:')}  ${c(bold, run.name)}`);
      console.log(`   Goal:    ${run.goal}`);
      console.log(`   Verdict: ${fmtVerdict(run.verdict)}${run.coverage != null ? `  (${run.coverage}% coverage)` : ''}`);
      console.log(`   Cost:    ${formatCostInline(run.costUsd)}`);
      console.log(`   Tasks:   ${run.completedCount}/${run.taskCount} completed`);
      if (run.pipelineId) {
        console.log(`   Pipeline: ${run.pipelineId}  Phase ${run.phaseIndex}/${run.totalPhases}`);
      }
      console.log('');
      const STATUS_ICONS: Record<string, string> = {
        pending: '○', in_progress: '⚡', completed: '✅', failed: '✗', skipped: '⊘', rolled_back: '↺',
      };
      for (const task of run.tasks) {
        const icon = STATUS_ICONS[task.status] ?? '?';
        const cost = task.costData?.estimatedUsd ? `$${task.costData.estimatedUsd.toFixed(3)}` : '';
        console.log(`  ${icon}  ${c(dim, task.id.padEnd(12))}  ${task.title.slice(0, 40).padEnd(40)}  ${c(dim, cost)}`);
      }
      console.log('');
      return;
    }

    // ── List all runs ──────────────────────────────────────────────────────────
    let runNames: string[];
    try {
      runNames = await fs.readdir(runsDir);
    } catch {
      console.log(c(dim, 'No runs yet. Run `cloudy init` to start.'));
      return;
    }

    // Load all run summaries in parallel
    const summaries = (
      await Promise.all(runNames.map((name) => loadRunSummary(runsDir, name)))
    ).filter((r): r is RunSummary => r !== null);

    if (summaries.length === 0) {
      console.log(c(dim, 'No runs yet. Run `cloudy init` to start.'));
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(summaries, null, 2));
      return;
    }

    // Sort by createdAt desc
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Group: pipelines first (grouped by pipelineId), then standalone
    const pipelines = new Map<string, RunSummary[]>();
    const standalone: RunSummary[] = [];

    for (const run of summaries) {
      if (run.pipelineId) {
        if (!pipelines.has(run.pipelineId)) pipelines.set(run.pipelineId, []);
        pipelines.get(run.pipelineId)!.push(run);
      } else {
        standalone.push(run);
      }
    }

    console.log(`\n${c(cyan + bold, '☁️  cloudy history')}  ${c(dim, cwd)}\n`);

    // Pipelines
    for (const [pipelineId, phases] of pipelines) {
      // Sort phases by phaseIndex
      phases.sort((a, b) => (a.phaseIndex ?? 0) - (b.phaseIndex ?? 0));
      const totalCost = phases.reduce((s, p) => s + p.costUsd, 0);
      const overallVerdict = phases.some((p) => p.verdict === 'FAIL')
        ? 'FAIL'
        : phases.every((p) => p.verdict === 'PASS')
          ? 'PASS'
          : phases.some((p) => p.verdict === 'running')
            ? 'running'
            : 'PASS_WITH_NOTES';

      console.log(`${c(bold, '●')} ${c(cyan, 'Pipeline:')}  ${c(bold, pipelineId)}  ${fmtVerdict(overallVerdict)}  ${c(dim, formatCostInline(totalCost))}`);

      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        const isLast = i === phases.length - 1;
        const prefix = isLast ? '  └─' : '  ├─';
        const cov = phase.coverage != null ? `  ${phase.coverage}%` : '';
        const tasks = `  ${phase.completedCount}/${phase.taskCount} tasks`;
        console.log(
          `${prefix} ${c(dim, `Phase ${phase.phaseIndex}:`)}  ${phase.name.slice(0, 50).padEnd(50)}  ${fmtVerdict(phase.verdict)}${cov}  ${c(dim, formatCostInline(phase.costUsd))}${tasks}  ${c(dim, fmtAge(phase.createdAt))}`,
        );
      }
      console.log('');
    }

    // Standalone
    if (standalone.length > 0) {
      if (pipelines.size > 0) {
        console.log(`${c(bold, '●')} ${c(cyan, 'Standalone runs:')}`);
      }
      for (const run of standalone) {
        const cov = run.coverage != null ? `  ${run.coverage}%` : '';
        const tasks = `  ${run.completedCount}/${run.taskCount} tasks`;
        console.log(
          `  ${run.name.slice(0, 50).padEnd(50)}  ${fmtVerdict(run.verdict)}${cov}  ${c(dim, formatCostInline(run.costUsd))}${tasks}  ${c(dim, fmtAge(run.createdAt))}`,
        );
      }
      console.log('');
    }
  });
