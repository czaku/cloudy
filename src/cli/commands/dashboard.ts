import { Command } from 'commander';
import { loadConfig } from '../../config/config.js';
import { c, bold, dim, cyan, cyanBright } from '../../utils/colors.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAWDASH_DIR } from '../../config/defaults.js';
import type { ProjectState } from '../../core/types.js';

// ── cloudy dashboard ─────────────────────────────────────────────────
//
// Standalone long-lived dashboard server that does NOT require an active run.
// It watches .cloudy/runs/ for run directories and serves them via /api/runs.
// The browser can switch the active streamed run via POST /api/switch-run.
//

function isCloudyLocalInHosts(): boolean {
  try {
    const hosts = readFileSync('/etc/hosts', 'utf-8');
    return hosts.includes('cloudy.local');
  } catch {
    return false;
  }
}

export const dashboardCommand = new Command('dashboard')
  .description('Start a persistent dashboard server (no active run required)')
  .option('--port <n>', 'Dashboard port (default: from config or 3117)', parseInt)
  .action(async (opts: { port?: number }) => {
    const cwd = process.cwd();
    const config = await loadConfig(cwd);
    const port = opts.port ?? config.dashboardPort ?? 3117;

    // We need a minimal ProjectState to bootstrap the server.
    // The server will serve runs from .cloudy/runs/ dynamically.
    const emptyState: ProjectState = {
      version: 1,
      plan: null,
      config,
      costSummary: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalEstimatedUsd: 0,
        byPhase: {},
        byModel: {},
      },
    };

    const { startDashboardServer } = await import('../../dashboard/server.js');

    const dashboard = await startDashboardServer(port, emptyState, {
      getState: () => emptyState,
      runsDir: join(cwd, CLAWDASH_DIR, 'runs'),
      onCommand: () => {},
    });

    const localUrl = `http://localhost:${dashboard.port}`;
    const hasCloudyLocal = isCloudyLocalInHosts();
    const localDomain = hasCloudyLocal ? `http://cloudy.local:${dashboard.port}` : null;

    console.log(`\n${c(cyan, '☁️  dashboard')}  ${c(cyanBright + bold, localUrl)}${localDomain ? `  ${c(dim, localDomain)}` : ''}  ${c(dim, '(cloudy.local)' )}\n`);
    console.log(`  ${c(dim, 'Watching')} ${c(dim, join(cwd, CLAWDASH_DIR, 'runs'))}`);
    console.log(`  ${c(dim, 'Press q or ctrl+c to exit')}\n`);

    import('open').then(({ default: open }) => open(localUrl)).catch(() => {});

    // Keep process alive until signal or 'q'
    await new Promise<void>((resolve) => {
      const cleanup = () => {
        process.removeListener('SIGINT', sigHandler);
        process.removeListener('SIGTERM', sigHandler);
        if (process.stdin.isTTY) {
          try { process.stdin.setRawMode(false); } catch {}
          process.stdin.pause();
          process.stdin.removeListener('data', keyHandler);
        }
        resolve();
      };
      const sigHandler = () => cleanup();
      const keyHandler = (key: Buffer) => {
        const str = key.toString();
        if (str === 'q' || str === 'Q' || str === '\u0003') cleanup();
      };
      process.once('SIGINT', sigHandler);
      process.once('SIGTERM', sigHandler);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', keyHandler);
      }
    });

    await dashboard.close();
  });
