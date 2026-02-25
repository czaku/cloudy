import { describe, it, expect } from 'vitest';
import {
  resolveModelId,
  isValidModel,
  parseModelFlag,
  mergeModelConfig,
} from '../../src/config/model-config.js';
import type { ModelConfig } from '../../src/core/types.js';

describe('resolveModelId', () => {
  it('resolves opus', () => {
    expect(resolveModelId('opus')).toBe('claude-opus-4-6');
  });

  it('resolves sonnet', () => {
    expect(resolveModelId('sonnet')).toBe('claude-sonnet-4-6');
  });

  it('resolves haiku', () => {
    expect(resolveModelId('haiku')).toBe('claude-haiku-4-5-20251001');
  });
});

describe('isValidModel', () => {
  it('accepts valid models', () => {
    expect(isValidModel('opus')).toBe(true);
    expect(isValidModel('sonnet')).toBe(true);
    expect(isValidModel('haiku')).toBe(true);
  });

  it('rejects invalid models', () => {
    expect(isValidModel('gpt4')).toBe(false);
    expect(isValidModel('')).toBe(false);
    expect(isValidModel('SONNET')).toBe(false);
  });
});

describe('parseModelFlag', () => {
  it('parses valid model names', () => {
    expect(parseModelFlag('opus')).toBe('opus');
    expect(parseModelFlag('Sonnet')).toBe('sonnet');
    expect(parseModelFlag('HAIKU')).toBe('haiku');
  });

  it('throws on invalid model', () => {
    expect(() => parseModelFlag('gpt4')).toThrow('Invalid model');
  });
});

describe('mergeModelConfig', () => {
  const base: ModelConfig = {
    planning: 'sonnet',
    execution: 'sonnet',
    validation: 'haiku',
  };

  it('returns base when no overrides', () => {
    expect(mergeModelConfig(base, {})).toEqual(base);
  });

  it('--model sets all phases', () => {
    const result = mergeModelConfig(base, { model: 'opus' });
    expect(result).toEqual({
      planning: 'opus',
      execution: 'opus',
      validation: 'opus',
    });
  });

  it('per-phase flags override --model', () => {
    const result = mergeModelConfig(base, {
      model: 'opus',
      executionModel: 'sonnet',
    });
    expect(result.planning).toBe('opus');
    expect(result.execution).toBe('sonnet');
    expect(result.validation).toBe('opus');
  });

  it('per-phase flags override base', () => {
    const result = mergeModelConfig(base, {
      taskReviewModel: 'opus',
    });
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('sonnet');
    expect(result.validation).toBe('opus');
  });

  it('planningModel overrides planning phase only', () => {
    const result = mergeModelConfig(base, { planningModel: 'opus' });
    expect(result.planning).toBe('opus');
    expect(result.execution).toBe('sonnet');
    expect(result.validation).toBe('haiku');
  });

  it('executionModel overrides execution phase only', () => {
    const result = mergeModelConfig(base, { executionModel: 'haiku' });
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('haiku');
    expect(result.validation).toBe('haiku');
  });

  it('taskReviewModel overrides validation phase only', () => {
    const result = mergeModelConfig(base, { taskReviewModel: 'sonnet' });
    expect(result.planning).toBe('sonnet');
    expect(result.execution).toBe('sonnet');
    expect(result.validation).toBe('sonnet');
  });
});
