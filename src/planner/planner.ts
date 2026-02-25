import type { ClaudeModel, Plan, Task } from '../core/types.js';
import { runClaude } from '../executor/claude-runner.js';
import { buildPlanningPrompt } from './prompts.js';
import { validateDependencyGraph } from './dependency-graph.js';
import { log } from '../utils/logger.js';

interface RawTask {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  contextPatterns?: string[];
  outputArtifacts?: string[];
  timeoutMinutes?: number;
}

/**
 * Use Claude to decompose a goal into tasks.
 */
export async function createPlan(
  goal: string,
  model: ClaudeModel,
  cwd: string,
  onOutput?: (text: string) => void,
  specContent?: string,
  claudeMdContent?: string,
  abortSignal?: AbortSignal,
): Promise<Plan> {
  await log.info(`Planning with model: ${model}`);
  await log.info(`Goal: ${goal}`);

  const prompt = buildPlanningPrompt(goal, specContent, claudeMdContent);

  const result = await runClaude({
    prompt,
    model,
    cwd,
    onOutput,
    abortSignal,
  });

  if (!result.success) {
    throw new Error(`Planning failed: ${result.error}`);
  }

  const rawTasks = parsePlanOutput(result.output);
  const tasks = rawTasks.map(toTask);

  const validation = validateDependencyGraph(tasks);
  if (!validation.valid) {
    throw new Error(
      `Invalid dependency graph:\n${validation.errors.join('\n')}`,
    );
  }

  const plan: Plan = {
    goal,
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await log.info(`Plan created with ${tasks.length} tasks`);

  return plan;
}

/**
 * Update an existing plan based on user feedback, without modifying non-pending tasks.
 */
export async function editPlan(
  existingPlan: Plan,
  feedback: string,
  model: ClaudeModel,
  cwd: string,
  onOutput?: (text: string) => void,
): Promise<Plan> {
  await log.info(`Editing plan with model: ${model}`);

  const prompt = `You are updating an existing project plan based on user feedback.

User feedback: ${feedback}

Rules:
- Do not modify tasks that are not "pending" status (completed, failed, in_progress, skipped, rolled_back tasks must remain exactly as-is).
- Preserve all field values for unchanged tasks.
- You may add new tasks, remove pending tasks, or modify pending tasks.
- New task IDs must not conflict with existing IDs.
- Dependencies must reference valid task IDs.
- Return the complete updated plan in the same JSON format.

Current plan:
${JSON.stringify(existingPlan, null, 2)}

Return ONLY valid JSON with this structure:
{
  "tasks": [ ... ]
}`;

  const result = await runClaude({ prompt, model, cwd, onOutput });

  if (!result.success) {
    throw new Error(`Plan editing failed: ${result.error}`);
  }

  const rawTasks = parsePlanOutput(result.output);
  const tasks = rawTasks.map(toTask);

  const validation = validateDependencyGraph(tasks);
  if (!validation.valid) {
    throw new Error(`Invalid dependency graph:\n${validation.errors.join('\n')}`);
  }

  // Restore non-pending task data from the original plan
  const originalById = new Map(existingPlan.tasks.map((t) => [t.id, t]));
  for (const task of tasks) {
    const orig = originalById.get(task.id);
    if (orig && orig.status !== 'pending') {
      Object.assign(task, orig);
    }
  }

  return {
    goal: existingPlan.goal,
    tasks,
    createdAt: existingPlan.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function parsePlanOutput(output: string): RawTask[] {
  // Try to extract JSON from the output (Claude might wrap it in markdown)
  let jsonStr = output.trim();

  // Strip markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object
  const objStart = jsonStr.indexOf('{');
  const objEnd = jsonStr.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    jsonStr = jsonStr.slice(objStart, objEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr) as { tasks: RawTask[] };
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error('Response missing "tasks" array');
    }
    return parsed.tasks;
  } catch (err) {
    throw new Error(
      `Failed to parse planning output as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function toTask(raw: RawTask): Task {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    acceptanceCriteria: raw.acceptanceCriteria ?? [],
    dependencies: raw.dependencies ?? [],
    contextPatterns: raw.contextPatterns ?? [],
    outputArtifacts: raw.outputArtifacts ?? [],
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'skip',
    timeout: Math.min(raw.timeoutMinutes ?? 60, 60) * 60_000,
  };
}
