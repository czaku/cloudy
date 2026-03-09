import type { ClaudeModel, Plan, Task } from '../core/types.js';
import { runClaude } from '../executor/claude-runner.js';
import { buildPlanningPrompt } from './prompts.js';
import { exploreCodebase } from './codebase-explorer.js';
import { validateDependencyGraph } from './dependency-graph.js';
import { loadRecentRunInsights } from '../knowledge/run-logger.js';
import { log } from '../utils/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export interface PlanQuestion {
  type: 'text' | 'select' | 'multiselect' | 'confirm';
  text: string;
  options?: string[];
  defaultValue?: string;
}

interface RawTask {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  contextPatterns?: string[];
  outputArtifacts?: string[];
  implementationSteps?: string[];
  timeoutMinutes?: number;
}

interface RawPlan {
  tasks: RawTask[];
  questions?: Array<PlanQuestion | string>;
  rationale?: string;
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

  // Load insights from previous runs to steer the planner away from known failure patterns
  const runInsights = await loadRecentRunInsights(cwd).catch(() => undefined);
  if (runInsights) {
    await log.info('Injecting learnings from previous runs into planning prompt');
  }

  // Deterministic codebase snapshot — runs find/ls/reads package.json, no LLM call
  await log.info('Exploring codebase for planning context…');
  const codebaseSnapshot = await exploreCodebase(cwd);

  const prompt = buildPlanningPrompt(goal, specContent, claudeMdContent, runInsights, codebaseSnapshot);

  const timeoutMs = Number(process.env['CLOUDY_PLANNING_TIMEOUT_MS']) || 900_000; // 15 min

  const planningCall = runClaude({
    prompt,
    model,
    cwd,
    onOutput,
    abortSignal,
    // Use 'high' effort for planning — enables extended thinking on capable models,
    // leading to better dependency graphs and acceptance criteria.
    effort: model === 'haiku' ? 'medium' : 'high',
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Planning timed out after ${Math.round(timeoutMs / 60_000)} minutes — check API rate limits or try again`)),
      timeoutMs,
    ),
  );

  const result = await Promise.race([planningCall, timeoutPromise]);

  if (!result.success) {
    throw new Error(`Planning failed: ${result.error}`);
  }

  const { tasks: rawTasks, questions: planQuestions, rationale } = parsePlanOutput(result.output);
  let tasks = rawTasks.map(toTask);

  const validation = validateDependencyGraph(tasks);
  if (!validation.valid) {
    throw new Error(
      `Invalid dependency graph:\n${validation.errors.join('\n')}`,
    );
  }

  // Plan quality warnings — catch common planner mistakes before execution
  await warnPlanQuality(tasks, cwd, specContent);

  // Artifact path validation — warn when declared paths look wrong
  await warnArtifactPaths(tasks, cwd);

  // Second pass: verify and fix the dependency graph with a cheap focused call.
  // The planner sometimes generates tasks with missing or empty dependencies —
  // this pass catches edges that the planner missed without re-running the full plan.
  tasks = await verifyAndFixDependencies(tasks, cwd);

  // Re-validate after corrections (LLM might introduce bad refs or cycles)
  const validation2 = validateDependencyGraph(tasks);
  if (!validation2.valid) {
    await log.warn(
      `Dependency verification introduced graph errors — reverting to original: ${validation2.errors.join(', ')}`,
    );
    tasks = rawTasks.map(toTask);
  }

  const plan: Plan = {
    goal,
    tasks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rationale,
  };

  // Write rationale to .cloudy/rationale.md for debugging and transparency
  if (rationale) {
    try {
      await fs.mkdir(path.join(cwd, '.cloudy'), { recursive: true });
      await fs.writeFile(
        path.join(cwd, '.cloudy', 'rationale.md'),
        `# Plan Rationale\n\n${rationale}\n\nGenerated: ${new Date().toISOString()}\n`,
        'utf8',
      );
    } catch { /* non-fatal */ }
  }

  if (planQuestions && planQuestions.length > 0) {
    // Stash questions on the plan temporarily — init.ts will consume them and save decision_log
    (plan as any)._questions = planQuestions;
  }

  await log.info(`Plan created with ${tasks.length} tasks${planQuestions?.length ? `, ${planQuestions.length} question(s)` : ''}`);

  return plan;
}

/**
 * Run a cheap focused LLM pass to catch missing dependency edges in the plan.
 *
 * The planner sometimes generates tasks with empty or incomplete dependency
 * arrays — this causes parallel execution to race on shared modules and break
 * builds. This pass looks ONLY at the dependency graph (not the full spec) and
 * adds any edges the planner missed.
 *
 * Rules enforced:
 * - Never removes existing dependencies
 * - Only adds a dependency if it is logically required (B uses A's output)
 * - Skips if the haiku call fails (non-fatal, logs a warning)
 */
async function verifyAndFixDependencies(
  tasks: Task[],
  cwd: string,
): Promise<Task[]> {
  await log.info('Verifying dependency graph…');

  const taskIds = new Set(tasks.map((t) => t.id));

  // Compact representation — enough for the LLM to reason about deps
  const compact = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description.slice(0, 400),
    outputArtifacts: t.outputArtifacts ?? [],
    dependencies: [...t.dependencies],
  }));

  const prompt = `You are verifying the dependency graph of a software build plan.

A task B MUST list task A as a dependency when:
- B imports, uses, or builds upon types/modules/services defined in A's output files
- B's description references files listed in A's outputArtifacts
- B is a test/integration task and A implements the feature it tests
- B uses a database schema, shared module, or config file that A creates

Rules:
- NEVER remove any existing dependency — only add missing ones
- Only add logically necessary edges — do not add spurious dependencies
- Task IDs that have no logical predecessor should keep an empty array

Task list:
${JSON.stringify(compact, null, 2)}

Respond with ONLY a JSON object mapping every task ID to its complete (corrected) dependency array:
{"task-1": [], "task-2": ["task-1"], "task-3": ["task-1", "task-2"]}`;

  let result;
  try {
    result = await runClaude({ prompt, model: 'haiku', cwd });
  } catch (err) {
    await log.warn(`Dependency verification skipped: ${err instanceof Error ? err.message : String(err)}`);
    return tasks;
  }

  if (!result.success) {
    await log.warn('Dependency verification call failed — using original graph');
    return tasks;
  }

  let corrected: Record<string, string[]> | null = null;
  try {
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      corrected = JSON.parse(jsonMatch[0]) as Record<string, string[]>;
    }
  } catch {
    await log.warn('Could not parse dependency verification response — using original graph');
    return tasks;
  }

  if (!corrected) return tasks;

  let addedCount = 0;
  for (const task of tasks) {
    const correctedDeps = corrected[task.id];
    if (!Array.isArray(correctedDeps)) continue;

    const existing = new Set(task.dependencies);
    for (const dep of correctedDeps) {
      // Guard: dep must exist, not be self-reference, and not already present
      if (dep !== task.id && taskIds.has(dep) && !existing.has(dep)) {
        task.dependencies.push(dep);
        existing.add(dep);
        addedCount++;
        await log.info(`  + inferred dependency: ${task.id} → ${dep}`);
      }
    }
  }

  if (addedCount > 0) {
    await log.info(`Dependency verification added ${addedCount} missing edge(s)`);
  } else {
    await log.info('Dependency verification: graph is complete');
  }

  return tasks;
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

  const { tasks: rawTasks2 } = parsePlanOutput(result.output);
  const tasks = rawTasks2.map(toTask);

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

/**
 * Warn when declared artifact paths look wrong — e.g. use a top-level directory that
 * doesn't exist (like `android/` when the repo uses `google/`).
 *
 * For each artifact path that doesn't exist AND whose top-level directory doesn't exist,
 * we glob for similarly-named files in the repo to suggest a correction.
 */
async function warnArtifactPaths(tasks: Task[], cwd: string): Promise<void> {
  for (const task of tasks) {
    const artifacts = task.outputArtifacts ?? [];
    for (const artifact of artifacts) {
      const fullPath = path.join(cwd, artifact);
      // Only check files that don't already exist (new files are expected to not exist,
      // but their parent directory should exist or be recognisable)
      let parentExists = false;
      try {
        const parentDir = path.dirname(fullPath);
        await fs.access(parentDir);
        parentExists = true;
      } catch {
        parentExists = false;
      }

      if (!parentExists) {
        // Try to find a similar path: search for the filename in the repo
        const basename = path.basename(artifact);
        const topDir = artifact.split('/')[0];

        try {
          const similar = await glob(`**/${basename}`, { cwd, nodir: true, ignore: ['node_modules/**', '.git/**'], absolute: false });
          if (similar.length > 0) {
            await log.warn(
              `[ARTIFACT:PATH_WARNING] task "${task.id}" declares artifact "${artifact}" ` +
              `but parent dir "${topDir}/" does not exist. ` +
              `Similar file(s) found: ${similar.slice(0, 3).join(', ')}`,
            );
          } else {
            // Check if the top-level directory has a similar alternative
            const topDirs = await glob('*/', { cwd, absolute: false });
            const topDirNames = topDirs.map((d) => d.replace(/\/$/, ''));
            if (topDirNames.length > 0) {
              await log.warn(
                `[ARTIFACT:PATH_WARNING] task "${task.id}" declares artifact "${artifact}" ` +
                `but top-level directory "${topDir}/" does not exist. ` +
                `Available top-level dirs: ${topDirNames.slice(0, 8).join(', ')}`,
              );
            }
          }
        } catch {
          // glob failed — skip silently
        }
      }
    }
  }
}

/**
 * Warn about common plan quality issues that would cause failures at execution time.
 *
 * All warnings are logged — this function never throws. Issues flagged:
 * - Tasks with zero acceptance criteria (validator has nothing to check)
 * - Tasks with vague criteria (fewer than 15 chars — almost certainly wrong)
 * - Tasks with no outputArtifacts (artifact check will trivially pass, masking missing files)
 * - Spec ACs that appear nowhere in the task list (coverage gap)
 */
async function warnPlanQuality(tasks: Task[], cwd: string, specContent?: string): Promise<void> {
  let warnings = 0;

  for (const task of tasks) {
    if (task.acceptanceCriteria.length === 0) {
      await log.warn(`  ⚠️  Plan quality: task "${task.id}" has no acceptance criteria — validation will trivially pass`);
      warnings++;
    } else {
      const vague = task.acceptanceCriteria.filter((ac) => ac.trim().length < 15);
      if (vague.length > 0) {
        await log.warn(`  ⚠️  Plan quality: task "${task.id}" has ${vague.length} vague criterion/criteria: ${vague.map((v) => `"${v}"`).join(', ')}`);
        warnings++;
      }
    }
  }

  // Spec coverage check — extract AC-like bullet lines from specContent and verify coverage
  if (specContent) {
    const specAcs = extractSpecAcs(specContent);
    if (specAcs.length > 0) {
      const allTaskAcs = tasks.flatMap((t) => t.acceptanceCriteria).map((ac) => ac.toLowerCase());
      const uncovered = specAcs.filter((specAc) => {
        const lower = specAc.toLowerCase();
        // A spec AC is "covered" if any task AC contains meaningful overlap (first 40 chars)
        const prefix = lower.slice(0, 40);
        return !allTaskAcs.some((ac) => ac.includes(prefix) || prefix.includes(ac.slice(0, 40)));
      });
      if (uncovered.length > 0) {
        await log.warn(`  ⚠️  Spec coverage: ${uncovered.length} spec requirement(s) may not be covered by any task AC:`);
        for (const ac of uncovered.slice(0, 8)) {
          await log.warn(`      - ${ac.slice(0, 120)}`);
        }
        warnings++;
      }
    }
  }

  // AC path check — warn when acceptance criteria reference file paths that don't exist yet.
  // This catches typos (wrong path, wrong ext) that would silently fail artifact checks.
  const PATH_RE = /(?:^|\s)((?:\.\.?\/|src\/|packages?\/|apps?\/|lib\/|tests?\/)\S+\.\w{1,10})(?:\s|$|[,;])/g;
  for (const task of tasks) {
    for (const ac of task.acceptanceCriteria) {
      let m: RegExpExecArray | null;
      while ((m = PATH_RE.exec(ac)) !== null) {
        const candidate = m[1];
        try {
          await fs.access(cwd + '/' + candidate);
        } catch {
          await log.warn('  Warning: task "' + task.id + '" AC references non-existent path "' + candidate + '" — typo or new file?');
          warnings++;
        }
      }
    }
  }

  if (warnings === 0) {
    await log.info('Plan quality check: OK');
  } else {
    await log.warn('Plan quality check: ' + warnings + ' warning(s) — review before running');
  }
}

/**
 * Extract acceptance-criteria-like bullet lines from spec markdown.
 * Looks for lines in "Acceptance Criteria" sections.
 */
function extractSpecAcs(specContent: string): string[] {
  const acs: string[] = [];
  let inAcSection = false;

  for (const line of specContent.split('\n')) {
    if (/^#+\s+acceptance criteria/i.test(line)) {
      inAcSection = true;
      continue;
    }
    if (inAcSection && /^#+/.test(line)) {
      inAcSection = false;
    }
    if (inAcSection) {
      const bullet = line.match(/^[-*]\s+(.+)$/);
      if (bullet && bullet[1].trim().length > 20) {
        acs.push(bullet[1].trim());
      }
    }
  }

  return acs;
}

function parsePlanOutput(output: string): RawPlan {
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
    const parsed = JSON.parse(jsonStr) as RawPlan;
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error('Response missing "tasks" array');
    }
    const questions: PlanQuestion[] = Array.isArray(parsed.questions)
      ? parsed.questions.map((q) => {
          if (typeof q === 'string') {
            return { type: 'text' as const, text: q };
          }
          // Already structured — ensure required fields
          return {
            type: q.type ?? 'text',
            text: q.text,
            options: q.options,
            defaultValue: q.defaultValue,
          } as PlanQuestion;
        }).filter((q) => q.text && q.text.trim())
      : [];
    return {
      tasks: parsed.tasks,
      questions,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
    };
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
    implementationSteps: raw.implementationSteps && raw.implementationSteps.length > 0 ? raw.implementationSteps : undefined,
    status: 'pending',
    retries: 0,
    maxRetries: 2,
    ifFailed: 'skip',
    timeout: Math.min(raw.timeoutMinutes ?? 60, 60) * 60_000,
  };
}
