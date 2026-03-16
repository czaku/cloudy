# Keel Handover

This file is the operator handoff for the current `cloudy` execution queue.

Use Keel as the source of truth for:

- current waves
- task order
- task specs
- proof requirements
- lane ownership
- acceptance and review state

Read these before starting work:

- `/Users/luke/dev/cloudy/keel/MULTI_AGENT_CLOUDY_RUNS.md`
- `/Users/luke/dev/cloudy/keel/specs/quality/README.md`

## Product Definition

Current product values:

- `cloudy`
  - the execution/orchestration layer

## Lane Definition

Current lane values:

- `backend`
  - run loop, planner, validator, Keel integration
- `ops`
  - watchdog loop, scheduler, control-plane process
- `dashboard`
  - history, review state, operator visibility
- `shared`
  - reserve for cross-lane changes that cannot stay local

Rules:

- do not run two agents in parallel on the same lane
- `backend` can run in parallel with `dashboard`
- `ops` can run in parallel with `dashboard`
- `backend` and `ops` should not run in parallel when both touch run close-out or scheduling semantics
- `shared` is not parallel-safe by default

## Current Active Waves

### Wave 1

`Run Truth & Quality Gates`

- `T-001` structured end-of-run assessment
- `T-002` proof contract and required artifact enforcement
- `T-003` acceptance reconciliation before close-out
- `T-004` Keel write-back review-ready semantics

### Wave 2

`Scheduler, Lanes, And Watchdog Discipline`

- `T-005` lane collision detection and lock discipline
- `T-006` cron watchdog and stuck-run controller
- `T-007` preflight baseline separation in run summaries

### Wave 3

`Operator Visibility`

- `T-008` run history and dashboard quality views

## Agent Model

- `Claude` steers
- `Cloudy` runs
- `Keel` plans and remembers
- `Codex` builds

Healthy split:

- `Codex` = implementation owner
- `Claude Opus` = semantics, architecture, and review owner
- `Cloudy` = orchestration owner

Do not let Codex and Opus edit the same file scope in parallel.

## Current Priority Order

1. `T-001`
2. `T-002`
3. `T-003`
4. `T-004`

This order is intentional:

- first make run outputs richer and more truthful
- then enforce proof
- then reconcile acceptance state
- then adjust Keel close-out semantics
