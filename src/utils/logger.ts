import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR, LOGS_DIR, TASK_LOGS_DIR } from '../config/defaults.js';
import { appendFile, ensureDir } from './fs.js';
import { getCurrentRunDir } from './run-dir.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const TASK_LOG_MAX_BYTES = 1_048_576; // 1 MB

let currentLevel: LogLevel = 'info';
let logDir: string | null = null;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export async function initLogger(cwd: string): Promise<void> {
  // Use run dir if available, otherwise fall back to .cloudy/ root (legacy / pre-init)
  const runDir = await getCurrentRunDir(cwd);
  logDir = path.join(runDir, LOGS_DIR);
  await ensureDir(path.join(runDir, TASK_LOGS_DIR));
}

function formatMessage(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}\n`;
}

async function writeLog(level: LogLevel, message: string): Promise<void> {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;

  const formatted = formatMessage(level, message);

  if (logDir) {
    await appendFile(path.join(logDir, 'cloudy.log'), formatted);
  }
}

/**
 * Rotate a log file if it exceeds TASK_LOG_MAX_BYTES.
 * Renames current file to {name}.log.1, then starts fresh.
 */
async function rotateIfNeeded(logPath: string): Promise<void> {
  try {
    const stat = await fs.stat(logPath);
    if (stat.size >= TASK_LOG_MAX_BYTES) {
      await fs.rename(logPath, `${logPath}.1`).catch(() => {});
    }
  } catch {
    // File doesn't exist yet — nothing to rotate
  }
}

export async function logTaskOutput(
  taskId: string,
  content: string,
  cwd: string,
): Promise<void> {
  const runDir = await getCurrentRunDir(cwd);
  const taskLogPath = path.join(runDir, TASK_LOGS_DIR, `${taskId}.log`);
  await rotateIfNeeded(taskLogPath);
  await appendFile(taskLogPath, content);
}

export const log = {
  debug: (msg: string) => writeLog('debug', msg),
  info: (msg: string) => writeLog('info', msg),
  warn: (msg: string) => writeLog('warn', msg),
  error: (msg: string) => writeLog('error', msg),
};

// Keep backward-compatible: if nothing used initLogger yet, use .cloudy/logs/ fallback
export function getLogDir(cwd: string): string {
  return logDir ?? path.join(cwd, CLAWDASH_DIR, LOGS_DIR);
}
