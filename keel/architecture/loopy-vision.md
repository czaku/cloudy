# Loopy Vision — Continuous Delivery for AI-Built Software

## What Loopy Is

Loopy is the continuous delivery daemon for keel-managed projects. It sits above any AI coding agent (Claude Code, Codex, pi-mono, any omnai-routed engine), checks for work, spawns sessions, validates results, and loops — forever.

Your code is being delivered in loops.

## Why Loopy Replaces Cloudy

Cloudy was built before the instruction system existed. It compensated for agents that didn't know how to orient, validate, or recover by building all of that into a 31k-line orchestrator with 35+ config keys, 8 execution modes, and a custom planning phase.

The instruction system (keel tasks, AGENTS.md, execution.yaml, quality gates, agent-profiles) now handles what cloudy compensated for:

| Cloudy built this | Now lives in |
|-------------------|-------------|
| Planning phase (goal → task graph) | Keel (tasks, waves, dependencies) |
| 35-key config system | execution.yaml (5 keys) + sweech profiles |
| Task graph management | Keel (depends_on, wave gating) |
| Custom prompt building | Agent reads AGENTS.md + keel task spec |
| 8 execution modes | One mode: read task, implement, validate |
| Approval gates | Keel (ApprovalItem, review stage) |
| Spec compliance AI review | Agent review session OR built-in validator |

## What Stays From Cloudy

- **Web dashboard** — React, live updates, project overview
- **Agent spawning** — claude/codex/omnai subprocess management
- **Git worktrees** — parallel execution isolation
- **External validation** — Phase 0 (artifacts) + Phase 1 (build/test/lint)
- **Built-in AI review** — Phase 2 in validator (for API engines like pi-mono)
- **Retry with error context** — expand context on failure, retry
- **Cost tracking** — per-task, per-session cost accounting
- **Keel integration** — read tasks, update status, add notes

## What Gets Deleted From Cloudy

- **Planning phase** (`src/planner/`) — keel owns task creation
- **Task graph management** — keel resolves "next ready task respecting dependencies"
- **35-key config system** — replaced by execution.yaml + sweech profiles + agent-profiles
- **Task shapes / 8 execution modes** — one mode
- **Holistic review** (`src/reviewer.ts`) — replaced by review session relay (for CLI agents) or kept as Phase 2 (for API engines)
- **First-write deadlines** — trust the agent
- **Tool policies** — agent knows from AGENTS.md
- **Prompt building** — agent reads its own docs

## What Gets Added

- **Daemon mode** — continuous loop checking keel for work (from loopy prototype)
- **tmux session management** — agents run in named sessions, watchable live
- **SwiftUI menu bar app** — macOS status bar showing all projects, click to watch/control
- **Sweech profile integration** — auto-discover available CLI profiles
- **Review session relay** — after implement session, spawn a review session
- **Circuit breaker** — stop spawning after N consecutive failures

## Architecture

```
┌─────────────────────────────────────────────┐
│              Loopy Daemon                    │
│  (continuous loop, checks keel, never stops) │
├─────────────────────────────────────────────┤
│                                             │
│  for each enabled project:                  │
│    1. keel: next ready task?                │
│    2. build context from task spec          │
│    3. spawn agent in tmux session           │
│    4. wait for session to end               │
│    5. run deterministic validation          │
│    6. spawn review session (CLI agents)     │
│       OR run AI review (API engines)        │
│    7. update keel task status               │
│    8. goto 1                                │
│                                             │
├─────────────────────────────────────────────┤
│  Menu Bar (SwiftUI)    Web Dashboard (React) │
│  reads state.json      live WebSocket        │
└─────────────────────────────────────────────┘
         │                    │
    ┌────┴────┐         ┌────┴────┐
    │  keel   │         │ sweech  │
    │ (tasks) │         │ (CLIs)  │
    └─────────┘         └─────────┘
```

## The Loop — In Detail

```
1. READ keel tasks --status ready (respecting depends_on + wave gating)
2. READ ONE_OFF.md (if incomplete items, execute those first)
3. BUILD context:
   - Task JSON (title, description, acceptanceCriteria[])
   - contextPatterns[] → resolve globs → read files
   - AGENTS.md (project conventions)
   - Handoff from prior task (if sequential)
4. GIT checkpoint (save SHA before changes)
5. SPAWN agent session in tmux:
   - CLI: claude/codex/sweech profile (from project config)
   - Prompt: task description + context + acceptance criteria
   - Timeout: platform-dependent (30-60 min natural ceiling)
6. WAIT for session to end (tmux process exits)
7. VALIDATE externally (deterministic — no agent needed):
   - Build: run project build commands from execution.yaml
   - Test: run project test commands
   - Lint: run linter if configured
   - Artifact check: expected output files exist?
8. REVIEW:
   - If CLI agent (claude/codex): spawn a SEPARATE review session
     - Fresh agent reviews the diff since checkpoint SHA
     - Has full codebase access (not just truncated diff)
     - If issues found → creates fix tasks in keel
     - If clean → marks task approved
   - If API engine (pi-mono/omnai): use built-in AI review
     - Phase 2 validator: diff-based, structured JSON verdict
     - Cheaper, faster, no interactive session needed
9. RESULT:
   - All pass → keel task done + note with summary
   - Deterministic fail → retry with error context (up to maxRetries)
   - Review fail → fix tasks created, loop picks them up next
10. GOTO 1 (next task, no stopping)
```

## Review Model — Two Paths

### Path A: CLI Agent Review (claude/codex)

For agents that run as interactive CLI sessions with full codebase access.

```
implement session (claude, 30-60 min)
  → agent reads AGENTS.md, picks keel task, codes, commits
  → session ends naturally

review session (codex or different claude profile, 10-20 min)
  → "Review the diff on develop since {sha}. Run quality gates.
     If issues, create keel tasks. If clean, mark approved."
  → reviewer has full codebase access, can read tests, check types
  → session ends

loopy checks keel → approved? → next task
                  → issues? → fix tasks in queue, loop continues
```

**Why separate sessions:** The implementing agent can't objectively review its own work. A fresh session with a different engine (or same engine, fresh context) catches things the implementer missed. The reviewer also runs the quality gate checklists from AGENTS.md that the implementer may have skipped under time pressure.

### Path B: Built-in AI Review (pi-mono/omnai)

For API-backed engines that don't run as interactive sessions.

```
execution via omnai API
  → send task + context to pi-mono/kimi/etc
  → receive code changes
  → apply to worktree, commit

validator Phase 2 AI review
  → extract diff, build review prompt
  → send to review model (haiku/cheap)
  → receive structured verdict: PASS / FAIL with reasons
  → if FAIL, retry with expanded context
```

**Why keep this:** pi-mono sessions don't have codebase access — they receive context via API and return code. You can't spawn a "review session" for an API engine. The built-in validator review handles this case cheaply and reliably.

### When to use which

| Engine type | Implement | Review |
|-------------|-----------|--------|
| Claude Code CLI | Spawn session | Spawn separate review session |
| Codex CLI | Spawn session | Spawn separate review session (claude or different codex) |
| pi-mono (API) | omnai API call | Built-in validator Phase 2 |
| Any omnai engine | omnai API call | Built-in validator Phase 2 |

The choice is automatic based on engine type — no config needed.

## Config — Minimal

Loopy reads from existing tools. Almost no config of its own.

| What | Source | Loopy config |
|------|--------|-------------|
| Task list + dependencies | keel tasks, views/tasks.md | (none — reads keel) |
| Build/test commands | execution.yaml | (none — reads execution.yaml) |
| Quality gates | ~/.keel/agent-profiles/ | (none — reads profiles) |
| CLI profiles | sweech (~/.sweech/config.json) | (none — reads sweech) |
| Which CLI per project | loopy config | `projects.goala.cli = "claude-ted"` |
| Spawn interval | loopy config | `defaults.interval = 600` |
| Max concurrent | loopy config | `defaults.maxConcurrent = 3` |
| Max retries | loopy config | `defaults.maxRetries = 3` |

**Total loopy-specific config: 4 keys** (+ per-project CLI override).

## Migration Path

1. **Rename** vykeai/cloudy → vykeai/loopy (keep git history)
2. **Delete** planning phase, config system, task graph, holistic review, tool policies, execution modes
3. **Rewire** task reading to use keel (not .cloudy/state.json)
4. **Rewire** validation to read build commands from execution.yaml
5. **Add** daemon mode (continuous loop from loopy prototype)
6. **Add** tmux session management (from loopy prototype)
7. **Add** menu bar app (SwiftUI, styled like sweech)
8. **Add** sweech profile discovery
9. **Add** review session relay (for CLI agents)
10. **Archive** old vykeai/loopy Python prototype (reset repo, override with cloudy content)

## The Tool Estate (Final)

```
vykeai/keel       — project knowledge (tasks, waves, specs, decisions, MCP, render)
vykeai/loopy      — continuous delivery (daemon, execute, validate, review, loop)
vykeai/runecode   — agent configuration (AGENTS.md, skills, hooks, setup)
vykeai/sentinel   — cross-platform contracts (tokens, strings, models, codegen)
vykeai/simemu     — simulator management (allocation, screenshots, ownership)
vykeai/sweech     — CLI identity switching (profiles, accounts, quotas)
```

Six tools. Each does one thing. No overlap. No 35-key config. No 31k-line monolith.
Cloudy's git history lives on in loopy. The research became the product.
