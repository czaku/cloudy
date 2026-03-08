import type { OutputLine } from '../types.js';

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

// ── ANSI / terminal noise stripping ──────────────────────────────────────────

/** Strip all ANSI escape sequences from a string */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, '');
}

/** True if a SINGLE line is terminal/UI noise and should be silently dropped */
function isNoiseLine(raw: string): boolean {
  const s = stripAnsi(raw).trim();
  if (!s) return true;                              // blank after stripping
  if (s.length <= 2) return true;                   // spinner chars: C | \ / —
  if (/^\[(\?[\d;]+[lh]|[\d;]*[A-Z])\s*$/.test(s)) return true; // bare escape remnants
  // claude-code interactive UI chrome: any line starting with "[project]…"
  // catches: "[project] Claude", "[project]|", "[project]□[?25l", etc.
  if (/^\[[\w-]+\]/.test(s)) return true;
  if (/^Conversation\d*\s*$/.test(s)) return true;
  if (/^(All\s+)?Prompts\s+Replies\s+Tools/i.test(s)) return true;
  if (/^[⓪①②③]\s*(▼|▲)?\s*(Collapse|Clear|Expand)/i.test(s)) return true;
  if (/^\s*[|\-\\\/]\s*$/.test(s)) return true;    // lone box-drawing / progress chars
  // clack/terminal interactive prompt chrome
  if (/^\|\s*[•○◉◎]\s/.test(s)) return true;       // radio button options: | • sonnet
  if (/^Planning model:\s*$/.test(s)) return true;  // model selection prompt (handled in UI)
  if (/^◆\s+Planning model/.test(s)) return true;  // clack styled prompt header
  if (/^[└│]\s*$/.test(s)) return true;            // clack box chars
  // cloudy scope command echo lines
  if (/^☁\s+cloudy\s+scope\s+/.test(s)) return true;
  // planning progress spinner: "Planning with sonnet… (287s)..◎" — any variant
  if (/^Planning with \S+/.test(s)) return true;
  // clack interactive prompt chrome
  if (/^[◆◇]\s/.test(s)) return true;           // "◆ What would you like to do?"
  if (/^[●○◉◎•]\s/.test(s)) return true;         // "● ✅ Approve" / "○ ✍ Revise"
  if (/^[└│┌┐┘├┤┬┴┼─]\s*$/.test(s)) return true; // clack box chars
  // bare spinner chars
  if (/^[.◎○◉oO]+$/.test(s)) return true;
  return false;
}

/**
 * Filter a (possibly multi-line) text block: split by newline, drop noise lines,
 * strip ANSI, rejoin non-empty lines.
 */
export function filterTextBlock(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !isNoiseLine(l))
    .map((l) => stripAnsi(l).trim())
    .filter(Boolean)
    .join('\n');
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
    // Not JSON — strip per-line, drop noise, render as event (not as a Claude reply bubble)
    const clean = filterTextBlock(text);
    if (!clean) return lines;
    lines.push({ id: nextId(), type: 'event', taskId: undefined, content: clean });
    return lines;
  }

  if (!ev) return lines;

  // Skip system init noise
  if (ev.type === 'system') return lines;

  if (ev.type === 'assistant') {
    const content = ev.message?.content ?? ev.content ?? [];
    for (const block of content) {
      if (block.type === 'text' && block.text?.trim()) {
        // Filter per-line (text blocks can contain multiple \n-joined lines)
        const clean = filterTextBlock(block.text);
        if (!clean) continue;
        lines.push({
          id: nextId(),
          type: 'text',
          taskId,
          content: clean,
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
    const cleanResult = stripAnsi(resultText).trim();
    if (cleanResult) {
      lines.push({
        id: nextId(),
        type: 'tool_result',
        taskId,
        content: cleanResult.slice(0, 2000),
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
