import { Command } from 'commander';
import * as p from '@clack/prompts';
import path from 'node:path';
import { loadConfig, saveConfig } from '../../config/config.js';
import { parseModelFlag } from '../../config/model-config.js';
import { c, bold, dim, cyan, green, yellow } from '../../utils/colors.js';
import type { ClaudeModel } from '../../core/types.js';
import type { ProjectMeta } from '../../core/types.js';
import fs from 'node:fs/promises';
import { readJson, writeJson, ensureDir } from '../../utils/fs.js';
import { PROJECT_META_FILE, CLAWDASH_DIR } from '../../config/defaults.js';

const MODEL_CHOICES = [
  { value: 'sonnet', label: 'sonnet', hint: 'recommended — smart & fast' },
  { value: 'haiku',  label: 'haiku',  hint: 'cheap & quick' },
  { value: 'opus',   label: 'opus',   hint: 'most capable, slowest' },
];

// ── cloudy.local hostname helper ────────────────────────────────────

export async function trySetupPortForward(daemonPort: number): Promise<void> {
  if (process.platform !== 'darwin') {
    console.log(c(yellow, '⚠  Port forwarding setup is macOS-only (pfctl/launchd)'));
    return;
  }
  const anchorFile = '/etc/pf.anchors/cloudy';
  const plistPath  = '/Library/LaunchDaemons/com.cloudy.portforward.plist';
  const rule  = `rdr pass on lo0 proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${daemonPort}\n`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cloudy.portforward</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>echo "rdr pass on lo0 proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port ${daemonPort}" | pfctl -ef -</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;

  try {
    await fs.writeFile(anchorFile, rule, 'utf-8');
    await fs.writeFile(plistPath, plist, 'utf-8');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('launchctl', ['load', plistPath]).catch(() =>
      // Already loaded or launchd needs reload — activate pf rule directly as fallback
      promisify(execFile)('sh', ['-c', `echo "${rule.trim()}" | pfctl -ef -`]).catch(() => {}),
    );
    console.log(c(green, `✓  Port forward 80 → ${daemonPort} active — http://cloudy.local will work`));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      console.log(c(yellow, '⚠  Need root to set up port forwarding. Run:'));
      console.log(`   sudo sh -c 'echo "${rule.trim()}" > ${anchorFile}'`);
      console.log(`   sudo tee ${plistPath} > /dev/null << 'PLIST'`);
      console.log(plist);
      console.log('PLIST');
      console.log(`   sudo launchctl load ${plistPath}`);
    } else {
      console.log(c(yellow, `⚠  Port forward failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

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
  .option('--global', 'Configure global defaults (stored in ~/.cloudy/config.json)')
  // Model flags for non-interactive mode
  .option('--plan-model <model>',              'Plan model')
  .option('--build-model <model>',             'Build model')
  .option('--task-review-model <model>',       'Per-task validation model')
  .option('--run-review-model <model>',        'Post-run holistic review model')
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
  .option('--setup-port-forward',      'Set up pfctl port forwarding 80 → daemon port (macOS, non-interactive)')
  .action(async (opts: {
    nonInteractive?: boolean;
    global?: boolean;
    planModel?: string;
    buildModel?: string;
    taskReviewModel?: string;
    runReviewModel?: string;
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
    setupPortForward?: boolean;
  }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    if (opts.nonInteractive) {
      // Apply any flags that were passed
      if (opts.planModel)        config.models.planning   = parseModelFlag(opts.planModel) as ClaudeModel;
      if (opts.buildModel)       config.models.execution  = parseModelFlag(opts.buildModel) as ClaudeModel;
      if (opts.taskReviewModel)  config.models.validation = parseModelFlag(opts.taskReviewModel) as ClaudeModel;
      if (opts.runReviewModel)   config.review.model      = parseModelFlag(opts.runReviewModel) as ClaudeModel;
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

      if (opts.setupPortForward) {
        const { loadGlobalConfig: loadGC } = await import('../../config/global-config.js');
        const { DAEMON_DEFAULT_PORT } = await import('../../config/defaults.js');
        const gc = await loadGC().catch(() => null);
        await trySetupPortForward(gc?.daemonPort ?? DAEMON_DEFAULT_PORT);
      }

      await saveConfig(cwd, config);
      console.log(c(green, '✅  config saved (non-interactive)'));
      return;
    }

    // ── Interactive wizard ────────────────────────────────────────────────────
    p.intro(`${c(cyan + bold, '☁️  cloudy setup')}  ${c(dim, cwd)}`);

    // ── Project identity ──────────────────────────────────────────────────────
    p.log.step('Project identity');

    const metaPath = path.join(cwd, CLAWDASH_DIR, PROJECT_META_FILE);
    const existingMeta = await readJson<ProjectMeta>(metaPath).catch(() => null);

    const defaultId = existingMeta?.id ?? path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const defaultName = existingMeta?.name ?? path.basename(cwd);

    const projectId = await p.text({
      message: 'Project ID (slug, used by daemon):',
      placeholder: defaultId,
      initialValue: existingMeta?.id ?? defaultId,
      validate: (v) => /^[a-z][a-z0-9-]{0,49}$/.test(v ?? '') ? undefined : 'Lowercase letters, numbers, hyphens only',
    });
    if (p.isCancel(projectId)) { p.cancel('Cancelled.'); process.exit(0); }

    const projectName = await p.text({
      message: 'Project display name:',
      placeholder: defaultName,
      initialValue: existingMeta?.name ?? defaultName,
      validate: (v) => (v ?? '').trim() ? undefined : 'Name required',
    });
    if (p.isCancel(projectName)) { p.cancel('Cancelled.'); process.exit(0); }

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

    // ── Port forwarding (80 → daemon port so http://cloudy.local works) ──────
    const pfAnchorExists = await fs.access('/etc/pf.anchors/cloudy').then(() => true).catch(() => false);
    if (!pfAnchorExists && process.platform === 'darwin') {
      const { loadGlobalConfig: loadGC } = await import('../../config/global-config.js');
      const { DAEMON_DEFAULT_PORT } = await import('../../config/defaults.js');
      const gc = await loadGC().catch(() => null);
      const dp = gc?.daemonPort ?? DAEMON_DEFAULT_PORT;
      const setupPf = await p.confirm({
        message: `Set up port forwarding 80 → ${dp}? (lets http://cloudy.local work without a port number — needs sudo)`,
        initialValue: false,
      });
      if (p.isCancel(setupPf)) { p.cancel('Cancelled.'); process.exit(0); }
      if (setupPf) {
        await trySetupPortForward(dp);
      }
    } else if (pfAnchorExists) {
      p.log.info(`${c(green, '✓')}  Port forwarding already configured`);
    }

    // ── Project type detection (for preflight + sentinel suggestions) ─────────
    const hasSentinelYaml = await fs.access(path.join(cwd, 'sentinel.yaml')).then(() => true).catch(() => false);
    const hasIosDir  = await fs.access(path.join(cwd, 'ios')).then(() => true).catch(() => false);
    const hasAppleDir = await fs.access(path.join(cwd, 'apple')).then(() => true).catch(() => false);
    const hasAndroid = await fs.access(path.join(cwd, 'android')).then(() => true).catch(() => false);
    const hasPubspec = await fs.access(path.join(cwd, 'pubspec.yaml')).then(() => true).catch(() => false);
    const isMobile = hasIosDir || hasAppleDir || hasAndroid || hasPubspec;

    // ── Preflight commands ────────────────────────────────────────────────────
    p.log.step('Preflight commands');

    const suggestedPreflight: string[] = [];
    if (hasSentinelYaml) suggestedPreflight.push('npx sentinel schema:validate');
    if (isMobile && (hasIosDir || hasAppleDir)) suggestedPreflight.push('xcrun simctl list devices available --json > /dev/null');

    const preflightDefault = (config as any).preflightCommands?.join('\n') ?? suggestedPreflight.join('\n');

    const preflightRaw = await p.text({
      message: `Preflight commands (run before first task, one per line — blank = none):${suggestedPreflight.length ? c(dim, '\n  detected: ' + suggestedPreflight.join(', ')) : ''}`,
      placeholder: suggestedPreflight.join('\n') || 'leave blank for none',
      initialValue: preflightDefault || undefined,
    });
    if (p.isCancel(preflightRaw)) { p.cancel('Cancelled.'); process.exit(0); }
    const preflightCommands = ((preflightRaw as string) || '').split('\n').map((l) => l.trim()).filter(Boolean);

    // ── Sentinel validation ───────────────────────────────────────────────────
    if (hasSentinelYaml && !config.validation.commands.includes('npx sentinel schema:validate')) {
      const addSentinel = await p.confirm({
        message: 'sentinel.yaml detected — add `npx sentinel schema:validate` to validation commands?',
        initialValue: true,
      });
      if (p.isCancel(addSentinel)) { p.cancel('Cancelled.'); process.exit(0); }
      if (addSentinel) {
        config.validation.commands = [...config.validation.commands.filter((c) => c !== 'npx sentinel schema:validate'), 'npx sentinel schema:validate'];
      }
    }

    // ── Review gate ───────────────────────────────────────────────────────────
    p.log.step('Review gate');

    const failBlocksRun = await p.confirm({
      message: 'Exit with error (code 1) when post-run review verdict is FAIL?',
      initialValue: config.review.failBlocksRun ?? false,
    });
    if (p.isCancel(failBlocksRun)) { p.cancel('Cancelled.'); process.exit(0); }

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
    (config as any).preflightCommands = preflightCommands;
    config.review.failBlocksRun = failBlocksRun as boolean;

    // Save project identity
    const meta: ProjectMeta = {
      id: projectId as string,
      name: (projectName as string).trim(),
      path: cwd,
      registeredAt: existingMeta?.registeredAt ?? new Date().toISOString(),
    };
    await ensureDir(path.join(cwd, CLAWDASH_DIR));
    await writeJson(metaPath, meta);

    await saveConfig(cwd, config);

    p.outro(`${c(green + bold, '✅  config saved')}  ${c(dim, '.cloudy/config.json')}`);
  });
