import { execa } from 'execa';
import type {
  ClaudeModel,
  ClaudeRunResult,
  ClaudeStreamMessage,
  TokenUsage,
} from '../core/types.js';
import { resolveModelId } from '../config/model-config.js';
import { findClaudeBinary } from '../utils/claude-path.js';
import { parseStreamMessages } from './output-parser.js';

export interface ClaudeRunOptions {
  prompt: string;
  model: ClaudeModel;
  cwd: string;
  onOutput?: (text: string) => void;
  abortSignal?: AbortSignal;
}

export async function runClaude(
  options: ClaudeRunOptions,
): Promise<ClaudeRunResult> {
  const { prompt, model, cwd, onOutput, abortSignal } = options;
  const claudePath = await findClaudeBinary();
  const modelId = resolveModelId(model);

  const args = [
    '--print',
    '--verbose',
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '--model',
    modelId,
  ];

  // Unset Claude Code session markers so cloudy can run as a subprocess inside an active
  // Claude Code session without triggering the nested-session guard in the claude CLI.
  // extendEnv: false prevents execa from re-merging process.env (which would re-add them).
  const childEnv = { ...process.env };
  delete childEnv['CLAUDECODE'];
  delete childEnv['CLAUDE_CODE_ENTRYPOINT'];

  const proc = execa(claudePath, args, {
    cwd,
    reject: false,
    cancelSignal: abortSignal,
    input: prompt,
    env: childEnv,
    extendEnv: false,
  });

  let rawOutput = '';

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      onOutput?.(text);
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      onOutput?.(text); // surface stderr in verbose mode too
    });
  }

  const result = await proc;

  const messages = parseStreamMessages(rawOutput);
  const { usage, output, costUsd } = extractFromMessages(messages);

  return {
    success: result.exitCode === 0,
    output,
    error: result.exitCode !== 0 ? result.stderr || 'Claude process failed' : undefined,
    usage,
    durationMs: extractDuration(messages),
    costUsd,
  };
}

function extractFromMessages(messages: ClaudeStreamMessage[]): {
  usage: TokenUsage;
  output: string;
  costUsd: number;
} {
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  let output = '';
  let costUsd = 0;

  for (const msg of messages) {
    // Collect text content from assistant messages
    if (msg.type === 'assistant' && msg.content) {
      output += msg.content;
    }

    // Collect text from content_block_delta
    if (msg.type === 'content_block_delta' && msg.content) {
      output += msg.content;
    }

    // Result message has final output
    if (msg.type === 'result' && msg.result) {
      output = msg.result;
      if (msg.total_cost_usd) costUsd = msg.total_cost_usd;
      if (msg.total_input_tokens) usage.inputTokens = msg.total_input_tokens;
      if (msg.total_output_tokens) usage.outputTokens = msg.total_output_tokens;
    }

    // Usage info from message_start or similar
    if (msg.usage) {
      if (msg.usage.input_tokens) usage.inputTokens += msg.usage.input_tokens;
      if (msg.usage.output_tokens)
        usage.outputTokens += msg.usage.output_tokens;
      if (msg.usage.cache_read_input_tokens)
        usage.cacheReadTokens += msg.usage.cache_read_input_tokens;
      if (msg.usage.cache_creation_input_tokens)
        usage.cacheWriteTokens += msg.usage.cache_creation_input_tokens;
    }
  }

  return { usage, output, costUsd };
}

function extractDuration(messages: ClaudeStreamMessage[]): number {
  for (const msg of messages) {
    if (msg.type === 'result' && msg.duration_ms) {
      return msg.duration_ms;
    }
  }
  return 0;
}
