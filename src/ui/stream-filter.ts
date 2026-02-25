/**
 * Filters raw stream-json output from Claude Code into human-readable lines
 * suitable for display in the TUI output panel.
 *
 * Claude Code --output-format stream-json emits JSON events on each line.
 * We extract only the useful text content and discard metadata.
 */

interface StreamEvent {
  type: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
  };
  result?: string;
  subtype?: string;
  content_block?: { type: string };
}

/** Per-task line buffers for partial JSON lines */
const taskBuffers = new Map<string, string>();

/**
 * Given a raw stdout chunk from Claude Code for a specific task, returns an array of
 * human-readable display lines. Empty array = nothing to show.
 */
export function filterStreamOutput(raw: string, taskId = '__default__'): string[] {
  const result: string[] = [];
  const pending = taskBuffers.get(taskId) ?? '';

  const lines = (pending + raw).split('\n');
  // Last element may be a partial line — buffer it
  taskBuffers.set(taskId, lines.pop() ?? '');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      // Not JSON — surface as-is (e.g. raw stderr)
      result.push(trimmed);
      continue;
    }

    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content ?? [];
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            // Split multi-line text blocks into individual lines
            const lines = block.text.trimEnd().split('\n');
            for (const l of lines) {
              if (l.trim()) result.push(l);
            }
          } else if (block.type === 'tool_use' && block.name) {
            const inputStr = formatToolInput(block.name, block.input ?? {});
            result.push(`▸ ${block.name}(${inputStr})`);
          } else if (block.type === 'thinking' && block.thinking) {
            // Show a brief thinking summary
            const snippet = block.thinking.split('\n')[0].slice(0, 80);
            result.push(`  💭 ${snippet}`);
          }
        }
        break;
      }

      case 'result': {
        if (event.subtype === 'success') {
          const summary = event.result?.split('\n')[0]?.slice(0, 100) ?? 'done';
          result.push(`✓ ${summary}`);
        } else if (event.subtype === 'error' || event.subtype === 'error_during_execution') {
          const summary = event.result?.split('\n')[0]?.slice(0, 100) ?? 'error';
          result.push(`✗ ${summary}`);
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          // Streaming text delta — only show non-whitespace fragments
          if (delta.text.trim()) result.push(delta.text.trimEnd());
        }
        break;
      }

      // Intentionally skipped: system, user, tool_result, rate_limit_event,
      // content_block_start, content_block_stop, message_start, message_delta
    }
  }

  return result;
}

function formatToolInput(name: string, input: Record<string, unknown>): string {
  // Show the most useful part of each common tool's input
  switch (name) {
    case 'Write':
    case 'Read':
    case 'Edit':
    case 'Glob':
    case 'Grep':
      return String(input.file_path ?? input.path ?? input.pattern ?? '');
    case 'Bash':
      return String(input.command ?? '').slice(0, 60);
    case 'Task':
      return String(input.description ?? '').slice(0, 50);
    default:
      return Object.values(input).slice(0, 1).map(String)[0]?.slice(0, 50) ?? '';
  }
}
