// ── Model types ──────────────────────────────────────────────────────
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

export type Engine = 'claude-code' | 'pi-mono';

export interface PiMonoConfig {
  provider: string;  // anthropic, openai, google, ollama, etc.
  model: string;     // full model ID: gpt-4o-mini, gemini-2.0-flash, claude-haiku-4-5-20251001, etc.
  piPath?: string;   // path to pi binary (default: 'pi')
  baseUrl?: string;  // for OpenAI-compatible endpoints (Kimi, GLM, Minimax, etc.)
}

export interface ModelConfig {
  planning: ClaudeModel;
  execution: ClaudeModel;
  validation: ClaudeModel;
}

// ── Task types ───────────────────────────────────────────────────────
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

export interface RetryHistoryEntry {
  attempt: number;
  timestamp: string;
  failureType: 'execution' | 'acceptance' | 'timeout';
  reason: string;
  fullError: string;
  durationMs: number;
}

export interface AcceptanceCriterionResult {
  criterion: string;
  passed: boolean;
  explanation: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[]; // task IDs this task depends on
  contextPatterns: string[]; // file globs relevant to this task
  status: TaskStatus;
  retries: number;
  maxRetries: number;
  ifFailed: 'skip' | 'halt';
  timeout: number; // ms
  checkpointSha?: string;
  costData?: TaskCostData;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  resultSummary?: string;
  retryHistory?: RetryHistoryEntry[];
  acceptanceCriteriaResults?: AcceptanceCriterionResult[];
  outputArtifacts?: string[]; // file paths that must exist after completion
  parentTaskId?: string;     // set when this task was dynamically created by another task
  requiresApproval?: boolean; // per-task override: require human approval before running
}

// ── Plan types ───────────────────────────────────────────────────────
export interface Plan {
  goal: string;
  tasks: Task[];
  createdAt: string;
  updatedAt: string;
  /** Raw prompt to execute after all tasks finish (from ## Wrap-up section in spec). */
  wrapUpPrompt?: string;
}

// ── Validation types ─────────────────────────────────────────────────
export type ValidationStrategyName =
  | 'typecheck'
  | 'lint'
  | 'build'
  | 'test'
  | 'ai-review'
  | 'command'
  | 'artifacts';

export interface ValidationResult {
  strategy: ValidationStrategyName;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface ValidationReport {
  taskId: string;
  passed: boolean;
  results: ValidationResult[];
}

// ── Cost types ───────────────────────────────────────────────────────
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface TaskCostData {
  model: ClaudeModel;
  engine: Engine;
  phase: 'planning' | 'execution' | 'validation';
  usage: TokenUsage;
  estimatedUsd: number;
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

// ── Approval config types ────────────────────────────────────────────
export interface ApprovalConfig {
  mode: 'never' | 'always' | 'on-failure';
  timeoutSec: number;
  autoAction: 'continue' | 'halt';
}

// ── Config types ─────────────────────────────────────────────────────
export interface ValidationConfig {
  typecheck: boolean;
  lint: boolean;
  build: boolean;
  test: boolean;
  aiReview: boolean;
  commands: string[]; // arbitrary shell commands that must exit 0
}

export interface NotificationsConfig {
  desktop: boolean;
  sound: boolean;
}

export interface ReviewConfig {
  enabled: boolean;   // default true
  model: ClaudeModel; // default 'sonnet'
}

export interface CloudyConfig {
  models: ModelConfig;
  validation: ValidationConfig;
  maxRetries: number;
  parallel: boolean;
  maxParallel: number;
  retryDelaySec: number;
  taskTimeoutMs: number;
  autoModelRouting: boolean;
  dashboard: boolean;
  dashboardPort: number;
  notifications: NotificationsConfig;
  contextBudgetTokens: number; // max tokens of context to load per task (0 = unlimited)
  maxCostPerTaskUsd: number;   // abort task if cumulative cost exceeds this (0 = unlimited)
  worktrees: boolean;          // use git worktrees for parallel task isolation
  approval: ApprovalConfig;
  engine: Engine;              // execution engine (default: claude-code)
  piMono: PiMonoConfig;        // pi-mono engine configuration
  review: ReviewConfig;        // post-run holistic review configuration
}

// ── State types ──────────────────────────────────────────────────────
export interface ProjectState {
  version: number;
  plan: Plan | null;
  config: CloudyConfig;
  costSummary: CostSummary;
  startedAt?: string;
  completedAt?: string;
}

// ── Claude CLI types ─────────────────────────────────────────────────
export interface ClaudeStreamMessage {
  type: string;
  subtype?: string;
  content?: string;
  message?: string;
  // cost_info fields from stream-json
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  // result message fields
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
}

export interface ClaudeRunResult {
  success: boolean;
  output: string;
  error?: string;
  usage: TokenUsage;
  durationMs: number;
  costUsd: number;
}

// ── Review types ─────────────────────────────────────────────────────
export interface ReviewResult {
  verdict: 'PASS' | 'PASS_WITH_NOTES' | 'FAIL';
  summary: string;
  criteriaResults: Array<{ criterion: string; passed: boolean; note: string }>;
  issues: Array<{ severity: 'critical' | 'major' | 'minor'; description: string; location?: string }>;
  conventionViolations: string[];
  suggestions: string[];
  costUsd: number;
  durationMs: number;
  model: string;
}

// ── Event types (for UI) ─────────────────────────────────────────────
export type OrchestratorEvent =
  | { type: 'plan_created'; plan: Plan }
  | { type: 'task_started'; taskId: string; title: string; attempt: number; maxAttempts: number; contextFileCount: number; engine?: Engine; model?: string }
  | { type: 'task_output'; taskId: string; text: string }
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
  | { type: 'approval_resolved'; taskId: string; action: string; autoTriggered: boolean }
  | { type: 'review_started'; model: string }
  | { type: 'review_output'; text: string }
  | { type: 'review_completed'; result: ReviewResult }
  | { type: 'review_failed'; error: string }
  | { type: 'review_model_requested' };

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void;

// ── Dashboard command types ─────────────────────────────────────────
export type DashboardCommand =
  | { type: 'start_run' }
  | { type: 'stop_run' }
  | { type: 'approval_response'; taskId: string; action: 'approved' | 'skipped' | 'halt' | 'retry_with_hint'; hint?: string };
