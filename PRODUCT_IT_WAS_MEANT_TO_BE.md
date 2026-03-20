# Cloudy -- Product Archaeology

## Vision

Cloudy is a multi-task orchestration engine for AI coding agents. You give it a spec, it
decomposes the work into a dependency-ordered task graph, executes each task with three-phase
validation, and rolls back cleanly on failure. The thesis: a single command should be able to
build a complete feature across any language or stack, with confidence that every piece works.

## What It Does

- **Spec-driven decomposition**: one Markdown spec file becomes a full dependency-ordered task graph
  with `cloudy plan --spec spec.md`
- **Three-phase validation**: every task is validated by (1) artifact check -- do the output files
  exist, (2) custom build commands -- swift build, gradlew build, pytest, (3) AI review -- does
  the diff match acceptance criteria
- **Git checkpoint and rollback**: each task gets a pre-execution git checkpoint; failures roll
  back cleanly without contaminating subsequent work
- **Scoped execution modes**: five bounded task shapes -- implement_ui_surface, verify_proof,
  closeout_keel, refactor_bounded, write_or_stop -- each with shape-specific enforcement policies
- **Execution metrics**: tracks timeToFirstWriteMs, discovery ops before first write, subagent
  calls, write count, verification ops, risk level, and failure classification per task
- **Nine failure classes**: executor_nonperformance, task_spec_problem, validation_problem,
  implementation_failure, acceptance_failure, out_of_scope_drift, already_satisfied,
  environment_failure, timeout
- **Runtime routing via omnai**: four-dimensional model routing (engine, provider, account,
  modelId) -- seamlessly switch between Claude Code, Codex, local LLMs, and API models
- **Keel integration**: `--keel-slug` and `--keel-task` flags auto-update task status on
  completion or failure
- **Real-time dashboard**: web UI showing task progress, execution metrics, and live logs
- **Strict batch mode**: `--strict-batch` keeps multi-task runs deterministic, stopping on
  terminal failures
- **Retry and rollback**: `cloudy retry task-3` and `cloudy rollback task-2` for surgical recovery
- **Cost tracking**: token usage and cost tracking per task and per run

## Architecture

- **Language**: TypeScript, built with Bun
- **Package structure**: single package with modules under `src/`
  - `planner/` -- spec decomposition and dependency graph construction
  - `executor/` -- task execution with scoped enforcement
  - `validator/` -- three-phase validation pipeline
  - `reviewer.ts` -- AI diff review against acceptance criteria
  - `git/` -- checkpoint creation and rollback
  - `cost/` -- token and cost tracking
  - `daemon/` -- background execution daemon
  - `dashboard/` -- real-time web UI for monitoring
  - `integrations/` -- keel, fed, and notification connectors
  - `knowledge/` -- context and knowledge base for AI phases
  - `cli/` -- command-line interface
  - `ui/` -- terminal UI components
- **Testing**: Vitest for unit tests, Playwright for dashboard E2E
- **Config**: `.cloudy/config.json` per project defines build commands, execution model, and
  validation rules

## Current State

**What works:**
- Core orchestration loop is production-used across all vykeai projects (sitches, goala,
  StrikeThePose, edge, SocialButterfly, and more)
- Spec decomposition, dependency ordering, and three-phase validation are stable
- Scoped execution modes enforce bounded task behavior
- Execution metrics and failure classification are tracked in the dashboard
- Runtime routing via omnai supports Claude Code, Codex, and API-backed models
- Keel integration auto-updates task status
- Dashboard shows real-time progress with detailed per-task metrics

**Known limitations:**
- Worktree mode breaks backend tests in monorepos with root-level test configs (use
  `worktrees: false` for these projects)
- Planning phase could be smarter about task granularity and dependency inference
- Cost tracking is per-run but doesn't aggregate across historical runs

## What It Was Meant To Be

The unrealized vision is a fully autonomous software delivery system. Today, Cloudy handles
the middle 80% well -- you write a good spec, it decomposes, implements, validates, and commits.
But the edges remain human-dependent: spec quality determines task quality, failure diagnosis
often needs human judgment, and ambiguous task boundaries still cause drift.

The full vision is a system that learns from every execution. It would understand which task
shapes succeed reliably, which failure patterns indicate spec problems versus implementation
problems, and automatically improve decomposition quality over time. Cross-platform parity
requirements (iOS + Android + backend changes for a single feature) would be understood
natively, not described manually in the spec. Database migrations, API changes, client updates,
and test coverage would be orchestrated as a single atomic feature delivery.

The gap between "describe what you want" and "ship a complete, tested, cross-platform feature"
should require zero human intervention. Cloudy is closer to this than anything else in the
ecosystem, but the last 20% -- understanding intent deeply enough to decompose autonomously,
recovering from integration failures without human steering, and maintaining quality across
hundreds of sequential runs -- remains the work ahead.
