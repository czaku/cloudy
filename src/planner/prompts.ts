export function buildPlanningPrompt(goal: string, specContent?: string, claudeMdContent?: string): string {
  const specSection = specContent
    ? `\n# Specification\n${specContent.slice(0, 120000)}\n\nUse this spec to derive specific tasks and acceptance criteria. Include ALL tasks mentioned in the spec — do not drop or merge tasks unless they are truly trivial.\n`
    : '';

  const claudeMdSection = claudeMdContent
    ? `\n# Project Context (CLAUDE.md)\n${claudeMdContent.slice(0, 4000)}\n`
    : '';

  return `You are a software project planner. Decompose the following goal into concrete, ordered implementation tasks.

# Goal
${goal}${specSection}${claudeMdSection}

# Instructions

Break this goal into sequential implementation tasks. Each task should be:
- Small enough for one focused coding session
- Concrete and actionable (not vague like "set up project")
- Ordered by dependency (earlier tasks are prerequisites for later ones)

For each task, provide:
- A short title
- A concise description (2-3 sentences max) of what to implement and which files to touch. Do NOT reproduce the full spec detail — the executor has access to the full spec.
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

# Output Format

Respond with ONLY valid JSON (no markdown, no explanation), matching this structure:

{
  "tasks": [
    {
      "id": "task-1",
      "title": "Short descriptive title",
      "description": "Detailed description of what to implement",
      "acceptanceCriteria": [
        "Specific testable condition 1",
        "Specific testable condition 2"
      ],
      "dependencies": [],
      "contextPatterns": ["src/relevant-file.ts", "src/related/**"],
      "outputArtifacts": ["src/auth/routes.ts", "migrations/001_users.ts"],
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
  ]
}

Important:
- Task IDs must be "task-1", "task-2", etc.
- Dependencies reference task IDs that must be completed first
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

  return `You are reviewing code changes for the task: "${taskTitle}"

# Acceptance Criteria
${acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
${responsibilitiesSection}${priorSection}${artifactSection}
# Git Diff
\`\`\`
${gitDiff}
\`\`\`
${fileSection}
# Instructions

Review the changes against the acceptance criteria. Use the changed file sections (if provided) to verify correctness in context.

IMPORTANT rules:
- Only evaluate what THIS task was responsible for. Do not fail a criterion because a pre-existing file (listed above) is absent from the diff — it was created by an earlier task and already exists.
- If the artifact check confirms all output files exist on disk, do not fail on "file is missing".
- The changed file sections show the most relevant parts of modified files around the actual changes — not necessarily the whole file head.
- For criteria referencing behaviour (e.g. "function X returns Y"), verify the implementation exists somewhere in the diff or the shown file sections.

Check for:
- Does each criterion have a concrete implementation in the diff or shown file sections?
- Are there obvious bugs (wrong types, missing awaits, unhandled errors)?
- Are edge cases handled?

Respond with ONLY valid JSON:

{
  "passed": true/false,
  "summary": "Brief summary of the review",
  "criteriaResults": [
    {
      "criterion": "The criterion text",
      "met": true/false,
      "reason": "Why it is or isn't met — cite specific code if failing"
    }
  ]
}
`;
}
