import path from 'node:path';
import fs from 'node:fs/promises';
import { getGlobalConfigDir } from '../config/global-config.js';
import { DAEMON_PID_FILE } from '../config/defaults.js';
import { ensureDir } from '../utils/fs.js';

function getPidPath(): string {
  return path.join(getGlobalConfigDir(), DAEMON_PID_FILE);
}

export async function writePid(pid: number): Promise<void> {
  await ensureDir(getGlobalConfigDir());
  await fs.writeFile(getPidPath(), String(pid), 'utf-8');
}

export async function readPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getPidPath(), 'utf-8');
    const pid = parseInt(raw.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function clearPid(): Promise<void> {
  try {
    await fs.unlink(getPidPath());
  } catch {
    // Already gone — fine
  }
}

export async function isDaemonRunning(): Promise<boolean> {
  const pid = await readPid();
  if (pid === null) return false;
  try {
    process.kill(pid, 0); // Signal 0: just checks if process exists
    return true;
  } catch {
    // ESRCH = no such process
    await clearPid();
    return false;
  }
}
