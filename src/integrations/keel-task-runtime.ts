import path from 'node:path';
import { isAbstractClaudeModel, parseModelFlag } from '../config/model-config.js';
import type { CloudyConfig, ClaudeModel, PhaseRuntimeConfig } from '../core/types.js';
import { readJson } from '../utils/fs.js';

export interface KeelTaskCloudyModels {
  planning?: ClaudeModel;
  execution?: ClaudeModel;
  taskReview?: ClaudeModel;
  runReview?: ClaudeModel;
  qualityReview?: ClaudeModel;
}

export interface KeelTaskCloudyConfig {
  models?: KeelTaskCloudyModels;
  execution?: PhaseRuntimeConfig;
  planning?: PhaseRuntimeConfig;
  validation?: PhaseRuntimeConfig;
  review?: PhaseRuntimeConfig;
}

interface RawKeelTaskCloudyModels {
  planning?: string;
  execution?: string;
  taskReview?: string;
  runReview?: string;
  qualityReview?: string;
}

interface RawKeelTaskCloudyConfig {
  models?: RawKeelTaskCloudyModels;
  execution?: PhaseRuntimeConfig;
  planning?: PhaseRuntimeConfig;
  validation?: PhaseRuntimeConfig;
  review?: PhaseRuntimeConfig;
}

interface KeelTaskFile {
  id?: string;
  cloudy?: RawKeelTaskCloudyConfig;
}

function normalizeModel(value: string | undefined, field: string): ClaudeModel | undefined {
  if (!value) return undefined;
  if (!isAbstractClaudeModel(value.toLowerCase())) {
    throw new Error(`Invalid keel cloudy model "${value}" for ${field}. Expected one of: opus, sonnet, haiku.`);
  }
  return parseModelFlag(value);
}

function normalizeModels(models: RawKeelTaskCloudyModels | undefined): KeelTaskCloudyModels | undefined {
  if (!models) return undefined;
  return {
    planning: normalizeModel(models.planning, 'models.planning'),
    execution: normalizeModel(models.execution, 'models.execution'),
    taskReview: normalizeModel(models.taskReview, 'models.taskReview'),
    runReview: normalizeModel(models.runReview, 'models.runReview'),
    qualityReview: normalizeModel(models.qualityReview, 'models.qualityReview'),
  };
}

export async function loadKeelTaskRuntime(cwd: string, taskId?: string): Promise<KeelTaskCloudyConfig | null> {
  if (!taskId) return null;
  const task = await readJson<KeelTaskFile>(path.join(cwd, 'keel', 'tasks', `${taskId}.json`));
  if (!task?.cloudy) return null;
  return {
    models: normalizeModels(task.cloudy.models),
    execution: task.cloudy.execution,
    planning: task.cloudy.planning,
    validation: task.cloudy.validation,
    review: task.cloudy.review,
  };
}

export function applyKeelTaskRuntime(config: CloudyConfig, runtime: KeelTaskCloudyConfig | null): CloudyConfig {
  if (!runtime) return config;

  const models = config.models ?? {
    planning: 'sonnet',
    execution: 'sonnet',
    validation: 'haiku',
  };
  const review = config.review ?? {
    enabled: true,
    model: 'sonnet',
    failBlocksRun: false,
  };

  return {
    ...config,
    models: {
      ...models,
      planning: runtime.models?.planning ?? models.planning,
      execution: runtime.models?.execution ?? models.execution,
      validation: runtime.models?.taskReview ?? models.validation,
      qualityReview: runtime.models?.qualityReview ?? models.qualityReview,
    },
    engine: runtime.execution?.engine ?? config.engine,
    provider: runtime.execution?.provider ?? config.provider,
    account: runtime.execution?.account ?? config.account,
    executionModelId: runtime.execution?.modelId ?? config.executionModelId,
    executionEffort: runtime.execution?.effort ?? config.executionEffort,
    planningRuntime: {
      ...config.planningRuntime,
      ...runtime.planning,
    },
    validationRuntime: {
      ...config.validationRuntime,
      ...runtime.validation,
    },
    reviewRuntime: {
      ...config.reviewRuntime,
      ...runtime.review,
    },
    review: {
      ...review,
      model: runtime.models?.runReview ?? review.model,
    },
  };
}
