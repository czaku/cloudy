# cloudy

**Give Claude a goal. Watch it build.**

Cloudy breaks a project goal into a dependency-ordered task graph, then works through each task using Claude Code — with validation, automatic retry, and real-time feedback. Works with any language or stack.

```
☁️  cloudy  ·  10 tasks
    🤖 exec:sonnet  ·  validate:sonnet  ·  sequential

⚡  task-1  Ralph Loop backend
    📁 49 files in context
    ─── live output ───────────────────────────
  💭 Let me analyze the requirements and map out what needs to change...
    Now I'll implement execute_task_ralph_loop in orchestrator.py:
    Adding the ORIENT → VERIFY → IMPLEMENT → COMMIT → REPORT steps...
    ✓ done  ~$3.12

    🔍 checking acceptance criteria
    ✨ criteria met

✅  task-1  Ralph Loop backend  4m32s

   ████████░░░░░░░░░░░░░░░░░░░░  1 / 10  10%
```

---

## Prerequisites

- **Node.js 18+**
- **[Claude Code](https://claude.ai/code)** — `claude` must be on your PATH

---

## Install

**One-liner:**

```bash
git clone https://github.com/czaku/cloudy.git ~/cloudy && cd ~/cloudy && npm install && npm run build && npm link
```

This clones the repo, builds it, and links `cloudy` globally so you can run it from any directory.

**Manual steps:**

```bash
git clone https://github.com/czaku/cloudy.git
cd cloudy
npm install
npm run build
npm link          # makes `cloudy` available globally
```

After install, verify:

```bash
cloudy --version
```

---

## Workflow

```bash
# 1. Plan — decompose a goal into tasks
cloudy init "add user authentication with JWT"

# 2. Preview the task graph
cloudy plan --graph

# 3. Execute
cloudy run --verbose
```

Or skip the planning step entirely:

```bash
cloudy run --goal "add user authentication with JWT"
```

Or point at a spec file:

```bash
cloudy init --spec ./PRD.md && cloudy run --verbose
```

---

## Init

```bash
# From a goal
cloudy init "build a payment integration"

# From a spec or PRD
cloudy init --spec ./PRD.md

# Skip interactive review
cloudy init --spec ./PRD.md --no-review

# Control the planning model
cloudy init --spec ./PRD.md --model-planning sonnet
```

The planner uses Claude to decompose your goal into concrete, ordered tasks — each with a title, description, acceptance criteria, context file patterns, expected output artifacts, and a time estimate. If you don't pass `--no-review`, you can approve the plan or describe changes in plain English and iterate before running.

---

## Run

```bash
cloudy run

# Choose models per phase
cloudy run --model-execution sonnet --model-validation sonnet

# Show live Claude output as each task runs
cloudy run --verbose

# Re-run a failed task (full retry budget, plan continues after)
cloudy run --retry task-3

# Run one task and its dependencies only
cloudy run --only-task task-5

# Skip tasks before a given point
cloudy run --start-from task-4

# Parallel execution
cloudy run --parallel --max-parallel 4

# No web dashboard
cloudy run --no-dashboard
```

| Flag | Description |
|------|-------------|
| `--goal <text>` | Plan + run in one shot |
| `--retry <id>` | Reset a failed task and re-run |
| `--only-task <id>` | Run only this task and its deps |
| `--start-from <id>` | Skip tasks before this point |
| `--resume` | Show completed tasks, confirm before continuing |
| `--max-retries <n>` | Override retry budget for this run |
| `--parallel` | Run independent tasks concurrently |
| `--max-parallel <n>` | Concurrency cap (default: 3) |
| `--no-validate` | Skip all validation |
| `--no-dashboard` | Disable the web dashboard |
| `--verbose` | Stream live Claude output per task |
| `--model <m>` | Model for all phases (`opus`, `sonnet`, `haiku`) |
| `--model-execution <m>` | Model for execution phase |
| `--model-validation <m>` | Model for validation phase |
| `--model-auto` | Auto-route model by task complexity |
| `--engine <e>` | Execution engine: `claude-code` (default) or `pi-mono` |
| `--pi-provider <p>` | Pi-mono provider (e.g. `openai`, `anthropic`, `google`) |
| `--pi-model <m>` | Pi-mono model ID (e.g. `gpt-4o-mini`) |
| `--pi-base-url <url>` | Custom base URL for pi-mono provider |
| `--tui` | Force terminal UI on (auto-enabled when TTY) |
| `--no-tui` | Disable terminal UI |
| `--no-dashboard` | Disable the web dashboard |

---

## Plan

```bash
cloudy plan                  # full task list
cloudy plan --graph          # ASCII dependency tree
cloudy plan --mermaid        # Mermaid diagram
cloudy plan --json           # raw JSON
cloudy plan edit             # edit pending tasks via Claude
```

`cloudy plan --graph`:

```
task-1  Set up database schema
  ├─ task-2  Auth routes (JWT)
  │    └─ task-4  User CRUD endpoints
  └─ task-3  File upload service
       └─ task-5  Integration tests
```

---

## Validation

After each task, cloudy runs a validation pipeline:

```
Phase 0  Artifact check    — required output files exist
Phase 1  Custom commands   — project-specific checks (exit 0 = pass)
Phase 2  AI review         — Claude reviews git diff vs acceptance criteria
```

Phase 1 runs whatever commands you configure for your project. There are no hardcoded assumptions about language or toolchain — cloudy doesn't know if you're building TypeScript, Swift, Rust, or Python. You tell it:

```json
// .cloudy/config.json
{
  "validation": {
    "commands": [
      "cd web && bunx tsc --noEmit",
      "cd web && bun test",
      "swift build"
    ]
  }
}
```

If a task fails validation, the retry prompt includes the exact error. Context is expanded on each retry. After exhausting retries, the run halts — with a clear error and the task preserved in `failed` state for `--retry`.

---

## Human-in-the-Loop

Pause for approval before tasks run, or escalate failures for guidance:

```bash
cloudy config --set approval.mode=always       # pause before every task
cloudy config --set approval.mode=on-failure   # only escalate on failure
cloudy config --set approval.timeoutSec=120    # auto-continue after 2 min
cloudy config --set approval.autoAction=halt   # auto-halt instead of continue
```

At each pause:

```
⏸  [task-3] JWT auth routes  — approval needed  (120s timeout)
  [a]pprove  [s]kip  [h]alt  [r <hint>] retry with hint:
  ❯ r store the token in httpOnly cookie, not localStorage
```

All decisions are logged to `.cloudy/logs/approvals.jsonl`.

---

## Dashboard

A real-time web UI starts automatically at `http://localhost:3117`. It shows live task status, streaming output, cost tracking, and approval cards.

```bash
cloudy run                        # dashboard on by default, browser auto-opens
cloudy run --no-dashboard         # disable
cloudy run --dashboard-port 4000  # custom port
```

---

## Terminal UI (TUI)

When running in a terminal, cloudy shows a two-panel TUI automatically:

```
┌─ Tasks ──────────────┐ ┌─ Output — task-2 ─────────────────────────────┐
│ ✅ task-1  Setup DB   │ │ Implementing JWT auth routes...               │
│ ⚡ task-2  Auth       │ │ Adding /api/auth/login endpoint               │
│ ○  task-3  Upload     │ │ Token stored in httpOnly cookie               │
│ ○  task-4  CRUD       │ │                                               │
│ ○  task-5  Tests      │ │                                               │
└───────────────────────┘ └────────────────────────────────────────────────┘
  ↑/↓ navigate · p pause · s skip · q quit
```

The TUI is enabled automatically when stdout is a TTY. To control it:

```bash
cloudy run --no-tui       # disable (useful for CI or piping output)
cloudy run --tui          # force on even in non-TTY contexts
```

---

## Execution Engines

Cloudy supports two execution engines:

### Claude Code (default)

Uses the `claude` CLI with `--dangerously-skip-permissions` for full autonomous operation.

```bash
cloudy run --engine claude-code --model-execution sonnet
```

### Pi-mono

Abstraction layer that supports OpenAI, Google, Ollama, and other providers — useful when you want to drive tasks with a different model family.

```bash
cloudy run --engine pi-mono --pi-provider openai --pi-model gpt-4o-mini
cloudy run --engine pi-mono --pi-provider google --pi-model gemini-2.0-flash
cloudy run --engine pi-mono --pi-provider ollama --pi-model llama3.2 --pi-base-url http://localhost:11434
```

Persist the engine in config:

```bash
cloudy config --set engine=pi-mono
cloudy config --set piMono.provider=openai
cloudy config --set piMono.model=gpt-4o-mini
```

---

## Models

```bash
# Same model for everything
cloudy run --model opus

# Mix per phase — cheap validation, quality execution
cloudy run --model-execution opus --model-validation haiku

# Auto-route by task complexity
cloudy run --model-auto

# Persist defaults
cloudy config --set models.execution=sonnet
cloudy config --set models.validation=haiku
```

| Phase | Default | Notes |
|-------|---------|-------|
| Planning | sonnet | Goal → task graph |
| Execution | sonnet | Balanced quality/cost |
| Validation | haiku | Reviewing diffs |

With `--model-auto`, task complexity (acceptance criteria count, description length, dep count, context size) determines the model.

---

## Dynamic Subtasks

If Claude discovers unexpected work mid-task, it can extend the plan:

```
## SUBTASKS
- [task-2-a] Add OAuth provider config (depends: task-2)
- [task-2-b] Implement token refresh (depends: task-2-a)
```

Cloudy parses this, adds the subtasks to the live queue, and runs them in order. Subtasks inherit retry budget and timeout from their parent.

---

## Wrap-up

Add a `wrapUpPrompt` to your plan to run a final prompt after all tasks complete — useful for generating a summary, running a smoke test, or sending a notification:

```json
// .cloudy/state.json  (or set via plan edit)
{
  "wrapUpPrompt": "Run make smoke. If it passes, write a one-paragraph summary of what was built to SUMMARY.md."
}
```

The wrap-up runs in the same working directory as the rest of the plan, using the execution engine and model.

---

## Other Commands

```bash
# Validate completed tasks (re-run acceptance checks)
cloudy validate
cloudy validate task-3
cloudy validate --no-ai-review

# Roll back a task to its pre-execution git checkpoint
cloudy rollback task-3

# Show progress, cost, logs
cloudy status
cloudy status --watch
cloudy status --cost

# Convergence loop: run until a condition passes
cloudy loop "make all tests pass" --until "npm test" --max-iterations 5

# Preview what cloudy would do without executing
cloudy dry-run

# View/update config
cloudy config
cloudy config --set parallel=true

# Clear all state
cloudy reset --force
```

---

## Writing Good Specs

Cloudy is only as good as the specs you give it. The most common cause of incomplete
implementations isn't a model failure — it's an incomplete spec. Claude will implement
exactly what you describe, no more.

### Complete the Files list

Every file in the full data pipeline must be listed. The most common mistake is describing
a feature at the UI or API layer without tracing where the data actually comes from.

**Example:** adding a `requires` field to tasks ingested from a spec file.

❌ **Incomplete** — agent builds the UI correctly but field is always empty:
```markdown
**Files:**
- `web/src/components/SpecIngestionDialog.tsx`  (add checkbox)
- `api/routes.py`  (no changes needed)
```

✅ **Complete** — agent traces the full pipeline:
```markdown
**Files:**
- `api/planner/spec_parser.py`  (extract `requires` from **Dependencies:** lines)
- `api/routes.py`  (pass `requires` through to create_task; dep-zero status logic)
- `web/src/components/SpecIngestionDialog.tsx`  (checkbox + filter on requires)
```

**Rule:** before writing the Files list, trace the data from its source (parser, DB,
external API) to where it's consumed (UI, test). Every layer that transforms or passes
it through must be listed.

Watch out for `(no changes needed)` — it's often wrong. If a feature depends on a field
existing, the file that produces that field must be in the list even if everything else
about that file stays the same.

---

### Write behaviour-based acceptance criteria

Acceptance criteria are how Cloudy validates each task. If they only check that files
exist or UI elements render, validation will pass even when the feature is broken.

**Every criterion should be falsifiable by running a command or making an API call.**

❌ **Surface checks** — pass even when broken:
```markdown
- Checkbox is present in the dialog (default unchecked)
- `requires` field added to Task model
- TaskDependencyBadge component exists
```

✅ **Behaviour checks** — actually verify the feature works:
```markdown
- `POST /api/v1/spaces/{id}/ingest-spec` with a spec containing
  `**Dependencies:** TASK-2601` creates a task with `requires: ["TASK-2601"]`
  in the API response
- With autoQueue=true: dep-zero tasks created as `ready`, tasks with requires
  set as `backlog` — verified by checking `GET /api/v1/tasks` after import
- `parse_spec()` on a spec with `**Dependencies:** TASK-2601, TASK-2602` returns
  `requires: ["TASK-2601", "TASK-2602"]` for that task
```

**Rules:**
- New API field? → criterion must read it back from the API response
- New data pipeline? → criterion must verify data flows end-to-end (source → API → consumer)
- New UI backed by API data? → two separate criteria: one for the API contract, one for the UI behaviour
- Parser/transformer change? → criterion must include a concrete input → expected output example

---

### Configure validation commands

Pair behaviour-based criteria with project-specific validation commands so Cloudy can
run them automatically after each task:

```json
// .cloudy/config.json
{
  "validation": {
    "commands": [
      "cd api && python -m pytest api/tests/ -x -q",
      "cd web && bunx tsc --noEmit",
      "make smoke"
    ]
  }
}
```

If you add a new API endpoint, add it to your smoke test before writing the task spec —
that way the validator catches regressions automatically.

---

## Configuration

Full config reference (`.cloudy/config.json`):

```json
{
  "models": {
    "planning": "sonnet",
    "execution": "sonnet",
    "validation": "haiku"
  },
  "engine": "claude-code",
  "piMono": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "baseUrl": ""
  },
  "parallel": false,
  "maxParallel": 3,
  "maxRetries": 2,
  "retryDelaySec": 30,
  "taskTimeoutMs": 3600000,
  "validation": {
    "aiReview": true,
    "commands": []
  },
  "dashboard": true,
  "dashboardPort": 3117,
  "approval": {
    "mode": "never",
    "timeoutSec": 300,
    "autoAction": "continue"
  }
}
```

---

## Project State

Everything lives in `.cloudy/` (gitignored by default):

```
.cloudy/
├── state.json        — tasks, status, cost data
├── config.json       — your overrides
├── logs/
│   ├── cloudy.log    — execution log
│   ├── tasks/        — per-task output
│   └── approvals.jsonl
├── checkpoints/      — git SHAs for rollback
└── handoffs/         — result summaries for downstream task context
```

---

## License

MIT
