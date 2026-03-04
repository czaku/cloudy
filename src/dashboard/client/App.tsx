import React, { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import type {
  OrchestratorEvent,
  ProjectState,
  Plan,
  Task,
  CostSummary,
  OutputLine,
  ApprovalRequest,
  RunStatus,
} from './types';
import { parseClaudeOutputLine, makeEventLine } from './utils/parseOutput';
import { useWebSocket } from './hooks/useWebSocket';
import { usePolling } from './hooks/usePolling';
import { Header } from './components/Header';
import { TaskList } from './components/TaskList';
import { StatsSidebar } from './components/StatsSidebar';
import { OutputLog } from './components/OutputLog';
import { ApprovalCard } from './components/ApprovalCard';

// ── State ────────────────────────────────────────────────────────────

interface AppState {
  plan: Plan | null;
  config: Record<string, unknown>;
  costSummary: CostSummary;
  startedAt: string | undefined;
  completedAt: string | undefined;
  outputLines: OutputLine[];
  approvalRequest: ApprovalRequest | null;
  wsConnected: boolean;
  runStatus: RunStatus;
  lastFailedTaskId: string | null;
}

const EMPTY_COST: CostSummary = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalEstimatedUsd: 0,
  byPhase: {},
  byModel: {},
};

const INITIAL_STATE: AppState = {
  plan: null,
  config: {},
  costSummary: EMPTY_COST,
  startedAt: undefined,
  completedAt: undefined,
  outputLines: [],
  approvalRequest: null,
  wsConnected: false,
  runStatus: 'idle',
  lastFailedTaskId: null,
};

// ── Helpers ──────────────────────────────────────────────────────────

function findTask(plan: Plan | null, id: string): Task | undefined {
  return plan?.tasks.find((t) => t.id === id);
}

function updateTask(plan: Plan | null, id: string, patch: Partial<Task>): Plan | null {
  if (!plan) return plan;
  return {
    ...plan,
    tasks: plan.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  };
}

function deriveRunStatus(state: ProjectState): RunStatus {
  if (state.completedAt) {
    const anyFailed = state.plan?.tasks.some((t) => t.status === 'failed');
    return anyFailed ? 'failed' : 'completed';
  }
  if (state.startedAt && state.plan?.tasks.some((t) => t.status === 'in_progress')) {
    return 'running';
  }
  return 'idle';
}

const MAX_OUTPUT_LINES = 500;

function appendLines(existing: OutputLine[], newLines: OutputLine[]): OutputLine[] {
  const combined = [...existing, ...newLines];
  return combined.length > MAX_OUTPUT_LINES ? combined.slice(-MAX_OUTPUT_LINES) : combined;
}

// ── Reducer ──────────────────────────────────────────────────────────

type Action = OrchestratorEvent | { type: 'ws_connected'; connected: boolean } | { type: 'clear_output' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ws_connected':
      return { ...state, wsConnected: action.connected };

    case 'clear_output':
      return { ...state, outputLines: [] };

    case 'init': {
      const s = action.state;
      const runStatus = deriveRunStatus(s);
      return {
        ...state,
        plan: s.plan,
        config: s.config,
        costSummary: s.costSummary ?? EMPTY_COST,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        runStatus,
        // Only reset approval if run is done
        approvalRequest: runStatus === 'idle' ? null : state.approvalRequest,
      };
    }

    case 'plan_created':
      return {
        ...state,
        plan: action.plan,
        outputLines: appendLines(
          state.outputLines,
          [makeEventLine(undefined, `Plan created: ${action.plan.goal}`, 'event')],
        ),
      };

    case 'run_status': {
      const rs = action.status as RunStatus;
      const newStartedAt =
        rs === 'running' ? (state.startedAt ?? new Date().toISOString()) : state.startedAt;
      return { ...state, runStatus: rs, startedAt: newStartedAt };
    }

    case 'task_started': {
      const plan = updateTask(state.plan, action.taskId, {
        status: 'in_progress',
        retries: action.attempt - 1,
        maxRetries: action.maxAttempts - 1,
      });
      const line = makeEventLine(
        action.taskId,
        `▶ Started: ${action.title} (attempt ${action.attempt}/${action.maxAttempts}, ${action.contextFileCount} context files)`,
        'event',
      );
      return { ...state, plan, outputLines: appendLines(state.outputLines, [line]) };
    }

    case 'task_output': {
      const newLines = parseClaudeOutputLine(action.taskId, action.text);
      return { ...state, outputLines: appendLines(state.outputLines, newLines) };
    }

    case 'task_completed': {
      const plan = updateTask(state.plan, action.taskId, {
        status: 'completed',
        durationMs: action.durationMs,
        resultSummary: action.resultSummary,
      });
      const line = makeEventLine(
        action.taskId,
        `✓ Completed: ${action.title}`,
        'success',
      );
      return { ...state, plan, outputLines: appendLines(state.outputLines, [line]) };
    }

    case 'task_failed': {
      const patch: Partial<Task> = {
        retries: action.attempt - 1,
        maxRetries: action.maxAttempts - 1,
      };
      if (!action.willRetry) {
        patch.status = 'failed';
        patch.error = action.error;
      }
      const plan = updateTask(state.plan, action.taskId, patch);
      const msg = action.willRetry
        ? `✗ Failed (will retry): ${action.title}`
        : `✗ Failed: ${action.title}`;
      const line = makeEventLine(action.taskId, msg, 'error');
      // On final failure, track the task ID so OutputLog can auto-scroll to its error
      const lastFailedTaskId = !action.willRetry ? action.taskId : state.lastFailedTaskId;
      return { ...state, plan, outputLines: appendLines(state.outputLines, [line]), lastFailedTaskId };
    }

    case 'task_retrying': {
      const line = makeEventLine(
        action.taskId,
        `↻ Retrying ${action.title} in ${action.delaySec}s (attempt ${action.attempt})`,
        'event',
      );
      return { ...state, outputLines: appendLines(state.outputLines, [line]) };
    }

    case 'validation_started': {
      const line = makeEventLine(action.taskId, '⧖ Validating...', 'event');
      return { ...state, outputLines: appendLines(state.outputLines, [line]) };
    }

    case 'validation_result': {
      const status = action.report.passed ? '✓ Validation PASSED' : '✗ Validation FAILED';
      const lines: OutputLine[] = [
        makeEventLine(action.taskId, status, action.report.passed ? 'success' : 'error'),
        ...action.report.results.map((r) =>
          makeEventLine(
            action.taskId,
            `  ${r.passed ? '✓' : '✗'} [${r.strategy}] ${r.passed ? 'passed' : r.output.split('\n')[0]}`,
            r.passed ? 'event' : 'error',
          ),
        ),
      ];
      // Store validation report + criteria results on task
      const plan = updateTask(state.plan, action.taskId, {
        validationReport: action.report,
        ...(action.criteriaResults ? { acceptanceCriteriaResults: action.criteriaResults } : {}),
      });
      return { ...state, plan, outputLines: appendLines(state.outputLines, lines) };
    }

    case 'cost_update':
      return { ...state, costSummary: action.summary };

    case 'progress':
      // Progress is derived from tasks, no separate state needed
      return state;

    case 'run_completed': {
      const line = makeEventLine(undefined, '✅ All tasks completed!', 'success');
      return {
        ...state,
        runStatus: 'completed',
        costSummary: action.summary,
        outputLines: appendLines(state.outputLines, [line]),
      };
    }

    case 'run_failed': {
      const line = makeEventLine(undefined, `❌ Run failed: ${action.error}`, 'error');
      return {
        ...state,
        runStatus: 'failed',
        outputLines: appendLines(state.outputLines, [line]),
      };
    }

    case 'approval_requested':
      return {
        ...state,
        approvalRequest: {
          taskId: action.taskId,
          title: action.title,
          stage: action.stage,
          context: action.context,
          timeoutSec: action.timeoutSec,
        },
        outputLines: appendLines(state.outputLines, [
          makeEventLine(action.taskId, `⏸ Awaiting approval: ${action.title} (${action.stage})`, 'event'),
        ]),
      };

    case 'approval_resolved': {
      const line = makeEventLine(
        action.taskId,
        `✓ Approval resolved: ${action.action}${action.autoTriggered ? ' (auto)' : ''}`,
        'event',
      );
      return {
        ...state,
        approvalRequest: state.approvalRequest?.taskId === action.taskId ? null : state.approvalRequest,
        outputLines: appendLines(state.outputLines, [line]),
      };
    }

    case 'subtasks_created': {
      const line = makeEventLine(
        action.parentTaskId,
        `➕ Subtasks created: ${action.ids.join(', ')}`,
        'event',
      );
      return { ...state, outputLines: appendLines(state.outputLines, [line]) };
    }

    default:
      return state;
  }
}

// ── Elapsed Timer ────────────────────────────────────────────────────

function useElapsedMs(startedAt: string | undefined, runStatus: RunStatus): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsedMs(0);
      return;
    }

    const start = new Date(startedAt).getTime();

    if (runStatus !== 'running') {
      // Static elapsed for finished runs
      const endMs = Date.now();
      setElapsedMs(endMs - start);
      return;
    }

    setElapsedMs(Date.now() - start);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt, runStatus]);

  return elapsedMs;
}

// ── App ──────────────────────────────────────────────────────────────

export function App() {
  const [state, rawDispatch] = useReducer(reducer, INITIAL_STATE);

  const dispatch = useCallback(
    (event: OrchestratorEvent) => rawDispatch(event),
    [],
  );

  const setConnected = useCallback((connected: boolean) => {
    rawDispatch({ type: 'ws_connected', connected });
  }, []);

  const { sendCommand } = useWebSocket(dispatch, setConnected);
  usePolling(dispatch);

  const elapsedMs = useElapsedMs(state.startedAt, state.runStatus);

  function handleApproval(taskId: string, action: string, hint?: string) {
    sendCommand('approval_response', { taskId, action, hint });
    rawDispatch({ type: 'approval_resolved', taskId, action, autoTriggered: false });
  }

  function clearOutput() {
    rawDispatch({ type: 'clear_output' });
  }

  return (
    <div className="app-root">
      <Header
        goal={state.plan?.goal}
        runStatus={state.runStatus}
        elapsedMs={elapsedMs}
        wsConnected={state.wsConnected}
        onStartRun={() => sendCommand('start_run')}
        onStopRun={() => sendCommand('stop_run')}
      />

      {state.approvalRequest && (
        <ApprovalCard
          request={state.approvalRequest}
          onRespond={handleApproval}
        />
      )}

      <div className="main-panels">
        <TaskList tasks={state.plan?.tasks ?? []} />
        <StatsSidebar
          tasks={state.plan?.tasks ?? []}
          costSummary={state.costSummary}
          elapsedMs={elapsedMs}
        />
      </div>

      <OutputLog lines={state.outputLines} onClear={clearOutput} failedTaskId={state.lastFailedTaskId} />
    </div>
  );
}
