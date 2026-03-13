import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventStore } from '../../src/core/event-store.js';
import type { ProjectState, Plan, Task } from '../../src/core/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

let tmpDir: string;

function makeTask(id: string, status: Task['status'] = 'pending'): Task {
  return {
    id,
    title: id,
    description: '',
    acceptanceCriteria: [],
    dependencies: [],
    contextPatterns: [],
    status,
    retries: 0,
    maxRetries: 2,
    ifFailed: 'halt',
    timeout: 3600000,
  };
}

function makePlan(tasks: Task[]): Plan {
  return {
    goal: 'test goal',
    tasks,
    createdAt: '2026-03-13T10:00:00.000Z',
    updatedAt: '2026-03-13T10:00:00.000Z',
  };
}

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    version: 1,
    plan: null,
    config: { ...DEFAULT_CONFIG },
    costSummary: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalEstimatedUsd: 0,
      byPhase: {},
      byModel: {},
    },
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-store-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function eventsFile(): string {
  return path.join(tmpDir, 'events.jsonl');
}

function snapshotFile(): string {
  return path.join(tmpDir, 'events-snapshot.json');
}

describe('EventStore', () => {
  describe('append and getState', () => {
    it('applies plan_created event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1'), makeTask('t2')]);

      await store.append({ type: 'plan_created', payload: { plan } });

      const state = store.getState();
      expect(state.plan).not.toBeNull();
      expect(state.plan!.tasks).toHaveLength(2);
      expect(state.plan!.goal).toBe('test goal');
    });

    it('plan_created resets costs and timestamps', async () => {
      const initial = makeState({
        startedAt: '2026-03-01T10:00:00.000Z',
        completedAt: '2026-03-01T11:00:00.000Z',
        costSummary: {
          totalInputTokens: 500,
          totalOutputTokens: 300,
          totalCacheReadTokens: 100,
          totalCacheWriteTokens: 50,
          totalEstimatedUsd: 7.89,
          byPhase: { execution: 7.89 },
          byModel: { sonnet: 7.89 },
        },
      });
      const store = new EventStore(initial, eventsFile());
      await store.append({ type: 'plan_created', payload: { plan: makePlan([]) } });

      const state = store.getState();
      expect(state.startedAt).toBeUndefined();
      expect(state.completedAt).toBeUndefined();
      expect(state.costSummary.totalEstimatedUsd).toBe(0);
      expect(state.costSummary.totalInputTokens).toBe(0);
    });

    it('applies task_started event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1')]);
      await store.append({ type: 'plan_created', payload: { plan } });
      await store.append({ type: 'task_started', payload: { taskId: 't1' } });

      const state = store.getState();
      expect(state.plan!.tasks[0].status).toBe('in_progress');
      expect(state.plan!.tasks[0].startedAt).toBeDefined();
    });

    it('applies task_completed event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1')]);
      await store.append({ type: 'plan_created', payload: { plan } });
      await store.append({ type: 'task_started', payload: { taskId: 't1' } });
      await store.append({ type: 'task_completed', payload: { taskId: 't1' } });

      const state = store.getState();
      expect(state.plan!.tasks[0].status).toBe('completed');
      expect(state.plan!.tasks[0].completedAt).toBeDefined();
    });

    it('applies task_failed event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1')]);
      await store.append({ type: 'plan_created', payload: { plan } });
      await store.append({ type: 'task_started', payload: { taskId: 't1' } });
      await store.append({ type: 'task_failed', payload: { taskId: 't1', error: 'boom' } });

      const state = store.getState();
      expect(state.plan!.tasks[0].status).toBe('failed');
      expect(state.plan!.tasks[0].error).toBe('boom');
    });

    it('applies config_updated event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({
        type: 'config_updated',
        payload: { config: { maxRetries: 5 } },
      });

      expect(store.getState().config.maxRetries).toBe(5);
    });

    it('applies cost_recorded event', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({
        type: 'cost_recorded',
        payload: {
          phase: 'execution',
          model: 'sonnet',
          usd: 0.50,
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 200,
          cacheWriteTokens: 100,
        },
      });

      const cs = store.getState().costSummary;
      expect(cs.totalEstimatedUsd).toBe(0.50);
      expect(cs.totalInputTokens).toBe(1000);
      expect(cs.totalOutputTokens).toBe(500);
      expect(cs.totalCacheReadTokens).toBe(200);
      expect(cs.totalCacheWriteTokens).toBe(100);
      expect(cs.byPhase.execution).toBe(0.50);
      expect(cs.byModel.sonnet).toBe(0.50);
    });

    it('accumulates multiple cost_recorded events', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({
        type: 'cost_recorded',
        payload: { phase: 'execution', model: 'sonnet', usd: 0.50, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });
      await store.append({
        type: 'cost_recorded',
        payload: { phase: 'validation', model: 'haiku', usd: 0.10, inputTokens: 200, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });

      const cs = store.getState().costSummary;
      expect(cs.totalEstimatedUsd).toBe(0.60);
      expect(cs.totalInputTokens).toBe(1200);
      expect(cs.byPhase.execution).toBe(0.50);
      expect(cs.byPhase.validation).toBe(0.10);
      expect(cs.byModel.sonnet).toBe(0.50);
      expect(cs.byModel.haiku).toBe(0.10);
    });
  });

  describe('getEvents', () => {
    it('returns all appended events', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({ type: 'plan_created', payload: { plan: makePlan([]) } });
      await store.append({ type: 'config_updated', payload: { config: { maxRetries: 3 } } });

      const events = store.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('plan_created');
      expect(events[1].type).toBe('config_updated');
      expect(events[0].id).toBeDefined();
      expect(events[0].timestamp).toBeDefined();
    });
  });

  describe('persistence and replay', () => {
    it('writes events to jsonl file', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({ type: 'plan_created', payload: { plan: makePlan([makeTask('t1')]) } });

      const content = await fs.readFile(eventsFile(), 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.type).toBe('plan_created');
    });

    it('replay rebuilds correct state from events.jsonl', async () => {
      const plan = makePlan([makeTask('t1'), makeTask('t2')]);
      const store1 = new EventStore(makeState(), eventsFile());
      await store1.append({ type: 'plan_created', payload: { plan } });
      await store1.append({ type: 'task_started', payload: { taskId: 't1' } });
      await store1.append({ type: 'task_completed', payload: { taskId: 't1' } });
      await store1.append({
        type: 'cost_recorded',
        payload: { phase: 'execution', model: 'sonnet', usd: 1.0, inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      });

      const store2 = new EventStore(makeState(), eventsFile());
      const rebuilt = await store2.replay();

      expect(rebuilt.plan!.tasks[0].status).toBe('completed');
      expect(rebuilt.plan!.tasks[0].completedAt).toBeDefined();
      expect(rebuilt.plan!.tasks[1].status).toBe('pending');
      expect(rebuilt.costSummary.totalEstimatedUsd).toBe(1.0);
      expect(rebuilt.costSummary.totalInputTokens).toBe(2000);
    });

    it('replay returns initial state when no events file exists', async () => {
      const initial = makeState({ version: 1 });
      const store = new EventStore(initial, eventsFile());
      const state = await store.replay();

      expect(state.plan).toBeNull();
      expect(state.costSummary.totalEstimatedUsd).toBe(0);
    });
  });

  describe('snapshots', () => {
    it('writes snapshot every 50 events', async () => {
      const store = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1')]);
      await store.append({ type: 'plan_created', payload: { plan } });

      for (let i = 1; i < 50; i++) {
        await store.append({
          type: 'cost_recorded',
          payload: { phase: 'execution', model: 'sonnet', usd: 0.01, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        });
      }

      // 50 events total — snapshot should exist
      const snapContent = await fs.readFile(snapshotFile(), 'utf-8');
      const snap = JSON.parse(snapContent);
      expect(snap.eventCount).toBe(50);
      expect(snap.state.costSummary.totalEstimatedUsd).toBeCloseTo(0.49, 2);
    });

    it('does not write snapshot before 50 events', async () => {
      const store = new EventStore(makeState(), eventsFile());
      for (let i = 0; i < 49; i++) {
        await store.append({
          type: 'cost_recorded',
          payload: { phase: 'execution', model: 'sonnet', usd: 0.01, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        });
      }

      let exists = true;
      try {
        await fs.access(snapshotFile());
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });

    it('replay from snapshot + remaining events', async () => {
      const store1 = new EventStore(makeState(), eventsFile());
      const plan = makePlan([makeTask('t1'), makeTask('t2')]);
      await store1.append({ type: 'plan_created', payload: { plan } });

      // Append 49 more cost events to hit 50 total
      for (let i = 1; i < 50; i++) {
        await store1.append({
          type: 'cost_recorded',
          payload: { phase: 'execution', model: 'sonnet', usd: 0.01, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        });
      }

      // Snapshot exists at event 50. Append more events after snapshot.
      await store1.append({ type: 'task_started', payload: { taskId: 't1' } });
      await store1.append({ type: 'task_completed', payload: { taskId: 't1' } });

      // Replay from a fresh store
      const store2 = new EventStore(makeState(), eventsFile());
      const rebuilt = await store2.replay();

      expect(rebuilt.plan!.tasks[0].status).toBe('completed');
      expect(rebuilt.plan!.tasks[1].status).toBe('pending');
      expect(rebuilt.costSummary.totalEstimatedUsd).toBeCloseTo(0.49, 2);
      expect(store2.getEvents()).toHaveLength(52);
    });
  });

  describe('event structure', () => {
    it('events have uuid and ISO timestamp', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({ type: 'plan_created', payload: { plan: makePlan([]) } });

      const event = store.getEvents()[0];
      expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });
  });

  describe('task_started/completed/failed ignore missing tasks gracefully', () => {
    it('does not throw when task not found', async () => {
      const store = new EventStore(makeState(), eventsFile());
      await store.append({ type: 'plan_created', payload: { plan: makePlan([]) } });
      await store.append({ type: 'task_started', payload: { taskId: 'nonexistent' } });
      await store.append({ type: 'task_completed', payload: { taskId: 'nonexistent' } });
      await store.append({ type: 'task_failed', payload: { taskId: 'nonexistent', error: 'x' } });

      expect(store.getEvents()).toHaveLength(4);
    });
  });
});
