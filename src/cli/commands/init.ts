import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { createPlan } from '../../planner/planner.js';
import { loadConfig, saveConfig } from '../../config/config.js';
import {
  mergeModelConfig,
  parseModelFlag,
} from '../../config/model-config.js';
import { loadOrCreateState, saveState, updatePlan } from '../../core/state.js';
import { initLogger, log } from '../../utils/logger.js';
import { fileExists } from '../../utils/fs.js';
import { c, bold, dim, red, green, yellow, cyan } from '../../utils/colors.js';
import { acquireLock } from '../../utils/lock.js';
import type { ClaudeModel } from '../../core/types.js';
import { createStreamFormatter } from '../../utils/stream-formatter.js';
import type { Plan } from '../../core/types.js';

const MODEL_OPTIONS = [
  { value: 'sonnet', label: 'sonnet', hint: 'recommended — smart & fast' },
  { value: 'haiku', label: 'haiku', hint: 'cheap & quick' },
  { value: 'opus', label: 'opus', hint: 'most capable, slowest' },
];

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '.cloudy/';
  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
      await fs.appendFile(gitignorePath, `\n${entry}\n`, 'utf-8');
    }
  } catch {
    await fs.writeFile(gitignorePath, `${entry}\n`, 'utf-8');
  }
}

function formatPlanNote(plan: Plan): string {
  const lines: string[] = [];
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i];
    const deps = task.dependencies.length > 0
      ? `  ← ${task.dependencies.join(', ')}`
      : '';
    const desc = task.description.length > 60
      ? task.description.slice(0, 57) + '...'
      : task.description;
    lines.push(`${String(i + 1).padStart(3)}  ${task.id.padEnd(8)}  ${task.title}${deps}`);
    lines.push(`         ${desc}`);
  }
  return lines.join('\n');
}

export const initCommand = new Command('init')
  .description('Decompose a goal into tasks using Claude')
  .argument('[goal]', 'The project goal to decompose into tasks')
  .option('--model <model>', 'Model for all phases')
  .option('--model-planning <model>', 'Model for planning phase')
  .option('--spec <file>', 'Path to a spec/PRD file to use as planning context')
  .option('--no-review', 'Auto-approve the generated plan without interactive review')
  .option('--verbose', 'Show live Claude output during planning')
  .option('--engine <engine>', 'Execution engine for run phase: claude-code (default) or pi-mono')
  .option('--pi-provider <provider>', 'Pi-mono provider: anthropic, openai, google, ollama, etc.')
  .option('--pi-model <model>', 'Pi-mono model ID: gpt-4o-mini, gemini-2.0-flash, qwen2.5-coder:7b, etc.')
  .option('--pi-base-url <url>', 'Pi-mono base URL for OpenAI-compatible endpoints')
  .action(async (goalArg: string | undefined, opts: {
    model?: string;
    modelPlanning?: string;
    spec?: string;
    review: boolean;
    verbose?: boolean;
    engine?: string;
    piProvider?: string;
    piModel?: string;
    piBaseUrl?: string;
  }) => {
    const cwd = process.cwd();
    const projectName = path.basename(cwd);
    await initLogger(cwd);

    // Global concurrency lock (max 2 across all projects)
    let releaseLock: (() => void) | undefined;
    try {
      releaseLock = await acquireLock('init', cwd);
    } catch (err) {
      console.error(c(red, `✖  ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    p.intro(`${c(cyan + bold, '☁️  cloudy init')}  ${c(bold, projectName)}  ${c(dim, cwd)}`);

    const config = await loadConfig(cwd);

    // ── Spec file ─────────────────────────────────────────────────────────────
    let specContent: string | undefined;
    let specPath = opts.spec;

    if (!specPath && !goalArg) {
      const input = await p.text({
        message: 'Spec file path (or leave blank to type a goal):',
        placeholder: '/tmp/my-spec.md',
      });
      if (p.isCancel(input)) { p.cancel('Cancelled.'); process.exit(0); }
      specPath = (input as string).trim() || undefined;
    }

    let wrapUpPrompt: string | undefined;

    if (specPath) {
      try {
        specContent = await fs.readFile(specPath, 'utf-8');
        // Extract ## Wrap-up section before passing to planner so it isn't treated as a task
        const wrapUpMatch = specContent.match(/^##\s+Wrap-?up\b.*\n([\s\S]*?)(?=\n##\s|\s*$)/im);
        if (wrapUpMatch) {
          wrapUpPrompt = wrapUpMatch[1].trim();
          specContent = specContent.replace(/^##\s+Wrap-?up\b[\s\S]*$/im, '').trim();
          p.log.info(`Wrap-up section extracted (will run after all tasks complete)`);
        }
        p.log.info(`Spec loaded: ${specPath}  (${Math.round(specContent.length / 1024)}KB)`);
      } catch (err) {
        p.log.error(`Cannot read spec file "${specPath}": ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    // ── Goal ──────────────────────────────────────────────────────────────────
    let goal = goalArg;
    if (!goal) {
      if (specContent) {
        const firstLine = specContent.split('\n').find((l) => l.trim().length > 0);
        goal = firstLine?.replace(/^#+\s*/, '').trim() ?? 'Implement the specification';
      } else {
        const input = await p.text({
          message: 'What do you want to build?',
          placeholder: 'e.g. Add authentication to the API',
          validate: (v) => (v ?? '').trim() ? undefined : 'Goal is required',
        });
        if (p.isCancel(input)) { p.cancel('Cancelled.'); process.exit(0); }
        goal = (input as string).trim();
      }
    }

    p.log.info(`Goal: ${goal}`);

    // ── Planning model ────────────────────────────────────────────────────────
    let planningModel = opts.model
      ? parseModelFlag(opts.model)
      : opts.modelPlanning
        ? parseModelFlag(opts.modelPlanning)
        : undefined;

    if (!planningModel) {
      const selected = await p.select({
        message: 'Planning model:',
        options: MODEL_OPTIONS,
        initialValue: 'sonnet',
      });
      if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
      planningModel = selected as ClaudeModel;
    }

    // ── Execution model (saved for cloudy run) ────────────────────────────────
    let executionModel: ClaudeModel = opts.model ? parseModelFlag(opts.model) : config.models.execution;
    if (!opts.model && !opts.modelPlanning) {
      const selected = await p.select({
        message: 'Execution model (used by cloudy run):',
        options: MODEL_OPTIONS,
        initialValue: executionModel ?? 'sonnet',
      });
      if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
      executionModel = selected as ClaudeModel;
    }

    // ── Validation model ──────────────────────────────────────────────────────
    let validationModel: ClaudeModel = config.models.validation;
    if (!opts.model && !opts.modelPlanning) {
      const selected = await p.select({
        message: 'Validation model:',
        options: [
          { value: 'haiku', label: 'haiku', hint: 'recommended — saves cost' },
          { value: 'sonnet', label: 'sonnet', hint: 'higher quality review' },
        ],
        initialValue: 'haiku',
      });
      if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
      validationModel = selected as ClaudeModel;
    }

    // Apply model config
    config.models = mergeModelConfig(config.models, {
      model: opts.model ? parseModelFlag(opts.model) : undefined,
      modelPlanning: planningModel,
      modelExecution: executionModel,
      modelValidation: validationModel,
    });

    // ── Engine config ─────────────────────────────────────────────────────────
    if (opts.engine) {
      if (opts.engine !== 'claude-code' && opts.engine !== 'pi-mono') {
        p.log.error(`Unknown engine "${opts.engine}" — use claude-code or pi-mono`);
        process.exit(1);
      }
      config.engine = opts.engine as 'claude-code' | 'pi-mono';
    }
    if (opts.piProvider) config.piMono = { ...config.piMono, provider: opts.piProvider };
    if (opts.piModel) config.piMono = { ...config.piMono, model: opts.piModel };
    if (opts.piBaseUrl) config.piMono = { ...config.piMono, baseUrl: opts.piBaseUrl };

    // ── Setup ─────────────────────────────────────────────────────────────────
    await ensureGitignore(cwd);

    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    let claudeMdContent: string | undefined;
    if (await fileExists(claudeMdPath)) {
      try {
        claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
        p.log.info('CLAUDE.md found — included as planning context');
      } catch { /* ignore */ }
    }

    // ── Planning ──────────────────────────────────────────────────────────────
    const PLANNING_TIMEOUT_MS = 15 * 60 * 1000;
    const planningAbort = new AbortController();
    const planningStart = Date.now();

    const spinner = p.spinner();
    spinner.start(`Planning with ${planningModel?.split('-')[1] ?? planningModel}…`);

    // Tick elapsed time every 5s
    const tickInterval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - planningStart) / 1000);
      spinner.message(`Planning with ${planningModel?.split('-')[1] ?? planningModel}…  ${elapsedSec}s`);
    }, 5000);
    const planningTimeout = setTimeout(() => planningAbort.abort(), PLANNING_TIMEOUT_MS);

    let plan: Plan;
    try {
      const onOutput = opts.verbose
        ? (() => {
            const fmt = createStreamFormatter((s) => process.stdout.write(s));
            return (text: string) => fmt(text);
          })()
        : undefined;

      plan = await createPlan(
        goal,
        config.models.planning,
        cwd,
        onOutput ?? (() => {}),
        specContent,
        claudeMdContent,
        planningAbort.signal,
      );
    } catch (err) {
      clearInterval(tickInterval);
      clearTimeout(planningTimeout);
      spinner.stop('Planning failed');
      p.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    clearInterval(tickInterval);
    clearTimeout(planningTimeout);

    if (wrapUpPrompt) {
      plan.wrapUpPrompt = wrapUpPrompt;
    }

    const elapsed = Math.round((Date.now() - planningStart) / 1000);
    spinner.stop(`Plan ready  ·  ${plan.tasks.length} tasks  ·  ${elapsed}s`);

    // ── Display plan ──────────────────────────────────────────────────────────
    p.note(formatPlanNote(plan), `📋 ${plan.tasks.length} tasks`);

    // ── Approval ──────────────────────────────────────────────────────────────
    if (opts.review) {
      let approved = false;
      while (!approved) {
        const action = await p.select({
          message: 'What would you like to do?',
          options: [
            { value: 'approve', label: '✅  Approve & queue', hint: 'run `cloudy run` to execute' },
            { value: 'revise', label: '✏️   Revise the plan', hint: 'describe what to change' },
            { value: 'cancel', label: '✖   Cancel' },
          ],
        });
        if (p.isCancel(action) || action === 'cancel') {
          p.cancel('Cancelled.');
          process.exit(0);
        }
        if (action === 'approve') {
          approved = true;
        } else {
          const feedback = await p.text({
            message: 'Describe what to change:',
            placeholder: 'e.g. Split task-3 into two smaller tasks',
            validate: (v) => (v ?? '').trim() ? undefined : 'Please describe the change',
          });
          if (p.isCancel(feedback)) { p.cancel('Cancelled.'); process.exit(0); }

          const reviseSpinner = p.spinner();
          reviseSpinner.start('Revising plan…');
          try {
            plan = await createPlan(
              `${goal}\n\nUser feedback on previous plan:\n${(feedback as string).trim()}`,
              config.models.planning,
              cwd,
              () => {},
              specContent,
              claudeMdContent,
            );
            reviseSpinner.stop(`Revised  ·  ${plan.tasks.length} tasks`);
            p.note(formatPlanNote(plan), `📋 ${plan.tasks.length} tasks`);
          } catch (err) {
            reviseSpinner.stop('Revision failed');
            p.log.error(err instanceof Error ? err.message : String(err));
          }
        }
      }
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    const readmePath = path.join(cwd, 'README.md');
    if (!(await fileExists(readmePath))) {
      const readmeContent = `# ${projectName}\n\n${goal}\n\n## Tasks\n\n${plan.tasks.map((t, i) => `${i + 1}. **${t.title}** — ${t.description.split('\n')[0]}`).join('\n')}\n\n---\n*Managed by cloudy*\n`;
      await fs.writeFile(readmePath, readmeContent, 'utf-8');
    }

    const state = await loadOrCreateState(cwd, config);
    updatePlan(state, plan);
    await saveState(cwd, state);
    await saveConfig(cwd, config);

    await log.info(`Plan saved: ${plan.tasks.length} tasks`);

    // ── Run now? ──────────────────────────────────────────────────────────────
    const runNow = await p.confirm({
      message: `Run ${plan.tasks.length} tasks now?`,
      initialValue: true,
    });

    if (p.isCancel(runNow) || !runNow) {
      p.outro(`${c(green + bold, '✅  ready!')}  ${plan.tasks.length} tasks queued  ·  run ${c(bold, 'cloudy run')} to execute`);
      return;
    }

    const withDashboard = await p.confirm({
      message: 'Launch web dashboard?',
      initialValue: true,
    });
    if (p.isCancel(withDashboard)) { p.cancel('Cancelled.'); process.exit(0); }

    p.outro(`${c(cyan + bold, '🚀  launching...')}  ${plan.tasks.length} tasks  ·  ${withDashboard ? 'dashboard on' : 'no dashboard'}`);

    // Spawn `cloudy run` inheriting this terminal (TUI + dashboard work normally).
    // Pass model flags so `run` skips its interactive prompts (avoids double dashboard ask).
    const { execa } = await import('execa');
    const runArgs = [
      'run',
      '--model-execution', config.models?.execution ?? 'sonnet',
      '--model-validation', config.models?.validation ?? 'haiku',
    ];
    if (!withDashboard) runArgs.push('--no-dashboard');
    // Release init lock before spawning run — run acquires its own slot
    releaseLock?.();
    try {
      await execa(process.argv[0], [process.argv[1], ...runArgs], { stdio: 'inherit' });
    } catch (err: any) {
      // SIGTERM = user pressed q in TUI — normal exit, not an error
      if (err?.signal !== 'SIGTERM') throw err;
    }
  });
