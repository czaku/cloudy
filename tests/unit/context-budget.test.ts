import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// Mock fs/promises to avoid real filesystem access
vi.mock('node:fs/promises', () => {
  const mockStat = vi.fn();
  const mockReaddir = vi.fn();
  const mockReadFile = vi.fn();
  return {
    default: {
      stat: mockStat,
      readdir: mockReaddir,
      readFile: mockReadFile,
    },
    stat: mockStat,
    readdir: mockReaddir,
    readFile: mockReadFile,
  };
});

vi.mock('../../src/utils/logger.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  initLogger: vi.fn(),
}));

describe('resolveContextFiles — token budget', () => {
  let mockFs: {
    stat: ReturnType<typeof vi.fn>;
    readdir: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const fs = await import('node:fs/promises');
    mockFs = {
      stat: fs.stat as ReturnType<typeof vi.fn>,
      readdir: fs.readdir as ReturnType<typeof vi.fn>,
      readFile: fs.readFile as ReturnType<typeof vi.fn>,
    };
    vi.clearAllMocks();
  });

  it('loads all files when budget is 0 (unlimited)', async () => {
    const cwd = '/project';
    const file1 = 'a/b/file1.ts';
    const file2 = 'a/b/file2.ts';
    // ~400 chars = ~100 tokens each
    const content = 'x'.repeat(400);

    mockFs.readdir.mockResolvedValue([file1, file2]);
    mockFs.stat.mockResolvedValue({ isFile: () => true, size: content.length });
    mockFs.readFile.mockResolvedValue(content);

    const { resolveContextFiles } = await import('../../src/executor/context-resolver.js');
    const files = await resolveContextFiles(['a/b/**'], cwd, 0);

    expect(files.length).toBe(2);
  });

  it('stops loading files once budget is exceeded', async () => {
    const cwd = '/project';
    // Each file is ~2000 chars = ~500 tokens
    const content = 'x'.repeat(2000);
    const fileNames = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'];

    mockFs.readdir.mockResolvedValue(fileNames);
    mockFs.stat.mockResolvedValue({ isFile: () => true, size: content.length });
    mockFs.readFile.mockResolvedValue(content);

    const { resolveContextFiles } = await import('../../src/executor/context-resolver.js');
    // Budget of 800 tokens → 800 * 4 = 3200 chars → allows 1 file (2000 chars) but not 2 (4000 chars)
    const files = await resolveContextFiles(['src/**'], cwd, 800);

    expect(files.length).toBe(1);
  });

  it('accumulates chars across multiple files', async () => {
    const cwd = '/project';
    // 3 files of 1000 chars each = 250 tokens each
    const content = 'y'.repeat(1000);
    const fileNames = ['a.ts', 'b.ts', 'c.ts'];

    mockFs.readdir.mockResolvedValue(fileNames);
    mockFs.stat.mockResolvedValue({ isFile: () => true, size: content.length });
    mockFs.readFile.mockResolvedValue(content);

    const { resolveContextFiles } = await import('../../src/executor/context-resolver.js');
    // Budget 600 tokens = 2400 chars → first 2 files (2000 chars), 3rd would push to 3000 chars = 750 tokens > 600
    const files = await resolveContextFiles(['*.ts'], cwd, 600);

    expect(files.length).toBe(2);
  });
});
