# MULTI_AGENT_CLOUDY_RUNS

Repo-local copy of the generic multi-agent operating model.

Use this with:

- `Cloudy` as orchestration owner
- `Codex 5.4` as implementation owner
- `Claude Code Opus 4.6` as semantics, architecture, and review owner
- `Keel` as the planning and state source of truth

## Core Rule

- `Claude` steers
- `Cloudy` runs
- `Keel` plans and remembers
- `Codex` builds

## Standard Lifecycle

1. Plan
2. Plan Review
3. Preflight Validate
4. Execute
5. Post-Execute Validate
6. Final Review
7. Close

## Close-Out Rule

Success does not automatically mean `done`.

Cloudy should distinguish:

- `blocked`
- `review` / `needs_acceptance`
- `done`

And every run should leave behind:

- a structured assessment
- proof references
- checks passed/failed
- remaining risks
- a next-action recommendation

Recommended assessment fields:

- `summary`
- `filesTouched`
- `checksPassed`
- `checksFailed`
- `artifactsProduced`
- `acceptanceStatus`
- `qualityVerdict`
- `risks`
- `recommendedNextAction`

## Cron Watchdog Rule

Cron should not blindly trigger overlapping Cloudy runs.

The control loop should:

1. check whether an active run exists
2. inspect status / heartbeat / recent progress
3. mark stuck runs in Keel instead of silently starting a second competing run
4. only launch the next run when the previous run is healthy-finished, failed-cleanly, or explicitly replaced by Claude steering logic

## Keel Rule

All real planning must end up in Keel:

- waves
- tasks
- specs
- lane ownership
- dependencies
- acceptance criteria
- notes about what execution learned

If it only happened in chat, it is not yet the real plan.
