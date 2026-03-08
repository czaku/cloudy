import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { c, bold, dim, red, green, cyan } from '../../utils/colors.js';
import { initLogger } from '../../utils/logger.js';

export const pipelineCommand = new Command('pipeline')
  .description('Run multiple specs sequentially as a pipeline')
  .option('--spec <file>', 'Spec file (repeatable, in order)', (v: string, prev: string[]) => [...prev, v], [] as string[])
  .option('--execution-model <model>', 'Execution model for all phases (haiku/sonnet/opus)')
  .option('--task-review-model <model>', 'Per-task validation model')
  .option('--run-review-model <model>', 'Post-phase holistic review model')
  .option('--planning-model <model>', 'Planning model (default: sonnet)')
  .option('--verbose', 'Pass --verbose to each run')
  .action(async (opts: {
    spec: string[];
    executionModel?: string;
    taskReviewModel?: string;
    runReviewModel?: string;
    planningModel?: string;
    verbose?: boolean;
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

    console.log(`\n${c(cyan + bold, '☁️  cloudy pipeline')}  ${c(bold, `${opts.spec.length} phases`)}`);
    for (let i = 0; i < opts.spec.length; i++) {
      console.log(`    ${c(dim, `phase ${i + 1}:`)}  ${opts.spec[i]}`);
    }
    console.log('');

    const { execa } = await import('execa');
    const cloudyBin = process.argv[1]; // path to cloudy.js

    for (let i = 0; i < opts.spec.length; i++) {
      const specPath = opts.spec[i];
      const phaseNum = i + 1;

      console.log(`\n${c(cyan, `━━━ Phase ${phaseNum}/${opts.spec.length}:`)}  ${c(bold, specPath)}`);

      // Archive previous .cloudy state
      const cloudyDir = path.join(cwd, '.cloudy');
      const archiveDir = path.join(cwd, `.cloudy-phases`);
      if (i > 0) {
        try {
          const phaseArchive = path.join(archiveDir, `phase${i}`);
          await fs.mkdir(phaseArchive, { recursive: true });
          // Copy key files
          for (const file of ['state.json', 'spec.md', 'LEARNINGS.md', 'review-latest.json']) {
            try {
              await fs.copyFile(path.join(cloudyDir, file), path.join(phaseArchive, file));
            } catch { /* file may not exist */ }
          }
          console.log(c(dim, `    archived phase ${i} state → .cloudy-phases/phase${i}/`));
        } catch { /* non-fatal */ }
      }

      // cloudy init --spec <file> --no-review --planning-model <model>
      console.log(c(dim, `    initialising plan…`));
      try {
        await execa(process.argv[0], [
          cloudyBin,
          'init',
          '--spec', path.resolve(cwd, specPath),
          '--no-review',
          '--planning-model', planningModel,
        ], { stdio: 'inherit', cwd });
      } catch (err: any) {
        console.error(c(red, `✖  init failed for phase ${phaseNum}: ${err?.message ?? err}`));
        process.exit(1);
      }

      // cloudy run --non-interactive --execution-model X --task-review-model Y --run-review-model Z
      const runArgs = [
        cloudyBin,
        'run',
        '--non-interactive',
        '--execution-model', opts.executionModel!,
        '--task-review-model', opts.taskReviewModel!,
        '--run-review-model', opts.runReviewModel!,
      ];
      if (opts.verbose) runArgs.push('--verbose');

      console.log(c(dim, `    running phase ${phaseNum}…`));
      try {
        await execa(process.argv[0], runArgs, { stdio: 'inherit', cwd });
      } catch (err: any) {
        if (err?.signal !== 'SIGTERM') {
          console.error(c(red, `✖  run failed for phase ${phaseNum}: ${err?.message ?? err}`));
          process.exit(1);
        }
      }

      // Check review result
      try {
        const reviewPath = path.join(cloudyDir, 'review-latest.json');
        const reviewRaw = await fs.readFile(reviewPath, 'utf-8');
        const review = JSON.parse(reviewRaw);
        if (review.verdict === 'FAIL') {
          console.error(c(red, `✖  Phase ${phaseNum} review: FAIL — halting pipeline`));
          console.error(c(dim, `    ${review.summary}`));
          process.exit(1);
        }
        const score = review.specCoverageScore != null ? ` (coverage: ${review.specCoverageScore}%)` : '';
        console.log(c(green, `✅  Phase ${phaseNum} review: ${review.verdict}${score}`));
      } catch { /* review file may not exist — non-fatal */ }
    }

    console.log(`\n${c(green + bold, '✅  Pipeline complete!')}  ${opts.spec.length} phases ran successfully.\n`);
  });
