import type { ClaudeModel, ModelConfig } from '../core/types.js';

const VALID_MODELS: ClaudeModel[] = ['opus', 'sonnet', 'haiku'];

const MODEL_TO_CLI: Record<ClaudeModel, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

export function resolveModelId(model: ClaudeModel): string {
  return MODEL_TO_CLI[model];
}

export function isValidModel(value: string): value is ClaudeModel {
  return VALID_MODELS.includes(value as ClaudeModel);
}

export function parseModelFlag(value: string): ClaudeModel {
  const lower = value.toLowerCase();
  if (!isValidModel(lower)) {
    throw new Error(
      `Invalid model "${value}". Must be one of: ${VALID_MODELS.join(', ')}`,
    );
  }
  return lower;
}

export function mergeModelConfig(
  base: ModelConfig,
  overrides: {
    model?: ClaudeModel;
    planningModel?: ClaudeModel;
    executionModel?: ClaudeModel;
    taskReviewModel?: ClaudeModel;
    qualityReviewModel?: ClaudeModel;
  },
): ModelConfig {
  const result = { ...base };

  // --model sets all phases
  if (overrides.model) {
    result.planning = overrides.model;
    result.execution = overrides.model;
    result.validation = overrides.model;
    result.qualityReview = overrides.model;
  }

  // Per-phase flags override --model
  if (overrides.planningModel) result.planning = overrides.planningModel;
  if (overrides.executionModel) result.execution = overrides.executionModel;
  if (overrides.taskReviewModel) result.validation = overrides.taskReviewModel;
  if (overrides.qualityReviewModel) result.qualityReview = overrides.qualityReviewModel;

  return result;
}

export function isAbstractClaudeModel(value: string): value is ClaudeModel {
  return isValidModel(value);
}
