import type { ClaudeModel, ClaudeRunResult } from '../core/types.js';
import { runClaude } from './claude-runner.js';

export interface EngineRunOptions {
  prompt: string;
  engine?: string;
  claudeModel?: ClaudeModel;
  cwd: string;
  onOutput?: (text: string) => void;
  onToolUse?: (toolName: string, toolInput: unknown) => void;
  onToolResult?: (toolName: string, content: string, isError: boolean) => void;
  onFilesWritten?: (paths: string[]) => void;
  abortSignal?: AbortSignal;
  resumeSessionId?: string;
  maxBudgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
}

export async function runEngine(options: EngineRunOptions): Promise<ClaudeRunResult> {
  const {
    prompt,
    claudeModel,
    cwd,
    onOutput,
    onToolUse,
    onToolResult,
    onFilesWritten,
    abortSignal,
    resumeSessionId,
    maxBudgetUsd,
    effort,
  } = options;

  return runClaude({
    prompt,
    model: claudeModel ?? 'sonnet',
    cwd,
    onOutput,
    onToolUse,
    onToolResult,
    onFilesWritten,
    abortSignal,
    resumeSessionId,
    maxBudgetUsd,
    effort,
  });
}
