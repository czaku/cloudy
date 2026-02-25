import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { isDaemonRunning, writePid, clearPid, readPid } from '../../daemon/pid.js';
import { listProjects, addProject, findProject } from '../../daemon/registry.js';
import { scanForProjects } from '../../daemon/scanner.js';
import { loadGlobalConfig, getGlobalConfigDir } from '../../config/global-config.js';
import { CLAWDASH_DIR, PROJECT_META_FILE, DAEMON_LOG_FILE, DAEMON_DEFAULT_PORT } from '../../config/defaults.js';
import { readJson, writeJson, ensureDir } from '../../utils/fs.js';
import { c, bold, dim, cyan, green, red, yellow } from '../../utils/colors.js';
import type { ProjectMeta } from '../../core/types.js';

const PROJECT_ID_RE = /^[a-z][a-z0-9-]{0,49}$/;

async function checkPortForward(): Promise<boolean> {
  return import('node:fs/promises')
    .then((f) => f.access('/etc/pf.anchors/cloudy').then(() => true))
    .catch(() => false);
}

async function readProjectMeta(cwd: string): Promise<ProjectMeta | null> {
  const metaPath = path.join(cwd, CLAWDASH_DIR, PROJECT_META_FILE);
  return readJson<ProjectMeta>(metaPath);
}

async function writeProjectMeta(cwd: string, meta: ProjectMeta): Promise<void> {
  await ensureDir(path.join(cwd, CLAWDASH_DIR));
  await writeJson(path.join(cwd, CLAWDASH_DIR, PROJECT_META_FILE), meta);
}

async function postToApi(port: number, apiPath: string, body: unknown): Promise<void> {
  const response = await fetch(`http://localhost:${port}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Daemon API error ${response.status}: ${text}`);
  }
}

// ── daemon start ──────────────────────────────────────────────────────

const startCommand = new Command('start')
  .description('Start the cloudy daemon in the background')
  .option('--port <n>', 'Port to listen on (saved to global config)', parseInt)
  .option('--boot', 'Install launchd plist so daemon starts on login (macOS only)')
  .action(async (opts: { port?: number; boot?: boolean }) => {
    if (await isDaemonRunning()) {
      const pid = await readPid();
      console.log(c(yellow, `⚠️  Daemon already running (PID ${pid})`));
      return;
    }

    const globalCfg = await loadGlobalConfig().catch(() => null);
    const port = opts.port ?? globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;

    // Persist custom port to global config so all other commands pick it up
    if (opts.port && opts.port !== globalCfg?.daemonPort) {
      const gc = await import('../../config/global-config.js');
      const full = await gc.loadGlobalConfig();
      await gc.saveGlobalConfig({ ...full, daemonPort: opts.port });
    }

    // Spawn the daemon serve process detached
    const cloudyBin = process.argv[1];
    const logFile = path.join(getGlobalConfigDir(), DAEMON_LOG_FILE);
    await ensureDir(getGlobalConfigDir());

    const logFd = await fs.open(logFile, 'a');
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [cloudyBin, 'daemon', '_serve', '--port', String(port)], {
      detached: true,
      stdio: ['ignore', logFd.fd, logFd.fd],
    });
    child.unref();
    await logFd.close();

    // Wait briefly for it to start then check
    await new Promise((r) => setTimeout(r, 800));

    if (await isDaemonRunning()) {
      const pfActive = await checkPortForward();
      console.log(c(green, `✅  Daemon started on port ${port}  (PID ${child.pid})`));
      if (pfActive) {
        console.log(c(dim, `    http://cloudy.local  ·  http://localhost:${port}`));
      } else {
        console.log(c(dim, `    http://localhost:${port}  (run: cloudy setup  to enable cloudy.local)`));
      }
      console.log(c(dim, `    Log: ${logFile}`));
    } else {
      console.log(c(red, `✖  Daemon may have failed to start — check log: ${logFile}`));
    }

    if (opts.boot && process.platform === 'darwin') {
      await installLaunchd(port, cloudyBin);
      const { trySetupPortForward } = await import('./setup.js');
      await trySetupPortForward(port);
    }
  });

async function installLaunchd(port: number, cloudyBin: string): Promise<void> {
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.cloudy.daemon.plist');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cloudy.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${cloudyBin}</string>
    <string>daemon</string>
    <string>_serve</string>
    <string>--port</string>
    <string>${port}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${path.join(getGlobalConfigDir(), DAEMON_LOG_FILE)}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(getGlobalConfigDir(), DAEMON_LOG_FILE)}</string>
</dict>
</plist>`;
  try {
    await ensureDir(path.dirname(plistPath));
    await fs.writeFile(plistPath, plist, 'utf-8');
    console.log(c(green, `✅  launchd plist installed: ${plistPath}`));
    console.log(c(dim, `    Run: launchctl load ${plistPath}`));
  } catch (err) {
    console.log(c(yellow, `⚠️  Could not write plist: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ── daemon stop ───────────────────────────────────────────────────────

const stopCommand = new Command('stop')
  .description('Stop the running cloudy daemon')
  .option('--boot', 'Also uninstall launchd plist (macOS only)')
  .action(async (opts: { boot?: boolean }) => {
    const pid = await readPid();
    if (!pid) {
      console.log(c(dim, 'Daemon is not running.'));
      return;
    }
    try {
      process.kill(pid, 'SIGTERM');
      await clearPid();
      console.log(c(green, `✅  Daemon stopped (PID ${pid})`));
    } catch {
      await clearPid();
      console.log(c(yellow, '⚠️  Daemon process not found — PID file cleaned up'));
    }

    if (opts.boot && process.platform === 'darwin') {
      const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.cloudy.daemon.plist');
      try {
        await fs.unlink(plistPath);
        console.log(c(green, `✅  launchd plist removed`));
      } catch { /* already gone */ }
    }
  });

// ── daemon status ─────────────────────────────────────────────────────

const statusCommand = new Command('status')
  .description('Show daemon status and registered projects')
  .action(async () => {
    const running = await isDaemonRunning();
    const pid = await readPid();
    const globalCfg = await loadGlobalConfig().catch(() => null);
    const port = globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;

    if (running) {
      const pfActive = await checkPortForward();
      console.log(`${c(green, '●')}  ${c(green + bold, 'daemon running')}  PID ${pid}  port ${port}`);
      if (pfActive) {
        console.log(`   ${c(green + bold, 'http://cloudy.local')}  ${c(dim, `· http://localhost:${port}`)}`);
      } else {
        console.log(`   http://localhost:${port}  ${c(dim, '(run: cloudy setup  to enable cloudy.local)')}`);
      }
    } else {
      console.log(`${c(dim, '○')}  daemon stopped`);
    }

    const projects = await listProjects().catch(() => [] as ProjectMeta[]);
    if (projects.length === 0) {
      console.log(c(dim, '\n   No projects registered. Run: cloudy daemon register'));
    } else {
      console.log(`\n${c(bold, `${projects.length} registered project${projects.length !== 1 ? 's' : ''}:`)}`);
      for (const proj of projects) {
        console.log(`   ${c(cyan, proj.id.padEnd(20))}  ${proj.name.padEnd(25)}  ${c(dim, proj.path)}`);
      }
    }
  });

// ── daemon register ───────────────────────────────────────────────────

const registerCommand = new Command('register')
  .description('Register this project with the daemon')
  .action(async () => {
    const cwd = process.cwd();
    const existing = await readProjectMeta(cwd);

    let id = existing?.id ?? '';
    let name = existing?.name ?? path.basename(cwd);

    if (!existing) {
      p.intro(`${c(cyan + bold, '☁️  cloudy daemon register')}  ${c(dim, cwd)}`);

      const idInput = await p.text({
        message: 'Project ID (lowercase slug):',
        placeholder: path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        validate: (v) => PROJECT_ID_RE.test(v ?? '') ? undefined : 'Must be lowercase letters, numbers, hyphens (e.g. my-project)',
      });
      if (p.isCancel(idInput)) { p.cancel('Cancelled.'); process.exit(0); }
      id = idInput as string;

      const nameInput = await p.text({
        message: 'Project display name:',
        placeholder: path.basename(cwd),
        validate: (v) => (v ?? '').trim() ? undefined : 'Name required',
      });
      if (p.isCancel(nameInput)) { p.cancel('Cancelled.'); process.exit(0); }
      name = (nameInput as string).trim();
    }

    const meta: ProjectMeta = {
      id,
      name,
      path: cwd,
      registeredAt: new Date().toISOString(),
    };

    await writeProjectMeta(cwd, meta);
    await addProject(meta);

    // Also notify daemon if running
    const running = await isDaemonRunning();
    if (running) {
      const globalCfg = await loadGlobalConfig().catch(() => null);
      const port = globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;
      await postToApi(port, '/api/projects/register', meta).catch(() => {});
      console.log(c(green, `✅  Registered "${name}" (${id}) — visible in daemon dashboard`));
    } else {
      console.log(c(green, `✅  Registered "${name}" (${id})`));
      console.log(c(dim, '   Start the daemon: cloudy daemon start'));
    }
  });

// ── daemon scan ───────────────────────────────────────────────────────

const scanCommand = new Command('scan')
  .description('Scan configured paths for cloudy projects and register new ones')
  .action(async () => {
    const globalCfg = await loadGlobalConfig().catch(() => null);
    const scanPaths = globalCfg?.scanPaths ?? ['~/dev', '~/projects'];

    console.log(`${c(cyan, '🔍')}  Scanning: ${scanPaths.join(', ')}`);
    const found = await scanForProjects(scanPaths);

    if (found.length === 0) {
      console.log(c(dim, 'No projects found.'));
      return;
    }

    const existing = await listProjects().catch(() => [] as ProjectMeta[]);
    const existingIds = new Set(existing.map((proj) => proj.id));
    const newProjects = found.filter((proj) => !existingIds.has(proj.id));

    console.log(`\nFound ${found.length} project(s), ${newProjects.length} new:`);
    for (const proj of found) {
      const isNew = !existingIds.has(proj.id);
      const marker = isNew ? c(green, '+') : c(dim, '·');
      console.log(`  ${marker}  ${proj.id.padEnd(20)}  ${c(dim, proj.path)}`);
    }

    if (newProjects.length > 0) {
      for (const proj of newProjects) {
        await addProject(proj);
      }
      console.log(c(green, `\n✅  Registered ${newProjects.length} new project(s)`));
    }
  });

// ── daemon open ───────────────────────────────────────────────────────

const openCommand = new Command('open')
  .description('Open the cloudy daemon dashboard in the browser')
  .action(async () => {
    const globalCfg = await loadGlobalConfig().catch(() => null);
    const port = globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;
    const pfActive = await checkPortForward();
    const friendlyUrl = pfActive ? 'http://cloudy.local' : `http://localhost:${port}`;
    const techUrl = `http://localhost:${port}`;

    const running = await isDaemonRunning();
    if (!running) {
      console.log(c(yellow, '⚠️  Daemon is not running. Start it with: cloudy daemon start'));
      return;
    }

    console.log(`${c(cyan, '🌐')}  ${friendlyUrl}  ${pfActive ? c(dim, `· ${techUrl}`) : ''}`);
    const { default: open } = await import('open');
    await open(friendlyUrl).catch(() => {
      console.log(c(dim, `   Could not open browser. Visit: ${friendlyUrl}  (or ${techUrl})`));
    });
  });

// ── daemon _serve (hidden, used by daemon start internally) ───────────

const serveCommand = new Command('_serve')
  .description('Start the daemon HTTP server (internal — use `cloudy daemon start` instead)')
  .option('--port <n>', 'Port to listen on', parseInt)
  .helpOption(false)
  .action(async (opts: { port?: number }) => {
    const globalCfg = await loadGlobalConfig().catch(() => null);
    const port = opts.port ?? globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;

    await writePid(process.pid);

    process.on('SIGTERM', async () => {
      await clearPid();
      process.exit(0);
    });
    process.on('SIGINT', async () => {
      await clearPid();
      process.exit(0);
    });

    const { startDaemonServer, startStatusBroadcast } = await import('../../daemon/server.js');

    // Find the dist/dashboard directory relative to this script
    const scriptDir = path.dirname(process.argv[1]);
    const bundleDir = path.join(scriptDir, '..', 'dashboard');

    await startDaemonServer(port, bundleDir);
    startStatusBroadcast(5000);

    console.log(`[cloudy daemon] listening on port ${port}`);
  });

// ── Main daemon command ────────────────────────────────────────────────

export const daemonCommand = new Command('daemon')
  .description('Manage the cloudy daemon (multi-project background server)');

daemonCommand.addCommand(startCommand);
daemonCommand.addCommand(stopCommand);
daemonCommand.addCommand(statusCommand);
daemonCommand.addCommand(registerCommand);
daemonCommand.addCommand(scanCommand);
daemonCommand.addCommand(openCommand);
daemonCommand.addCommand(serveCommand);

// ── Auto-register helper (used by run/init) ───────────────────────────

export async function autoRegisterWithDaemon(cwd: string): Promise<void> {
  if (!(await isDaemonRunning())) return;

  // Check if already registered
  await findProject(path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-')).catch(() => undefined);

  const metaPath = path.join(cwd, CLAWDASH_DIR, PROJECT_META_FILE);
  const meta = await readJson<ProjectMeta>(metaPath).catch(() => null);
  if (!meta) return; // No project.json means not configured for daemon

  const globalCfg = await loadGlobalConfig().catch(() => null);
  const port = globalCfg?.daemonPort ?? DAEMON_DEFAULT_PORT;

  await postToApi(port, '/api/projects/register', { ...meta, path: cwd }).catch(() => {});
}
