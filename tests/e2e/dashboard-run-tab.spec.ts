import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const DAEMON_PORT = 1512;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/projects`);
      if (res.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

test.describe('dashboard run tab', () => {
  let tempDir = '';
  let homeDir = '';
  let projectDir = '';
  let daemon: ChildProcess | null = null;

  test.beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudy-dashboard-e2e-'));
    homeDir = path.join(tempDir, 'home');
    projectDir = path.join(tempDir, 'demo-project');
    await fs.mkdir(path.join(homeDir, '.cloudy'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.cloudy'), { recursive: true });

    await fs.writeFile(
      path.join(projectDir, '.cloudy', 'config.json'),
      JSON.stringify(
        {
          models: {
            plan: 'sonnet',
            build: 'sonnet',
            taskReview: 'haiku',
            runReview: 'opus',
          },
          dashboard: true,
          dashboardPort: DAEMON_PORT,
          buildEngine: 'claude-code',
          buildProvider: 'claude',
          buildAccount: 'claude-main',
          planRuntime: {
            engine: 'claude-code',
            provider: 'claude',
            account: 'claude-main',
          },
          taskReviewRuntime: {
            engine: 'claude-code',
            provider: 'claude',
            account: 'claude-main',
          },
          runReviewRuntime: {
            engine: 'claude-code',
            provider: 'claude',
            account: 'claude-main',
          },
        },
        null,
        2,
      ),
    );

    await fs.writeFile(
      path.join(homeDir, '.cloudy', 'projects.json'),
      JSON.stringify(
        [
          {
            id: 'demo',
            name: 'Demo',
            path: projectDir,
            registeredAt: new Date().toISOString(),
          },
        ],
        null,
        2,
      ),
    );

    daemon = spawn(
      'node',
      ['dist/bin/cloudy.js', 'daemon', '_serve', '--port', String(DAEMON_PORT)],
      {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          HOME: homeDir,
        },
        stdio: 'ignore',
      },
    );

    await waitForServer(DAEMON_URL, 20_000);
  });

  test.afterAll(async () => {
    if (daemon && !daemon.killed) {
      daemon.kill('SIGTERM');
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('renders the run tab without crashing', async ({ page }) => {
    await page.goto(`${DAEMON_URL}/#/demo/run`);
    await page.locator('.daemon-tabs').waitFor();

    await expect(page.getByText('run tab crashed')).toHaveCount(0);
    await page.getByText('Advanced options').click();
    await expect(page.getByText('Build route')).toBeVisible();
    await expect(page.getByText('Task-review route')).toBeVisible();
    await expect(page.getByText('Run-review route')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Engine' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Provider' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Account' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Model ID' }).first()).toBeVisible();
  });
});
