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
    modelPlanning?: ClaudeModel;
    modelExecution?: ClaudeModel;
    modelValidation?: ClaudeModel;
  },
): ModelConfig {
  const result = { ...base };

  // --model sets all phases
  if (overrides.model) {
    result.planning = overrides.model;
    result.execution = overrides.model;
    result.validation = overrides.model;
  }

  // Per-phase flags override --model
  if (overrides.modelPlanning) result.planning = overrides.modelPlanning;
  if (overrides.modelExecution) result.execution = overrides.modelExecution;
  if (overrides.modelValidation) result.validation = overrides.modelValidation;

  return result;
}
