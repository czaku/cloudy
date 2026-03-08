import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { c, bold, dim, red, green, cyan, yellow } from '../../utils/colors.js';
import { initLogger } from '../../utils/logger.js';
import { CLAWDASH_DIR, RUNS_DIR } from '../../config/defaults.js';

export const pipelineCommand = new Command('pipeline')
  .description('Run multiple specs sequentially as a pipeline')
  .option('--spec <file>', 'Spec file (repeatable, in order)', (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option('--execution-model <model>', 'Execution model for all phases (haiku/sonnet/opus)')
  .option('--task-review-model <model>', 'Per-task validation model')
  .option('--run-review-model <model>', 'Post-phase holistic review model')
  .option('--planning-model <model>', 'Planning model (default: sonnet)')
  .option('--no-auto-fix', 'Disable automatic fix-task generation from review notes')
  .option('--verbose', 'Pass --verbose to each run')
  .option('--heartbeat-interval <seconds>', 'Write status.json every N seconds during each phase', parseInt)
  .action(async (opts: {
    spec: string[];
    executionModel?: string;
    taskReviewModel?: string;
    runReviewModel?: string;
    planningModel?: string;
    autoFix?: boolean;
    verbose?: boolean;
    heartbeatInterval?: number;
  }) => {
    const cwd = process.cwd();
    await initLogger(cwd);

    if (opts.spec.length === 0) {
      console.error(c(red, '✖  --spec required (repeatable): cloudy pipeline --spec p1.md --spec p2.md'));
      process.exit(1);
    }

    const missing: string[] = [];
    if (!opts.executionModel) missing.push('--execution-model');
    if (!opts.taskReviewModel) missing.push('--task-review-model');
    if (!opts.runReviewModel) missing.push('--run-review-model');
    if (missing.length > 0) {
      console.error(c(red, `✖  pipeline requires: ${missing.join(', ')}`));
      process.exit(1);
    }

    const planningModel = opts.planningModel ?? 'sonnet';
    // opts.autoFix is true by default (commander inverts --no-auto-fix)
    const autoFix = opts.autoFix !== false;

    // Generate a stable pipeline ID for this run — used to group phases in `cloudy runs`
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toTimeString().slice(0, 5).replace(':', '');
    const pipelineId = `pipeline-${datePart}-${timePart}`;

    console.log(`\n${c(cyan + bold, '☁️  cloudy pipeline')}  ${c(bold, `${opts.spec.length} phases`)}  ${c(dim, pipelineId)}`);
    for (let i = 0; i < opts.spec.length; i++) {
      console.log(`    ${c(dim, `phase ${i + 1}:`)}  ${opts.spec[i]}`);
    }
    console.log('');

    const { execa } = await import('execa');
    const cloudyBin = process.argv[1]; // path to cloudy.js

    for (let i = 0; i < opts.spec.length; i++) {
      const specPath = opts.spec[i];
      const phaseNum = i + 1;
      const phaseSlug = path.basename(specPath, path.extname(specPath))
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      const runName = `${pipelineId}-p${phaseNum}-${phaseSlug}`;
      const runDir = path.join(cwd, CLAWDASH_DIR, RUNS_DIR, runName);

      console.log(`\n${c(cyan, `━━━ Phase ${phaseNum}/${opts.spec.length}:`)}  ${c(bold, specPath)}  ${c(dim, runName)}`);

      // cloudy init --spec <file> --no-review --planning-model <model> --run-name <name>
      console.log(c(dim, `    initialising plan…`));
      try {
        await execa(process.argv[0], [
          cloudyBin,
          'init',
          '--spec', path.resolve(cwd, specPath),
          '--no-review',
          '--planning-model', planningModel,
          '--run-name', runName,
        ], { stdio: 'inherit', cwd });
      } catch (err: any) {
        console.error(c(red, `✖  init failed for phase ${phaseNum}: ${err?.message ?? err}`));
        process.exit(1);
      }

      // Phase size check
      try {
        const stateData = JSON.parse(await fs.readFile(path.join(runDir, 'state.json'), 'utf-8'));
        const taskCount = stateData.plan?.tasks?.length ?? 0;
        if (taskCount > 10) {
          console.log(c(yellow, `  ⚠️  Large phase: ${taskCount} tasks planned. Consider splitting into 2 phases of ~${Math.ceil(taskCount/2)} tasks for better reliability.`));
        } else if (taskCount > 6) {
          console.log(c(dim, `  ℹ️  ${taskCount} tasks in this phase (recommended max: 6 for best quality)`));
        }
      } catch { /* non-fatal */ }

      // Inject pipelineContext into state.json
      try {
        const statePath = path.join(runDir, 'state.json');
        const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
        if (state.plan) {
          state.plan.pipelineContext = {
            pipelineId,
            phaseIndex: phaseNum,
            totalPhases: opts.spec.length,
            phaseLabel: phaseSlug,
          };
          await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
        }
      } catch { /* non-fatal */ }

      // Build run args (reused for fix-task re-runs)
      const runArgs = [
        cloudyBin,
        'run',
        '--non-interactive',
        '--execution-model', opts.executionModel!,
        '--task-review-model', opts.taskReviewModel!,
        '--run-review-model', opts.runReviewModel!,
      ];
      if (opts.verbose) runArgs.push('--verbose');
      if (opts.heartbeatInterval) runArgs.push('--heartbeat-interval', String(opts.heartbeatInterval));

      // Run the phase
      console.log(c(dim, `    running phase ${phaseNum}…`));
      try {
        await execa(process.argv[0], runArgs, { stdio: 'inherit', cwd });
      } catch (err: any) {
        if (err?.signal !== 'SIGTERM') {
          console.error(c(red, `✖  run failed for phase ${phaseNum}: ${err?.message ?? err}`));
          process.exit(1);
        }
      }

      // Check review result from run dir
      const reviewPath = path.join(runDir, 'review.json');
      let review: any = null;
      try {
        review = JSON.parse(await fs.readFile(reviewPath, 'utf-8'));
      } catch { /* no review file — non-fatal */ }

      if (review?.verdict === 'FAIL') {
        console.error(c(red, `✖  Phase ${phaseNum} review: FAIL — halting pipeline`));
        console.error(c(dim, `    ${review.summary}`));
        process.exit(1);
      }

      const score = review?.specCoverageScore != null ? ` (coverage: ${review.specCoverageScore}%)` : '';
      console.log(c(green, `✅  Phase ${phaseNum} review: ${review?.verdict ?? 'unknown'}${score}`));

      // ── Auto-fix: inject repair tasks for major/critical issues ──────────────
      if (autoFix && review) {
        const actionable: Array<{ severity: string; description: string; location?: string }> =
          (review.issues ?? []).filter(
            (iss: any) => iss.severity === 'major' || iss.severity === 'critical',
          );

        if (actionable.length > 0) {
          console.log(
            c(yellow, `    ⚠  ${actionable.length} major/critical issue(s) — generating fix tasks…`),
          );

          let fixTasks: any[] = [];
          try {
            const statePath = path.join(runDir, 'state.json');
            const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));

            const { generateFixTasks } = await import('../../reviewer.js');
            fixTasks = await generateFixTasks(
              review,
              state.plan,
              cwd,
              'haiku',
            );

            if (fixTasks.length > 0) {
              // Inject fix tasks into state.json
              state.plan.tasks.push(...fixTasks);
              state.plan.updatedAt = new Date().toISOString();
              await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');

              console.log(
                c(dim, `    injected ${fixTasks.length} fix task(s): ${fixTasks.map((t: any) => t.id).join(', ')}`),
              );

              // Re-run — completed tasks are skipped, only new pending fix tasks execute
              console.log(c(dim, `    re-running with fix tasks…`));
              try {
                await execa(process.argv[0], runArgs, { stdio: 'inherit', cwd });
              } catch (err: any) {
                if (err?.signal !== 'SIGTERM') {
                  // Non-fatal: log but continue pipeline — fixes are best-effort
                  console.error(c(yellow, `    ⚠  fix run failed (non-fatal): ${err?.message ?? err}`));
                }
              }

              // Read updated review after fix run
              try {
                const review2 = JSON.parse(await fs.readFile(reviewPath, 'utf-8'));
                if (review2.verdict === 'FAIL') {
                  console.error(c(red, `✖  Phase ${phaseNum} review after fixes: FAIL — halting pipeline`));
                  console.error(c(dim, `    ${review2.summary}`));
                  process.exit(1);
                }
                const score2 = review2.specCoverageScore != null
                  ? ` (coverage: ${review2.specCoverageScore}%)`
                  : '';
                console.log(c(green, `✅  Phase ${phaseNum} after fixes: ${review2.verdict}${score2}`));
              } catch { /* non-fatal */ }
            } else {
              console.log(c(dim, `    no fix tasks generated — skipping fix run`));
            }
          } catch (err: any) {
            console.log(c(dim, `    fix task generation failed (non-fatal): ${err?.message ?? err}`));
          }
        }
      }
    }

    console.log(`\n${c(green + bold, '✅  Pipeline complete!')}  ${opts.spec.length} phases ran successfully.\n`);
  });
