import type { ClaudeStreamMessage } from '../core/types.js';

/**
 * Parse raw stream-json output from Claude CLI into structured messages.
 * Each line is a JSON object. Lines that aren't valid JSON are ignored.
 */
export function parseStreamMessages(raw: string): ClaudeStreamMessage[] {
  const messages: ClaudeStreamMessage[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as ClaudeStreamMessage;
      if (parsed && typeof parsed.type === 'string') {
        messages.push(parsed);
      }
    } catch {
      // Not JSON - skip (could be raw text output)
    }
  }

  return messages;
}

/**
 * Extract the final text result from stream messages.
 */
export function extractResultText(messages: ClaudeStreamMessage[]): string {
  // Prefer the result message
  for (const msg of messages) {
    if (msg.type === 'result' && msg.result) {
      return msg.result;
    }
  }

  // Fall back to concatenating assistant content
  let text = '';
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.content) {
      text += msg.content;
    }
    if (msg.type === 'content_block_delta' && msg.content) {
      text += msg.content;
    }
  }

  return text;
}

/**
 * Extract total cost in USD from the result message.
 */
export function extractCost(messages: ClaudeStreamMessage[]): number {
  for (const msg of messages) {
    if (msg.type === 'result' && msg.total_cost_usd) {
      return msg.total_cost_usd;
    }
  }
  return 0;
}
