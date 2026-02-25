import type { ClaudeModel, ClaudeRunResult, Engine, PiMonoConfig } from '../core/types.js';
import { runClaude } from './claude-runner.js';
import { runPi } from './pi-runner.js';

export interface EngineRunOptions {
  prompt: string;
  engine: Engine;
  claudeModel?: ClaudeModel;
  piMono?: PiMonoConfig;
  cwd: string;
  onOutput?: (text: string) => void;
  abortSignal?: AbortSignal;
}

export async function runEngine(options: EngineRunOptions): Promise<ClaudeRunResult> {
  const { prompt, engine, claudeModel, piMono, cwd, onOutput, abortSignal } = options;

  if (engine === 'pi-mono' && piMono) {
    return runPi({
      prompt,
      provider: piMono.provider,
      model: piMono.model,
      piPath: piMono.piPath,
      baseUrl: piMono.baseUrl,
      cwd,
      onOutput,
      abortSignal,
    });
  }

  return runClaude({
    prompt,
    model: claudeModel ?? 'sonnet',
    cwd,
    onOutput,
    abortSignal,
  });
}
