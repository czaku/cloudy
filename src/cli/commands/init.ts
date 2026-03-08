import fs from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { createPlan } from '../../planner/planner.js';
import { loadConfig, saveConfig } from '../../config/config.js';
import {
  mergeModelConfig,
  parseModelFlag,
} from '../../config/model-config.js';
import { loadOrCreateState, saveState, updatePlan, generateRunName, createRunDir } from '../../core/state.js';
import { initLogger, log } from '../../utils/logger.js';
import { fileExists, ensureDir } from '../../utils/fs.js';
import { c, bold, dim, red, green, yellow, cyan } from '../../utils/colors.js';
import { acquireLock } from '../../utils/lock.js';
import type { ClaudeModel, DecisionLogEntry } from '../../core/types.js';
import { CLAWDASH_DIR } from '../../config/defaults.js';
import { createStreamFormatter } from '../../utils/stream-formatter.js';
import type { Plan } from '../../core/types.js';

/**
 * Prompt for input with a countdown timer. Returns the trimmed answer or null on timeout/empty.
 * onTick is called every second with remaining seconds so the caller can render a countdown.
 */
async function promptWithTimeout(
  prompt: string,
  timeoutMs: number,
  onTick?: (remainingSec: number) => void,
): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let resolved = false;

    const totalSec = Math.round(timeoutMs / 1000);
    let remaining = totalSec;
    onTick?.(remaining);

    const tick = setInterval(() => {
      remaining--;
      onTick?.(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 1000);

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(tick);
        rl.close();
        resolve(null);
      }
    }, timeoutMs);

    rl.question(prompt, (answer) => {
      if (!resolved) {
        resolved = true;
        clearInterval(tick);
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim() || null);
      }
    });

    rl.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearInterval(tick);
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

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
  .option('--planning-model <model>', 'Model for planning phase')
  .option('--spec <file>', 'Spec/PRD file (repeatable: --spec A --spec B)', (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option('--no-review', 'Auto-approve the generated plan without interactive review')
  .option('--verbose', 'Show live Claude output during planning')
  .option('--run-name <name>', 'Explicit run directory name (used by pipeline command)')
  .option('--questions-auto-answering-model <model>', 'Model used to auto-answer planning questions on timeout (default: planning model)')
  .option('--questions-timeout <seconds>', 'Seconds to wait for human answer before auto-assuming (default: 60)', parseInt)
  .action(async (goalArg: string | undefined, opts: {
    model?: string;
    planningModel?: string;
    spec: string[];
    review: boolean;
    verbose?: boolean;
    runName?: string;
    questionsAutoAnsweringModel?: string;
    questionsTimeout?: number;
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

    // ── Spec file(s) ──────────────────────────────────────────────────────────
    let specContent: string | undefined;
    let specPaths: string[] = opts.spec;

    if (specPaths.length === 0 && !goalArg) {
      const input = await p.text({
        message: 'Spec file path (or leave blank to type a goal):',
        placeholder: '/tmp/my-spec.md',
      });
      if (p.isCancel(input)) { p.cancel('Cancelled.'); process.exit(0); }
      const entered = (input as string).trim();
      if (entered) specPaths = [entered];
    }

    let wrapUpPrompt: string | undefined;

    if (specPaths.length > 0) {
      const parts: string[] = [];
      const multipleSpecs = specPaths.length > 1;

      if (multipleSpecs) {
        parts.push(`<!-- Combined spec from ${specPaths.length} files: ${specPaths.map(p => path.basename(p)).join(', ')} -->\n`);
      }

      for (const specPath of specPaths) {
        try {
          let content = await fs.readFile(specPath, 'utf-8');
          // Extract ## Wrap-up section
          const wrapUpMatch = content.match(/^##\s+Wrap-?up\b.*\n([\s\S]*?)(?=\n##\s|\s*$)/im);
          if (wrapUpMatch) {
            wrapUpPrompt = (wrapUpPrompt ? wrapUpPrompt + '\n\n' : '') + wrapUpMatch[1].trim();
            content = content.replace(/^##\s+Wrap-?up\b[\s\S]*$/im, '').trim();
          }
          if (multipleSpecs) {
            parts.push(`<!-- spec: ${path.basename(specPath)} -->\n${content}`);
          } else {
            parts.push(content);
          }
          p.log.info(`Spec loaded: ${specPath}  (${Math.round(content.length / 1024)}KB)`);
        } catch (err) {
          p.log.error(`Cannot read spec file "${specPath}": ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      }

      if (wrapUpPrompt) {
        p.log.info(`Wrap-up section extracted (will run after all tasks complete)`);
      }

      specContent = parts.join('\n\n---\n\n');

      // Guard: reject if combined spec is too large for the planner context
      const MAX_SPEC_BYTES = 150_000; // ~37K tokens — safe planning budget
      if (specContent.length > MAX_SPEC_BYTES) {
        p.log.error(
          `Combined spec is ${Math.round(specContent.length / 1024)}KB — exceeds the ${Math.round(MAX_SPEC_BYTES / 1024)}KB limit.\n` +
          `  Split into separate cloudy init runs, or trim the specs.`
        );
        process.exit(1);
      }

      // spec.md is saved to run dir below (after run dir is created)
    }

    // ── Goal ──────────────────────────────────────────────────────────────────
    let goal = goalArg;
    if (!goal) {
      if (specContent) {
        // Skip HTML comments and blank lines to find the real title
        const firstLine = specContent.split('\n').find((l) => {
          const t = l.trim();
          return t.length > 0 && !t.startsWith('<!--');
        });
        goal = firstLine?.replace(/^#+\s*/, '').trim() ?? 'Implement the specification';
        // For multiple specs, combine their titles
        if (specPaths.length > 1) {
          const titles = specPaths.map(p => path.basename(p, '.md').replace(/^aiyayai-/, ''));
          goal = titles.join(' + ');
        }
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
      : opts.planningModel
        ? parseModelFlag(opts.planningModel)
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

    // Apply planning model config only — execution/validation/review are asked at run time
    config.models = mergeModelConfig(config.models, {
      model: opts.model ? parseModelFlag(opts.model) : undefined,
      planningModel: planningModel,
    });

    // ── Run directory ─────────────────────────────────────────────────────────
    // Create a named run dir after we know the goal (or use --run-name if provided by pipeline)
    const runName = opts.runName ?? generateRunName(goal!);
    const runDir = await createRunDir(cwd, runName);

    // Re-init logger now that run dir exists — logs go into run dir
    await initLogger(cwd);

    // Save spec to run dir for holistic reviewer
    if (specContent) {
      try {
        await fs.writeFile(path.join(runDir, 'spec.md'), specContent, 'utf-8');
      } catch {
        // Non-fatal — reviewer falls back to task descriptions
      }
    }

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

    // Inject pipeline context from previous phases (if running as part of a pipeline)
    const pipelineContextPath = path.join(cwd, '.cloudy/pipeline-context.md');
    try {
      const pipelineContext = await fs.readFile(pipelineContextPath, 'utf-8');
      if (pipelineContext.trim()) {
        claudeMdContent = claudeMdContent
          ? `${claudeMdContent}\n\n---\n\n${pipelineContext}`
          : pipelineContext;
        p.log.info('Pipeline context found — injected into planning');
      }
    } catch { /* no pipeline context — normal single-phase run */ }

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

    // ── Planning Q&A ──────────────────────────────────────────────────────────
    const planQuestions: string[] = (plan as any)._questions ?? [];
    delete (plan as any)._questions;

    const autoAnswerModel: ClaudeModel = opts.questionsAutoAnsweringModel
      ? (parseModelFlag(opts.questionsAutoAnsweringModel) as ClaudeModel)
      : (planningModel as ClaudeModel);
    const questionTimeoutMs = (opts.questionsTimeout ?? 60) * 1000;
    const isInteractive = opts.review && process.stdout.isTTY && process.stdin.isTTY;

    if (planQuestions.length > 0) {
      const decisionLog: DecisionLogEntry[] = [];

      p.log.info(`💭  ${planQuestions.length} planning question(s) — answer to refine the plan:`);

      for (let qi = 0; qi < planQuestions.length; qi++) {
        const question = planQuestions[qi];
        const questionId = `q${qi + 1}`;
        let answer: string | null = null;

        if (isInteractive) {
          // Show question prominently
          console.log(`\n  ${c(cyan + bold, `Question ${qi + 1}/${planQuestions.length}:`)}  ${question}`);
          console.log(`  ${c(dim, `(${opts.questionsTimeout ?? 60}s to answer — press Enter to skip and let the AI assume)`)}`);

          answer = await promptWithTimeout(
            `  ${c(bold, '→')} `,
            questionTimeoutMs,
            (remaining) => {
              process.stdout.write(`\r  ${c(dim, `⏱  ${remaining}s remaining…`)}  `);
            },
          );

          if (answer !== null) {
            process.stdout.write('\r' + ' '.repeat(40) + '\r');
            console.log(`  ${c(green, '✓')} ${c(dim, 'Your answer recorded.')}`);
          } else {
            process.stdout.write('\r' + ' '.repeat(40) + '\r');
            console.log(`  ${c(yellow, '⏱  timeout — asking the AI to assume…')}`);
          }
        }

        if (answer === null) {
          // AI auto-assumption using the configured model
          const assumptionPrompt = `You are a technical planner resolving an ambiguous design question so that implementation can proceed.
${specContent ? `\n## Spec Context (first 3000 chars)\n${specContent.slice(0, 3000)}\n` : ''}${claudeMdContent ? `\n## Project Context (CLAUDE.md)\n${claudeMdContent.slice(0, 2000)}\n` : ''}
## Question
${question}

## Your Task
Make a reasonable technical assumption to resolve this question. Base your assumption on:
- Evidence in the spec or project context
- Common industry patterns and conservative defaults
- Existing patterns visible in the codebase context

Respond with ONLY valid JSON:
{"assumption": "One concise sentence stating the decision", "reasoning": "One sentence explaining why"}`;

          let assumptionResult = { assumption: `Proceeding with default approach for: ${question}`, reasoning: 'Spec context insufficient for a specific assumption; defaulting to common patterns.' };
          try {
            const { runClaude } = await import('../../executor/claude-runner.js');
            const result = await runClaude({ prompt: assumptionPrompt, model: autoAnswerModel, cwd });
            if (result.success) {
              const jsonMatch = result.output.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.assumption) assumptionResult = parsed;
              }
            }
          } catch { /* non-fatal — use default */ }

          console.log(`  ${c(cyan, `🤖 AI assumes:`)} ${assumptionResult.assumption}`);
          if (assumptionResult.reasoning) {
            console.log(`  ${c(dim, assumptionResult.reasoning)}`);
          }

          decisionLog.push({
            questionId,
            question,
            answeredBy: 'agent',
            answer: assumptionResult.assumption,
            reasoning: assumptionResult.reasoning,
            timestamp: new Date().toISOString(),
          });
        } else {
          decisionLog.push({
            questionId,
            question,
            answeredBy: 'human',
            answer,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Attach decision log to plan for executor injection
      plan.decisionLog = decisionLog;
      console.log('');
    }

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
    state.runName = runName;
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

    p.outro(`${c(cyan + bold, '🚀  launching...')}  ${plan.tasks.length} tasks`);

    // Spawn `cloudy run` — it will ask for execution/validation/review models interactively
    const { execa } = await import('execa');
    const runArgs = ['run'];
    // Release init lock before spawning run — run acquires its own slot
    releaseLock?.();
    try {
      await execa(process.argv[0], [process.argv[1], ...runArgs], { stdio: 'inherit' });
    } catch (err: any) {
      // SIGTERM = user pressed q in TUI — normal exit, not an error
      if (err?.signal !== 'SIGTERM') throw err;
    }
  });
