# Superpowers → Cloudy Improvements Proposal

Patterns identified from [obra/superpowers](https://github.com/obra/superpowers) that can improve cloudy's execution quality, review accuracy, and developer experience.

The first wave of improvements (two-stage AI review, LEARNINGS accumulation, verification gate, finishing workflow, qualityReviewModel) has already been shipped. This document captures the next wave.

---

## Quick Wins — Prompt-only changes, ~30min each

### #2 · "Do not trust the report" in spec reviewer
**File:** `src/planner/prompts.ts` → `buildValidationPrompt()`

Superpowers' spec-reviewer prompt explicitly warns: *"The implementer finished suspiciously quickly. Their report may be incomplete, inaccurate, or optimistic. You MUST verify everything independently."*

Cloudy's `buildValidationPrompt()` has no such skepticism directive, leaving the AI free to trust a confident diff summary rather than reading actual code.

**Implementation:** Add near the top of the prompt:
```
IMPORTANT: Do not trust the implementation's apparent completeness at face value.
Read the actual diff and file sections below. Compare each acceptance criterion
line-by-line against what you can see in the code — not against what you would
expect to see. If evidence is absent, the criterion is not met.
```

---

### #3 · Ask-questions-first gate in executor
**File:** `src/executor/prompt-builder.ts` → `buildExecutionPrompt()`

Superpowers implementer prompt has an explicit "Before You Begin" section: *"If you have questions about requirements, approach, dependencies, or anything unclear — ask them now."* This surfaces ambiguity before wasted work happens.

Cloudy's execution prompt says "Implement this task completely" with no invitation for clarification. Ambiguous tasks get guessed implementations that fail review.

**Implementation:** Add before the `# Instructions` section:
```
## Before You Begin
If anything in the task description or acceptance criteria is unclear — the approach,
which existing files to modify, how this integrates with already-completed tasks —
ask a clarifying question NOW before writing any code.
```

---

### #9 · Anti-pattern catalog in execution prompt
**File:** `src/executor/prompt-builder.ts` → `buildExecutionPrompt()`

Superpowers TDD and testing skills both have dedicated "Common Rationalizations" sections listing specific bad thoughts by name. Naming an anti-pattern makes it harder to act on unconsciously.

Cloudy's execution prompt has no such catalog.

**Implementation:** Add to the Instructions section:
```
## Anti-Patterns — Do Not Do These
- "I'll verify later" — verify now, before summarizing
- "The tests should pass" — run them and show the output
- "I'll add that cleanup in a follow-up" — scope = exactly what's in the AC
- "This approach is close enough" — implement exactly what was specified
```

---

### #11 · Strengths field in quality review
**File:** `src/planner/prompts.ts` → `buildQualityReviewPrompt()`

Superpowers `code-reviewer.md` asks for Strengths before Issues. Forcing the reviewer to acknowledge what works first calibrates tone and reduces false-positive failure rates.

Cloudy's `buildQualityReviewPrompt()` goes directly to issues.

**Implementation:** Add `"strengths": ["..."]` to the JSON response schema and add *"Strengths (2–3 things the implementation does well)"* to the review instructions. Adjust pass/fail logic to remain unchanged.

---

## Medium Effort — Logic changes, self-contained

### #1 · Implementer self-review checklist before handoff
**File:** `src/executor/prompt-builder.ts` → `buildExecutionPrompt()`

Superpowers implementer prompt has a mandatory "Before Reporting Back: Self-Review" section that runs before the spec reviewer ever sees the work. It checks completeness, YAGNI discipline, quality, and testing — and requires fixing any issues found before reporting.

Cloudy's executor reports back immediately after the Verification Gate with no structured internal review step.

**Implementation:** Add after the Verification Gate and before the summary instruction:
```
## Before Reporting: Self-Review
Review your work before summarizing. Check each item:
- Completeness: Did you implement everything in the acceptance criteria? Any edge cases missed?
- YAGNI: Did you add anything not in the spec? If yes, remove it before continuing.
- Quality: Are names clear? Is the logic straightforward?
- Tests: If you wrote tests, do they test real behaviour (not just mock wiring)?
Fix any issues found, then summarize.
```

---

### #4 · Debugging protocol in retry prompts
**File:** `src/executor/prompt-builder.ts` → `buildRetryPrompt()`

Superpowers `systematic-debugging` skill has an "Iron Law": no fix attempt without root cause investigation first. If 3+ attempts fail, it escalates to questioning the entire approach rather than retrying.

Cloudy's `buildRetryPrompt()` gives the error output and says "Address each error precisely" — no protocol preventing random fix-guessing. After `maxRetries` the task just fails.

**Implementation:** Add a debugging protocol block:
```
## Before Attempting Any Fix
1. Read the error output above completely — the exact message often contains the solution
2. Identify WHICH line/function triggers the failure (trace backward from the error)
3. State your root cause hypothesis explicitly before writing code
4. Make the SMALLEST possible change to test that hypothesis
Do NOT shotgun-fix multiple things at once.
```

When `task.retries >= 2`, append:
```
This is attempt N. Two prior fixes failed. Before trying again, question whether
your overall approach is correct — not just the last fix.
```

---

### #7 · Smarter stale detection in loop runner
**File:** `src/core/loop-runner.ts` → `runLoop()`

Superpowers `condition-based-waiting.md` replaces fixed iteration counts with condition polling. Applied here: if Claude makes unrelated changes (touching comments, adding unrelated files), the current `madeChanges = newDiff !== prevDiff` check fires even though no progress was made toward the goal.

**Implementation:** Track `prevFailureLineCount` alongside `prevDiff`. If `failureLineCount >= prevFailureLineCount && !madeChanges`, that is a stronger stuck signal. Optionally: if the `untilCommand` failure output is identical to the previous iteration, increment `staleCount` regardless of diff changes. This prevents burning iterations on cosmetic edits.

---

### #10 · main/master branch guard at run start
**File:** `src/cli/commands/run.ts` → `executeRun()`

Superpowers `subagent-driven-development` and `executing-plans` both have an explicit red flag: *"Never start implementation on main/master without explicit user consent."*

Cloudy `createRunBranch()` creates a `cloudy/run-*` branch before execution, but the check only applies when branching is used. Direct `cloudy run` on a non-cloudy branch has no guard.

**Implementation:** Before starting the orchestrator, check the current branch:
```typescript
const currentBranch = (await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).stdout.trim();
if (currentBranch === 'main' || currentBranch === 'master') {
  // warn interactively and offer to create a branch or proceed anyway
}
```
`runFinishingWorkflow` already guards the exit. This guards the entry.

---

## Higher Effort — Architecture changes, high value

### #5 · Architectural scene-setting context in executor
**File:** `src/core/orchestrator.ts`

Superpowers implementer prompt has an explicit `## Context` section derived by the controller: *"Scene-setting: where this fits, dependencies, architectural context."* The subagent understands where the task fits in the whole without having to infer it from titles.

Cloudy includes "Already Completed Tasks" (just titles) and the rolling context summary, but no explicit architectural framing of where the current task sits in the dependency graph.

**Implementation:** Derive and pass an `architecturalContext` field to `buildExecutionPrompt()` from the dependency graph in the orchestrator:
```
This task (task-3) depends on [task-1: schema, task-2: models].
It will be depended on by [task-4: API routes].
```
This costs no LLM calls — it's derived from the static plan graph.

---

### #6 · Plan pre-flight review before execution
**File:** `src/cli/commands/run.ts`, new prompt in `src/planner/prompts.ts`

Superpowers `executing-plans` skill: *"Step 1: Review plan critically — identify any questions or concerns BEFORE starting."* It explicitly names diving in without reviewing as an anti-pattern.

Cloudy starts running tasks immediately after plan loading with no mechanism to flag plan-level problems.

**Implementation:** Before the orchestrator starts, run a cheap haiku call:
```
Review this plan for critical ambiguities, impossible tasks, or missing dependencies.
Return JSON: { "concerns": ["..."], "safe_to_proceed": true/false }
```
If `safe_to_proceed: false`, surface concerns interactively and let the user abort or continue. Cost: ~$0.001. Catches broken plans before expensive execution.

---

### #8 · Second holistic review after fix tasks complete
**File:** `src/reviewer.ts`, `src/core/orchestrator.ts`

Superpowers dispatches a final code reviewer subagent across the entire implementation after all per-task reviews pass and before calling the finishing workflow. This is distinct from per-task reviews — it checks architectural consistency of the whole.

Cloudy's `runHolisticReview()` is close to this, but if the verdict is `PASS_WITH_NOTES`, fix tasks are generated and run with no second holistic pass afterward. The fix tasks might introduce new inconsistencies.

**Implementation:** After fix tasks generated from the holistic review complete, re-run `runHolisticReview()` once. Gate the finishing workflow on this second pass rather than the first.

---

### #12 · `.cloudy/session-start.sh` extension point
**File:** New convention, minimal code change in `src/core/orchestrator.ts` or `src/cli/commands/run.ts`

Superpowers `hooks/session-start` injects extra context into every session via `additionalContext`. This primes Claude with project-specific knowledge (tooling, conventions, recent changes) before any work begins.

Cloudy loads `conventionsContent` (CLAUDE.md) per-task, which is the same idea. But there's no extension point for project authors to inject dynamic context (e.g., recent git log, current open issues, environment notes).

**Implementation:** Before execution, check for `.cloudy/session-start.sh`. If present, run it and append stdout to `conventionsContent`. Project authors can use this to inject anything — no cloudy changes needed beyond the runner.

---

## Implementation Order

| Priority | Item | Files | Effort |
|---|---|---|---|
| 1 | #2 "Do not trust the report" | `planner/prompts.ts` | 30min |
| 2 | #3 Ask-questions-first gate | `prompt-builder.ts` | 30min |
| 3 | #9 Anti-pattern catalog | `prompt-builder.ts` | 30min |
| 4 | #11 Strengths in quality review | `planner/prompts.ts` | 30min |
| 5 | #1 Self-review checklist | `prompt-builder.ts` | 1h |
| 6 | #4 Debugging protocol in retries | `prompt-builder.ts` | 1h |
| 7 | #10 main/master branch guard | `run.ts` | 1h |
| 8 | #7 Smarter stale detection | `loop-runner.ts` | 2h |
| 9 | #5 Architectural scene-setting | `orchestrator.ts` | 2h |
| 10 | #6 Plan pre-flight review | `run.ts`, new prompt | 3h |
| 11 | #8 Second holistic review pass | `reviewer.ts`, `orchestrator.ts` | 2h |
| 12 | #12 session-start extension point | new convention | 2h |
