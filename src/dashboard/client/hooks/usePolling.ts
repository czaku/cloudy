import { useEffect, useRef } from 'react';
import type { OrchestratorEvent } from '../types';

type Dispatch = (event: OrchestratorEvent) => void;

export function usePolling(dispatch: Dispatch, intervalMs = 2000): void {
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    let active = true;

    async function poll() {
      if (!active) return;
      try {
        const res = await fetch('/api/state');
        if (res.ok && active) {
          const state = await res.json();
          dispatchRef.current({ type: 'init', state });
        }
      } catch {
        // ignore network errors
      }
    }

    // Immediate first poll
    void poll();

    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);
}
