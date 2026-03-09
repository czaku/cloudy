import readline from 'node:readline';
import { Command } from 'commander';
import { loadState, saveState, updatePlan } from '../../core/state.js';
import { loadConfig } from '../../config/config.js';
import { parseModelFlag } from '../../config/model-config.js';
import { editPlan } from '../../planner/planner.js';
import { renderAsciiGraph, renderMermaidGraph } from '../../planner/dependency-graph.js';
import { initLogger } from '../../utils/logger.js';
import { c, bold, dim, red, green, yellow, cyan } from '../../utils/colors.js';
import type { Task } from '../../core/types.js';

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function printPlanForEdit(tasks: Task[]): void {
  const n = tasks.length;
  console.log(`\n  ${c(bold, '📋 Plan')}  ${c(dim, `·  ${n} task${n !== 1 ? 's' : ''}`)}\n`);
  for (const task of tasks) {
    const deps = task.dependencies.length > 0
      ? `  ${c(dim, `↳ ${task.dependencies.join(', ')}`)}`
      : '';
    const desc = task.description.length > 72
      ? task.description.slice(0, 69) + '...'
      : task.description;
    const statusLabel = task.status !== 'pending' ? c(dim, ` [${task.status}]`) : '';
    console.log(`  ${c(yellow, task.id)}${statusLabel}  ${c(bold, task.title)}${deps}`);
    console.log(`       ${c(dim, desc)}`);
  }
}

export const planCommand = new Command('tasks')
  .description('View the current plan in detail')
  .option('--json', 'Output as JSON')
  .option('--graph', 'Show ASCII dependency graph')
  .option('--mermaid', 'Show Mermaid diagram (copy into docs/GitHub)')
  .action(async (opts: { json?: boolean; graph?: boolean; mermaid?: boolean }) => {
    const cwd = process.cwd();
    const state = await loadState(cwd);

    if (!state?.plan) {
      console.log('No plan found. Run "cloudy init <goal>" first.');
      return;
    }

    const plan = state.plan;

    if (opts.json) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    if (opts.graph) {
      console.log('\n' + renderAsciiGraph(plan.tasks) + '\n');
      return;
    }

    if (opts.mermaid) {
      console.log('\n```mermaid\n' + renderMermaidGraph(plan.tasks) + '\n```\n');
      return;
    }

    console.log(`\nGoal: ${plan.goal}`);
    console.log(`Created: ${plan.createdAt}`);
    console.log(`Tasks: ${plan.tasks.length}\n`);

    for (const task of plan.tasks) {
      console.log(`━━━ [${task.id}] ${task.title} ━━━`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Description: ${task.description}`);

      if (task.dependencies.length > 0) {
        console.log(`  Dependencies: ${task.dependencies.join(', ')}`);
      }

      if (task.acceptanceCriteria.length > 0) {
        console.log('  Acceptance Criteria:');
        for (const criterion of task.acceptanceCriteria) {
          console.log(`    - ${criterion}`);
        }
      }

      console.log('');
    }
  });

planCommand
  .command('edit')
  .description('Add, remove, or modify pending tasks in the current plan')
  .option('--model <model>', 'Model to use for editing')
  .action(async (opts: { model?: string }) => {
    const cwd = process.cwd();
    await initLogger(cwd);

    const state = await loadState(cwd);
    if (!state?.plan) {
      console.log('No plan found. Run "cloudy init <goal>" first.');
      return;
    }

    const config = await loadConfig(cwd);
    if (opts.model) {
      config.models.planning = parseModelFlag(opts.model);
    }

    console.log(`\n${c(cyan + bold, '☁️  cloudy plan edit')}`);
    console.log(`  ${c(dim, 'Describe what to add, remove, or change in the pending tasks.')}`);
    console.log(`  ${c(dim, 'Completed and in-progress tasks will not be modified.')}\n`);

    printPlanForEdit(state.plan.tasks);

    const divider = c(dim, '─'.repeat(52));
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      let currentPlan = state.plan;
      let approved = false;

      while (!approved) {
        console.log(`\n${divider}`);
        console.log(`  ${c(green, 'approve')}  ${c(dim, '·')}  ${c(red, 'cancel')}  ${c(dim, '·  <describe what to change>')}`);
        console.log(divider);

        const input = await ask(rl, `\n${c(dim, '❯')} `);
        const trimmed = input.trim().toLowerCase();

        if (trimmed === 'approve') {
          approved = true;
        } else if (trimmed === 'cancel') {
          console.log(`\n${c(dim, '  cancelled — no changes saved')}`);
          return;
        } else if (trimmed) {
          console.log(`\n  ${c(cyan, '🔄 Updating plan...')}\n`);

          try {
            const previousIds = new Set(currentPlan.tasks.map((t) => t.id));
            const updatedPlan = await editPlan(
              currentPlan,
              input.trim(),
              config.models.planning,
              cwd,
              () => process.stdout.write(c(dim, '.')),
            );
            process.stdout.write('\n');

            // Compute diff markers
            const updatedIds = new Set(updatedPlan.tasks.map((t) => t.id));
            const removedIds = new Set(
              [...previousIds].filter(
                (id) => !updatedIds.has(id) && currentPlan.tasks.find((t) => t.id === id)?.status === 'pending',
              ),
            );

            console.log(`\n  ${c(bold, '📋 Updated Plan')}\n`);
            for (const task of updatedPlan.tasks) {
              const isNew = !previousIds.has(task.id);
              const prevTask = currentPlan.tasks.find((t) => t.id === task.id);
              const isModified = prevTask &&
                prevTask.status === 'pending' &&
                (prevTask.title !== task.title ||
                  prevTask.description !== task.description ||
                  JSON.stringify(prevTask.acceptanceCriteria) !== JSON.stringify(task.acceptanceCriteria));

              const marker = isNew ? c(green, '+') : isModified ? c(yellow, '~') : ' ';
              const deps = task.dependencies.length > 0
                ? `  ${c(dim, `↳ ${task.dependencies.join(', ')}`)}`
                : '';
              const desc = task.description.length > 72
                ? task.description.slice(0, 69) + '...'
                : task.description;
              const statusLabel = task.status !== 'pending' ? c(dim, ` [${task.status}]`) : '';
              console.log(`  ${marker} ${c(yellow, task.id)}${statusLabel}  ${c(bold, task.title)}${deps}`);
              console.log(`       ${c(dim, desc)}`);
            }

            for (const removedId of removedIds) {
              console.log(`  ${c(red, '-')} ${c(dim, removedId)}  ${c(dim, '(removed)')}`);
            }

            currentPlan = updatedPlan;
          } catch (err) {
            console.error(
              `\n${c(red, '❌')}  ${c(red + bold, 'edit failed:')}  ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      updatePlan(state, currentPlan);
      await saveState(cwd, state);

      const pendingCount = currentPlan.tasks.filter((t) => t.status === 'pending').length;
      console.log(`\n${c(green, '✅')}  ${c(green + bold, 'plan updated!')}  ${c(dim, `${pendingCount} pending task${pendingCount !== 1 ? 's' : ''}`)}`);
    } finally {
      rl.close();
    }
  });
