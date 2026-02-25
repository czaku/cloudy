import { useState, useCallback } from 'react';
import type {
  CostSummary,
  OrchestratorEvent,
  ReviewResult,
  Task,
} from '../../core/types.js';
import { filterStreamOutput } from '../stream-filter.js';

interface PendingApproval {
  taskId: string;
  title: string;
  stage: 'pre_task' | 'failure_escalation';
  context?: string;
  timeoutSec: number;
  startedAt: number;
}

interface OrchestratorState {
  tasks: Task[];
  activeTaskId: string | null;
  selectedTaskId: string | null;
  /** True once the user has manually pressed ↑/↓ — prevents auto-follow on task_started */
  manuallySelected: boolean;
  outputByTask: Record<string, string[]>;
  costByTask: Record<string, number>;
  durationByTask: Record<string, number>;
  engineByTask: Record<string, string>;
  modelByTask: Record<string, string>;
  costSummary: CostSummary;
  status: 'idle' | 'running' | 'completed' | 'failed';
  paused: boolean;
  error: string | null;
  prevTaskCostUsd: number;
  pendingApproval: PendingApproval | null;
  reviewStatus: 'idle' | 'model_select' | 'running' | 'completed' | 'failed';
  reviewResult: ReviewResult | null;
  reviewOutput: string[];
  reviewError: string | null;
  reviewModel: string | null;
}

const INITIAL_COST: CostSummary = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalEstimatedUsd: 0,
  byPhase: {},
  byModel: {},
};

export function useOrchestrator(initialTasks: Task[]) {
  const [state, setState] = useState<OrchestratorState>({
    tasks: initialTasks,
    activeTaskId: null,
    selectedTaskId: null,
    manuallySelected: false,
    outputByTask: {},
    costByTask: {},
    durationByTask: {},
    engineByTask: {},
    modelByTask: {},
    costSummary: INITIAL_COST,
    status: 'idle',
    paused: false,
    error: null,
    prevTaskCostUsd: 0,
    pendingApproval: null,
    reviewStatus: 'idle',
    reviewResult: null,
    reviewOutput: [],
    reviewError: null,
    reviewModel: null,
  });

  const handleEvent = useCallback((event: OrchestratorEvent) => {
    setState((prev) => {
      switch (event.type) {
        case 'task_started':
          return {
            ...prev,
            activeTaskId: event.taskId,
            // Only auto-follow if user hasn't manually navigated
            selectedTaskId: prev.manuallySelected ? prev.selectedTaskId : event.taskId,
            status: 'running',
            prevTaskCostUsd: prev.costSummary.totalEstimatedUsd,
            tasks: prev.tasks.map((t) =>
              t.id === event.taskId ? { ...t, status: 'in_progress' as const } : t,
            ),
            engineByTask: {
              ...prev.engineByTask,
              [event.taskId]: event.engine ?? 'cc',
            },
            modelByTask: {
              ...prev.modelByTask,
              [event.taskId]: event.model ?? '',
            },
          };

        case 'task_output': {
          const newLines = filterStreamOutput(event.text, event.taskId);
          if (newLines.length === 0) return prev;
          return {
            ...prev,
            outputByTask: {
              ...prev.outputByTask,
              [event.taskId]: [
                ...(prev.outputByTask[event.taskId] ?? []),
                ...newLines,
              ].slice(-300),
            },
          };
        }

        case 'task_completed':
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === event.taskId
                ? { ...t, status: 'completed' as const, durationMs: event.durationMs, resultSummary: event.resultSummary }
                : t,
            ),
            durationByTask: {
              ...prev.durationByTask,
              [event.taskId]: event.durationMs,
            },
            costByTask: {
              ...prev.costByTask,
              [event.taskId]: prev.costSummary.totalEstimatedUsd - prev.prevTaskCostUsd,
            },
          };

        case 'task_failed': {
          // On final failure (no more retries), auto-select the task so logs are visible immediately
          const autoSelect = !event.willRetry && !prev.manuallySelected;
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === event.taskId
                ? { ...t, status: 'failed' as const, error: event.error, durationMs: t.durationMs ?? Date.now() - Date.now() }
                : t,
            ),
            selectedTaskId: autoSelect ? event.taskId : prev.selectedTaskId,
          };
        }

        case 'cost_update':
          return { ...prev, costSummary: event.summary };

        case 'run_completed':
          return {
            ...prev,
            status: 'completed',
            activeTaskId: null,
            costSummary: event.summary,
          };

        case 'run_failed':
          return { ...prev, status: 'failed', error: event.error };

        case 'approval_requested':
          return {
            ...prev,
            pendingApproval: {
              taskId: event.taskId,
              title: event.title,
              stage: event.stage,
              context: event.context,
              timeoutSec: event.timeoutSec,
              startedAt: Date.now(),
            },
          };

        case 'approval_resolved':
          return { ...prev, pendingApproval: null };

        case 'review_model_requested':
          return { ...prev, reviewStatus: 'model_select' };

        case 'review_started':
          return {
            ...prev,
            reviewStatus: 'running',
            reviewModel: event.model,
            reviewOutput: [],
          };

        case 'review_output': {
          const reviewLines = filterStreamOutput(event.text, '__review__');
          if (reviewLines.length === 0) return prev;
          return {
            ...prev,
            reviewOutput: [...prev.reviewOutput, ...reviewLines].slice(-200),
          };
        }

        case 'review_completed':
          return {
            ...prev,
            reviewStatus: 'completed',
            reviewResult: event.result,
          };

        case 'review_failed':
          return {
            ...prev,
            reviewStatus: 'failed',
            reviewError: event.error,
          };

        case 'rerun_started': {
          const rerunIds = new Set(event.taskIds);
          return {
            ...prev,
            status: 'running',
            reviewStatus: 'idle',
            reviewResult: null,
            reviewOutput: [],
            tasks: prev.tasks.map((t) =>
              rerunIds.has(t.id) ? { ...t, status: 'pending' as const } : t,
            ),
          };
        }

        default:
          return prev;
      }
    });
  }, []);

  const selectTask = useCallback((direction: 'up' | 'down') => {
    setState((prev) => {
      const visibleTasks = prev.tasks;
      if (visibleTasks.length === 0) return prev;

      const currentIdx = prev.selectedTaskId
        ? visibleTasks.findIndex((t) => t.id === prev.selectedTaskId)
        : -1;

      let nextIdx: number;
      if (direction === 'up') {
        nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
      } else {
        nextIdx = currentIdx >= visibleTasks.length - 1 ? visibleTasks.length - 1 : currentIdx + 1;
      }

      return { ...prev, selectedTaskId: visibleTasks[nextIdx].id, manuallySelected: true };
    });
  }, []);

  const togglePause = useCallback(() => {
    setState((prev) => ({ ...prev, paused: !prev.paused }));
  }, []);

  return { state, handleEvent, selectTask, togglePause };
}

export type { OrchestratorState };
