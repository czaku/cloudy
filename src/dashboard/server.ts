import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Socket } from 'node:net';
import type { DashboardCommand, OrchestratorEvent, ProjectState } from '../core/types.js';
import { computeAcceptKey, encodeWebSocketFrame, decodeWebSocketFrame } from './ws-frames.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Dashboard Server ────────────────────────────────────────────────

export async function startDashboardServer(
  port: number,
  state: ProjectState,
  options?: {
    onCommand?: (cmd: DashboardCommand) => void;
    getState?: () => ProjectState;
  },
): Promise<{ port: number; broadcast: (event: OrchestratorEvent) => void; waitForClient: (timeoutMs?: number) => Promise<void>; close: () => Promise<void> }> {
  const clients = new Set<Socket>();

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
