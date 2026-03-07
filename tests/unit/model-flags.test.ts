import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { mergeModelConfig, parseModelFlag } from '../../src/config/model-config.js';
import type { ModelConfig } from '../../src/core/types.js';

describe('DEFAULT_CONFIG model defaults', () => {
  it('defaults execution to sonnet', () => {
    expect(DEFAULT_CONFIG.models.execution).toBe('sonnet');
  });

  it('defaults planning to sonnet', () => {
    expect(DEFAULT_CONFIG.models.planning).toBe('sonnet');
  });

  it('defaults validation (task review) to haiku', () => {
    expect(DEFAULT_CONFIG.models.validation).toBe('haiku');
  });

  it('defaults post-run review model to opus', () => {
    expect(DEFAULT_CONFIG.review.model).toBe('opus');
  });

  it('defaults post-run review to enabled', () => {
    expect(DEFAULT_CONFIG.review.enabled).toBe(true);
  });
});

describe('--planning-model flag (planningModel)', () => {
  const base: ModelConfig = { planning: 'haiku', execution: 'haiku', validation: 'haiku' };

  it('sets planning phase only', () => {
    const result = mergeModelConfig(base, { planningModel: parseModelFlag('sonnet') });
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('haiku');
    expect(result.validation).toBe('haiku');
  });

  it('is overridden by --model when both provided', () => {
    const result = mergeModelConfig(base, {
      model: parseModelFlag('opus'),
      planningModel: parseModelFlag('sonnet'),
    });
    // planningModel wins (applied after --model)
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('opus');
    expect(result.validation).toBe('opus');
  });
});

describe('--execution-model flag (executionModel)', () => {
  const base: ModelConfig = { planning: 'haiku', execution: 'haiku', validation: 'haiku' };

  it('sets execution phase only', () => {
    const result = mergeModelConfig(base, { executionModel: parseModelFlag('sonnet') });
    expect(result.planning).toBe('haiku');
    expect(result.execution).toBe('sonnet');
    expect(result.validation).toBe('haiku');
  });

  it('overrides --model for execution phase', () => {
    const result = mergeModelConfig(base, {
      model: parseModelFlag('haiku'),
      executionModel: parseModelFlag('opus'),
    });
    expect(result.execution).toBe('opus');
    expect(result.planning).toBe('haiku');
  });
});

describe('--task-review-model flag (taskReviewModel)', () => {
  const base: ModelConfig = { planning: 'sonnet', execution: 'sonnet', validation: 'sonnet' };

  it('sets validation phase only', () => {
    const result = mergeModelConfig(base, { taskReviewModel: parseModelFlag('haiku') });
    expect(result.validation).toBe('haiku');
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('sonnet');
  });

  it('overrides --model for validation phase', () => {
    const result = mergeModelConfig(base, {
      model: parseModelFlag('opus'),
      taskReviewModel: parseModelFlag('haiku'),
    });
    expect(result.validation).toBe('haiku');
    expect(result.planning).toBe('opus');
    expect(result.execution).toBe('opus');
  });
});

describe('recommended defaults workflow', () => {
  it('sonnet build + haiku task review + opus run review', () => {
    // Simulates the intended default: sonnet for execution, haiku for per-task,
    // opus for post-run holistic review.
    const base: ModelConfig = {
      planning: DEFAULT_CONFIG.models.planning,
      execution: DEFAULT_CONFIG.models.execution,
      validation: DEFAULT_CONFIG.models.validation,
    };
    // No overrides — just check defaults are correct
    expect(base.execution).toBe('sonnet');
    expect(base.validation).toBe('haiku');
    expect(DEFAULT_CONFIG.review.model).toBe('opus');
  });

  it('--model opus overrides all phases but task-review-model haiku wins', () => {
    const base: ModelConfig = { planning: 'sonnet', execution: 'sonnet', validation: 'haiku' };
    const result = mergeModelConfig(base, {
      model: parseModelFlag('opus'),
      taskReviewModel: parseModelFlag('haiku'),
    });
    expect(result.planning).toBe('opus');
    expect(result.execution).toBe('opus');
    expect(result.validation).toBe('haiku');
  });
});
