export function buildPlanningPrompt(goal: string, specContent?: string, claudeMdContent?: string, runInsights?: string, codebaseSnapshot?: string): string {
  const specSection = specContent
    ? `\n# Specification\n${specContent.slice(0, 120000)}\n\nUse this spec to derive specific tasks and acceptance criteria. Include ALL tasks mentioned in the spec — do not drop or merge tasks unless they are truly trivial.\n`
    : '';

  const claudeMdSection = claudeMdContent
    ? `\n# Project Context (CLAUDE.md)\n${claudeMdContent.slice(0, 4000)}\n`
    : '';

  const insightsSection = runInsights
    ? `\n# Learnings from Previous Runs\n${runInsights}\n`
    : '';

  const snapshotSection = codebaseSnapshot
    ? `\n${codebaseSnapshot}\n`
    : '';

  return `You are a software project planner. Decompose the following goal into concrete, ordered implementation tasks.

# Goal
${goal}${specSection}${claudeMdSection}${insightsSection}${snapshotSection}
# Standing Rules

PRISMA RULE: Any task that modifies \`prisma/schema.prisma\` MUST include \`npx prisma migrate dev --name <descriptive-name>\` as an explicit step. The agent must NEVER create migration files manually. The migration command must run and exit 0. Declare the generated \`backend/prisma/migrations/*_<name>/migration.sql\` as a required artifact.


# Instructions

Break this goal into sequential implementation tasks. Each task should be:
- Small enough for one focused coding session
- Concrete and actionable (not vague like "set up project")
- Ordered by dependency (earlier tasks are prerequisites for later ones)

For each task, provide:
- A short title
- A concise description (2-3 sentences max) of what to implement and which files to touch. Do NOT reproduce the full spec detail — the executor has access to the full spec.
- type: one of "implement", "verify", "review", or "closeout". Use "verify" for screenshot/proof/parity/check tasks, "review" for semantic/audit tasks, and "closeout" for Keel/task-update closure work.
- Implementation approach (optional, 1 sentence): if the task involves new logic or a non-obvious implementation choice, state the approach. Otherwise omit.
- implementationSteps (optional array): if the task produces testable units (functions, endpoints, components), provide an ordered list of implementation steps. For TDD tasks this is typically: ["Write failing test(s) for the acceptance criteria", "Run tests — confirm they are red", "Implement the minimum code to pass", "Run tests — confirm they are green"]. For non-TDD tasks (config, migration, scaffolding) omit this field entirely. Tailor the steps to the task type — the goal is to give the executor a clear sequence, not to mandate a fixed template.
- Specific acceptance criteria — each criterion MUST be one of:
    (a) A shell command that exits 0: e.g. "cd web && bunx tsc --noEmit exits 0"
    (b) A file that must exist with a specific export: e.g. "api/executor/quality_monitor.py exports QualityMonitor class"
    (c) An observable API behaviour: e.g. "POST /api/v1/tasks/{id}/execute returns 200 with run_id field"
    (d) A structural requirement: e.g. "All async functions in orchestrator.py use await, no blocking I/O"
  Avoid vague criteria like "Feature works" or "Implementation complete".
- Dependencies (which other task IDs must be completed first)
- Context patterns: file glob patterns for existing files that are relevant to the task (e.g. "src/components/Header.tsx", "api/routes/**", "lib/utils/*.ts"). These help the executor understand the codebase context. Use glob syntax where appropriate.
- outputArtifacts: List key files this task must create. Only include files this task is responsible for creating (not files that already exist). Use exact paths, not globs.
- timeoutMinutes: Estimate how long this task might take Claude to execute. Use 15 for simple edits, 30 for typical coding tasks, 60 for the largest tasks. Cap at 60 — if a task needs more than 60 minutes it should be split into smaller tasks instead.

Proof/verification planning rules:
- If a task is mainly about screenshots, proof capture, parity review, or task closure, prefer a verify/review/closeout task instead of an implementation task.
- For verify tasks, acceptance criteria should start with existing artifacts/commands before any code change requirement.
- If the task may already be satisfied by existing files or screenshots, still create the task, but write the criteria so the executor can verify and move on without inventing code changes.

Task Sizing Rules:
- IDEAL: A task whose acceptance criterion is a single shell command (e.g. "tsc --noEmit exits 0"). If you can state the criterion as one command, the task size is right.
- TOO LARGE: A task that touches more than 3 unrelated files or implements more than one user-facing feature — split it.
- TOO SMALL: A task that only adds a type alias or renames a variable — merge with a related task.
- Sweet spot: 15-30 minutes, one clear deliverable, one passing shell command as the criterion.

# Output Format

Respond with ONLY valid JSON (no markdown, no explanation), matching this structure:

{
  "tasks": [
    {
      "id": "task-1",
      "title": "Short descriptive title",
      "description": "Detailed description of what to implement",
      "type": "implement",
      "acceptanceCriteria": [
        "Specific testable condition 1",
        "Specific testable condition 2"
      ],
      "dependencies": [],
      "contextPatterns": ["src/relevant-file.ts", "src/related/**"],
      "outputArtifacts": ["src/auth/routes.ts", "migrations/001_users.ts"],
      "implementationSteps": ["Write failing test for X", "Run tests — confirm red", "Implement X", "Run tests — confirm green"],
      "timeoutMinutes": 30
    },
    {
      "id": "task-2",
      "title": "Next task title",
      "description": "What to implement",
      "acceptanceCriteria": ["Condition"],
      "dependencies": ["task-1"],
      "contextPatterns": ["src/other-file.ts"],
      "outputArtifacts": [],
      "timeoutMinutes": 15
    }
  ],
  "rationale": "One paragraph: approach chosen and why, 1-2 alternatives rejected, key assumptions this plan depends on.",
  "questions": [
    { "type": "select", "text": "Should auth use JWT or session cookies?", "options": ["JWT (stateless)", "Session cookies (stateful)"] },
    { "type": "text", "text": "Which cloud region should S3 buckets target?" },
    { "type": "confirm", "text": "Should we include rate limiting on all API endpoints?" }
  ]
}

The "questions" array must contain 0–3 high-impact clarifying questions. Only include questions about decisions that would materially change the task design — architecture choices, external service selection, data model decisions. If the spec is clear and complete, return an empty array. Do NOT ask about implementation details that can be inferred from context or convention.

Each question must have a "type" field:
- Use "select" when there are 2–4 mutually exclusive choices — always include an "options" array.
- Use "multiselect" when multiple options can be selected — always include an "options" array.
- Use "confirm" for yes/no decisions.
- Use "text" for open-ended questions where options cannot be enumerated.
Always include "options" for select/multiselect types. Never include "options" for text/confirm types.

Important:
- Task IDs must be "task-1", "task-2", etc.
- Dependencies reference task IDs that must be completed first. Set these CAREFULLY — running tasks in the wrong order in parallel will cause import errors, missing modules, and broken builds.
- Most tasks will have at least one dependency. Only the very first task(s) that set up the foundation (e.g. database schema, module scaffold, shared types) should have empty dependencies arrays.
- If task B uses types, imports, or modules created by task A, then B must list A in its dependencies. When in doubt, add the dependency — it is always safer to serialize than to race.
- Aim for tasks that represent a few hours of focused work each — not so small they're trivial, not so large they risk failure (avoid bundling 3+ independent features into one task)
- If a spec lists explicit tasks, preserve them — do not merge or drop tasks from the spec
- First task should have no dependencies
- Every task must be reachable from a task with no dependencies
`;
}

export interface PriorArtifact {
  file: string;
  taskId: string;
  taskTitle: string;
}

export function buildValidationPrompt(
  taskTitle: string,
  acceptanceCriteria: string[],
  gitDiff: string,
  changedFileSections?: Array<{ path: string; content: string; note?: string }>,
  priorArtifacts?: PriorArtifact[],
  artifactCheckPassed?: boolean,
  taskOutputArtifacts?: string[],
  commandResults?: Array<{ label: string; passed: boolean; output: string }>,
  baselineFailures?: string[],
): string {
  const fileSection = changedFileSections && changedFileSections.length > 0
    ? `\n# Changed Files (relevant sections)\n${changedFileSections.map(
        (f) => `\n## ${f.path}${f.note ? ` — ${f.note}` : ''}\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n')}\n`
    : '';

  const responsibilitiesSection = taskOutputArtifacts && taskOutputArtifacts.length > 0
    ? `\n# This Task's Output Files\nThis task was responsible for creating or modifying:\n${
        taskOutputArtifacts.map((f) => `- ${f}`).join('\n')
      }\n`
    : '';

  const priorSection = priorArtifacts && priorArtifacts.length > 0
    ? `\n# Pre-existing Files (created by earlier tasks — NOT in this diff)\nThese files already exist on disk but were created by prior tasks. Do NOT expect them to appear in the diff:\n${
        priorArtifacts.map((a) => `- ${a.file}  (created by ${a.taskId}: "${a.taskTitle}")`).join('\n')
      }\n`
    : '';

  const artifactSection = artifactCheckPassed !== undefined
    ? `\n# Artifact Check Result\n${
        artifactCheckPassed
          ? '✓ All required output files confirmed present on disk.'
          : '✗ Some required output files are missing (artifact check failed).'
      }\n`
    : '';

  // Ground-truth evidence from deterministic checks run before this AI review.
  // If a smoke test confirms an HTTP endpoint returns 200, that is stronger evidence
  // than the diff alone. Do not fail a criterion that a passing command already proves.
  const commandSection = commandResults && commandResults.length > 0
    ? `\n# Deterministic Check Results (run before this review — treat as ground truth)\n${
        commandResults.map((r) =>
          `${r.passed ? '✓' : '✗'} [${r.label}] ${r.output.slice(0, 400)}${r.output.length > 400 ? '…' : ''}`
        ).join('\n')
      }\n`
    : '';

  const baselineSection = baselineFailures && baselineFailures.length > 0
    ? `\n# Pre-existing Test Failures (ignore these — they were failing before this task ran)\n${
        baselineFailures.map((t) => `- ${t}`).join('\n')
      }\nDo NOT fail any criterion solely because one of the above tests fails — they were already broken.\n`
    : '';

  return `You are reviewing code changes for the task: "${taskTitle}"

IMPORTANT: Do not trust the implementation's apparent completeness at face value.
Read the actual diff and file sections below. Compare each acceptance criterion
line-by-line against what you can see in the code — not against what you would
expect to see. If evidence is absent, the criterion is not met.

# Acceptance Criteria
${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
${responsibilitiesSection}${priorSection}${artifactSection}${commandSection}${baselineSection}
# Git Diff
\`\`\`
${gitDiff}
\`\`\`
${fileSection}
# Instructions

Review the changes against the acceptance criteria. Use the changed file sections and deterministic check results (if provided) to verify correctness.

IMPORTANT rules:
- Only evaluate what THIS task was responsible for. Do not fail a criterion because a pre-existing file (listed above) is absent from the diff — it was created by an earlier task and already exists on disk.
- If the artifact check confirms all output files exist on disk, do not fail on "file is missing".
- The changed file sections show the most relevant parts of modified files around the actual changes — not necessarily the whole file head.
- For criteria referencing behaviour (e.g. "function X returns Y"), verify the implementation exists somewhere in the diff or the shown file sections.
- If deterministic check results above show a command passed (e.g. a smoke test returning HTTP 200 for an endpoint), treat that as conclusive evidence that the criterion is met — do not fail it just because the endpoint code isn't visible in the shown diff sections.
- The diff may not show every file that changed (large tasks touch many files). If a criterion is about something that is plausibly implemented given the other evidence, give the benefit of the doubt.
- Do NOT fail criteria that require running tests (e.g. "unit tests pass", "integration tests pass") solely because no test execution output appears in the deterministic check results. The validation environment may lack a test database, running server, or other runtime. If the test code exists, is syntactically correct, and the test cases look reasonable, mark those criteria as met.

Check for:
- Does each criterion have concrete evidence of implementation (diff, file sections, or passing commands)?
- Are there obvious bugs (wrong types, missing awaits, unhandled errors)?
- Are edge cases handled?

SCOPE CHECK — this is critical:
- Flag anything implemented that was NOT requested in the acceptance criteria. Extra flags, extra endpoints, extra fields, extra abstractions — all should be noted in "extras".
- "No extras" means: if it wasn't in the AC, it shouldn't be in the diff. Over-building is a spec violation just like under-building.

Respond with ONLY valid JSON:

{
  "passed": true/false,
  "summary": "Brief summary of the review",
  "criteriaResults": [
    {
      "criterion": "The criterion text",
      "met": true/false,
      "reason": "Why it is or isn't met — cite specific code or command output if failing"
    }
  ],
  "extras": ["Describe any implementation added beyond the acceptance criteria, or empty array if none"]
}
`;
}

/**
 * Build a code quality review prompt. This is Phase 2b — runs only after spec compliance
 * (Phase 2a) passes. It focuses purely on how the implementation is built, not what it does.
 */
export function buildQualityReviewPrompt(
  taskTitle: string,
  gitDiff: string,
  changedFileSections?: Array<{ path: string; content: string; note?: string }>,
): string {
  const fileSection = changedFileSections && changedFileSections.length > 0
    ? `\n# Changed Files (relevant sections)\n${changedFileSections.map(
        (f) => `\n## ${f.path}${f.note ? ` — ${f.note}` : ''}\n\`\`\`\n${f.content}\n\`\`\``
      ).join('\n')}\n`
    : '';

  return `You are doing a code quality review of the implementation for task: "${taskTitle}"

The spec compliance check has already passed — this task built the right things. Your job is to assess how well it is built.

# Git Diff
\`\`\`
${gitDiff}
\`\`\`
${fileSection}
# What to check

**Critical (block the task):**
- Hardcoded values that should be constants or config
- Missing error handling on I/O operations, network calls, or external services
- Obvious logic bugs (off-by-one, wrong operator, unreachable code)
- Security issues (SQL injection, XSS, unvalidated input, secrets in code)
- Async/await misuse (missing await, fire-and-forget that should be awaited)

**Important (flag but don't block unless severe):**
- Duplicated logic that should be extracted (3+ repetitions)
- Magic numbers or strings with no explanation
- Functions doing more than one thing
- Names that are actively misleading (not just un-ideal)

**Do NOT flag:**
- Style preferences (variable naming style, formatting, line length)
- Missing comments or documentation
- Things that work but could theoretically be written differently
- Reasonable abstraction choices

Respond with ONLY valid JSON:

{
  "passed": true/false,
  "summary": "One sentence verdict",
  "strengths": ["2-3 things the implementation does well — be specific"],
  "issues": [
    {
      "severity": "critical" | "important",
      "location": "file.ts:line or 'general'",
      "description": "What the issue is and why it matters"
    }
  ]
}

Before listing issues, identify 2–3 concrete strengths. This calibrates the review.
Set "passed" to false only if there are critical issues. Important issues should be listed but do not fail the review unless there are 3 or more.
`;
}

/**
 * Plan pre-flight review — cheap haiku call before execution starts.
 * Warns about critical plan problems without blocking autonomous runs.
 * (#6 from superpowers improvements)
 */
export function buildPlanPreflightPrompt(goal: string, tasks: Array<{ id: string; title: string; description: string; dependencies: string[] }>): string {
  const taskList = tasks.map((t) =>
    `- ${t.id}: ${t.title}${t.dependencies.length ? ` (depends: ${t.dependencies.join(', ')})` : ''}\n  ${t.description}`
  ).join('\n');

  return `You are doing a quick pre-flight review of an implementation plan before execution starts.

# Goal
${goal}

# Tasks
${taskList}

# What to check
- Tasks that reference tools, APIs, frameworks, or files that almost certainly don't exist in a typical project
- Acceptance criteria that are impossible to verify (e.g. "works correctly" with no measurable definition)
- Missing tasks that are obviously required as prerequisites (e.g. a migration task with no schema task before it)
- Do NOT flag: implementation choices, ordering preferences, or anything that is a matter of opinion

This is a warn-only review. The run will proceed regardless — you are flagging problems so the user is aware, not blocking execution.

Respond with ONLY valid JSON:

{
  "concerns": ["Each concern in one sentence — be specific about which task and why"],
  "safe_to_proceed": true/false
}

Set "safe_to_proceed" to false only if you see a critical blocker (e.g. task-3 depends on task-5 which doesn't exist). For style or preference issues, set true and leave concerns empty.`;
}
