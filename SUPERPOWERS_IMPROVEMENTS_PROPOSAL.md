# Superpowers → Cloudy Improvements Proposal (Wave 2)

Patterns identified from [obra/superpowers](https://github.com/obra/superpowers) that can improve cloudy's execution quality, review accuracy, and developer experience.

---

## What Cloudy Already Does (Wave 1 — Already Shipped)

These patterns from superpowers are already implemented — do not re-propose them:

- **Two-stage AI review** — Phase 2a spec compliance (`runAiReview`) → Phase 2b code quality (`runAiQualityReview`), ordered gate in `src/validator/validator.ts`
- **"No extras" enforcement** — `buildValidationPrompt()` has a SCOPE CHECK section; spec reviewer returns `extras[]` field flagging over-building (`src/planner/prompts.ts:110`)
- **LEARNINGS accumulation** — `extractLearnings()` parses `## LEARNINGS` from Claude output and passes `accumulatedLearnings` into each subsequent iteration prompt (`src/core/loop-runner.ts:65`)
- **Verification gate** — execution prompt has a mandatory "Verification Gate" section requiring Claude to run a command before summarising (`src/executor/prompt-builder.ts:139`)
- **Finishing workflow** — after a successful run, CLI presents merge/push-PR/keep/discard options; dashboard shows a modal; server has a `/finish` endpoint (`src/cli/commands/run.ts:32`, `src/daemon/server.ts`)
- **`qualityReviewModel`** — separate per-phase model config field for Phase 2b (`src/config/model-config.ts`, `src/core/types.ts`)

---

## Autonomy Constraint — Critical for All Implementations

Cloudy runs **fully unattended**. Any improvement that could cause Claude to pause, ask questions, or block execution must degrade gracefully in non-interactive mode. The rule:

> **When running with `--non-interactive` (or `isNonInteractive === true` in `src/cli/commands/run.ts:162`), Claude must prefer a reasonable assumption over blocking for clarification.**

Where relevant, each item below notes how to handle non-interactive mode.

---

## Quick Wins — Prompt-only, zero execution risk

These are pure text additions to existing prompt functions. Worst case: Claude ignores them or gets slightly more verbose. They cannot break execution.

---

### #2 · "Do not trust the report" in spec reviewer
**File:** `src/planner/prompts.ts:110` → `buildValidationPrompt()`
**Risk:** None

Superpowers' spec-reviewer prompt explicitly warns: *"The implementer finished suspiciously quickly. Their report may be incomplete, inaccurate, or optimistic. You MUST verify everything independently."*

Cloudy's `buildValidationPrompt()` has no skepticism directive, leaving the AI free to trust a confident diff summary rather than reading actual code.

**Implementation:** Add near the top of the prompt body:
```
IMPORTANT: Do not trust the implementation's apparent completeness at face value.
Read the actual diff and file sections below. Compare each acceptance criterion
line-by-line against what you can see in the code — not against what you would
expect to see. If evidence is absent, the criterion is not met.
```

**Ted's take:** Highest-ROI item in the entire list. Without this, a confident Claude summary can breeze past a broken implementation. The existing `buildValidationPrompt()` already has good structure (file sections, command results, scope check) but no skepticism directive — this fills the gap perfectly. Ship first.

---

### #3 · Ask-questions-first gate in executor
**File:** `src/executor/prompt-builder.ts:20` → `buildExecutionPrompt()`
**Risk:** None in non-interactive mode if implemented correctly

Superpowers implementer prompt has an explicit "Before You Begin" section: *"If you have questions — ask them now."* This surfaces ambiguity before wasted work happens.

Cloudy's execution prompt says "Implement this task completely" with no invitation for clarification. Ambiguous tasks get guessed implementations that fail review.

**Implementation:** Add before the `# Instructions` section:
```
## Before You Begin
If anything in the task description or acceptance criteria is unclear — the approach,
which existing files to modify, how this integrates with already-completed tasks —
ask a clarifying question NOW before writing any code.
```

**Non-interactive note:** When `isNonInteractive` is true, append: *"If running non-interactively, make the most reasonable assumption and document it in your summary instead of asking."* This preserves autonomy.

**Ted's take:** Nice in theory, but cloudy is almost always non-interactive. So this becomes "make a reasonable assumption and document it" — which is still useful for the documentation benefit. The real value is that when Claude does document assumptions, they show up in the task summary and can be caught in review. Note: `buildExecutionPrompt()` currently has no access to `isNonInteractive` — you'll need to thread it through `ExecutionPromptOptions` or just always include the non-interactive note (since that's the common case anyway).

---

### #9 · Anti-pattern catalog in execution prompt
**File:** `src/executor/prompt-builder.ts:20` → `buildExecutionPrompt()`
**Risk:** None

Superpowers TDD and testing skills both have dedicated "Common Rationalizations" sections listing specific bad thoughts by name. Naming an anti-pattern makes it harder to act on unconsciously.

**Implementation:** Add to the Instructions section:
```
## Anti-Patterns — Do Not Do These
- "I'll verify later" — verify now, before summarising
- "The tests should pass" — run them and show the output
- "I'll add that cleanup in a follow-up" — scope = exactly what's in the AC
- "This approach is close enough" — implement exactly what was specified
```

**Ted's take:** Overlaps with the verification gate but naming anti-patterns is psychologically effective. The "I'll verify later" one is the only one that really bites — the others are nice-to-haves. Keep it short; 4 bullets is the right length. More would get ignored.

---

### #11 · Strengths field in quality review
**File:** `src/planner/prompts.ts:210` → `buildQualityReviewPrompt()`
**Risk:** None — additive JSON field only

Superpowers `code-reviewer.md` asks for Strengths before Issues. Forcing the reviewer to acknowledge what works first calibrates tone and reduces false-positive failure rates.

Cloudy's `buildQualityReviewPrompt()` goes directly to issues.

**Implementation:** Add `"strengths": ["..."]` to the JSON response schema and add *"Strengths (2–3 things the implementation does well)"* to the review instructions. Pass/fail logic (`src/validator/strategies/ai-review-quality.ts`) is unchanged — `strengths` is informational only, logged but not evaluated.

**Ted's take:** Reduces false-positive quality failures by forcing the reviewer to acknowledge what works before nitpicking. Phase 2b is already advisory (we made it so last session), but this further calibrates tone. The strengths data could also be surfaced in the dashboard later. Zero downside.

---

### #1 · Implementer self-review checklist before handoff
**File:** `src/executor/prompt-builder.ts:20` → `buildExecutionPrompt()`
**Risk:** None — additive prompt section

Superpowers implementer prompt has a mandatory "Before Reporting Back: Self-Review" section that runs before the spec reviewer ever sees the work. It catches over-building and missed requirements before they hit the review gate, reducing failed-review retry loops.

Cloudy's executor reports back immediately after the Verification Gate.

**Implementation:** Add after the Verification Gate section and before the summary instruction:
```
## Before Reporting: Self-Review
Review your work before summarising. Check each item:
- Completeness: Did you implement everything in the acceptance criteria? Any edge cases missed?
- YAGNI: Did you add anything not in the spec? If yes, remove it before continuing.
- Quality: Are names clear? Is the logic straightforward?
- Tests: If you wrote tests, do they test real behaviour (not just mock wiring)?
Fix any issues found, then summarise.
```

**Ted's take:** This is the second highest-impact item after #2. The YAGNI check is especially valuable — over-building is the #1 reason tasks fail review in cloudy. Placing this after the verification gate creates a natural flow: verify it works → check you didn't over/under-build → report. The self-review catches problems before they burn a review cycle + retry.

---

### #4 · Debugging protocol in retry prompts
**File:** `src/executor/prompt-builder.ts:168` → `buildRetryPrompt()`
**Risk:** None — additive prompt section

Superpowers `systematic-debugging` skill has an "Iron Law": no fix attempt without root cause investigation first. If 3+ attempts fail, it escalates to questioning the entire approach.

Cloudy's `buildRetryPrompt()` gives the error output and says "Address each error precisely" — no protocol preventing random fix-guessing.

**Implementation:** Add a debugging protocol block:
```
## Before Attempting Any Fix
1. Read the error output above completely — the exact message often contains the solution
2. Identify WHICH line/function triggers the failure (trace backward from the error)
3. State your root cause hypothesis explicitly before writing code
4. Make the SMALLEST possible change to test that hypothesis
Do NOT shotgun-fix multiple things at once.
```

When `task.retries >= 2`, also append:
```
This is attempt [N]. Two prior fixes failed. Before trying again, question whether
your overall approach is correct — not just the last fix.
```

The retry count is available on the `task` object passed to `buildRetryPrompt()`.

**Ted's take:** The single most impactful change for retry success rate. Random fix-guessing is the #1 reason tasks burn all 3 retries. The "state your root cause hypothesis" instruction forces structured thinking. The escalation at attempt 3+ ("question your overall approach") is critical — without it, Claude keeps patching the same broken approach. Note: `task.retries` is already available in `buildRetryPrompt()` — just use it directly.

---

## Medium Effort — Logic changes, each self-contained

---

### #10 · main/master branch guard at run start
**File:** `src/cli/commands/run.ts:694` → `executeRun()`
**Risk:** Low — wrap git call in try/catch so failure degrades gracefully

Superpowers `subagent-driven-development` and `executing-plans` both flag: *"Never start implementation on main/master without explicit user consent."*

Cloudy `createRunBranch()` at `src/git/git.ts:138` creates a `cloudy/run-*` branch, but only when branching is used. A user running `cloudy run` directly on main with an existing plan has no guard.

**Implementation:** Near the top of `executeRun()` before the orchestrator starts:
```typescript
const currentBranch = (await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, reject: false })).stdout.trim();
if (currentBranch === 'main' || currentBranch === 'master') {
  if (isNonInteractive) {
    log.warn('Running on main/master branch in non-interactive mode — proceeding');
  } else {
    const proceed = await p.confirm({ message: `You are on ${currentBranch}. Continue without branching?` });
    if (p.isCancel(proceed) || !proceed) return;
  }
}
```

`runFinishingWorkflow()` at `src/cli/commands/run.ts:32` already guards the exit. This guards the entry.

**Ted's take:** Good safety net. Low effort, low risk. In non-interactive mode it just logs a warning — which is the right call. Worth doing but not urgent since `createRunBranch()` already handles branching for most flows. This catches the edge case where someone runs `cloudy run` directly on main with an existing plan.

---

### #7 · Smarter stale detection in loop runner
**File:** `src/core/loop-runner.ts:151` → `runLoop()`
**Risk:** Medium — changing bail-out logic could abort runs that would have eventually converged. Use a conservative threshold and keep existing diff-change check as primary signal.

Superpowers `condition-based-waiting.md` replaces fixed iteration counts with condition polling. Current stale check at `src/core/loop-runner.ts:212` uses `newDiff.trim() !== prevDiff.trim()`. If Claude touches comments or unrelated files, `madeChanges = true` even though no progress was made toward the goal.

**Implementation:** Track `prevFailureLineCount` alongside `prevDiff`:
```typescript
let prevFailureLineCount = Infinity;

// after failureOutput is obtained each iteration:
const failureLineCount = failureOutput.split('\n').filter(Boolean).length;
const progressOnErrors = failureLineCount < prevFailureLineCount;

if (!madeChanges && !progressOnErrors) {
  staleCount++;
  // existing staleCount >= 2 bail-out remains unchanged
} else {
  staleCount = 0;
}
prevFailureLineCount = failureLineCount;
```

`progressOnErrors` acts as a safety valve: even if the diff is stale, if the error count is falling, keep going. This is strictly more conservative than the current logic (harder to bail out prematurely).

**Ted's take:** Right idea, fragile heuristic. Error line count is not monotonically decreasing — fixing one import error can reveal 5 new type errors downstream, making `failureLineCount` spike even though real progress was made. A better signal might be tracking unique error signatures (e.g., first line of each error block) rather than raw line count. If implementing as-is, make the threshold generous (e.g., allow line count to increase by up to 50% and still count as progress) to avoid premature bail-out on cascading error reveals.

---

### #5 · Architectural scene-setting context in executor
**File:** `src/core/orchestrator.ts:203`, `src/executor/prompt-builder.ts:20`
**Risk:** Low — additive context field, no LLM calls required

Superpowers implementer prompt has a `## Context` section: *"Scene-setting: where this fits, dependencies, architectural context."* The controller derives this from the plan graph and provides it explicitly.

Cloudy includes "Already Completed Tasks" (just titles) but no explicit framing of where the current task sits in the dependency graph.

**Implementation:** In the orchestrator, before calling `buildExecutionPrompt()`, derive an `architecturalContext` string from the plan:
```typescript
const deps = task.dependencies.map(id => plan.tasks.find(t => t.id === id)?.title).filter(Boolean);
const dependents = plan.tasks.filter(t => t.dependencies.includes(task.id)).map(t => t.title);
const architecturalContext = [
  deps.length ? `Depends on: ${deps.join(', ')}` : '',
  dependents.length ? `Required by: ${dependents.join(', ')}` : '',
].filter(Boolean).join('\n');
```
Pass as an optional parameter to `buildExecutionPrompt()` and render as a `## Context` section when non-empty. Zero LLM cost.

**Ted's take:** Easy win, zero cost. The "Required by" line is especially useful — it tells the executor what downstream tasks depend on, so it can ensure its outputs are compatible. Add `architecturalContext` as an optional field on `ExecutionPromptOptions` (the interface already supports extension). Render it right after the task title/description.

---

## Higher Effort — Control flow changes

---

### #6 · Plan pre-flight review before execution
**File:** `src/cli/commands/run.ts:694`, new prompt in `src/planner/prompts.ts`
**Risk:** Medium — must default to warn-not-block, never hard-block execution

Superpowers `executing-plans` skill: *"Step 1: Review plan critically — identify any questions or concerns BEFORE starting."*

Cloudy starts running tasks immediately after plan loading with no mechanism to flag impossible tasks or missing dependencies before spending tokens on execution.

**Implementation:** Before the orchestrator starts, run a cheap haiku call with a new `buildPlanPreflightPrompt()` function:
```
Review this plan for critical problems: impossible tasks, circular dependencies,
missing context, or tasks that reference non-existent files/APIs.
Return JSON: { "concerns": ["..."], "safe_to_proceed": boolean }
```

Behaviour by mode:
- **Interactive:** If `safe_to_proceed: false`, show concerns and ask user to confirm or abort
- **Non-interactive:** Log concerns as warnings but always proceed — never block autonomous execution

Cost: ~$0.001 per run. Catches broken plans before expensive execution.

**Ted's take:** Marginal value. Circular deps are already caught by the task graph topological sort. "Impossible tasks" and "missing context" are hard for haiku to detect reliably without actually seeing the codebase. The $0.001 cost is fine but the false positive risk is real — if this blocks runs on phantom concerns, it'll be turned off fast. Keep it warn-only (never block), and consider skipping it entirely in non-interactive mode since it can't act on the concerns anyway.

---

### #8 · Second holistic review pass after fix tasks
**File:** `src/core/orchestrator.ts:382` → `runHolisticReview()`
**Risk:** Medium — adds another gate that could fail. Should be opt-in initially (flag: `--double-holistic-review`)

Superpowers dispatches a final code reviewer across the entire implementation after all per-task reviews pass, before the finishing workflow. Distinct from per-task reviews — checks architectural consistency of the whole.

Cloudy's `runHolisticReview()` at `src/core/orchestrator.ts:382` is close, but if verdict is `PASS_WITH_NOTES`, fix tasks run with no second holistic pass afterward. Those fix tasks could introduce new inconsistencies.

**Implementation:** After fix tasks generated from the holistic review complete (currently at `src/core/orchestrator.ts:357`), re-run `this.runHolisticReview()` once. Gate the finishing workflow on this second pass.

Initially expose as an opt-in flag (`--double-review` or `holistic.doublePass: true` in config) so existing runs are unaffected while the behaviour is validated.

**Ted's take:** Right problem, expensive solution. Doubles the cost of the final gate. The opt-in flag is essential — don't make this default. A cheaper alternative: instead of re-running the full holistic review, run a targeted review that only looks at the fix task diffs against the original holistic concerns. This focuses the second pass on "did the fixes actually fix the concerns" rather than re-reviewing the entire codebase.

---

### #12 · `.cloudy/session-start.sh` extension point
**File:** `src/core/orchestrator.ts` or `src/cli/commands/run.ts:694`
**Risk:** Low — only activates if the file exists, zero impact on existing projects

Superpowers `hooks/session-start` injects extra context into every session via `additionalContext`. Project authors use it to prime Claude with tooling notes, recent git log, environment state — anything that changes between runs.

Cloudy loads `conventionsContent` (CLAUDE.md) per-task from disk. There is no extension point for dynamic context injection.

**Implementation:** Before execution begins, check for `.cloudy/session-start.sh`. If present, run it (with a timeout, e.g. 10s) and append stdout to `conventionsContent`:
```typescript
const sessionStartScript = path.join(cwd, '.cloudy', 'session-start.sh');
const scriptExists = await fs.access(sessionStartScript).then(() => true).catch(() => false);
if (scriptExists) {
  const result = await execa('bash', [sessionStartScript], { cwd, timeout: 10_000, reject: false });
  if (result.stdout) conventionsContent += '\n\n' + result.stdout;
}
```

Project authors can use this for anything: `git log --oneline -10`, current branch name, open GitHub issues, environment variable validation. No cloudy changes needed beyond this runner.

**Ted's take:** Good extension point, low risk. The 10s timeout is essential — a hung script would block the entire run. Consider also supporting `.cloudy/session-start.ts` (run with `tsx`) for TypeScript projects. The stdout-append-to-conventions approach is clean. No one is using this yet but it's the kind of thing that becomes invaluable once it exists. Ship it but don't prioritise over the prompt improvements.

---

## Implementation Order

| Priority | Item | Files | Effort | Risk |
|---|---|---|---|---|
| 1 | #2 "Do not trust the report" | `planner/prompts.ts:110` | 30min | None |
| 2 | #3 Ask-questions-first gate | `prompt-builder.ts:20` | 30min | None |
| 3 | #9 Anti-pattern catalog | `prompt-builder.ts:20` | 30min | None |
| 4 | #11 Strengths in quality review | `planner/prompts.ts:210` | 30min | None |
| 5 | #1 Self-review checklist | `prompt-builder.ts:20` | 1h | None |
| 6 | #4 Debugging protocol in retries | `prompt-builder.ts:168` | 1h | None |
| 7 | #10 main/master branch guard | `run.ts:694` | 1h | Low |
| 8 | #7 Smarter stale detection | `loop-runner.ts:151` | 2h | Medium |
| 9 | #5 Architectural scene-setting | `orchestrator.ts:203` | 2h | Low |
| 10 | #6 Plan pre-flight (warn-not-block) | `run.ts:694`, new prompt | 3h | Medium |
| 11 | #8 Second holistic review (opt-in) | `orchestrator.ts:357` | 2h | Medium |
| 12 | #12 session-start extension point | `orchestrator.ts` or `run.ts` | 2h | Low |
