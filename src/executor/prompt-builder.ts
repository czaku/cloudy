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
  rollingContextSummary?: string;  // AI-generated summary of what previous tasks in this run built
  decisionLog?: import('../core/types.js').DecisionLogEntry[];  // resolved planning decisions
  architecturalContext?: string;   // derived from dependency graph — where this task fits
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
  let rollingContextSummary: string | undefined;
  let decisionLog: import('../core/types.js').DecisionLogEntry[] | undefined;
  let architecturalContext: string | undefined;

  if ('task' in taskOrOpts && 'plan' in taskOrOpts) {
    const opts = taskOrOpts as ExecutionPromptOptions;
    task = opts.task;
    plan = opts.plan;
    completedTaskTitles = opts.completedTaskTitles;
    contextFiles = opts.contextFiles ?? [];
    learningsContent = opts.learningsContent;
    handoffSummaries = opts.handoffSummaries;
    conventionsContent = opts.conventionsContent;
    rollingContextSummary = opts.rollingContextSummary;
    decisionLog = opts.decisionLog;
    architecturalContext = opts.architecturalContext;
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

  // Inject rolling context summary (AI-generated summary of all previously completed tasks)
  if (rollingContextSummary?.trim()) {
    parts.push('## Progress So Far (Rolling Summary)');
    parts.push('> This summarizes what previous tasks in this run already built. Do not re-implement these.');
    parts.push(rollingContextSummary.trim());
    parts.push('');
  }

  // Inject planning decisions — these are the resolved ambiguities from the Q&A phase.
  // Implement according to these decisions; do not second-guess them.
  if (decisionLog && decisionLog.length > 0) {
    parts.push('## Planning Decisions');
    parts.push('The following ambiguities were resolved before implementation began. Implement exactly according to these decisions:');
    for (const d of decisionLog) {
      const source = d.answeredBy === 'human' ? '(human)' : '(AI assumed)';
      parts.push(`- **${d.question.split('?')[0].trim()}?** → ${d.answer} ${source}`);
    }
    parts.push('');
  }

  // Inject handoff summaries from dependency tasks
  if (handoffSummaries?.trim()) {
    parts.push(handoffSummaries.trim());
    parts.push('');
  }

  // #5 — Architectural scene-setting: where this task fits in the dependency graph
  if (architecturalContext?.trim()) {
    parts.push('## Context');
    parts.push(architecturalContext.trim());
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

  if (task.outputArtifacts && task.outputArtifacts.length > 0) {
    parts.push('# Required Output Files');
    parts.push('You MUST create ALL of the following files. Do not skip or omit any:');
    for (const artifact of task.outputArtifacts) {
      parts.push(`- ${artifact}`);
    }
    parts.push('');
  }

  if (task.implementationSteps && task.implementationSteps.length > 0) {
    parts.push('## Implementation Steps');
    task.implementationSteps.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
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

  // #3 — Ask-questions-first gate (always use non-interactive note since cloudy runs autonomously)
  parts.push('## Before You Begin');
  parts.push('If anything in this task is unclear — the approach, which existing files to modify,');
  parts.push('how this integrates with already-completed tasks — document your assumption and reasoning');
  parts.push('in your summary. Since you are running autonomously, make the most reasonable assumption');
  parts.push('rather than blocking. Do not ask questions — proceed with a documented assumption.');
  parts.push('');

  parts.push('# Instructions');
  parts.push(
    'Implement this task completely. Write all necessary code, create files as needed.',
  );
  parts.push('Do NOT explain what you will do - just do it. Write the actual code.');
  parts.push('Follow all conventions in the Project Conventions section above exactly.');
  parts.push('');
  parts.push('**CRITICAL — File paths:** Always write files using RELATIVE paths (e.g. `src/Foo.swift`, `StrikeThePose/Bar.ts`).');
  parts.push('NEVER use absolute paths starting with `/Users/`, `/home/`, or `~/`.');
  parts.push('Your working directory is the project root. Relative paths resolve correctly from it.');
  parts.push('');
  parts.push('**CRITICAL — Discovery discipline:** Start from the provided context files before exploring.');
  parts.push('Prefer targeted `rg`, `sed`, and `ls` commands over broad `find` scans.');
  parts.push('Do not crawl unrelated parts of the repo just to learn the structure.');
  parts.push('Once the relevant files are identified, move directly into implementation or verification.');
  parts.push('');

  // #9 — Anti-pattern catalog (general + testing, merged into one section)
  parts.push('## Anti-Patterns — Do Not Do These');
  parts.push('- "I\'ll verify later" — verify now, before summarising');
  parts.push('- "The tests should pass" — run them and show the actual pass/fail count');
  parts.push('- "I\'ll add that cleanup in a follow-up" — scope = exactly what\'s in the AC');
  parts.push('- "This approach is close enough" — implement exactly what was specified');
  parts.push('- Mock returns what you told it to return — that tests the mock, not the code; use in-memory DB or temp files for integration tests');
  parts.push('- Tests without assertions — a test that does not assert is not a test');
  parts.push('- `expect(fn()).toBeDefined()` — assert the actual value, not just that something exists');
  parts.push('');

  parts.push('## Verification Gate (mandatory before claiming done)');
  parts.push('Before summarizing completion, run at least one verification command that proves the work is correct:');
  parts.push('- TypeScript/JS: `tsc --noEmit` (or project equivalent) — show actual error count');
  parts.push('- Tests added: run the test command — show actual pass/fail count, not "should pass"');
  parts.push('- New endpoints/functions: call them with realistic input — show actual output');
  parts.push('- Python: `python -m py_compile` on changed files');
  parts.push('Do NOT summarise completion based on how the code looks. Run a command that proves it works.');
  parts.push('');

  // #1 — Self-review checklist (runs after verification, before summary)
  parts.push('## Before Reporting: Self-Review');
  parts.push('After verification, review your work before summarising:');
  parts.push('- Completeness: Did you implement every acceptance criterion? Any edge cases missed?');
  parts.push('- YAGNI: Did you add anything not in the spec? If yes, remove it before continuing.');
  parts.push('- Quality: Are names clear? Is the logic easy to follow?');
  parts.push('- Tests: If you wrote tests, do they test real behaviour (not just mock wiring)?');
  parts.push('Fix any issues found, then summarise.');
  parts.push('');

  parts.push('When done, briefly summarize what you implemented (files created/modified, key decisions, any assumptions made) and include the verification output.');
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
  priorFilesCreated?: string[],
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

  const priorFilesSection =
    priorFilesCreated && priorFilesCreated.length > 0
      ? `\n# Files Created in Previous Attempt\nYour previous attempt created these files. Check whether they are in the correct location — if any are misplaced or duplicated, delete or move them as part of this retry:\n${priorFilesCreated.map((f) => `- ${f}`).join('\n')}\n`
      : '';

  const escalationNote = task.retries >= 2
    ? `\nThis is attempt ${task.retries + 1}. ${task.retries} prior fix${task.retries > 1 ? 'es' : ''} failed. Before trying again, question whether your overall approach is correct — not just the last fix. Consider a fundamentally different strategy.\n`
    : '';

  return `${base}

# RETRY — Previous Attempt Failed

The previous attempt had these errors that MUST be fixed:

${validationErrors}
${contextSection}${priorFilesSection}
## Before Attempting Any Fix
1. Read the error output above completely — the exact message often contains the solution
2. Identify WHICH line/function triggers the failure (trace backward from the error)
3. State your root cause hypothesis explicitly before writing code
4. Make the SMALLEST possible change to test that hypothesis
Do NOT shotgun-fix multiple things at once. Fix one root cause, then verify.
${escalationNote}
Address each error precisely. Do not rewrite working parts — only fix what failed.`;
}
