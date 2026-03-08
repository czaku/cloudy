import { describe, it, expect, beforeEach } from 'vitest';

// parseOutput is a browser-side util — we import it directly (no Node-only deps)
// The module uses a module-level counter so we reset it between tests via the
// id field assertion (each new test block observes incremented IDs, which is fine —
// we just assert type/content, not exact IDs).

// Inline the OutputLine type so we don't pull in browser build chain
interface OutputLine {
  id: string;
  type: 'text' | 'event' | 'error' | 'success' | 'tool_call' | 'tool_result' | 'prompt';
  taskId?: string;
  content: string;
  toolName?: string;
  toolHint?: string;
  collapsed?: boolean;
}

// Import the functions under test
import { parseClaudeOutputLine, makeEventLine } from '../../dashboard/client/utils/parseOutput.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function assistantLine(blocks: object[]): string {
  return JSON.stringify({ type: 'assistant', message: { content: blocks } });
}

function toolResultLine(content: string | object[], is_error = false): string {
  return JSON.stringify({ type: 'tool_result', content, is_error });
}

function resultLine(result: string, is_error = false): string {
  return JSON.stringify({ type: 'result', result, is_error });
}

function systemLine(): string {
  return JSON.stringify({ type: 'system', subtype: 'init' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseClaudeOutputLine', () => {
  const TASK_ID = 'task-1';

  it('returns empty array for empty / whitespace-only input', () => {
    expect(parseClaudeOutputLine(TASK_ID, '')).toEqual([]);
    expect(parseClaudeOutputLine(TASK_ID, '   ')).toEqual([]);
    expect(parseClaudeOutputLine(TASK_ID, '\n')).toEqual([]);
  });

  it('returns an event line for non-JSON input (not rendered as a chat bubble)', () => {
    const result = parseClaudeOutputLine(TASK_ID, 'plain text output');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('event');
    expect(result[0].content).toBe('plain text output');
    // non-JSON lines have no taskId — they are not attributed to a specific task
    expect(result[0].taskId).toBeUndefined();
  });

  it('skips system init messages', () => {
    const result = parseClaudeOutputLine(TASK_ID, systemLine());
    expect(result).toHaveLength(0);
  });

  it('parses assistant text block into a text OutputLine', () => {
    const line = assistantLine([{ type: 'text', text: 'Hello from Claude' }]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    expect(result[0].content).toBe('Hello from Claude');
  });

  it('skips empty assistant text blocks', () => {
    const line = assistantLine([{ type: 'text', text: '   ' }]);
    expect(parseClaudeOutputLine(TASK_ID, line)).toHaveLength(0);
  });

  it('parses assistant tool_use block into a tool_call OutputLine', () => {
    const line = assistantLine([
      {
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/src/app.ts' },
      },
    ]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_call');
    expect(result[0].toolName).toBe('Read');
    expect(result[0].toolHint).toBe('/src/app.ts');
    expect(result[0].collapsed).toBe(true);
    const parsedContent = JSON.parse(result[0].content);
    expect(parsedContent.file_path).toBe('/src/app.ts');
  });

  it('extracts toolHint from command when file_path absent', () => {
    const line = assistantLine([
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
    ]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result[0].toolHint).toBe('npm test');
  });

  it('extracts toolHint from url field', () => {
    const line = assistantLine([
      { type: 'tool_use', name: 'WebFetch', input: { url: 'https://example.com' } },
    ]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result[0].toolHint).toBe('https://example.com');
  });

  it('extracts toolHint from pattern field', () => {
    const line = assistantLine([
      { type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } },
    ]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result[0].toolHint).toBe('**/*.ts');
  });

  it('parses multiple blocks in one assistant message', () => {
    const line = assistantLine([
      { type: 'text', text: 'I will read the file.' },
      { type: 'tool_use', name: 'Read', input: { file_path: '/index.ts' } },
    ]);
    const result = parseClaudeOutputLine(TASK_ID, line);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('text');
    expect(result[1].type).toBe('tool_call');
  });

  it('parses tool_result with string content', () => {
    const result = parseClaudeOutputLine(TASK_ID, toolResultLine('File contents here'));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].content).toBe('File contents here');
    expect(result[0].collapsed).toBe(true);
  });

  it('parses tool_result with array content', () => {
    const result = parseClaudeOutputLine(
      TASK_ID,
      toolResultLine([{ text: 'Part A' }, { text: 'Part B' }]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_result');
    expect(result[0].content).toBe('Part APart B');
  });

  it('skips empty tool_result', () => {
    const result = parseClaudeOutputLine(TASK_ID, toolResultLine(''));
    expect(result).toHaveLength(0);
  });

  it('truncates long tool_result to 2000 chars', () => {
    const long = 'x'.repeat(5000);
    const result = parseClaudeOutputLine(TASK_ID, toolResultLine(long));
    expect(result[0].content).toHaveLength(2000);
  });

  it('parses result line as success', () => {
    const result = parseClaudeOutputLine(TASK_ID, resultLine('Task completed'));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('success');
    expect(result[0].content).toBe('Task completed');
  });

  it('parses error result line as error', () => {
    const result = parseClaudeOutputLine(TASK_ID, resultLine('Something went wrong', true));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('error');
  });

  it('skips empty result lines', () => {
    const result = parseClaudeOutputLine(TASK_ID, resultLine('  '));
    expect(result).toHaveLength(0);
  });

  it('returns empty array for unknown event types', () => {
    const unknown = JSON.stringify({ type: 'unknown_event', data: 'something' });
    expect(parseClaudeOutputLine(TASK_ID, unknown)).toHaveLength(0);
  });

  it('handles malformed partial JSON gracefully (treats as event, not chat bubble)', () => {
    const partial = '{"type":"assistant","message":{"content":[';
    const result = parseClaudeOutputLine(TASK_ID, partial);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('event');
    expect(result[0].content).toBe(partial);
  });
});

describe('makeEventLine', () => {
  it('creates an event line with the given text', () => {
    const line = makeEventLine('task-2', 'Run started');
    expect(line.type).toBe('event');
    expect(line.content).toBe('Run started');
    expect(line.taskId).toBe('task-2');
    expect(line.id).toBeTruthy();
  });

  it('accepts a custom type', () => {
    const line = makeEventLine('task-3', 'Error message', 'error');
    expect(line.type).toBe('error');
  });

  it('accepts undefined taskId', () => {
    const line = makeEventLine(undefined, 'Global event');
    expect(line.taskId).toBeUndefined();
    expect(line.content).toBe('Global event');
  });
});
