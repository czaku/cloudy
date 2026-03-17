import type { Plan, Task } from './types.js';
import { assessTaskRisk, inferExecutionMode } from './task-shape.js';

export interface TaskRiskPreflight {
  taskId: string;
  title: string;
  executionMode: ReturnType<typeof inferExecutionMode>;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
  shouldBlock: boolean;
}

export function analyzeTaskRisk(task: Task): TaskRiskPreflight {
  const assessment = assessTaskRisk(task);
  const mode = inferExecutionMode(task);
  const shouldBlock =
    assessment.level === 'high' &&
    (mode === 'implement_ui_surface' || mode === 'refactor_bounded' || mode === 'write_or_stop');

  return {
    taskId: task.id,
    title: task.title,
    executionMode: mode,
    level: assessment.level,
    reasons: assessment.reasons,
    shouldBlock,
  };
}

export function analyzePlanRisk(plan: Plan): TaskRiskPreflight[] {
  return plan.tasks
    .filter((task) => task.status === 'pending')
    .map(analyzeTaskRisk);
}
