import type { ClaudeModel, Task } from '../core/types.js';

/**
 * Weights for each complexity factor when computing the task score.
 */
const WEIGHTS = {
  description: 2,
  acceptanceCriteria: 3,
  dependencies: 1,
  contextPatterns: 1,
} as const;

/**
 * Thresholds that map description length to a complexity tier value.
 *
 *   - Short  (< 200 chars)  -> 1
 *   - Medium (200-500 chars) -> 3
 *   - Long   (> 500 chars)  -> 5
 */
function descriptionComplexity(description: string): number {
  const len = description.length;
  if (len < 200) return 1;
  if (len <= 500) return 3;
  return 5;
}

/**
 * Compute a numeric complexity score for a task based on its attributes.
 *
 * The score is the weighted sum of:
 *   - description complexity tier  (weight 2)
 *   - number of acceptance criteria (weight 3)
 *   - number of dependencies        (weight 1)
 *   - number of context patterns    (weight 1)
 */
export function computeComplexityScore(task: Task): number {
  const descScore = descriptionComplexity(task.description) * WEIGHTS.description;
  const criteriaScore = task.acceptanceCriteria.length * WEIGHTS.acceptanceCriteria;
  const depsScore = task.dependencies.length * WEIGHTS.dependencies;
  const contextScore = task.contextPatterns.length * WEIGHTS.contextPatterns;

  return descScore + criteriaScore + depsScore + contextScore;
}

/**
 * Analyse a Task and determine the best Claude model to use based on
 * its complexity.
 *
 *   - score <  10  ->  haiku   (simple tasks)
 *   - score <  25  ->  sonnet  (medium tasks)
 *   - score >= 25  ->  opus    (complex tasks)
 */
export function routeModelForTask(task: Task): ClaudeModel {
  const score = computeComplexityScore(task);

  if (score < 10) return 'haiku';
  if (score < 25) return 'sonnet';
  return 'opus';
}
