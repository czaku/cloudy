# Superpowers → Cloudy: Planning & Pre-Coding Phase Improvements

Patterns identified from [obra/superpowers](https://github.com/obra/superpowers) that target the **planning, design, and pre-execution phases** — everything that happens before `runTask()` fires. All 10 are new; none overlap with the Wave 1/2 proposals.

---

## Autonomy Constraint

Same rule as Wave 2 proposal applies here:

> **When `isNonInteractive === true` (`src/cli/commands/run.ts:162`), skip or auto-resolve any blocking gate. Never pause autonomous runs.**

Each item below notes its non-interactive behaviour explicitly.

---

## Overview

| # | Name | Phase | Risk | Non-interactive |
|---|------|-------|------|-----------------|
| 1 | Codebase exploration before planning | Pre-plan | Low | Auto-summarise |
| 2 | Baseline test run as pre-execution gate | Pre-execution | Low | Log + continue |
| 3 | Human approval checkpoint | Pre-execution | Medium | Auto-proceed |
| 4 | TDD as numbered task sub-steps | Plan generation | Low | Built-in |
| 5 | Design rationale document | Post-planning | Low | Auto-generate |
| 6 | Sequential clarifying questions | Planning Q&A | Medium | Auto-answer all |
| 7 | Git worktree isolation per task | Execution | High | Same as interactive |
| 8 | Task granularity guidance | Plan generation | Low | Built-in |
| 9 | Testing anti-patterns in executor context | Execution prompt | Low | Built-in |
| 10 | Pre-planning brainstorming gate | Pre-plan | Medium | Skip gate entirely |

---

## Item 1 — Codebase Exploration Before Planning

### Current State
`createPlan()` in `src/planner/planner.ts` calls `buildPlanningPrompt(goal, specContent, claudeMdContent, runInsights)` and sends it straight to Claude. Claude plans blind — it has no knowledge of the actual repo structure, existing services, import paths, or test baseline.

**Symptom**: tasks reference wrong file paths, import things that don't exist, or duplicate functionality that's already there.

### What Superpowers Does
Before creating a plan, superpowers runs a structured repo exploration pass using a small Haiku call:
- `find . -name "*.ts" | head -60` — what files exist
- Reads `package.json` / `Cargo.toml` / `pyproject.toml` — dependency map
- Reads existing test files — what's already covered
- Reads README + CLAUDE.md — project conventions

The output (a structured JSON or markdown summary) is injected into `buildPlanningPrompt()` as a `# Codebase Snapshot` section.

### Implementation

**File: `src/planner/planner.ts`** — add before `buildPlanningPrompt()` call:

```typescript
const codebaseSnapshot = await exploreCodebase(cwd, model);
```

**New file: `src/planner/codebase-explorer.ts`**:
```typescript
export async function exploreCodebase(cwd: string, model: ClaudeModel): Promise<string> {
  // Haiku call with prompt:
  // "Summarise this repo in 300 words for a planner agent. Cover:
  //  - key directories and their purpose
  //  - main dependencies (from package.json / requirements.txt)
  //  - test framework and test file locations
  //  - any build commands you see in scripts or Makefile
  //  Return plain markdown, no fences."
}
```

**File: `src/planner/prompts.ts`** — add `codebaseSnapshot?: string` param to `buildPlanningPrompt()`, inject as `# Codebase Snapshot` section.

### Non-interactive
Identical behaviour — exploration is read-only and never blocks.

### Why It Matters
This is the single highest-leverage fix for task failure at the planning stage. Plans written with real repo knowledge have dramatically more accurate file references and avoid duplicating existing work.

---

## Item 2 — Baseline Test Run as Pre-Execution Gate

### Current State
Cloudy starts executing tasks with no knowledge of which tests were already failing. Validation can't distinguish "tests we broke" from "tests that were already red before we started."

**Symptom**: a task fails validation because a pre-existing broken test runs in its test suite. The task retries, can't fix something it didn't break, and exhausts retries.

### What Superpowers Does
Before the first task runs, superpowers executes the project test command and captures the baseline pass/fail snapshot. This is stored and passed to the validator: "these tests were already failing before this run — ignore them."

### Implementation

**File: `src/cli/commands/run.ts`** — after plan approval, before `orchestrator.run()`:
```typescript
const baseline = await captureTestBaseline(planConfig.testCommand, cwd);
```

**New file: `src/core/baseline.ts`**:
```typescript
export interface TestBaseline {
  failingTests: string[];   // test names/IDs that were red before the run
  capturedAt: string;       // ISO timestamp
  command: string;          // what was run
}

export async function captureTestBaseline(command: string, cwd: string): Promise<TestBaseline | null>
```

The baseline is written to `.cloudy/baseline.json` and loaded by the validator when checking test criteria.

**File: `src/planner/prompts.ts`** — `buildValidationPrompt()` gets a `baselineFailures?: string[]` param; injects a `# Pre-existing Test Failures (ignore these)` section.

### Non-interactive
Capture baseline, log it, continue. Never block.

### Config
Add `testCommand?: string` to `RunConfig` (already partially wired in `src/core/types.ts`). If not set, skip silently.

---

## Item 3 — Human Approval Checkpoint Before Execution

### Current State
After `createPlan()` returns tasks, the CLI in `src/cli/commands/run.ts` shows the task list and immediately starts executing (or skips the display in `--non-interactive`). There is no structured approval checkpoint where the user can review the architecture and say "change task 3" before any code is written.

### What Superpowers Does
After plan generation and Q&A resolution, superpowers presents:
- The goal restatement
- Design alternatives that were considered (and why each was rejected)
- The chosen approach summary
- The task list
- A `[approve / edit / reject]` prompt

Only after explicit approval does execution start. The user can inline-edit the JSON or reject and re-plan with additional context.

### Implementation

**File: `src/cli/commands/run.ts`** — after plan is displayed, before `orchestrator.run()`:

```typescript
if (!isNonInteractive) {
  const approved = await promptPlanApproval(plan, designRationale);
  if (!approved) {
    console.log('Run cancelled. Edit your goal or spec and try again.');
    process.exit(0);
  }
}
```

The `designRationale` is the output of Item 5 (rationale doc) — they compose naturally.

`promptPlanApproval()` shows a `confirm` prompt (using existing `@inquirer/prompts` dependency). It also allows the user to open the plan JSON in `$EDITOR` before approving.

### Non-interactive
Skip the checkpoint entirely, log `[auto-approved: non-interactive mode]`, proceed.

---

## Item 4 — TDD as Numbered Task Sub-Steps

### Current State
`buildPlanningPrompt()` in `src/planner/prompts.ts:34` says:
> "TDD note: if the task produces testable units... the description should remind the executor to write failing tests first..."

This is a description note. Claude ignores it roughly 40% of the time because it's buried in prose.

### What Superpowers Does
When a task produces testable units, superpowers adds an explicit numbered `implementationSteps` array to the task JSON:
```json
{
  "implementationSteps": [
    "1. Write failing test(s) for the acceptance criteria",
    "2. Run tests — confirm they are red",
    "3. Implement the minimum code to pass",
    "4. Run tests — confirm they are green",
    "5. Refactor if needed, re-run"
  ]
}
```

The execution prompt renders these as a numbered list under `## Implementation Steps`, separate from the description.

### Implementation

**File: `src/core/types.ts`** — add to `Task`:
```typescript
implementationSteps?: string[];
```

**File: `src/planner/prompts.ts`** — update JSON schema in `buildPlanningPrompt()` to include `implementationSteps` as an optional array. The planner prompt should state: "If the task produces testable units (functions, endpoints, components), set `implementationSteps` to the TDD sequence above."

**File: `src/executor/prompt-builder.ts`** — after acceptance criteria section, render:
```typescript
if (task.implementationSteps && task.implementationSteps.length > 0) {
  parts.push('## Implementation Steps');
  task.implementationSteps.forEach((step, i) => parts.push(`${i + 1}. ${step}`));
}
```

### Non-interactive
No change — steps are injected into the execution prompt regardless.

---

## Item 5 — Design Rationale Document

### Current State
`createPlan()` returns a `Plan` object with tasks and a goal string. There is no record of why these tasks were chosen, what alternatives were considered, or what assumptions were made during planning.

**Symptom**: when a task fails and the user wants to understand the plan, there's nothing to read. They have to re-examine the goal and reverse-engineer the planner's thinking.

### What Superpowers Does
After plan creation, superpowers generates a lightweight rationale doc (Haiku call, ~200 tokens):
- What approach was chosen and why
- Alternatives that were rejected (and the reason)
- Key assumptions the plan depends on
- Risks identified

Stored as `.cloudy/rationale.md` alongside `.cloudy/plan.json`.

### Implementation

**New file: `src/planner/rationale-generator.ts`**:
```typescript
export async function generateRationale(goal: string, plan: Plan, model: ClaudeModel): Promise<string>
```

Prompt: "Given this goal and the plan below, write a 150-word rationale document covering: approach chosen, 1-2 alternatives rejected, key assumptions, top risk. Plain markdown."

**File: `src/planner/planner.ts`** — call after `createPlan()`, write to `.cloudy/rationale.md`.

**File: `src/cli/commands/run.ts`** — print rationale path after plan display: `Rationale: .cloudy/rationale.md`.

**Dashboard**: add a "Rationale" tab or collapsible section in the run view.

### Non-interactive
Generate and write the file, don't display it interactively. Same as interactive.

---

## Item 6 — Sequential Clarifying Questions

### Current State
`buildPlanningPrompt()` instructs Claude to return 0–3 questions in a batch array. The CLI asks all of them at once. This means question 3 may be irrelevant given the answer to question 1 (e.g., "which auth method?" answered "JWT" makes "should we use session expiry?" moot).

### What Superpowers Does
Questions are asked one at a time. After each answer, the planner re-evaluates whether the next question is still necessary. This typically reduces total questions asked and improves answer quality (users answer more carefully when not facing a wall of prompts).

### Implementation

**File: `src/planner/planner.ts`** — replace batch Q&A loop with sequential:
```typescript
for (const question of plan.questions) {
  const stillRelevant = await checkQuestionRelevance(question, previousAnswers, model);
  if (!stillRelevant) continue;
  const answer = await askQuestion(question);
  previousAnswers.push({ question, answer });
}
```

`checkQuestionRelevance()` is a tiny Haiku call: "Given these prior answers, is this question still relevant? Return {relevant: true/false}."

This adds one Haiku call per question (cheap), reduces user friction significantly.

### Non-interactive
Skip all questions, use AI-assumed defaults (already the current behaviour — no change needed).

---

## Item 7 — Git Worktree Isolation Per Task

### Current State
All tasks in a run execute in the same working directory (`cwd`). Parallel tasks (when dependency graph allows) write to the same files simultaneously. Sequential tasks accumulate changes in the same tree, so a half-applied task 3 can confuse Claude when task 4 starts.

### What Superpowers Does
Each task runs in a dedicated git worktree:
```
main worktree: ~/dev/project         (untouched)
task-1 worktree: /tmp/cloudy-run-abc/task-1
task-2 worktree: /tmp/cloudy-run-abc/task-2
```

On task completion, the worktree diff is cherry-picked or merged back. On task failure, the worktree is discarded cleanly.

### Implementation

**File: `src/core/orchestrator.ts`** — before each task:
```typescript
const worktree = await createWorktree(plan.runId, task.id, cwd);
// run task in worktree.path
await mergeWorktree(worktree, cwd);  // on success
await discardWorktree(worktree);     // on failure or always after merge
```

**New file: `src/git/worktree.ts`**:
```typescript
export async function createWorktree(runId: string, taskId: string, baseCwd: string): Promise<Worktree>
export async function mergeWorktree(worktree: Worktree, targetCwd: string): Promise<void>
export async function discardWorktree(worktree: Worktree): Promise<void>
```

Uses `git worktree add` / `git worktree remove`. Requires git 2.5+.

**Risk note**: this is the highest-complexity item. Merge conflicts between worktrees are possible and need a resolution strategy. Recommend implementing with a `--worktrees` flag first (opt-in) before making it default.

### Non-interactive
Same as interactive — worktrees are transparent to the execution model.

---

## Item 8 — Task Granularity Guidance

### Current State
`buildPlanningPrompt()` in `src/planner/prompts.ts:44` caps `timeoutMinutes` at 60 and says "if a task needs more than 60 minutes it should be split." This implicitly allows very large tasks. The planner has no guidance on the lower bound.

### What Superpowers Does
Superpowers targets 2-5 minute micro-tasks in its most aggressive mode, and 15-30 minute tasks in standard mode. The planner prompt explicitly states: "Tasks should represent one concrete, verifiable change. If you can state the acceptance criterion as a single shell command, the task size is right."

This guidance produces more granular plans that fail and recover faster — a failed 5-minute task loses less work than a failed 60-minute task.

### Implementation

**File: `src/planner/prompts.ts`** — update the task granularity guidance section:

```
Task Sizing Rules:
- IDEAL: A task whose acceptance criterion is a single shell command (e.g. "tsc --noEmit exits 0")
- TOO LARGE: A task that touches more than 3 unrelated files or implements more than one user-facing feature
- TOO SMALL: A task that only adds a type alias or renames a variable — merge with a related task
- Cap: 60 minutes. If a task needs more, split it — never bundle 3+ independent features into one task
- Sweet spot: 15-30 minutes, one clear deliverable, one passing command as the criterion
```

Replace the current single-line guidance with this block.

### Non-interactive
No change — guidance is baked into the planner prompt.

---

## Item 9 — Testing Anti-Patterns in Executor Context

### Current State
`buildExecutionPrompt()` in `src/executor/prompt-builder.ts:159` has an `## Anti-Patterns — Do Not Do These` section. It covers general Claude execution anti-patterns (claiming done without verifying, simulator ≠ device, etc.) but says nothing about testing anti-patterns.

**Symptom**: Claude writes tests that test mock wiring rather than real behaviour — tests always pass because they only verify that mocks return what they're configured to return.

### What Superpowers Does
The execution prompt includes a `## Testing Anti-Patterns` section:
- Don't test that mocks return what you told them to return
- Don't skip the assertion — a test that calls the function but doesn't assert is a lie
- Don't use `any` casts to silence type errors in test files
- If the test relies on more than 2 mocks to pass, it's testing the test, not the code
- Integration tests must use real I/O (temp files, in-memory DB) — no mocking the thing being tested

### Implementation

**File: `src/executor/prompt-builder.ts`** — extend the anti-patterns section:

```typescript
parts.push('## Testing Anti-Patterns — Do Not Do These');
parts.push('- "I\'ll mock the database so the test passes" — use an in-memory DB or temp file; mock only external services');
parts.push('- "The mock returns what I told it to return so the assertion passes" — that tests the mock, not the code');
parts.push('- Tests without assertions — a test that does not assert is not a test');
parts.push('- `expect(fn()).toBeDefined()` — assert the actual value, not just that something exists');
parts.push('- More than 2 mocks in a unit test — if it needs 3 mocks, extract the logic and test it directly');
```

### Non-interactive
No change — built into the execution prompt.

---

## Item 10 — Pre-Planning Brainstorming Gate

### Current State
When a user runs `cloudy run "build X"`, `createPlan()` fires immediately. There is no phase where multiple approaches are considered before one is committed to. The first thing Claude produces is the execution plan.

### What Superpowers Does
Before `createPlan()`, superpowers runs a brainstorming skill (a lightweight Haiku prompt) that produces:
1. 3 candidate approaches to the goal
2. Pros/cons of each (2-3 bullet points per approach)
3. A recommended approach with a one-sentence rationale

The user sees this and either confirms the recommendation or selects a different approach. The selected approach is injected into `buildPlanningPrompt()` as a `# Chosen Approach` constraint.

Without this gate, the planner makes an implicit architectural decision that may not match what the user had in mind.

### Implementation

**New file: `src/planner/brainstorm.ts`**:
```typescript
export interface Approach {
  name: string;
  pros: string[];
  cons: string[];
}

export interface BrainstormResult {
  approaches: Approach[];
  recommended: string;  // approach name
  rationale: string;
}

export async function brainstorm(goal: string, model: ClaudeModel, cwd: string): Promise<BrainstormResult>
```

**File: `src/cli/commands/run.ts`** — before `createPlan()`:
```typescript
if (!isNonInteractive) {
  const brainstorm = await runBrainstorm(goal, model, cwd);
  displayApproaches(brainstorm);
  const chosen = await selectApproach(brainstorm);
  goalContext = `Chosen approach: ${chosen.name}\nRationale: ${chosen.rationale}`;
}
```

`goalContext` is appended to the goal string passed into `buildPlanningPrompt()`.

**Dashboard**: show brainstorm results as the first step in the run flow, before the task list renders.

### Non-interactive
Skip the brainstorm gate entirely. No approaches are generated, no selection is made. Planner runs as today.

---

## Implementation Priority

**Do first (prompt-only, zero risk, highest ratio of impact to effort):**
- Item 4 — TDD sub-steps (types.ts + prompts.ts + prompt-builder.ts, ~40 lines)
- Item 8 — Task granularity guidance (prompts.ts, ~10 lines)
- Item 9 — Testing anti-patterns (prompt-builder.ts, ~10 lines)

**Do second (new files, medium effort, high impact):**
- Item 1 — Codebase exploration (new `codebase-explorer.ts`, ~80 lines)
- Item 2 — Baseline test run (new `baseline.ts`, ~60 lines)
- Item 5 — Design rationale doc (new `rationale-generator.ts`, ~40 lines)

**Do third (interactive UX + approval flow):**
- Item 3 — Human approval checkpoint (run.ts gate, ~30 lines)
- Item 6 — Sequential Q&A (planner.ts loop refactor, ~50 lines)
- Item 10 — Brainstorming gate (new `brainstorm.ts`, ~80 lines)

**Do last (complex, high-risk, opt-in first):**
- Item 7 — Git worktree isolation (new `worktree.ts`, requires conflict resolution strategy)

---

## What This Solves

| Problem | Fixed by |
|---------|----------|
| Tasks reference wrong file paths | Item 1 |
| Can't distinguish pre-existing broken tests from newly broken | Item 2 |
| Architecture committed before user can weigh in | Items 3, 10 |
| TDD reminder ignored by Claude | Item 4 |
| No record of why decisions were made | Item 5 |
| Question 3 is moot after answer to question 1 | Item 6 |
| Parallel/sequential tasks stomp each other | Item 7 |
| Plans with 60-min monolith tasks fail and lose all progress | Item 8 |
| Tests that only test mock wiring | Item 9 |
