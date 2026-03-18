# Plan: Cloudy → Loopy Migration + Keel Enhancements

## Context

Cloudy (31k lines, 114 files) was built before the agent instruction system existed. It compensates for agents that didn't know how to orient, validate, or recover. Now that keel owns tasks/specs/dependencies, AGENTS.md has project conventions, and quality gates are standardised — 80% of cloudy is redundant. The useful 20% (agent spawning, git worktrees, external validation, dashboard, cost tracking) becomes loopy: a continuous delivery daemon that checks keel for work, spawns agents, validates externally, and loops forever.

## Three Parallel Tracks

### Track A: Cloudy → Loopy (main, 8 phases)
### Track B: Keel Enhancements (parallel, 3 MCP tools + rename)
### Track C: Menu Bar App (parallel after Track A Phase 4)

---

## Track A: Cloudy → Loopy

### Phase 0: Repository Setup

**Rename vykeai/cloudy → vykeai/loopy on GitHub. Override old vykeai/loopy with the cloudy content.**

Files to touch:
- `package.json` — name, bin entry (`cloudy` → `loopy`), repo URLs
- `bin/cloudy.ts` → `bin/loopy.ts`
- `src/cli/index.ts` — program name + description
- `README.md`, `AGENTS.md`, `CLAUDE.md`

Verify: `loopy --help` works.

### Phase 1: Delete Dead Code (~11k lines)

Delete entirely:
- `src/planner/` (all 6 files, 1,256 LOC)
- `src/reviewer.ts` (679 LOC)
- `src/core/task-shape.ts` (130 LOC) — inline the 2 functions orchestrator.ts uses into orchestrator.ts
- `src/core/risk-preflight.ts` (40 LOC)
- `src/config/global-config.ts` (78 LOC)
- `src/cli/commands/plan.ts` (200 LOC)
- `src/cli/commands/setup.ts` (483 LOC)
- `src/cli/commands/config.ts` (167 LOC)
- `src/cli/commands/pipeline.ts` (563 LOC)
- `src/__tests__/reviewer.test.ts` (393 LOC)
- `src/validator/prompts.ts` (3 LOC)

Fix imports in:
- `src/cli/index.ts` — remove deleted command registrations
- `src/core/orchestrator.ts` — inline task-shape functions it uses
- `src/config/config.ts` — remove global-config import

Verify: `bun run build` zero errors. `bun test` passes (minus deleted test).

### Phase 2: Rename Internals

Global find-replace: `cloudy` → `loopy`, `Cloudy` → `Loopy`, `CLOUDY` → `LOOPY`.

Key files:
- `src/config/defaults.ts` — `.cloudy` dir → `.loopy`
- `src/core/types.ts` — `CloudyConfig` → `LoopyConfig`
- `src/integrations/keel.ts` — note `by: 'loopy'`
- `src/daemon/server.ts` — endpoint names, log messages
- `src/dashboard/client/` — any branding

Do NOT rename keel's `CloudyRun` type — that's keel's concern.

Verify: `bun run build`. `loopy status` says "loopy" not "cloudy".

### Phase 3: Config Rewrite

**3a: Sweech profile discovery** — new file `src/integrations/sweech.ts`
- Read `~/.sweech/config.json` (JSON array of profiles)
- Each profile has: `commandName`, `cliType`, `provider`, `model`
- Wrapper scripts at `~/.sweech/bin/{commandName}` handle env vars
- Export: `discoverProfiles()`, `getProfile(name)`, `getProfileBinary(name)`

**3b: Loopy config** — new file `src/config/loopy-config.ts`
- Global config at `~/.loopy/config.json`:
  ```json
  {
    "defaultProfile": "claude",
    "interval": 600,
    "maxConcurrent": 3,
    "maxRetries": 3,
    "projects": {
      "goala": { "profile": "claude-ted", "interval": 300, "enabled": true }
    }
  }
  ```

**3c: Rewrite `src/config/config.ts`** — `loadConfig()` reads:
1. `keel/execution.yaml` (build commands, test commands, platforms)
2. Sweech profile (engine, model)
3. `~/.loopy/config.json` (interval, concurrency, per-project profile)

**3d: Rewrite `src/config/auto-routing.ts`** — check sweech profile for model, fall back to complexity routing.

Verify: `loopy status` shows projects from keel with sweech profile info.

### Phase 4: Daemon Tick Loop (THE critical phase)

**4a: tmux session manager** — new file `src/daemon/tmux.ts`
- Port from `loopy.py` lines 167-238
- Functions: `tmuxSpawn`, `tmuxKill`, `tmuxIsRunning`, `tmuxAttach`, `tmuxSessionName`
- Use `Bun.spawn` or `child_process.execSync`

**4b: Daemon state** — new file `src/daemon/daemon-state.ts`
- `DaemonState` with `runners: Record<string, RunnerState>`
- `RunnerState`: state, path, runs, lastRun, consecutiveFailures, lastExitCode, task counts
- Persist to `~/.loopy/state.json` (atomic write)

**4c: Tick function** — new file `src/daemon/tick.ts`
- Port from `loopy.py` lines 243-339 in TypeScript
- Read keel registry → check each enabled project → spawn if work available
- Circuit breaker: after `maxRetries` consecutive failures → state `circuit_open`
- Exit code tracking: write exit code to `~/.loopy/exits/{slug}.exit`
- Cooldown with exponential backoff on failures

**4d: Integrate with existing daemon server** (`src/daemon/server.ts`)
- Add tick loop on 30s interval
- Broadcast state changes via existing SSE/WebSocket
- SIGTERM/SIGINT graceful shutdown

**Spawning approach:** Tmux sessions that call the sweech wrapper:
```
tmux new-session -d -s loopy-goala bash -c \
  "cd /Users/luke/dev/goala && ~/.sweech/bin/claude-ted -p 'Read AUTONOMOUS_EXECUTION.md and execute.'"
```

Simple, transparent, watchable. The orchestrator (worktrees, validation) can be wired in later as an optional mode.

Verify: `loopy run` starts daemon. Agents spawn in tmux. `loopy status` shows live state. Circuit breaker triggers after 3 failures.

### Phase 5: CLI Commands

Keep from cloudy: `run`, `status`, `validate`, `logs`, `dashboard`, `daemon`, `dry-run`, `rollback`, `reset`, `runs`

Add from Python prototype:
- `enable <slug> [--profile <name>] [--interval <sec>]`
- `disable <slug>`
- `watch <slug>` — `tmux attach`
- `open <slug>` — Terminal.app via osascript
- `kick <slug>` — force-spawn, skip cooldown
- `stop [slug]` — kill tmux session(s)

Simplify `init.ts` (926 → ~50 lines): just `loopy enable <slug>`.

Verify: all commands from Python prototype work.

### Phase 6: Review Session Relay

New file: `src/core/review-relay.ts`

After implement session exits:
1. If CLI agent (claude/codex): spawn separate review tmux session (`loopy-review-{slug}`)
   - Prompt: "Review the diff since {checkpoint_sha}. Run quality gates. If issues, create keel tasks. If clean, mark approved."
   - Different engine (or same engine, fresh session)
2. If API engine (pi-mono/omnai): use existing Phase 2 AI review in validator
   - Keep `src/validator/strategies/ai-review.ts` and `ai-review-quality.ts`

Choice is automatic based on engine type — no config needed.

Integrate into tick.ts: after session ends + deterministic validation passes → spawn review.

Verify: review session spawns after implement. Review verdict updates keel.

### Phase 7: Cleanup & Documentation

- Update README.md with new architecture
- Update AGENTS.md
- Delete `.cloudy/` references in `.gitignore`, docs
- Archive old loopy Python prototype (move to `archive/loopy-prototype/` or delete)

---

## Track B: Keel Enhancements (Parallel)

### B1: `keel_next_ready_task` MCP tool

Add to `src/mcp/index.ts`.

Logic (exists in `src/cli/commands/status.ts:69-75`):
```ts
tasks.filter(t => t.status === 'todo')
  .filter(t => t.depends_on.every(dep => {
    const depTask = tasks.find(dt => dt.id === dep)
    return !depTask || depTask.status === 'done'
  }))
```

Add wave gating: only tasks in active waves.
Return full Task object with contextPatterns, acceptanceCriteria, allowedWritePaths.

File: `/Users/luke/dev/keel/src/mcp/index.ts`

### B2: `keel_get_execution_config` MCP tool

Read `keel/execution.yaml` using existing `parseYamlSimple()` from `src/core/render-autonomous.ts`.

Return: buildCommands, testCommands, profile, platforms, ports.

File: `/Users/luke/dev/keel/src/mcp/index.ts`

### B3: Rename `src/integrations/cloudy.ts` → `loopy.ts`

- `findCloudyBinary()` → `findLoopyBinary()`
- `keelTaskToCloudyTask()` → `keelTaskToLoopyTask()`
- `syncCloudyResults()` → `syncLoopyResults()`

Files: `/Users/luke/dev/keel/src/integrations/cloudy.ts` → `loopy.ts`, update all imports.

---

## Track C: Menu Bar App (After Track A Phase 4)

SwiftUI macOS app following SweechBar patterns exactly.

```
macos-menubar/
  LoopyBar/
    Package.swift
    Sources/
      LoopyBarApp.swift      — MenuBarExtra, single-instance, .accessory policy
      Design.swift           — emerald/teal theme (not purple like sweech)
      LoopyService.swift     — reads ~/.loopy/state.json, timer polling, sends CLI commands
      ProjectsView.swift     — project cards with state icons, task counts, actions
      SettingsView.swift     — refresh interval, notifications, daemon control
    Info.plist
  build-app.sh
```

Data source: reads `~/.loopy/state.json` (daemon writes it).
Commands: calls `loopy kick/stop/enable/disable` via `Process()`.
Pattern: identical to SweechBar's architecture.

Reference files:
- `/Users/luke/dev/sweech/macos-menubar/SweechBar/Sources/SweechBarApp.swift`
- `/Users/luke/dev/sweech/macos-menubar/SweechBar/Sources/Design.swift`
- `/Users/luke/dev/sweech/macos-menubar/SweechBar/Sources/AccountsView.swift`

---

## Phase Sequencing

```
Day 1:   Phase 0 (repo rename) + Phase 1 (delete dead code)
Day 2:   Phase 2 (rename internals)
Day 3-4: Phase 3 (config rewrite + sweech)
Day 5-7: Phase 4 (daemon tick loop) ← critical path
Day 8:   Phase 5 (CLI commands)
Day 9:   Phase 6 (review relay)
Day 10:  Phase 7 (cleanup + docs)

Parallel:
Day 1-2: Track B (keel MCP tools + rename)
Day 6-8: Track C (menu bar app, needs Phase 4 state.json)
```

## Verification

After full migration:
1. `loopy --help` shows the reduced command set
2. `loopy status` shows all keel projects with sweech profile info
3. `loopy enable goala --profile claude-ted` enables a project
4. `loopy run` starts daemon, spawns agents in tmux sessions
5. `loopy watch goala` attaches to live agent session
6. `loopy kick goala` force-spawns immediately
7. Agent exits → deterministic validation runs → review session spawns
8. `loopy stop` kills all agents gracefully
9. Dashboard at :1510 shows live state
10. Menu bar app shows project states, click actions work
11. `keel_next_ready_task` returns correct task from MCP
12. Circuit breaker triggers after 3 consecutive failures

## Risks

1. **Phase 4 is the hardest** — integrating the tick loop with the existing daemon server. Mitigation: start with standalone tick loop, integrate with daemon server after it works.
2. **Dashboard breakage** — renaming types/fields in Phase 2 breaks React client. Mitigation: update client types in the same commit.
3. **orchestrator.ts imports from deleted modules** — Phase 1 must carefully inline or stub the 5 functions from task-shape.ts. Mitigation: read orchestrator.ts thoroughly before deleting.
4. **omnai dependency** — keep it for now, layer sweech on top. Don't try to remove omnai in this migration.
