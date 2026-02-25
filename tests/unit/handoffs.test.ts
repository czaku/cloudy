import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => {
  const mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const mockReadFile = vi.fn();
  const mockAppendFile = vi.fn().mockResolvedValue(undefined);
  const mockAccess = vi.fn().mockResolvedValue(undefined);
  const mockMkdir = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      writeFile: mockWriteFile,
      readFile: mockReadFile,
      appendFile: mockAppendFile,
      access: mockAccess,
      mkdir: mockMkdir,
    },
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    appendFile: mockAppendFile,
    access: mockAccess,
    mkdir: mockMkdir,
  };
});

vi.mock('../../src/utils/fs.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

describe('extractLearning', () => {
  it('extracts from explicit LEARNINGS section', async () => {
    const { extractLearning } = await import('../../src/knowledge/handoffs.js');
    const output = `I implemented the auth module.

## LEARNINGS
- Uses bcrypt for password hashing
- JWT tokens expire after 7 days`;

    const result = extractLearning(output);
    expect(result).toContain('bcrypt');
  });

  it('falls back to first meaningful line when no LEARNINGS section', async () => {
    const { extractLearning } = await import('../../src/knowledge/handoffs.js');
    const output = `Created the database schema with PostgreSQL tables for users and sessions.`;
    const result = extractLearning(output);
    expect(result).toContain('PostgreSQL');
  });

  it('returns empty string for empty output', async () => {
    const { extractLearning } = await import('../../src/knowledge/handoffs.js');
    expect(extractLearning('')).toBe('');
  });

  it('handles case-insensitive LEARNINGS header', async () => {
    const { extractLearning } = await import('../../src/knowledge/handoffs.js');
    const output = `Done.\n\n## Learning\n- Uses pnpm workspaces`;
    const result = extractLearning(output);
    expect(result).toContain('pnpm');
  });
});

describe('writeHandoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a markdown file for the task', async () => {
    const fs = await import('node:fs/promises');
    const mockWrite = fs.writeFile as ReturnType<typeof vi.fn>;

    const { writeHandoff } = await import('../../src/knowledge/handoffs.js');
    await writeHandoff('task-1', 'Setup Express', 'Created server on port 3000', [], '/project');

    expect(mockWrite).toHaveBeenCalledOnce();
    const [filePath, content] = mockWrite.mock.calls[0] as [string, string];
    expect(filePath).toContain('task-1.md');
    expect(content).toContain('Setup Express');
    expect(content).toContain('Created server on port 3000');
  });

  it('includes acceptance criteria results', async () => {
    const fs = await import('node:fs/promises');
    const mockWrite = fs.writeFile as ReturnType<typeof vi.fn>;
    mockWrite.mockClear();

    const { writeHandoff } = await import('../../src/knowledge/handoffs.js');
    await writeHandoff(
      'task-2',
      'Auth module',
      'Implemented JWT auth',
      [
        { criterion: 'login endpoint works', passed: true, explanation: 'ok' },
        { criterion: 'refresh tokens work', passed: false, explanation: 'not done' },
      ],
      '/project',
    );

    const [, content] = mockWrite.mock.calls[0] as [string, string];
    expect(content).toContain('✅');
    expect(content).toContain('❌');
  });
});

describe('readHandoffs', () => {
  it('returns formatted section for existing handoff files', async () => {
    const fs = await import('node:fs/promises');
    const mockRead = fs.readFile as ReturnType<typeof vi.fn>;
    mockRead.mockResolvedValue('# Handoff: task-1 — Setup\n\nDid the setup.');

    const { readHandoffs } = await import('../../src/knowledge/handoffs.js');
    const result = await readHandoffs(['task-1'], '/project');

    expect(result).toContain('# Dependency Handoffs');
    expect(result).toContain('task-1');
    expect(result).toContain('Did the setup');
  });

  it('returns empty string when no handoff files exist', async () => {
    const fs = await import('node:fs/promises');
    const mockRead = fs.readFile as ReturnType<typeof vi.fn>;
    mockRead.mockRejectedValue(new Error('ENOENT'));

    const { readHandoffs } = await import('../../src/knowledge/handoffs.js');
    const result = await readHandoffs(['task-1'], '/project');
    expect(result).toBe('');
  });
});

describe('appendLearning', () => {
  it('creates the learnings file if it does not exist', async () => {
    const fs = await import('node:fs/promises');
    const mockAccess = fs.access as ReturnType<typeof vi.fn>;
    const mockAppend = fs.appendFile as ReturnType<typeof vi.fn>;
    const mockWrite = fs.writeFile as ReturnType<typeof vi.fn>;
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockWrite.mockResolvedValue(undefined);
    mockAppend.mockResolvedValue(undefined);

    const { appendLearning } = await import('../../src/knowledge/handoffs.js');
    await appendLearning('task-1', 'Project uses Bun not npm', '/project');

    expect(mockWrite).toHaveBeenCalledWith(
      expect.stringContaining('LEARNINGS.md'),
      expect.stringContaining('# Project Learnings'),
      'utf-8',
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.stringContaining('LEARNINGS.md'),
      expect.stringContaining('[task-1]'),
      'utf-8',
    );
  });
});
