import { Command } from 'commander';
// Commands: plan, run, tasks, status, history, pipeline, preview, check, watch, logs, rollback, reset, config, setup, dashboard, daemon
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
      'AI orchestration tool - decompose goals, route phases across local CLIs or APIs, and validate with deterministic + AI checks',
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
