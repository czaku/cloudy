import type { ClaudeModel, Task, TaskExecutionMode, TaskFailureType, ThinkingEffort } from './types.js';

export interface TaskRiskAssessment {
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface TaskExecutionDefaults {
  executionMode: TaskExecutionMode;
  model: ClaudeModel;
  effort: ThinkingEffort;
  disallowSubagents: boolean;
  requireFirstWrite: boolean;
}

function normalizedText(task: Task): string {
  return `${task.title}\n${task.description}\n${task.acceptanceCriteria.join('\n')}`.toLowerCase();
}

export function inferExecutionMode(task: Task): TaskExecutionMode {
  if (task.executionMode) return task.executionMode;
  const text = normalizedText(task);
  if (task.type === 'verify' || /screenshot|proof|parity|verify|artifact/.test(text)) return 'verify_proof';
  if (task.type === 'closeout' || /keel|note|close the task|mark the task done/.test(text)) return 'closeout_keel';
  if (/ui|screen|view|swiftui|compose|surface|card|layout/.test(text) && (task.allowedWritePaths?.length ?? 0) > 0) {
    return 'implement_ui_surface';
  }
  if (/refactor|cleanup|rename|extract/.test(text) && (task.allowedWritePaths?.length ?? 0) > 0) {
    return 'refactor_bounded';
  }
  if (task.type === 'implement' && (task.allowedWritePaths?.length ?? 0) > 0) {
    return 'write_or_stop';
  }
  return 'generic';
}

export function assessTaskRisk(task: Task): TaskRiskAssessment {
  const reasons: string[] = [];
  const mode = inferExecutionMode(task);
  const ctx = task.contextPatterns?.length ?? 0;
  const writes = task.allowedWritePaths?.length ?? 0;
  const validators = (task.validationOverrides?.commands?.length ?? 0)
    + (task.validationOverrides?.iosBuildCommand ? 1 : 0)
    + (task.validationOverrides?.androidBuildCommand ? 1 : 0);

  if (writes > 8) reasons.push('wide_write_scope');
  if (ctx > 12) reasons.push('wide_context_scope');
  if (writes === 0 && mode !== 'verify_proof' && mode !== 'closeout_keel') reasons.push('no_write_scope');
  if (validators === 0 && mode !== 'generic') reasons.push('missing_validation_override');
  if (mode === 'implement_ui_surface' && ctx > 8) reasons.push('ui_task_context_too_broad');

  const level =
    reasons.length >= 3 ? 'high'
      : reasons.length >= 1 ? 'medium'
        : 'low';

  return { level, reasons };
}

export function getExecutionDefaults(task: Task): TaskExecutionDefaults {
  const mode = inferExecutionMode(task);
  switch (mode) {
    case 'verify_proof':
      return { executionMode: mode, model: 'sonnet', effort: 'low', disallowSubagents: true, requireFirstWrite: false };
    case 'closeout_keel':
      return { executionMode: mode, model: 'haiku', effort: 'low', disallowSubagents: true, requireFirstWrite: false };
    case 'implement_ui_surface':
      return { executionMode: mode, model: 'sonnet', effort: 'low', disallowSubagents: true, requireFirstWrite: true };
    case 'refactor_bounded':
      return { executionMode: mode, model: 'sonnet', effort: 'low', disallowSubagents: true, requireFirstWrite: true };
    case 'write_or_stop':
      return { executionMode: mode, model: 'sonnet', effort: 'low', disallowSubagents: true, requireFirstWrite: true };
    default:
      return { executionMode: mode, model: 'sonnet', effort: 'medium', disallowSubagents: false, requireFirstWrite: false };
  }
}

export function isTerminalFailureType(failureType: TaskFailureType): boolean {
  return failureType === 'executor_nonperformance'
    || failureType === 'out_of_scope_drift'
    || failureType === 'validation_problem'
    || failureType === 'task_spec_problem';
}
