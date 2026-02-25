import type { OutputLine } from '../types';

let lineCounter = 0;
function nextId(): string {
  return `line-${++lineCounter}`;
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | unknown[];
}

interface ClaudeMessage {
  type: string;
  message?: { content?: ClaudeContentBlock[] };
  content?: ClaudeContentBlock[];
  result?: string;
  is_error?: boolean;
}

function getToolHint(input: Record<string, unknown>): string {
  return String(
    input['file_path'] ?? input['command'] ?? input['path'] ??
    input['url'] ?? input['pattern'] ?? input['query'] ?? ''
  );
}

/**
 * Parse a raw stream-json line from a task_output event into OutputLine(s).
 */
export function parseClaudeOutputLine(taskId: string, text: string): OutputLine[] {
  const lines: OutputLine[] = [];
  const trimmed = text.trim();
  if (!trimmed) return lines;

  let ev: ClaudeMessage | null = null;
  try {
    ev = JSON.parse(trimmed) as ClaudeMessage;
  } catch {
    // Not JSON — treat as plain text
    lines.push({ id: nextId(), type: 'text', taskId, content: text });
    return lines;
  }

  if (!ev) return lines;

  // Skip system init noise
  if (ev.type === 'system') return lines;

  if (ev.type === 'assistant') {
    const content = ev.message?.content ?? ev.content ?? [];
    for (const block of content) {
      if (block.type === 'text' && block.text?.trim()) {
        lines.push({
          id: nextId(),
          type: 'text',
          taskId,
          content: block.text.trim(),
        });
      } else if (block.type === 'tool_use') {
        const input = (block.input as Record<string, unknown>) ?? {};
        const hint = getToolHint(input);
        lines.push({
          id: nextId(),
          type: 'tool_call',
          taskId,
          content: JSON.stringify(input, null, 2),
          toolName: block.name ?? '',
          toolHint: hint,
          collapsed: true,
        });
      }
    }
    return lines;
  }

  if (ev.type === 'tool_result') {
    const raw = ev.content;
    const resultText = typeof raw === 'string'
      ? raw
      : Array.isArray(raw)
        ? raw.map((b) => (typeof b === 'object' && b !== null && 'text' in b ? (b as { text: string }).text : '')).join('')
        : '';
    if (resultText.trim()) {
      lines.push({
        id: nextId(),
        type: 'tool_result',
        taskId,
        content: resultText.slice(0, 2000),
        collapsed: true,
      });
    }
    return lines;
  }

  if (ev.type === 'result') {
    if (ev.result?.trim()) {
      lines.push({
        id: nextId(),
        type: ev.is_error ? 'error' : 'success',
        taskId,
        content: ev.result,
      });
    }
    return lines;
  }

  return lines;
}

/**
 * Create a plain event log line.
 */
export function makeEventLine(
  taskId: string | undefined,
  text: string,
  type: OutputLine['type'] = 'event',
): OutputLine {
  return { id: nextId(), type, taskId, content: text };
}
