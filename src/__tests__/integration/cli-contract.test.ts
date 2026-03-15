import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../../..');
const BIN_PATH = path.join(ROOT_DIR, 'dist/bin/cloudy.js');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function ensureBuilt(): Promise<void> {
  try {
    await fs.access(BIN_PATH, fsConstants.F_OK);
  } catch {
    await execFileAsync(NPM_CMD, ['run', 'build'], { cwd: ROOT_DIR });
  }
}

function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function withTempCwd<T>(run: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-cli-'));
  try {
    return await run(cwd);
  } finally {
    await fs.rm(cwd, { recursive: true, force: true });
  }
}

async function cloudyDirExists(cwd: string): Promise<boolean> {
  try {
    await fs.access(path.join(cwd, '.cloudy'), fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  await ensureBuilt();
});

describe('CLI contract', () => {
  it('prints root help to stdout with exit code 0 and no side effects', async () => withTempCwd(async (cwd) => {
    const result = await runCli(['--help'], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: cloudy');
    expect(result.stderr).toBe('');
    expect(await cloudyDirExists(cwd)).toBe(false);
  }));

  it('prints the version to stdout with exit code 0 and no side effects', async () => withTempCwd(async (cwd) => {
    const result = await runCli(['--version'], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('0.1.0');
    expect(result.stderr).toBe('');
    expect(await cloudyDirExists(cwd)).toBe(false);
  }));

  it('prints subcommand help without creating project state', async () => withTempCwd(async (cwd) => {
    const result = await runCli(['run', '--help'], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: cloudy run');
    expect(result.stdout).toContain('--build-engine');
    expect(result.stdout).toContain('--plan-engine');
    expect(result.stderr).toBe('');
    expect(await cloudyDirExists(cwd)).toBe(false);
  }));

  it('writes unknown flag errors to stderr and exits non-zero', async () => withTempCwd(async (cwd) => {
    const result = await runCli(['--definitely-not-a-flag'], cwd);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('error: unknown option');
    expect(await cloudyDirExists(cwd)).toBe(false);
  }));
});
