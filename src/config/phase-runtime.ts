import type { CloudyConfig, PhaseRuntimeConfig } from '../core/types.js';

export type RuntimePhase = 'planning' | 'validation' | 'review';

export function getPhaseRuntime(config: CloudyConfig, phase: RuntimePhase): PhaseRuntimeConfig {
  switch (phase) {
    case 'planning':
      return config.planningRuntime ?? {};
    case 'validation':
      return config.validationRuntime ?? {};
    case 'review':
      return config.reviewRuntime ?? {};
  }
}
