import { useEffect, useRef, useCallback } from 'react';
import type { OrchestratorEvent } from '../types';

type Dispatch = (event: OrchestratorEvent) => void;

interface SendCommand {
  (type: 'start_run' | 'stop_run'): void;
  (type: 'approval_response', payload: { taskId: string; action: string; hint?: string }): void;
}

export function useWebSocket(
  dispatch: Dispatch,
  onConnected: (connected: boolean) => void,
): { sendCommand: SendCommand } {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dispatchRef = useRef(dispatch);
  const onConnectedRef = useRef(onConnected);

  dispatchRef.current = dispatch;
  onConnectedRef.current = onConnected;

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      onConnectedRef.current(true);
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onclose = () => {
      onConnectedRef.current(false);
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setInterval(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as OrchestratorEvent;
        dispatchRef.current(event);
      } catch {
        // ignore malformed frames
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendCommand = useCallback<SendCommand>(
    (type: string, payload?: { taskId: string; action: string; hint?: string }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type, ...payload }));
      }
    },
    [],
  ) as SendCommand;

  return { sendCommand };
}
