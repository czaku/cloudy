import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NotifyOpts } from '../../src/notifications/notify.js';

// Mock execa before importing the module under test
vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({}),
}));

describe('notifyRunComplete', () => {
  let mockExeca: ReturnType<typeof vi.fn>;
  let mockStdoutWrite: ReturnType<typeof vi.fn>;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    mockExeca.mockClear();

    mockStdoutWrite = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(mockStdoutWrite);

    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  function setPlatform(p: string) {
    Object.defineProperty(process, 'platform', { value: p, configurable: true });
  }

  it('writes bell character when sound is enabled', async () => {
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: true };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockStdoutWrite).toHaveBeenCalledWith('\x07');
  });

  it('does not write bell when sound is disabled', async () => {
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: false };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockStdoutWrite).not.toHaveBeenCalledWith('\x07');
  });

  it('calls afplay on macOS when sound is enabled', async () => {
    setPlatform('darwin');
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: true };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockExeca).toHaveBeenCalledWith('afplay', ['/System/Library/Sounds/Blow.aiff']);
  });

  it('does not call afplay on non-macOS', async () => {
    setPlatform('linux');
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: true };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockExeca).not.toHaveBeenCalledWith('afplay', expect.anything());
  });

  it('calls osascript on macOS when desktop notifications enabled', async () => {
    setPlatform('darwin');
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: true, sound: false };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockExeca).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining(['-e', expect.stringContaining('display notification')]),
    );
    const callArgs = mockExeca.mock.calls.find((c: unknown[]) => c[0] === 'osascript');
    expect(callArgs?.[1]?.[1]).toContain('☁️ cloudy');
  });

  it('does not call osascript when desktop is disabled', async () => {
    setPlatform('darwin');
    const { notifyRunComplete } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: false };

    await notifyRunComplete(3, 0.0089, opts);

    expect(mockExeca).not.toHaveBeenCalledWith('osascript', expect.anything());
  });
});

describe('notifyRunFailed', () => {
  let mockExeca: ReturnType<typeof vi.fn>;
  let mockStdoutWrite: ReturnType<typeof vi.fn>;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa as ReturnType<typeof vi.fn>;
    mockExeca.mockClear();

    mockStdoutWrite = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(mockStdoutWrite);

    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  function setPlatform(p: string) {
    Object.defineProperty(process, 'platform', { value: p, configurable: true });
  }

  it('writes bell on failure with sound enabled', async () => {
    const { notifyRunFailed } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: false, sound: true };

    await notifyRunFailed('Something went wrong', opts);

    expect(mockStdoutWrite).toHaveBeenCalledWith('\x07');
  });

  it('includes error text in osascript notification', async () => {
    setPlatform('darwin');
    const { notifyRunFailed } = await import('../../src/notifications/notify.js');
    const opts: NotifyOpts = { desktop: true, sound: false };

    await notifyRunFailed('Build failed', opts);

    const callArgs = mockExeca.mock.calls.find((c: unknown[]) => c[0] === 'osascript');
    expect(callArgs?.[1]?.[1]).toContain('Build failed');
  });
});
