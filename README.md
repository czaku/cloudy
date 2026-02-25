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

## Install

```bash
npm install && npm run build
npm link          # makes `cloudy` available globally
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
| `--model <m>` | Model for all phases |
| `--model-execution <m>` | Model for execution |
| `--model-validation <m>` | Model for validation |
| `--model-auto` | Auto-route model by task complexity |

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
cloudy run --dashboard-only       # open dashboard and wait for browser to start the run
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

# View/update config
cloudy config
cloudy config --set parallel=true

# Clear all state
cloudy reset --force
```

---

## Configuration

```json
{
  "models": {
    "planning": "sonnet",
    "execution": "sonnet",
    "validation": "haiku"
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
