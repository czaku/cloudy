import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../../utils/fs.js', () => ({
  readJson: vi.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import { loadClaudeCodeMessages } from '../../daemon/scanner.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJsonlLine(
  type: 'user' | 'assistant',
  content: string | object[],
  ts = '2025-01-01T00:00:00.000Z',
): string {
  const contentVal = typeof content === 'string' ? content : content;
  return JSON.stringify({
    type,
    timestamp: ts,
    message: { content: contentVal },
  });
}

function makeToolUseBlock(name: string, input: object = {}) {
  return { type: 'tool_use', id: 'tu_1', name, input };
}

function makeToolResultBlock(toolUseId: string, resultText: string) {
  return { type: 'tool_result', tool_use_id: toolUseId, content: resultText };
}

function makeTextBlock(text: string) {
  return { type: 'text', text };
}

const FAKE_PROJECT = '/fake/project';
// encodeProjectPath: replace all '/' with '-'
const ENCODED = FAKE_PROJECT.replace(/\//g, '-');

function mockSessionFile(lines: string[]) {
  vi.mocked(fs.readFile).mockResolvedValue(lines.join('\n') as unknown as Buffer);
  vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: Date.now(), mtime: new Date(), birthtime: new Date() } as ReturnType<typeof fs.stat> extends Promise<infer T> ? T : never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadClaudeCodeMessages — injection filtering', () => {
  const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('returns empty array when file is not found', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toEqual([]);
  });

  it('passes through normal user messages', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Hello Claude, can you help me?'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('Hello Claude, can you help me?');
  });

  it('filters "Implement the following plan" injection', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Implement the following plan:\n## Task 1\nBuild the API...'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "Implement the plan" variant injection', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Implement the plan as described above. Start with task-1.'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "You are " sub-agent system prompts', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'You are a code reviewer. Analyze the following diff...'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "Please review" cloudy review prompts', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Please review the implementation and check acceptance criteria.'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "Please validate" cloudy validation prompts', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Please validate task-3 against its acceptance criteria.'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "<system>" injections', async () => {
    mockSessionFile([
      makeJsonlLine('user', '<system>\nProject context here.\n</system>'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "This session is being continued" compaction injections', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'This session is being continued from a previous conversation...'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters markdown heading injections (CLAUDE.md system prompts)', async () => {
    mockSessionFile([
      makeJsonlLine('user', '# CLAUDE.md\n\nUse bun not npm. Ports: 47820, 47821.'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters "<context>" sub-agent injections', async () => {
    mockSessionFile([
      makeJsonlLine('user', '<context>\nProject: fitkind\nGoal: ...\n</context>'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters heartbeat monitoring messages', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Heartbeat check on the pipeline. Please confirm all tasks are running.'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters user string messages longer than 2000 chars', async () => {
    const longMessage = 'x'.repeat(2001);
    mockSessionFile([makeJsonlLine('user', longMessage)]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('passes through user messages exactly 2000 chars', async () => {
    const borderMessage = 'Hello '.repeat(333) + 'Hi!'; // ~2001, test just under
    const exactMessage = 'A'.repeat(2000);
    mockSessionFile([makeJsonlLine('user', exactMessage)]);
    // Exactly 2000 chars — filter is > 2000, so this should pass through
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(1);
  });

  it('filters array-form "Implement the following plan" injection', async () => {
    mockSessionFile([
      makeJsonlLine('user', [makeTextBlock('Implement the following plan:\n## Task 1\n...')]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('filters array-form large context injection (> 2000 chars)', async () => {
    const bigText = 'y'.repeat(2001);
    mockSessionFile([
      makeJsonlLine('user', [makeTextBlock(bigText)]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(0);
  });

  it('keeps non-system assistant messages', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [makeTextBlock('I will now implement the feature.')]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
  });

  it('mixes filtered and non-filtered messages', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'Implement the following plan: ...', '2025-01-01T00:00:00.000Z'),
      makeJsonlLine('user', 'What is the capital of France?', '2025-01-01T00:01:00.000Z'),
      makeJsonlLine('assistant', [makeTextBlock('Paris.')], '2025-01-01T00:02:00.000Z'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('What is the capital of France?');
    expect(result[1].role).toBe('assistant');
  });
});

describe('loadClaudeCodeMessages — block extraction', () => {
  const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('extracts text blocks from assistant messages', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [
        makeTextBlock('Step 1: read the file'),
        makeTextBlock(' Step 2: edit it'),
      ]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks).toHaveLength(2);
    expect(result[0].blocks[0].type).toBe('text');
    expect(result[0].blocks[1].type).toBe('text');
  });

  it('extracts tool_use blocks', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [makeToolUseBlock('Read', { file_path: '/src/app.ts' })]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks[0].type).toBe('tool_use');
    expect(result[0].blocks[0].toolName).toBe('Read');
    expect((result[0].blocks[0].toolInput as Record<string, unknown>)?.file_path).toBe('/src/app.ts');
  });

  it('extracts tool_result blocks from user messages', async () => {
    mockSessionFile([
      makeJsonlLine('user', [makeToolResultBlock('tu_1', 'File contents here')]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks[0].type).toBe('tool_result');
    expect(result[0].blocks[0].resultContent).toBe('File contents here');
  });

  it('skips thinking blocks', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [
        { type: 'thinking', thinking: 'Let me think...' },
        makeTextBlock('Here is my answer.'),
      ]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks).toHaveLength(1);
    expect(result[0].blocks[0].type).toBe('text');
  });

  it('skips "[Request interrupted" text blocks', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [
        makeTextBlock('[Request interrupted by user]'),
        makeTextBlock('Continuing after interrupt.'),
      ]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks).toHaveLength(1);
    expect(result[0].blocks[0].text).toBe('Continuing after interrupt.');
  });

  it('replaces image blocks with 📷 Image attached placeholder', async () => {
    mockSessionFile([
      makeJsonlLine('assistant', [{ type: 'image', source: { type: 'base64', data: '...' } }]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks[0].type).toBe('text');
    expect(result[0].blocks[0].text).toBe('📷 Image attached');
  });

  it('merges consecutive assistant JSONL lines into one message', async () => {
    // Claude Code writes each tool call as a separate JSONL line
    mockSessionFile([
      makeJsonlLine('assistant', [makeTextBlock('Reading the file...')], '2025-01-01T00:00:00.000Z'),
      makeJsonlLine('assistant', [makeToolUseBlock('Read', { file_path: '/app.ts' })], '2025-01-01T00:00:01.000Z'),
      makeJsonlLine('assistant', [makeTextBlock('Done.')], '2025-01-01T00:00:02.000Z'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    // All 3 should merge into one assistant message
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].blocks).toHaveLength(3);
  });

  it('merges consecutive user tool_result-only lines into one message', async () => {
    mockSessionFile([
      makeJsonlLine('user', [makeToolResultBlock('tu_1', 'Result A')], '2025-01-01T00:00:00.000Z'),
      makeJsonlLine('user', [makeToolResultBlock('tu_2', 'Result B')], '2025-01-01T00:00:01.000Z'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(1);
    expect(result[0].blocks).toHaveLength(2);
  });

  it('does NOT merge user messages that have real text blocks', async () => {
    mockSessionFile([
      makeJsonlLine('user', 'First real message', '2025-01-01T00:00:00.000Z'),
      makeJsonlLine('user', 'Second real message', '2025-01-01T00:01:00.000Z'),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result).toHaveLength(2);
  });

  it('caps tool_result content at 4000 chars', async () => {
    const bigResult = 'Z'.repeat(5000);
    mockSessionFile([
      makeJsonlLine('user', [makeToolResultBlock('tu_1', bigResult)]),
    ]);
    const result = await loadClaudeCodeMessages(FAKE_PROJECT, SESSION_ID);
    expect(result[0].blocks[0].resultContent).toHaveLength(4000);
  });
});
