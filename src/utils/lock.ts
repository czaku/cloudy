import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, stat } from 'node:fs/promises';

const LOCKS_DIR = join(homedir(), '.cloudy', 'locks');
const MAX_CONCURRENT = 2;
const MAX_LOCK_AGE_MS = 60 * 60 * 1000; // 1 hour — stale regardless of PID

interface LockInfo {
  pid: number;
  command: string; // 'run' | 'init'
  cwd: string;
  startedAt: string;
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function readActiveLocks(): Promise<{ file: string; info: LockInfo }[]> {
  await mkdir(LOCKS_DIR, { recursive: true });
  const files = await readdir(LOCKS_DIR).catch(() => [] as string[]);
  const active: { file: string; info: LockInfo }[] = [];
  for (const file of files) {
    if (!file.endsWith('.lock')) continue;
    const filePath = join(LOCKS_DIR, file);
    try {
      const [content, fileStat] = await Promise.all([
        readFile(filePath, 'utf-8'),
        stat(filePath),
      ]);
      const info: LockInfo = JSON.parse(content);
      const ageMs = Date.now() - fileStat.mtimeMs;
      const stale = ageMs > MAX_LOCK_AGE_MS || !isAlive(info.pid);
      if (stale) {
        await unlink(filePath).catch(() => {});
      } else {
        active.push({ file, info });
      }
    } catch {
      await unlink(filePath).catch(() => {});
    }
  }
  return active;
}

/**
 * Acquire a global concurrency lock. Returns a release function.
 * Throws if MAX_CONCURRENT slots are already taken.
 */
export async function acquireLock(command: string, cwd: string): Promise<() => void> {
  const active = await readActiveLocks();
  if (active.length >= MAX_CONCURRENT) {
    const lines = active.map(({ info }) => {
      const dir = info.cwd.replace(homedir(), '~');
      return `  · ${info.command}  ${dir}`;
    });
    throw new Error(
      `Max ${MAX_CONCURRENT} concurrent cloudy processes allowed.\n` +
      `Already running:\n${lines.join('\n')}\n\n` +
      `Wait for one to finish (or press q inside its TUI).`,
    );
  }

  const lockFile = join(LOCKS_DIR, `${process.pid}.lock`);
  const info: LockInfo = { pid: process.pid, command, cwd, startedAt: new Date().toISOString() };
  mkdirSync(LOCKS_DIR, { recursive: true });
  writeFileSync(lockFile, JSON.stringify(info));

  const release = () => { try { unlinkSync(lockFile); } catch {} };

  // Clean up on any process exit — exit handler is sync, signals need explicit handlers
  process.on('exit', release);
  process.once('SIGHUP', () => { release(); process.exit(0); });

  return release;
}
