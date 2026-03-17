// Mirror of server-side types for browser client

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'completed_without_changes'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

export type TaskExecutionMode =
  | 'generic'
  | 'implement_ui_surface'
  | 'verify_proof'
  | 'closeout_keel'
  | 'refactor_bounded'
  | 'write_or_stop';

export type TaskFailureType =
  | 'implementation_failure'
  | 'acceptance_failure'
  | 'timeout'
  | 'executor_nonperformance'
  | 'already_satisfied'
  | 'environment_failure'
  | 'validation_problem'
  | 'out_of_scope_drift'
  | 'task_spec_problem';

export interface RetryHistoryEntry {
  attempt: number;
  timestamp: string;
  failureType: TaskFailureType;
  reason: string;
  fullError: string;
  durationMs: number;
}

export interface TaskExecutionMetrics {
  timeToFirstWriteMs?: number;
  discoveryOpsBeforeFirstWrite: number;
  subagentCalls: number;
  writeCount: number;
  verificationOps: number;
  executionMode: TaskExecutionMode;
  riskLevel?: 'low' | 'medium' | 'high';
  riskReasons?: string[];
}

export interface AcceptanceCriterionResult {
  criterion: string;
  passed: boolean;
  explanation: string;
}

export interface ValidationResult {
  strategy: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface ValidationReport {
  taskId: string;
  passed: boolean;
  results: ValidationResult[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  executionMode?: TaskExecutionMode;
  acceptanceCriteria: string[];
  dependencies: string[];
  status: TaskStatus;
  retries: number;
  maxRetries: number;
  error?: string;
  durationMs?: number;
  resultSummary?: string;
  retryHistory?: RetryHistoryEntry[];
  acceptanceCriteriaResults?: AcceptanceCriterionResult[];
  validationReport?: ValidationReport;
  executionMetrics?: TaskExecutionMetrics;
  failureClass?: TaskFailureType;
}

export interface Plan {
  goal: string;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalEstimatedUsd: number;
  byPhase: Record<string, number>;
  byModel: Record<string, number>;
}

export interface ProjectState {
  version: number;
  plan: Plan | null;
  config: Record<string, unknown>;
  costSummary: CostSummary;
  startedAt?: string;
  completedAt?: string;
}

export type OrchestratorEvent =
  | { type: 'init'; state: ProjectState }
  | { type: 'plan_created'; plan: Plan }
  | { type: 'task_started'; taskId: string; title: string; attempt: number; maxAttempts: number; contextFileCount: number; engine?: string; model?: string }
  | { type: 'task_output'; taskId: string; text: string }
  | { type: 'task_tool_call'; taskId: string; toolName: string; toolInput: unknown }
  | { type: 'task_tool_result'; taskId: string; toolName: string; content: string; isError: boolean }
  | { type: 'task_completed'; taskId: string; title: string; durationMs: number; resultSummary?: string }
  | { type: 'task_failed'; taskId: string; title: string; error: string; attempt: number; maxAttempts: number; willRetry: boolean }
  | { type: 'task_retrying'; taskId: string; title: string; delaySec: number; attempt: number }
  | { type: 'validation_started'; taskId: string }
  | { type: 'validation_result'; taskId: string; report: ValidationReport; criteriaResults?: AcceptanceCriterionResult[] }
  | { type: 'cost_update'; summary: CostSummary }
  | { type: 'progress'; completed: number; total: number; percentage: number }
  | { type: 'run_completed'; summary: CostSummary }
  | { type: 'run_failed'; error: string }
  | { type: 'run_status'; status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped' }
  | { type: 'subtasks_created'; parentTaskId: string; count: number; ids: string[] }
  | { type: 'approval_requested'; taskId: string; title: string; stage: 'pre_task' | 'failure_escalation'; context?: string; timeoutSec: number }
  | { type: 'approval_resolved'; taskId: string; action: string; autoTriggered: boolean };

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export interface OutputLine {
  id: string;
  /** prompt = task instructions sent to Claude (user turn) */
  type: 'text' | 'event' | 'error' | 'success' | 'tool_call' | 'tool_result' | 'prompt';
  taskId?: string;
  content: string;
  toolName?: string;
  toolHint?: string;
  isError?: boolean;
  collapsed?: boolean;
}

export interface ApprovalRequest {
  taskId: string;
  title: string;
  stage: 'pre_task' | 'failure_escalation';
  context?: string;
  timeoutSec: number;
}
