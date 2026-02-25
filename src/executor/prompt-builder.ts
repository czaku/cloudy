import type { Task, Plan } from '../core/types.js';
import { buildContextSection, type ContextFile } from './context-resolver.js';

export interface ExecutionPromptOptions {
  task: Task;
  plan: Plan;
  completedTaskTitles: string[];
  contextFiles?: ContextFile[];
  learningsContent?: string;       // contents of .cloudy/LEARNINGS.md
  handoffSummaries?: string;       // formatted dependency handoff sections
  conventionsContent?: string;     // CLAUDE.md / AGENTS.md from project root
}

/**
 * Build the execution prompt for a task. Supports both the original
 * positional API and a new options-object API that carries learnings/handoffs.
 */
export function buildExecutionPrompt(
  taskOrOpts: Task | ExecutionPromptOptions,
  planArg?: Plan,
  completedTitlesArg?: string[],
  contextFilesArg?: ContextFile[],
): string {
  let task: Task;
  let plan: Plan;
  let completedTaskTitles: string[];
  let contextFiles: ContextFile[];
  let learningsContent: string | undefined;
  let handoffSummaries: string | undefined;
  let conventionsContent: string | undefined;

  if ('task' in taskOrOpts && 'plan' in taskOrOpts) {
    const opts = taskOrOpts as ExecutionPromptOptions;
    task = opts.task;
    plan = opts.plan;
    completedTaskTitles = opts.completedTaskTitles;
    contextFiles = opts.contextFiles ?? [];
    learningsContent = opts.learningsContent;
    handoffSummaries = opts.handoffSummaries;
    conventionsContent = opts.conventionsContent;
  } else {
    task = taskOrOpts as Task;
    plan = planArg!;
    completedTaskTitles = completedTitlesArg ?? [];
    contextFiles = contextFilesArg ?? [];
  }

  const parts: string[] = [];

  // ── Project conventions (CLAUDE.md / AGENTS.md) ─────────────────────────
  // Placed first so Claude internalises conventions before seeing the task.
  if (conventionsContent?.trim()) {
    parts.push('# Project Conventions');
    parts.push(conventionsContent.trim());
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  parts.push(`# Project Goal\n${plan.goal}\n`);

  // Inject accumulated project learnings from prior tasks
  if (learningsContent?.trim()) {
    parts.push(learningsContent.trim());
    parts.push('');
  }

  // Inject handoff summaries from dependency tasks
  if (handoffSummaries?.trim()) {
    parts.push(handoffSummaries.trim());
    parts.push('');
  }

  parts.push(`# Your Task: ${task.title}\n${task.description}\n`);

  if (task.acceptanceCriteria.length > 0) {
    parts.push('# Acceptance Criteria');
    for (const criterion of task.acceptanceCriteria) {
      parts.push(`- ${criterion}`);
    }
    parts.push('');
  }

  if (completedTaskTitles.length > 0) {
    parts.push('# Already Completed Tasks');
    for (const title of completedTaskTitles) {
      parts.push(`- ${title}`);
    }
    parts.push('');
  }

  const contextSection = buildContextSection(contextFiles);
  if (contextSection) {
    parts.push(contextSection);
  }

  parts.push('# Instructions');
  parts.push(
    'Implement this task completely. Write all necessary code, create files as needed.',
  );
  parts.push('Do NOT explain what you will do - just do it. Write the actual code.');
  parts.push('Follow all conventions in the Project Conventions section above exactly.');
  parts.push('When done, briefly summarize what you implemented (files created/modified, key decisions).');
  parts.push('');
  parts.push(
    'If you discover any project-specific facts (libraries, file locations, patterns, conventions) that future tasks should know, end your response with:',
  );
  parts.push('## LEARNINGS');
  parts.push('- <one or two bullet points of key facts discovered>');
  parts.push('');
  parts.push(
    'If you discover additional work beyond this task\'s scope, end with ## SUBTASKS — one line per task:',
  );
  parts.push('## SUBTASKS');
  parts.push('- [task-N-x] Title (depends: task-N)');

  return parts.join('\n');
}

/**
 * Build a retry prompt when a task has failed validation.
 * Includes targeted code snippets extracted from the error context.
 */
export function buildRetryPrompt(
  task: Task,
  plan: Plan,
  completedTaskTitles: string[],
  validationErrors: string,
  contextFiles: ContextFile[] = [],
  learningsContent?: string,
  handoffSummaries?: string,
  conventionsContent?: string,
  errorFileContext?: string,
): string {
  const base = buildExecutionPrompt({
    task,
    plan,
    completedTaskTitles,
    contextFiles,
    learningsContent,
    handoffSummaries,
    conventionsContent,
  });

  const contextSection = errorFileContext?.trim()
    ? `\n${errorFileContext.trim()}\n`
    : '';

  return `${base}

# RETRY — Previous Attempt Failed

The previous attempt had these errors that MUST be fixed:

${validationErrors}
${contextSection}
Address each error precisely. Do not rewrite working parts — only fix what failed.`;
}
