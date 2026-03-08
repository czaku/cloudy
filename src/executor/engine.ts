import type { ClaudeModel, ClaudeRunResult } from '../core/types.js';
import { runClaude } from './claude-runner.js';

export interface EngineRunOptions {
  prompt: string;
  engine?: string;
  claudeModel?: ClaudeModel;
  cwd: string;
  onOutput?: (text: string) => void;
  abortSignal?: AbortSignal;
}

export async function runEngine(options: EngineRunOptions): Promise<ClaudeRunResult> {
  const { prompt, claudeModel, cwd, onOutput, abortSignal } = options;

  return runClaude({
    prompt,
    model: claudeModel ?? 'sonnet',
    cwd,
    onOutput,
    abortSignal,
  });
}
