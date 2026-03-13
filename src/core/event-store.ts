import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import type { ProjectState, Plan, CostSummary } from './types.js';
import { ensureDir } from '../utils/fs.js';

export type EventType =
  | 'plan_created'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'config_updated'
  | 'cost_recorded';

export interface StateEvent {
  id: string;
  type: EventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface Snapshot {
  state: ProjectState;
  eventCount: number;
}

const SNAPSHOT_INTERVAL = 50;

function emptyCostSummary(): CostSummary {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    totalEstimatedUsd: 0,
    byPhase: {},
    byModel: {},
  };
}

function applyEvent(state: ProjectState, event: StateEvent): void {
  switch (event.type) {
    case 'plan_created': {
      state.plan = event.payload.plan as Plan;
      state.startedAt = undefined;
      state.completedAt = undefined;
      state.costSummary = emptyCostSummary();
      break;
    }
    case 'task_started': {
      const taskId = event.payload.taskId as string;
      const task = state.plan?.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'in_progress';
        task.startedAt = event.timestamp;
      }
      break;
    }
    case 'task_completed': {
      const taskId = event.payload.taskId as string;
      const task = state.plan?.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'completed';
        task.completedAt = event.timestamp;
      }
      break;
    }
    case 'task_failed': {
      const taskId = event.payload.taskId as string;
      const error = event.payload.error as string;
      const task = state.plan?.tasks.find((t) => t.id === taskId);
      if (task) {
        task.status = 'failed';
        task.error = error;
      }
      break;
    }
    case 'config_updated': {
      const updates = event.payload.config as Partial<ProjectState['config']>;
      state.config = { ...state.config, ...updates };
      break;
    }
    case 'cost_recorded': {
      const { phase, model, usd, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } =
        event.payload as {
          phase: string;
          model: string;
          usd: number;
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheWriteTokens: number;
        };
      const cs = state.costSummary;
      cs.totalInputTokens += inputTokens;
      cs.totalOutputTokens += outputTokens;
      cs.totalCacheReadTokens += cacheReadTokens;
      cs.totalCacheWriteTokens += cacheWriteTokens;
      cs.totalEstimatedUsd += usd;
      cs.byPhase[phase] = (cs.byPhase[phase] ?? 0) + usd;
      cs.byModel[model] = (cs.byModel[model] ?? 0) + usd;
      break;
    }
  }
}

function snapshotPath(eventsPath: string): string {
  return path.join(path.dirname(eventsPath), 'events-snapshot.json');
}

export class EventStore {
  private events: StateEvent[] = [];
  private state: ProjectState;
  private eventsPath: string;

  constructor(initialState: ProjectState, eventsPath: string) {
    this.state = structuredClone(initialState);
    this.eventsPath = eventsPath;
  }

  async append(event: Omit<StateEvent, 'id' | 'timestamp'>): Promise<void> {
    const full: StateEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.events.push(full);
    await ensureDir(path.dirname(this.eventsPath));
    await fs.appendFile(this.eventsPath, JSON.stringify(full) + '\n', 'utf-8');
    applyEvent(this.state, full);

    if (this.events.length % SNAPSHOT_INTERVAL === 0) {
      await this.writeSnapshot();
    }
  }

  async replay(): Promise<ProjectState> {
    const snapFile = snapshotPath(this.eventsPath);
    let snapshot: Snapshot | null = null;
    let startIndex = 0;

    try {
      const snapContent = await fs.readFile(snapFile, 'utf-8');
      snapshot = JSON.parse(snapContent) as Snapshot;
    } catch {
      // No snapshot
    }

    let lines: string[];
    try {
      const content = await fs.readFile(this.eventsPath, 'utf-8');
      lines = content.trim().split('\n').filter(Boolean);
    } catch {
      lines = [];
    }

    if (snapshot && snapshot.eventCount <= lines.length) {
      this.state = snapshot.state;
      startIndex = snapshot.eventCount;
    }

    this.events = [];
    for (const line of lines) {
      this.events.push(JSON.parse(line) as StateEvent);
    }

    for (let i = startIndex; i < this.events.length; i++) {
      applyEvent(this.state, this.events[i]);
    }

    return this.state;
  }

  getState(): ProjectState {
    return this.state;
  }

  getEvents(): readonly StateEvent[] {
    return this.events;
  }

  private async writeSnapshot(): Promise<void> {
    const snap: Snapshot = {
      state: structuredClone(this.state),
      eventCount: this.events.length,
    };
    const snapFile = snapshotPath(this.eventsPath);
    await ensureDir(path.dirname(snapFile));
    await fs.writeFile(snapFile, JSON.stringify(snap, null, 2) + '\n', 'utf-8');
  }
}
