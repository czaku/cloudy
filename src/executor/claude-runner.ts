import { selectViaDaemon, type RunOptions, type FnHook, type ThinkingLevel } from 'omnai';
import type { ClaudeModel, ClaudeRunResult, Engine, Provider, TokenUsage } from '../core/types.js';
import { resolveModelId } from '../config/model-config.js';

export interface ClaudeRunOptions {
  prompt: string;
  model: ClaudeModel;
  cwd: string;
  onOutput?: (text: string) => void;
  /** Called for each tool call Claude makes — useful for live progress reporting. */
  onToolUse?: (toolName: string, toolInput: unknown) => void;
  /** Called when a file write is detected via PostToolUse hook. */
  onFilesWritten?: (paths: string[]) => void;
  /** Called after every tool execution with the tool result content. */
  onToolResult?: (toolName: string, content: string, isError: boolean) => void;
  abortSignal?: AbortSignal;
  /** Resume a previous session ID — skips rollback and continues from prior state. */
  resumeSessionId?: string;
  /** SDK-native cost ceiling. Stops with an error when exceeded (0 = unlimited). */
  maxBudgetUsd?: number;
  /**
   * Maps to the SDK `effort` field:
   *   low    → minimal thinking
   *   medium → default
   *   high   → extended thinking on capable models
   *   max    → max thinking (Opus 4.6 only)
   */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /**
   * Explicit thinking level. Overrides the budget implied by `effort`.
   * off | minimal | low | medium | high | xhigh
   */
  thinking?: ThinkingLevel;
}

export type ModelRunOptions = ClaudeRunOptions;

export interface AbstractModelRunOptions extends ClaudeRunOptions {
  engine?: Engine;
  provider?: Provider;
  modelId?: string;
  taskType?: 'coding' | 'analysis' | 'planning' | 'review' | 'chat' | 'research';
}

export interface OmnaiRunOptions {
  prompt: string;
  cwd: string;
  engine?: Engine;
  provider?: Provider;
  modelId?: string;
  onOutput?: (text: string) => void;
  onToolUse?: (toolName: string, toolInput: unknown) => void;
  onFilesWritten?: (paths: string[]) => void;
  onToolResult?: (toolName: string, content: string, isError: boolean) => void;
  abortSignal?: AbortSignal;
  resumeSessionId?: string;
  maxBudgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
  thinking?: ThinkingLevel;
  taskType?: 'coding' | 'analysis' | 'planning' | 'review' | 'chat' | 'research';
}

// ── Dangerous command guard ──────────────────────────────────────────────────
const DANGEROUS_BASH_RE =
  /rm\s+-[a-z]*r[a-z]*f\s+\/(?!tmp|Users|home|var\/folders)|dd\s+if=\/dev\/zero\s+of=\/dev\/|mkfs\.\w+\s+\/dev\/[a-z]+$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewritePromptForWorktree(prompt: string, cwd: string): string {
  const worktreeMarker = '/.cloudy/worktrees/';
  const markerIndex = cwd.indexOf(worktreeMarker);
  if (markerIndex === -1) return prompt;

  const mainRepoCwd = cwd.slice(0, markerIndex);
  const escapedMainRepo = escapeRegExp(mainRepoCwd);

  return prompt
    .replace(new RegExp(`\\bcd\\s+${escapedMainRepo}(?=\\s|$)`, 'g'), 'cd .')
    .replace(new RegExp(`${escapedMainRepo}/`, 'g'), '');
}

export async function runOmnai(options: OmnaiRunOptions): Promise<ClaudeRunResult> {
  const {
    prompt,
    cwd,
    engine,
    provider,
    modelId,
    onOutput,
    onToolUse,
    onFilesWritten,
    onToolResult,
    abortSignal,
    resumeSessionId,
    maxBudgetUsd,
    effort,
    thinking,
    taskType,
  } = options;

  const runner = await selectViaDaemon({
    provider,
    engine,
    taskType: taskType ?? 'coding',
  });
  const rewrittenPrompt = rewritePromptForWorktree(prompt, cwd);

  const filesWritten: string[] = [];

  // Build function hooks for file tracking, tool result forwarding, and dangerous command blocking
  const postToolUseHook: FnHook = async (input: unknown) => {
    const h = input as any;
    const ti = h.tool_input ?? {};
    const toolName: string = h.tool_name ?? '';

    // File-write tracking
    if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(toolName)) {
      if (typeof ti.file_path === 'string' && ti.file_path) {
        filesWritten.push(ti.file_path);
        onFilesWritten?.([ti.file_path]);
      }
      if (Array.isArray(ti.edits)) {
        for (const edit of ti.edits) {
          if (typeof edit?.file_path === 'string' && edit.file_path) {
            filesWritten.push(edit.file_path as string);
            onFilesWritten?.([edit.file_path as string]);
          }
        }
      }
    }

    // Tool result forwarding
    if (onToolResult) {
      const resp = h.tool_response as { content?: unknown; is_error?: boolean } | null | undefined;
      if (resp) {
        const raw = resp.content;
        const text = typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? (raw as Array<{ text?: string }>).map(b => b.text ?? '').join('')
            : JSON.stringify(raw ?? '');
        if (text.trim()) {
          onToolResult(toolName, text.slice(0, 4000), resp.is_error ?? false);
        }
      }
    }

    return {};
  };

  // Derive the main repo path from the worktree cwd, if applicable.
  // Worktree path shape: {mainRepo}/.cloudy/worktrees/{taskId}
  const clawdashIdx = cwd.indexOf('/.cloudy/worktrees/');
  const mainRepoCwd = clawdashIdx !== -1 ? cwd.slice(0, clawdashIdx) : null;

  const preToolUseHook: FnHook = async (input: unknown) => {
    const h = input as any;
    const toolName: string = h.tool_name ?? '';
    const ti = h.tool_input ?? {};

    // Redirect absolute paths that land in the main repo instead of the worktree.
    // This happens when Claude ignores the relative-path instruction and uses
    // absolute paths it learned from CLAUDE.md or prior context.
    if (mainRepoCwd && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(toolName)) {
      const redirectPath = (filePath: unknown): string | null => {
        if (typeof filePath !== 'string') return null;
        // Path is inside the main repo but outside the worktree → redirect
        if (
          filePath.startsWith(mainRepoCwd + '/') &&
          !filePath.startsWith(cwd + '/')
        ) {
          return cwd + filePath.slice(mainRepoCwd.length);
        }
        return null;
      };

      const redirected = redirectPath(ti.file_path);
      if (redirected) {
        ti.file_path = redirected;
      }
      if (Array.isArray(ti.edits)) {
        for (const edit of ti.edits) {
          const r = redirectPath(edit?.file_path);
          if (r) edit.file_path = r;
        }
      }
    }

    const cmd = (ti?.command as string | undefined) ?? '';
    if (DANGEROUS_BASH_RE.test(cmd)) {
      return {
        decision: 'block' as const,
        reason: 'Blocked potentially destructive command. Run it manually if intentional.',
      };
    }
    return {};
  };

  const runOpts: RunOptions = {
    cwd,
    model: modelId,
    permissionMode: 'bypass',
    abortSignal,
    resumeSessionId,
    maxBudgetUsd,
    effort,
    thinking,
  };

  if (runner.engine === 'claude-code') {
    runOpts.hooks = {
      PostToolUse: [{ matcher: '.*', hooks: [postToolUseHook] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [preToolUseHook] }],
    };
  }

  let output = '';
  let sessionId: string | undefined;
  let costUsd = 0;
  let durationMs = 0;
  let success = false;
  let error: string | undefined;
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  try {
    for await (const event of runner.run(rewrittenPrompt, runOpts)) {
      if (event.type === 'text') {
        onOutput?.(event.content);

        // Rate limit detection
        if (/you'?re out of extra usage|rate limit/i.test(event.content)) {
          throw new Error(`Rate limit detected: ${event.content.slice(0, 200).trim()}`);
        }

        // Mid-task escalation
        const escalateMatch = event.content.match(/<ESCALATE>([\s\S]*?)<\/ESCALATE>/i);
        if (escalateMatch) {
          throw new Error(`escalation: ${escalateMatch[1].trim()}`);
        }
      } else if (event.type === 'tool_use') {
        onToolUse?.(event.name, event.input);
      } else if (event.type === 'tool_result') {
        onToolResult?.(event.name, event.content, event.isError);
      } else if (event.type === 'result') {
        output = event.output;
        sessionId = event.sessionId;
        costUsd = event.costUsd;
        durationMs = event.durationMs;
        usage.inputTokens = event.usage.inputTokens;
        usage.outputTokens = event.usage.outputTokens;
        usage.cacheReadTokens = event.usage.cacheReadTokens ?? 0;
        usage.cacheWriteTokens = event.usage.cacheWriteTokens ?? 0;
        success = true;
      } else if (event.type === 'error') {
        error = event.message;
        success = false;
      }
    }
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'));
    success = false;
    error = isAbort ? 'Task aborted' : err instanceof Error ? err.message : String(err);
    durationMs = durationMs || 0;
  }

  return {
    success,
    output,
    error,
    usage,
    durationMs,
    costUsd,
    sessionId,
    filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
  };
}

export const runModel = runOmnai;
export { rewritePromptForWorktree };

export async function runClaude(
  options: ClaudeRunOptions,
): Promise<ClaudeRunResult> {
  return runAbstractModel(options);
}

export async function runAbstractModel(
  options: AbstractModelRunOptions,
): Promise<ClaudeRunResult> {
  const resolvedModelId =
    options.modelId ??
    ((options.engine === 'claude-code' || !options.engine)
      ? resolveModelId(options.model)
      : undefined);

  return runOmnai({
    prompt: options.prompt,
    cwd: options.cwd,
    engine: options.engine ?? 'claude-code',
    provider: options.provider ?? 'claude',
    modelId: resolvedModelId,
    onOutput: options.onOutput,
    onToolUse: options.onToolUse,
    onFilesWritten: options.onFilesWritten,
    onToolResult: options.onToolResult,
    abortSignal: options.abortSignal,
    resumeSessionId: options.resumeSessionId,
    maxBudgetUsd: options.maxBudgetUsd,
    effort: options.effort,
    thinking: options.thinking,
    taskType: options.taskType,
  });
}

export const runPhaseModel = runAbstractModel;
