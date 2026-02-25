import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => {
  const mockStat = vi.fn();
  const mockRename = vi.fn().mockResolvedValue(undefined);
  const mockAppendFile = vi.fn().mockResolvedValue(undefined);
  const mockMkdir = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      stat: mockStat,
      rename: mockRename,
      appendFile: mockAppendFile,
      mkdir: mockMkdir,
    },
    stat: mockStat,
    rename: mockRename,
    appendFile: mockAppendFile,
    mkdir: mockMkdir,
  };
});

vi.mock('../../src/utils/fs.js', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

describe('logTaskOutput — log rotation', () => {
  let mockFsStat: ReturnType<typeof vi.fn>;
  let mockFsRename: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const fs = await import('node:fs/promises');
    mockFsStat = fs.stat as ReturnType<typeof vi.fn>;
    mockFsRename = fs.rename as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
    mockFsRename.mockResolvedValue(undefined);
  });

  it('renames log file when it exceeds 1MB', async () => {
    mockFsStat.mockResolvedValue({ size: 1_100_000 }); // over 1MB

    const { logTaskOutput } = await import('../../src/utils/logger.js');
    await logTaskOutput('task-1', 'some output', '/project');

    expect(mockFsRename).toHaveBeenCalledWith(
      expect.stringContaining('task-1.log'),
      expect.stringContaining('task-1.log.1'),
    );
  });

  it('does not rename when file is under 1MB', async () => {
    mockFsStat.mockResolvedValue({ size: 500_000 }); // under 1MB

    const { logTaskOutput } = await import('../../src/utils/logger.js');
    await logTaskOutput('task-2', 'some output', '/project');

    expect(mockFsRename).not.toHaveBeenCalled();
  });

  it('does not throw when log file does not exist yet', async () => {
    mockFsStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const { logTaskOutput } = await import('../../src/utils/logger.js');
    await expect(logTaskOutput('task-3', 'first line', '/project')).resolves.not.toThrow();
    expect(mockFsRename).not.toHaveBeenCalled();
  });

  it('rotates at exactly 1MB (boundary)', async () => {
    mockFsStat.mockResolvedValue({ size: 1_048_576 }); // exactly 1MB

    const { logTaskOutput } = await import('../../src/utils/logger.js');
    await logTaskOutput('task-4', 'content', '/project');

    expect(mockFsRename).toHaveBeenCalled();
  });
});
