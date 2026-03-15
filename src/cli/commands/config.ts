import { Command } from 'commander';
import { loadConfig, saveConfig } from '../../config/config.js';
import { isValidModel } from '../../config/model-config.js';
import type { ClaudeModel } from '../../core/types.js';

export const configCommand = new Command('config')
  .description('View or update project configuration')
  .option('--json', 'Output as JSON')
  .option('--set <key=value>', 'Set a config value (e.g., models.execution=opus)')
  .action(async (opts: { json?: boolean; set?: string }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);

    if (opts.set) {
      const [key, value] = opts.set.split('=');
      if (!key || !value) {
        console.error('Invalid format. Use --set key=value');
        process.exit(1);
      }

      const parts = key.split('.');
      if (parts[0] === 'models' && parts[1]) {
        const phase = parts[1] as keyof typeof config.models;
        if (phase in config.models) {
          if (!isValidModel(value)) {
            console.error(`Invalid model "${value}". Use opus, sonnet, or haiku.`);
            process.exit(1);
          }
          config.models[phase] = value as ClaudeModel;
        } else {
          console.error(`Unknown model phase "${phase}".`);
          process.exit(1);
        }
      } else if (parts[0] === 'validation' && parts[1]) {
        if (parts[1] === 'commands') {
          // Append a command: --set validation.commands=npm test
          if (!config.validation.commands.includes(value)) {
            config.validation.commands.push(value);
          }
        } else {
          const strategy = parts[1] as keyof typeof config.validation;
          if (strategy in config.validation && typeof config.validation[strategy as keyof typeof config.validation] === 'boolean') {
            (config.validation as unknown as Record<string, unknown>)[parts[1]] = value === 'true';
          } else {
            console.error(`Unknown validation strategy "${parts[1]}".`);
            process.exit(1);
          }
        }
      } else if (key === 'contextBudgetTokens') {
        config.contextBudgetTokens = parseInt(value, 10);
      } else if (key === 'engine') {
        config.engine = value as typeof config.engine;
      } else if (key === 'provider') {
        config.provider = value;
      } else if (key === 'executionModelId') {
        config.executionModelId = value;
      } else if (key === 'executionEffort') {
        config.executionEffort = value as typeof config.executionEffort;
      } else if (parts[0] === 'planningRuntime' && parts[1]) {
        (config.planningRuntime ??= {});
        (config.planningRuntime as Record<string, string | undefined>)[parts[1]] = value;
      } else if (parts[0] === 'validationRuntime' && parts[1]) {
        (config.validationRuntime ??= {});
        (config.validationRuntime as Record<string, string | undefined>)[parts[1]] = value;
      } else if (parts[0] === 'reviewRuntime' && parts[1]) {
        (config.reviewRuntime ??= {});
        (config.reviewRuntime as Record<string, string | undefined>)[parts[1]] = value;
      } else if (parts[0] === 'keel' && parts[1]) {
        config.keel ??= { slug: '' };
        if (parts[1] === 'port') {
          config.keel.port = parseInt(value, 10);
        } else if (parts[1] === 'slug') {
          config.keel.slug = value;
        } else if (parts[1] === 'taskId') {
          config.keel.taskId = value;
        } else {
          console.error(`Unknown keel key "${parts[1]}".`);
          process.exit(1);
        }
      } else if (key === 'maxCostPerTaskUsd') {
        config.maxCostPerTaskUsd = parseFloat(value);
      } else if (key === 'worktrees') {
        config.worktrees = value === 'true';
      } else if (parts[0] === 'notifications' && parts[1]) {
        const notifKey = parts[1] as keyof typeof config.notifications;
        if (notifKey in config.notifications) {
          config.notifications[notifKey] = value === 'true';
        } else {
          console.error(`Unknown notifications key "${parts[1]}".`);
          process.exit(1);
        }
      } else if (key === 'maxRetries') {
        config.maxRetries = parseInt(value, 10);
      } else if (key === 'parallel') {
        config.parallel = value === 'true';
      } else if (key === 'maxParallel') {
        config.maxParallel = parseInt(value, 10);
      } else {
        console.error(`Unknown config key "${key}".`);
        process.exit(1);
      }

      await saveConfig(cwd, config);
      console.log(`Set ${key} = ${value}`);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log('\n=== Configuration ===');
    console.log('\nModels:');
    console.log(`  planning:   ${config.models.planning}`);
    console.log(`  execution:  ${config.models.execution}`);
    console.log(`  validation: ${config.models.validation}`);
    console.log('\nValidation:');
    console.log(`  typecheck: ${config.validation.typecheck}`);
    console.log(`  lint:      ${config.validation.lint}`);
    console.log(`  build:     ${config.validation.build}`);
    console.log(`  test:      ${config.validation.test}`);
    console.log(`  aiReview:  ${config.validation.aiReview}`);
    console.log('\nExecution:');
    console.log(`  engine:              ${config.engine}`);
    console.log(`  provider:            ${config.provider ?? '(auto)'}`);
    console.log(`  executionModelId:    ${config.executionModelId ?? '(engine default)'}`);
    console.log(`  executionEffort:     ${config.executionEffort ?? '(engine default)'}`);
    console.log(`  planningRuntime:     ${JSON.stringify(config.planningRuntime ?? {})}`);
    console.log(`  validationRuntime:   ${JSON.stringify(config.validationRuntime ?? {})}`);
    console.log(`  reviewRuntime:       ${JSON.stringify(config.reviewRuntime ?? {})}`);
    console.log(`  keel:                ${config.keel ? JSON.stringify(config.keel) : '(disabled)'}`);
    console.log(`  maxRetries:          ${config.maxRetries}`);
    console.log(`  parallel:            ${config.parallel}`);
    console.log(`  maxParallel:         ${config.maxParallel}`);
    console.log(`  worktrees:           ${config.worktrees}`);
    console.log(`  contextBudgetTokens: ${config.contextBudgetTokens}`);
    console.log(`  maxCostPerTaskUsd:   ${config.maxCostPerTaskUsd === 0 ? 'unlimited' : `$${config.maxCostPerTaskUsd}`}`);
    if (config.validation.commands.length > 0) {
      console.log(`\nQuality Gate Commands:`);
      for (const cmd of config.validation.commands) {
        console.log(`  - ${cmd}`);
      }
    }
  });
