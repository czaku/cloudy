import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Socket } from 'node:net';
import type { DashboardCommand, OrchestratorEvent, ProjectState } from '../core/types.js';
import { computeAcceptKey, encodeWebSocketFrame, decodeWebSocketFrame } from './ws-frames.js';
import { STATE_FILE } from '../config/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Dashboard Server ────────────────────────────────────────────────

// ── Run summary type (for /api/runs) ────────────────────────────────

export interface RunSummary {
  name: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  completedTasks: number;
  totalTasks: number;
  costUsd: number;
  startedAt: string | null;
}

async function readRunSummaries(runsDir: string): Promise<RunSummary[]> {
  const summaries: RunSummary[] = [];
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const stateFile = join(runsDir, entry.name, STATE_FILE);
      try {
        const raw = await fs.readFile(stateFile, 'utf-8');
        const state = JSON.parse(raw) as ProjectState;
        const tasks = state.plan?.tasks ?? [];
        const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
        const failedTasks = tasks.filter((t) => t.status === 'failed').length;
        const inProgress = tasks.some((t) => t.status === 'in_progress');
        let status: RunSummary['status'] = 'idle';
        if (state.completedAt) {
          status = failedTasks > 0 ? 'failed' : 'completed';
        } else if (inProgress || state.startedAt) {
          status = 'running';
        }
        summaries.push({
          name: entry.name,
          status,
          completedTasks,
          totalTasks: tasks.length,
          costUsd: state.costSummary?.totalEstimatedUsd ?? 0,
          startedAt: state.startedAt ?? null,
        });
      } catch {
        // No state.json yet or malformed — still include as idle with minimal info
        summaries.push({
          name: entry.name,
          status: 'idle',
          completedTasks: 0,
          totalTasks: 0,
          costUsd: 0,
          startedAt: null,
        });
      }
    }
  } catch {
    // runsDir doesn't exist yet — return empty
  }
  // Sort by startedAt desc (null last)
  summaries.sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return b.startedAt.localeCompare(a.startedAt);
  });
  return summaries;
}

export async function startDashboardServer(
  port: number,
  state: ProjectState,
  options?: {
    onCommand?: (cmd: DashboardCommand) => void;
    getState?: () => ProjectState;
    /** Optional path to .cloudy/runs/ dir — enables /api/runs and /api/switch-run */
    runsDir?: string;
  },
): Promise<{ port: number; broadcast: (event: OrchestratorEvent) => void; waitForClient: (timeoutMs?: number) => Promise<void>; close: () => Promise<void> }> {
  const clients = new Set<Socket>();
  // Track which run dir the WS is currently streaming (can be switched at runtime)
  let currentRunDir: string | null = options?.runsDir ?? null;

  function broadcast(event: OrchestratorEvent): void {
    const frame = encodeWebSocketFrame(JSON.stringify(event));
    for (const socket of clients) {
      if (!socket.destroyed) {
        socket.write(frame);
      } else {
        clients.delete(socket);
      }
    }
  }

  function sendToSocket(socket: Socket, data: unknown): void {
    if (!socket.destroyed) {
      socket.write(encodeWebSocketFrame(JSON.stringify(data)));
    }
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    if (url === '/api/state') {
      const currentState = options?.getState?.() ?? state;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(currentState));
      return;
    }

    if (url === '/api/runs' && req.method === 'GET') {
      const runsDir = options?.runsDir;
      if (!runsDir) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end('[]');
        return;
      }
      readRunSummaries(runsDir).then((summaries) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(summaries));
      }).catch(() => {
        res.writeHead(500);
        res.end('error reading runs');
      });
      return;
    }

    if (url === '/api/switch-run' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { runName } = JSON.parse(body) as { runName: string };
          if (options?.runsDir && runName) {
            currentRunDir = join(options.runsDir, runName);
            // Broadcast a switch notification to all connected clients
            const switchEvent = encodeWebSocketFrame(JSON.stringify({ type: 'run_switched', runName }));
            for (const socket of clients) {
              if (!socket.destroyed) socket.write(switchEvent);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ ok: true, runName }));
        } catch {
          res.writeHead(400);
          res.end('invalid body');
        }
      });
      return;
    }

    if (url === '/bundle.js') {
      try {
        const bundle = readFileSync(join(__dirname, '../../dashboard/bundle.js'));
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        res.end(bundle);
      } catch {
        res.writeHead(404);
        res.end('bundle.js not found — run npm run build:client');
      }
      return;
    }

    if (url === '/bundle.css') {
      try {
        const css = readFileSync(join(__dirname, '../../dashboard/bundle.css'));
        res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' });
        res.end(css);
      } catch {
        // CSS may not exist if there are no CSS imports — serve empty
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('');
      }
      return;
    }

    // Serve dashboard HTML shell for everything else
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });
    res.end(getDashboardHTML());
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(key);
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    socket.write(responseHeaders);
    clients.add(socket);

    // Send initial state after a brief delay to ensure the browser has
    // processed the 101 Switching Protocols response and attached onmessage
    // before the first data frame arrives.
    setTimeout(() => {
      if (!socket.destroyed) {
        const currentState = options?.getState?.() ?? state;
        sendToSocket(socket, { type: 'init', state: currentState });
      }
    }, 50);

    // Handle incoming data (ping/pong, close)
    const MAX_FRAME_BUFFER = 1 * 1024 * 1024; // 1 MB
    let fragmentBuffer = Buffer.alloc(0);
    socket.on('data', (data: Buffer) => {
      fragmentBuffer = Buffer.concat([fragmentBuffer, data]);
      if (fragmentBuffer.length > MAX_FRAME_BUFFER) {
        socket.destroy();
        clients.delete(socket);
        return;
      }

      while (fragmentBuffer.length > 0) {
        const frame = decodeWebSocketFrame(fragmentBuffer);
        if (!frame) break;

        fragmentBuffer = fragmentBuffer.subarray(frame.bytesConsumed);

        if (frame.opcode === 0x08) {
          // Close frame - send close back and end
          const closeFrame = Buffer.alloc(2);
          closeFrame[0] = 0x88;
          closeFrame[1] = 0x00;
          socket.write(closeFrame);
          socket.end();
          clients.delete(socket);
          return;
        }

        if (frame.opcode === 0x01) {
          // Text frame - parse command
          if (options?.onCommand) {
            try {
              const cmd = JSON.parse(frame.payload) as DashboardCommand;
              if (cmd.type === 'start_run' || cmd.type === 'stop_run' || cmd.type === 'approval_response') {
                options.onCommand(cmd);
              }
            } catch {
              // Ignore malformed commands
            }
          }
        }

        if (frame.opcode === 0x09) {
          // Ping - respond with pong
          const pong = Buffer.alloc(2);
          pong[0] = 0x8a; // FIN + pong opcode
          pong[1] = 0x00;
          socket.write(pong);
        }
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port automatically
        server.removeAllListeners('error');
        server.close();
        startDashboardServer(port + 1, state, options).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    server.listen(port, () => {
      const actualPort = (server.address() as { port: number }).port;
      resolve({
        port: actualPort,
        broadcast,
        waitForClient(timeoutMs = 5000): Promise<void> {
          if (clients.size > 0) return Promise.resolve();
          return new Promise((res) => {
            const timer = setTimeout(res, timeoutMs);
            const interval = setInterval(() => {
              if (clients.size > 0) {
                clearTimeout(timer);
                clearInterval(interval);
                res();
              }
            }, 50);
          });
        },
        close(): Promise<void> {
          // Close all open WebSocket connections
          for (const socket of clients) {
            socket.destroy();
          }
          clients.clear();
          return new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });
  });
}


// ── Dashboard HTML ──────────────────────────────────────────────────

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>cloudy</title>
  <link rel="stylesheet" href="/bundle.css"/>
</head>
<body>
  <div id="root"></div>
  <script src="/bundle.js"></script>
</body>
</html>`;
}
