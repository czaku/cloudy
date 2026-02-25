import { Command } from 'commander';
// Command vocabulary: scope, build, chain, tasks, preview, check, watch
// Old names aliased for back-compat: init, run, pipeline, plan, dry-run, validate, loop
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { planCommand } from './commands/plan.js';
import { dryRunCommand } from './commands/dry-run.js';
import { rollbackCommand } from './commands/rollback.js';
import { configCommand } from './commands/config.js';
import { resetCommand } from './commands/reset.js';
import { validateCommand } from './commands/validate.js';
import { loopCommand } from './commands/loop.js';
import { logsCommand } from './commands/logs.js';
import { pipelineCommand } from './commands/pipeline.js';
import { runsCommand } from './commands/runs.js';
import { setupCommand } from './commands/setup.js';
import { dashboardCommand } from './commands/dashboard.js';
import { daemonCommand } from './commands/daemon.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('cloudy')
    .description(
      'Claude Code orchestration tool - decompose goals, execute with model selection, validate with deterministic + AI checks',
    )
    .version('0.1.0');

  program.addCommand(initCommand);
  program.addCommand(runCommand);
  program.addCommand(statusCommand);
  program.addCommand(planCommand);
  program.addCommand(dryRunCommand);
  program.addCommand(rollbackCommand);
  program.addCommand(configCommand);
  program.addCommand(resetCommand);
  program.addCommand(validateCommand);
  program.addCommand(loopCommand);
  program.addCommand(logsCommand);
  program.addCommand(pipelineCommand);
  program.addCommand(runsCommand);
  program.addCommand(setupCommand);
  program.addCommand(dashboardCommand);
  program.addCommand(daemonCommand);

  return program;
}
