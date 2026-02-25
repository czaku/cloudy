import { c, dim, cyan } from './colors.js';

/**
 * Creates a stateful formatter for claude --output-format stream-json output.
 * Buffers partial lines and extracts human-readable content from JSON events.
 * Returns a function to call with each raw chunk.
 */
export function createStreamFormatter(write: (s: string) => void): (chunk: string) => void {
  let lineBuffer = '';
  let inThinking = false;

  function handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Raw text — print as-is
      if (line.trim()) write(c(dim, line + '\n'));
      return;
    }

    const type = msg.type as string;

    // content_block_start: signals start of a block
    if (type === 'content_block_start') {
      const block = msg.content_block as Record<string, unknown> | undefined;
      if (block?.type === 'thinking') {
        inThinking = true;
        write(c(dim, '  💭 thinking...\n'));
      } else if (block?.type === 'text') {
        inThinking = false;
      }
      return;
    }

    // content_block_stop
    if (type === 'content_block_stop') {
      if (inThinking) {
        write('\n');
        inThinking = false;
      }
      return;
    }

    // content_block_delta: streaming text/thinking
    if (type === 'content_block_delta') {
      const delta = msg.delta as Record<string, unknown> | undefined;
      if (!delta) return;
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        write(c(dim, delta.thinking));
      } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        write(c(dim, delta.text));
      }
      return;
    }

    // result: final summary
    if (type === 'result') {
      const cost = msg.total_cost_usd as number | undefined;
      const costStr = cost ? `  ${c(dim, `~$${cost.toFixed(4)}`)}` : '';
      write(c(dim, `\n  ✓ done${costStr}\n`));
      return;
    }

    // assistant: may contain full thinking/text content (non-streaming path)
    if (type === 'assistant') {
      const message = msg.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!content) return;
      for (const block of content) {
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
          write(c(dim, `  💭 ${block.thinking.slice(0, 200)}${block.thinking.length > 200 ? '…' : ''}\n`));
        } else if (block.type === 'text' && typeof block.text === 'string') {
          write(c(dim, block.text));
        }
      }
      return;
    }

    // system init, ping, etc — skip
  }

  return function onChunk(chunk: string): void {
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) handleLine(line);
    }
  };
}
