import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeModel, ClaudeRunResult, TokenUsage } from '../core/types.js';
import { resolveModelId } from '../config/model-config.js';
import { findClaudeBinary } from '../utils/claude-path.js';

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
}

// ── Dangerous command guard ──────────────────────────────────────────────────
// Regex of bash command patterns that are irreversibly destructive.
// We block them via PreToolUse hook rather than letting Claude run them.
// Intentionally narrow — only target truly catastrophic one-liners.
const DANGEROUS_BASH_RE =
  /rm\s+-[a-z]*r[a-z]*f\s+\/(?!tmp|Users|home|var\/folders)|dd\s+if=\/dev\/zero\s+of=\/dev\/|mkfs\.\w+\s+\/dev\/[a-z]+$/i;

export async function runClaude(
  options: ClaudeRunOptions,
): Promise<ClaudeRunResult> {
  const {
    prompt,
    model,
    cwd,
    onOutput,
    onToolUse,
    onFilesWritten,
    onToolResult,
    abortSignal,
    resumeSessionId,
    maxBudgetUsd,
    effort,
  } = options;

  const claudePath = await findClaudeBinary();
  const modelId = resolveModelId(model);

  // Strip nested-session env guards so cloudy can run inside an active Claude Code session.
  const childEnv: Record<string, string | undefined> = { ...process.env };
  delete childEnv['CLAUDECODE'];
  delete childEnv['CLAUDE_CODE_ENTRYPOINT'];

  // Collected by PostToolUse hooks; returned in ClaudeRunResult.
  const filesWritten: string[] = [];

  // Wire external AbortSignal into an AbortController the SDK can consume.
  const ac = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) {
      ac.abort();
    } else {
      abortSignal.addEventListener('abort', () => ac.abort(), { once: true });
    }
  }

  const q = query({
    prompt,
    options: {
      pathToClaudeCodeExecutable: claudePath,
      model: modelId,
      cwd,
      env: childEnv,
      abortController: ac,
      allowDangerouslySkipPermissions: true,
      permissionMode: 'bypassPermissions',
      // ── Session resume ─────────────────────────────────────────────────────
      // When resumeSessionId is set, the SDK picks up where the previous run left
      // off — Claude already has context of what it wrote, so retries are smarter.
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      // ── Native cost ceiling ────────────────────────────────────────────────
      ...(maxBudgetUsd && maxBudgetUsd > 0 ? { maxBudgetUsd } : {}),
      // ── Effort / extended thinking ─────────────────────────────────────────
      // 'high' and 'max' enable adaptive extended thinking on capable models.
      ...(effort ? { effort } : {}),
      // ── Hooks ─────────────────────────────────────────────────────────────
      hooks: {
        // Catch-all PostToolUse: track file writes + forward results to dashboard.
        PostToolUse: [
          {
            matcher: '.*',
            hooks: [
              async (input) => {
                const h = input as any;
                const ti = h.tool_input ?? {};
                const toolName: string = h.tool_name ?? '';

                // ── File-write tracking ────────────────────────────────
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

                // ── Tool result forwarding ─────────────────────────────
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
              },
            ],
          },
        ],
        // Guard against catastrophically destructive bash commands.
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [
              async (input) => {
                const cmd =
                  ((input as any).tool_input?.command as string | undefined) ?? '';
                if (DANGEROUS_BASH_RE.test(cmd)) {
                  return {
                    decision: 'block' as const,
                    reason:
                      'Blocked potentially destructive command. Run it manually if intentional.',
                  };
                }
                return {};
              },
            ],
          },
        ],
      },
    },
  });

  // ── Consume the async generator ─────────────────────────────────────────────
  let output = '';
  let sessionId: string | undefined;
  let costUsd = 0;
  let durationMs = 0;
  let success = false;
  let error: string | undefined;
  const startMs = Date.now();
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  try {
    for await (const msg of q) {
      // Capture session ID from the first init message
      if (
        msg.type === 'system' &&
        (msg as any).subtype === 'init' &&
        (msg as any).session_id
      ) {
        sessionId = (msg as any).session_id as string;
      }

      // Emit text content from assistant turns; collect tool_use events
      if (msg.type === 'assistant') {
        const content = (msg as any).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              onOutput?.(block.text as string);
            }
            if (block.type === 'tool_use') {
              onToolUse?.(block.name as string, block.input);
            }
          }
        }
      }

      // Detect rate-limit signals in assistant output — fail fast instead of spinning
      // Also detect mid-task escalation markers (<ESCALATE>question</ESCALATE>)
      if (msg.type === 'assistant') {
        const textBlocks = ((msg as any).message?.content ?? []) as Array<{ type: string; text?: string }>;
        for (const block of textBlocks) {
          if (block.type === 'text' && block.text) {
            const t = block.text;
            if (/you'?re out of extra usage|rate limit/i.test(t)) {
              throw new Error(`Rate limit detected: ${t.slice(0, 200).trim()}`);
            }
            // Mid-task escalation: Claude signals it needs human input
            const escalateMatch = t.match(/<ESCALATE>([\s\S]*?)<\/ESCALATE>/i);
            if (escalateMatch) {
              const question = escalateMatch[1].trim();
              ac.abort();
              throw new Error(`escalation: ${question}`);
            }
          }
        }
      }

      // Final result message
      if (msg.type === 'result') {
        const r = msg as any;
        sessionId = (r.session_id as string | undefined) ?? sessionId;
        durationMs = (r.duration_ms as number | undefined) ?? Date.now() - startMs;
        costUsd = (r.total_cost_usd as number | undefined) ?? 0;

        if (r.subtype === 'success') {
          success = true;
          output = (r.result as string | undefined) ?? '';
          const u = r.usage as Record<string, number> | undefined;
          if (u) {
            usage.inputTokens = u['input_tokens'] ?? 0;
            usage.outputTokens = u['output_tokens'] ?? 0;
            usage.cacheReadTokens = u['cache_read_input_tokens'] ?? 0;
            usage.cacheWriteTokens = u['cache_creation_input_tokens'] ?? 0;
          }
        } else {
          success = false;
          const errors = (r.errors as string[] | undefined) ?? [];
          if (r.subtype === 'error_max_budget_usd') {
            error = `Task cost exceeded maxBudgetUsd ($${maxBudgetUsd})`;
          } else {
            error = errors.join('; ') || (r.subtype as string) || 'Unknown error';
          }
        }
      }
    }
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'));
    success = false;
    error = isAbort ? 'Task aborted' : err instanceof Error ? err.message : String(err);
    durationMs = Date.now() - startMs;
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
