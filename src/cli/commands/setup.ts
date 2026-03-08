import { Command } from 'commander';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../../config/config.js';
import { parseModelFlag } from '../../config/model-config.js';
import { c, bold, dim, cyan, green, yellow } from '../../utils/colors.js';
import type { ClaudeModel } from '../../core/types.js';
import fs from 'node:fs/promises';

const MODEL_CHOICES = [
  { value: 'sonnet', label: 'sonnet', hint: 'recommended — smart & fast' },
  { value: 'haiku',  label: 'haiku',  hint: 'cheap & quick' },
  { value: 'opus',   label: 'opus',   hint: 'most capable, slowest' },
];

// ── cloudy.local hostname helper ────────────────────────────────────

async function tryAddCloudyLocal(): Promise<void> {
  const HOSTS_FILE = '/etc/hosts';
  const ENTRY = '127.0.0.1 cloudy.local';
  try {
    const existing = await fs.readFile(HOSTS_FILE, 'utf-8');
    if (existing.includes('cloudy.local')) {
      console.log(c(green, '✓  cloudy.local already in /etc/hosts'));
      return;
    }
    const updated = existing.trimEnd() + '\n' + ENTRY + '\n';
    await fs.writeFile(HOSTS_FILE, updated, 'utf-8');
    console.log(c(green, `✓  Added ${ENTRY} to /etc/hosts`));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      console.log(c(yellow, `⚠  Permission denied writing /etc/hosts. Run manually:`));
      console.log(`   sudo sh -c 'echo "${ENTRY}" >> /etc/hosts'`);
    } else {
      console.log(c(yellow, `⚠  Could not update /etc/hosts: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

export const setupCommand = new Command('setup')
  .description('Interactive wizard to configure cloudy for this project')
  .option('--non-interactive', 'Apply defaults without prompting (useful in CI)')
  // Model flags for non-interactive mode
  .option('--planning-model <model>',          'Planning model')
  .option('--execution-model <model>',         'Execution model')
  .option('--validation-model <model>',        'Per-task validation model')
  .option('--review-model <model>',            'Post-run holistic review model')
  .option('--questions-model <model>',         'Model for auto-answering planning questions')
  .option('--questions-timeout <seconds>',     'Seconds to wait for human answer (default 60)', parseInt)
  // Validation flags
  .option('--typecheck <bool>',  'Enable TypeScript type-checking validation')
  .option('--lint <bool>',       'Enable lint validation')
  .option('--build <bool>',      'Enable build validation')
  .option('--test <bool>',       'Enable test validation')
  .option('--ai-review <bool>',  'Enable per-task AI review')
  // Execution flags
  .option('--max-retries <n>',         'Max retries per task', parseInt)
  .option('--parallel <bool>',         'Enable parallel task execution')
  .option('--max-parallel <n>',        'Max parallel tasks', parseInt)
  .option('--worktrees <bool>',        'Use git worktrees for parallel isolation')
  .option('--dashboard-port <n>',      'Default dashboard port', parseInt)
  .option('--max-cost-per-task <usd>', 'Abort task if cost exceeds this ($0 = unlimited)', parseFloat)
  .option('--max-cost-per-run <usd>',  'Abort run if cost exceeds this ($0 = unlimited)', parseFloat)
  .option('--setup-local-domain',      'Add 127.0.0.1 cloudy.local to /etc/hosts (non-interactive)')
  .action(async (opts: {
    nonInteractive?: boolean;
    planningModel?: string;
    executionModel?: string;
    validationModel?: string;
    reviewModel?: string;
    questionsModel?: string;
    questionsTimeout?: number;
    typecheck?: string;
    lint?: string;
    build?: string;
    test?: string;
    aiReview?: string;
    maxRetries?: number;
    parallel?: string;
    maxParallel?: number;
    worktrees?: string;
    dashboardPort?: number;
    maxCostPerTask?: number;
    maxCostPerRun?: number;
    setupLocalDomain?: boolean;
  }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    if (opts.nonInteractive) {
      // Apply any flags that were passed
      if (opts.planningModel)    config.models.planning   = parseModelFlag(opts.planningModel) as ClaudeModel;
      if (opts.executionModel)   config.models.execution  = parseModelFlag(opts.executionModel) as ClaudeModel;
      if (opts.validationModel)  config.models.validation = parseModelFlag(opts.validationModel) as ClaudeModel;
      if (opts.reviewModel)      config.review.model      = parseModelFlag(opts.reviewModel) as ClaudeModel;
      if (opts.typecheck  !== undefined) config.validation.typecheck  = opts.typecheck  === 'true';
      if (opts.lint       !== undefined) config.validation.lint       = opts.lint       === 'true';
      if (opts.build      !== undefined) config.validation.build      = opts.build      === 'true';
      if (opts.test       !== undefined) config.validation.test       = opts.test       === 'true';
      if (opts.aiReview   !== undefined) config.validation.aiReview   = opts.aiReview   === 'true';
      if (opts.maxRetries    !== undefined) config.maxRetries    = opts.maxRetries;
      if (opts.parallel      !== undefined) config.parallel      = opts.parallel === 'true';
      if (opts.maxParallel   !== undefined) config.maxParallel   = opts.maxParallel;
      if (opts.worktrees     !== undefined) config.worktrees     = opts.worktrees === 'true';
      if (opts.dashboardPort !== undefined) config.dashboardPort = opts.dashboardPort;
      if (opts.maxCostPerTask !== undefined) config.maxCostPerTaskUsd = opts.maxCostPerTask;
      if (opts.maxCostPerRun  !== undefined) config.maxCostPerRunUsd  = opts.maxCostPerRun;

      if (opts.setupLocalDomain) {
        await tryAddCloudyLocal();
      }

      await saveConfig(cwd, config);
      console.log(c(green, '✅  config saved (non-interactive)'));
      return;
    }

    // ── Interactive wizard ────────────────────────────────────────────────────
    p.intro(`${c(cyan + bold, '☁️  cloudy setup')}  ${c(dim, cwd)}`);

    // ── Models ────────────────────────────────────────────────────────────────
    p.log.step('Models');

    const planningModel = await p.select({
      message: 'Planning model (decomposes goals into tasks):',
      options: MODEL_CHOICES,
      initialValue: config.models.planning,
    });
    if (p.isCancel(planningModel)) { p.cancel('Cancelled.'); process.exit(0); }

    const executionModel = await p.select({
      message: 'Execution model (implements each task):',
      options: MODEL_CHOICES,
      initialValue: config.models.execution,
    });
    if (p.isCancel(executionModel)) { p.cancel('Cancelled.'); process.exit(0); }

    const validationModel = await p.select({
      message: 'Per-task validation model (checks acceptance criteria):',
      options: MODEL_CHOICES,
      initialValue: config.models.validation,
    });
    if (p.isCancel(validationModel)) { p.cancel('Cancelled.'); process.exit(0); }

    const reviewModel = await p.select({
      message: 'Post-run holistic review model (checks full spec coverage):',
      options: MODEL_CHOICES,
      initialValue: config.review.model,
    });
    if (p.isCancel(reviewModel)) { p.cancel('Cancelled.'); process.exit(0); }

    // ── Planning Q&A ──────────────────────────────────────────────────────────
    p.log.step('Planning Q&A');

    const questionsModel = await p.select({
      message: 'Model for auto-answering planning questions (when human doesn\'t respond):',
      options: MODEL_CHOICES,
      initialValue: config.models.planning,
    });
    if (p.isCancel(questionsModel)) { p.cancel('Cancelled.'); process.exit(0); }

    const questionsTimeoutRaw = await p.text({
      message: 'Seconds to wait for human answer before AI assumes (default: 60):',
      placeholder: '60',
      validate: (v) => {
        const n = parseInt(v || '60', 10);
        return isNaN(n) || n < 5 ? 'Must be a number ≥ 5' : undefined;
      },
    });
    if (p.isCancel(questionsTimeoutRaw)) { p.cancel('Cancelled.'); process.exit(0); }
    const questionsTimeout = parseInt((questionsTimeoutRaw as string) || '60', 10);

    // ── Validation strategies ─────────────────────────────────────────────────
    p.log.step('Per-task validation');

    const validationStrategies = await p.multiselect({
      message: 'Enable validation strategies (run after each task):',
      options: [
        { value: 'typecheck', label: 'TypeScript type-check', hint: 'tsc --noEmit' },
        { value: 'lint',      label: 'Lint',                  hint: 'eslint / ruff etc.' },
        { value: 'build',     label: 'Build',                 hint: 'compile the project' },
        { value: 'test',      label: 'Tests',                 hint: 'run test suite' },
        { value: 'aiReview',  label: 'AI review',             hint: 'per-task AI acceptance check' },
      ],
      initialValues: [
        ...(config.validation.typecheck ? ['typecheck'] : []),
        ...(config.validation.lint      ? ['lint']      : []),
        ...(config.validation.build     ? ['build']     : []),
        ...(config.validation.test      ? ['test']      : []),
        ...(config.validation.aiReview  ? ['aiReview']  : []),
      ] as string[],
      required: false,
    });
    if (p.isCancel(validationStrategies)) { p.cancel('Cancelled.'); process.exit(0); }

    // ── Execution ─────────────────────────────────────────────────────────────
    p.log.step('Execution');

    const maxRetries = await p.text({
      message: 'Max retries per failed task:',
      placeholder: String(config.maxRetries),
      validate: (v) => {
        const n = parseInt(v || String(config.maxRetries), 10);
        return isNaN(n) || n < 0 ? 'Must be a non-negative integer' : undefined;
      },
    });
    if (p.isCancel(maxRetries)) { p.cancel('Cancelled.'); process.exit(0); }

    const parallel = await p.confirm({
      message: 'Run independent tasks in parallel?',
      initialValue: config.parallel,
    });
    if (p.isCancel(parallel)) { p.cancel('Cancelled.'); process.exit(0); }

    let maxParallel = config.maxParallel;
    if (parallel) {
      const maxParallelRaw = await p.text({
        message: 'Max parallel tasks:',
        placeholder: String(config.maxParallel),
        validate: (v) => {
          const n = parseInt(v || String(config.maxParallel), 10);
          return isNaN(n) || n < 1 ? 'Must be ≥ 1' : undefined;
        },
      });
      if (p.isCancel(maxParallelRaw)) { p.cancel('Cancelled.'); process.exit(0); }
      maxParallel = parseInt((maxParallelRaw as string) || String(config.maxParallel), 10);
    }

    const worktrees = await p.confirm({
      message: 'Use git worktrees for parallel task isolation? (requires git 2.15+)',
      initialValue: config.worktrees,
    });
    if (p.isCancel(worktrees)) { p.cancel('Cancelled.'); process.exit(0); }

    // ── Cost limits ───────────────────────────────────────────────────────────
    p.log.step('Cost limits');

    const maxCostPerTask = await p.text({
      message: 'Max cost per task in USD (0 = unlimited):',
      placeholder: config.maxCostPerTaskUsd === 0 ? '0' : String(config.maxCostPerTaskUsd),
      validate: (v) => {
        const n = parseFloat(v || '0');
        return isNaN(n) || n < 0 ? 'Must be a number ≥ 0' : undefined;
      },
    });
    if (p.isCancel(maxCostPerTask)) { p.cancel('Cancelled.'); process.exit(0); }

    const maxCostPerRun = await p.text({
      message: 'Max cost per run in USD (0 = unlimited):',
      placeholder: config.maxCostPerRunUsd === 0 ? '0' : String(config.maxCostPerRunUsd),
      validate: (v) => {
        const n = parseFloat(v || '0');
        return isNaN(n) || n < 0 ? 'Must be a number ≥ 0' : undefined;
      },
    });
    if (p.isCancel(maxCostPerRun)) { p.cancel('Cancelled.'); process.exit(0); }

    // ── Dashboard ─────────────────────────────────────────────────────────────
    p.log.step('Dashboard');

    const dashboardPort = await p.text({
      message: 'Dashboard port (auto-increments if busy — use different ports for multiple projects):',
      placeholder: String(config.dashboardPort),
      validate: (v) => {
        const n = parseInt(v || String(config.dashboardPort), 10);
        return isNaN(n) || n < 1024 || n > 65535 ? 'Must be 1024–65535' : undefined;
      },
    });
    if (p.isCancel(dashboardPort)) { p.cancel('Cancelled.'); process.exit(0); }

    // ── cloudy.local hostname ─────────────────────────────────────────────
    const hostsContent = await fs.readFile('/etc/hosts', 'utf-8').catch(() => '');
    const cloudyLocalAlreadySet = hostsContent.includes('cloudy.local');

    if (!cloudyLocalAlreadySet) {
      const setupLocalDomain = await p.confirm({
        message: 'Set up cloudy.local hostname? (adds 127.0.0.1 cloudy.local to /etc/hosts — may need sudo)',
        initialValue: false,
      });
      if (p.isCancel(setupLocalDomain)) { p.cancel('Cancelled.'); process.exit(0); }
      if (setupLocalDomain) {
        await tryAddCloudyLocal();
      }
    } else {
      p.log.info(`${c(green, '✓')}  cloudy.local already in /etc/hosts`);
    }

    // ── Apply & save ──────────────────────────────────────────────────────────
    config.models.planning   = planningModel as ClaudeModel;
    config.models.execution  = executionModel as ClaudeModel;
    config.models.validation = validationModel as ClaudeModel;
    config.review.model      = reviewModel as ClaudeModel;

    // Store Q&A defaults in config (consumed by init if no flags provided)
    (config as any).questionsAutoAnsweringModel = questionsModel as ClaudeModel;
    (config as any).questionsTimeoutSec = questionsTimeout;

    const selected = validationStrategies as string[];
    config.validation.typecheck = selected.includes('typecheck');
    config.validation.lint      = selected.includes('lint');
    config.validation.build     = selected.includes('build');
    config.validation.test      = selected.includes('test');
    config.validation.aiReview  = selected.includes('aiReview');

    config.maxRetries    = parseInt((maxRetries as string) || String(config.maxRetries), 10);
    config.parallel      = parallel as boolean;
    config.maxParallel   = maxParallel;
    config.worktrees     = worktrees as boolean;
    config.maxCostPerTaskUsd = parseFloat((maxCostPerTask as string) || '0');
    config.maxCostPerRunUsd  = parseFloat((maxCostPerRun as string) || '0');
    config.dashboardPort = parseInt((dashboardPort as string) || String(config.dashboardPort), 10);

    await saveConfig(cwd, config);

    p.outro(`${c(green + bold, '✅  config saved')}  ${c(dim, '.cloudy/config.json')}`);
  });
