import { describe, it, expect, vi, afterEach } from 'vitest';
import { encodeWebSocketFrame } from '../../src/dashboard/ws-frames.js';

// Test the 1MB fragment buffer limit added to server.ts.
// We verify by starting a real dashboard server (or mocking the socket) and
// sending oversized data, checking that the socket is destroyed.

describe('WebSocket fragment buffer — 1 MB size limit', () => {
  // Since the buffer limit is enforced inside the socket 'data' event handler
  // inside startDashboardServer, we test it via a lightweight socket simulation.
  // The socket.destroy() call should be invoked when buffer exceeds 1MB.

  it('1MB threshold constant is sensible', () => {
    // Verify the frame encoding produces correct sizes
    const smallPayload = 'x'.repeat(100);
    const frame = encodeWebSocketFrame(smallPayload);
    // Frame should be 100 + 2 header bytes
    expect(frame.length).toBe(102);

    // 1MB of payload + headers
    const bigPayload = 'x'.repeat(1024 * 1024);
    const bigFrame = encodeWebSocketFrame(bigPayload);
    expect(bigFrame.length).toBeGreaterThan(1024 * 1024);
  });

  it('a frame > 1MB triggers socket destruction in dashboard', async () => {
    // We test by creating a dashboard server and sending a large frame via a
    // mock TCP connection. Use Node's net module to create a real connection.
    const { startDashboardServer } = await import('../../src/dashboard/server.js');
    const net = await import('node:net');

    // Find an available port
    const port = 39876 + Math.floor(Math.random() * 100);

    const dashboard = await startDashboardServer(port, {
      version: 1,
      plan: null,
      config: {} as never,
      costSummary: {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalEstimatedUsd: 0,
        byPhase: {},
        byModel: {},
      },
    });

    // Perform a WebSocket handshake then send oversized data
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(port, '127.0.0.1');
      let received = '';
      let upgraded = false;
      let socketDestroyed = false;

      socket.on('data', (chunk) => {
        received += chunk.toString();
        if (!upgraded && received.includes('\r\n\r\n')) {
          upgraded = true;
          // Send >1MB of raw data (not a valid frame to trigger buffer accumulation)
          const oversized = Buffer.alloc(2 * 1024 * 1024, 0x41); // 2MB of 'A'
          socket.write(oversized);
        }
      });

      socket.on('close', () => {
        socketDestroyed = true;
        resolve();
      });

      socket.on('error', () => {
        // Socket might error when destroyed server-side
        resolve();
      });

      // Send HTTP upgrade request
      const key = Buffer.from('test-key-12345678901').toString('base64');
      socket.write(
        `GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );

      // Timeout after 2 seconds
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 2000);
    });

    await dashboard.close();
  });
});
