# ☁️ cloudy

**Give Claude a goal. Watch it build.**

> `v0.1.0` · MIT · Node.js 18+ · Requires [Claude Code](https://claude.ai/code)

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

## ⚡ Quick Start

```bash
# Install
npm install -g github:vykeai/cloudy

# Plan a goal
cloudy init "add user authentication with JWT"

# Run it
cloudy run --verbose
```

Or plan + run in one shot:

```bash
cloudy run --goal "add user authentication with JWT"
```

---

## 📦 Install

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/vykeai/cloudy/main/scripts/install.sh | bash
```

### npm (recommended)

```bash
npm install -g github:vykeai/cloudy
cloudy --version   # verify
```

npm clones from GitHub, builds from source, and links `cloudy` globally.

### Update / Uninstall

```bash
npm install -g github:vykeai/cloudy   # update
npm uninstall -g cloudy               # uninstall
```

### Local development

```bash
git clone https://github.com/vykeai/cloudy.git
cd cloudy
npm install
npm run build
npm link
```

**Requirements:** Node.js 18+, `claude` on your PATH ([Claude Code](https://claude.ai/code))

---

## 🗺️ Workflow

```bash
# 1. Plan — decompose a goal into tasks
cloudy init "add user authentication with JWT"

# 2. Preview the task graph
cloudy plan --graph

# 3. Execute
cloudy run --verbose
```

Point at a spec file:

```bash
cloudy init --spec ./PRD.md && cloudy run --verbose
```

---

## 🧠 Init — Plan Your Goal

```bash
# From a plain-English goal
cloudy init "build a payment integration"

# From a spec or PRD
cloudy init --spec ./PRD.md

# Combine multiple specs into one plan
cloudy init --spec ./phase38-spec.md --spec ./phase38b-spec.md

# Skip interactive review
cloudy init --spec ./PRD.md --no-review

# Control the planning model
cloudy init --spec ./PRD.md --planning-model sonnet
```

The planner uses Claude to decompose your goal into concrete, ordered tasks — each with a title, description, acceptance criteria, context file patterns, expected output artifacts, and a time estimate. If you don't pass `--no-review`, you can approve the plan or describe changes in plain English and iterate before running.

---

## 🚀 Run

```bash
cloudy run

# Choose models per phase
cloudy run --execution-model sonnet --task-review-model haiku --run-review-model opus

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
| `--execution-model <m>` | Model for execution phase |
| `--task-review-model <m>` | Model for per-task validation |
| `--run-review-model <m>` | Model for holistic post-run review |
| `--non-interactive` | Skip all prompts, disable dashboard (also `--ni`) |
| `--model-auto` | Auto-route model by task complexity |
| `--engine <e>` | Execution engine: `claude-code` (default) or `pi-mono` |
| `--pi-provider <p>` | Pi-mono provider (e.g. `openai`, `anthropic`, `google`) |
| `--pi-model <m>` | Pi-mono model ID (e.g. `gpt-4o-mini`) |
| `--pi-base-url <url>` | Custom base URL for pi-mono provider |
| `--tui` / `--no-tui` | Force terminal UI on/off |

---

## 🌳 Plan — Visualise the Graph

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

## ✅ Validation

After each task, cloudy runs a validation pipeline:

```
Phase 0  Artifact check    — required output files exist
Phase 1  Custom commands   — project-specific checks (exit 0 = pass)
Phase 2  AI review         — Claude reviews git diff vs acceptance criteria
```

Configure validation commands for your project:

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

## 🙋 Human-in-the-Loop

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

## 🖥️ Dashboard

A real-time web UI starts automatically at `http://localhost:3117`. It shows live task status, streaming output, cost tracking, and approval cards.

```bash
cloudy run                        # dashboard on by default, browser auto-opens
cloudy run --no-dashboard         # disable
cloudy run --dashboard-port 4000  # custom port
```

---

## 🌐 Daemon — Multi-Project Web Dashboard

The daemon runs a persistent background server at `http://localhost:3117` that aggregates all your registered projects into one web dashboard.

```bash
cloudy daemon start     # start the daemon (background, survives terminal close)
cloudy daemon stop      # stop it
cloudy daemon status    # running/stopped + registered projects
cloudy daemon register  # register the current project
cloudy daemon scan      # auto-discover projects under ~/dev and ~/projects
cloudy daemon open      # open http://localhost:3117 in browser
```

The dashboard has five tabs per project:

| Tab | What it does |
|-----|-------------|
| 📊 **Dashboard** | Project overview — chat count, message count, last activity |
| 💬 **Chat** | Chat with Claude · view Claude Code CLI session history |
| 📋 **Plan** | Pick spec files → `cloudy scope` → Q&A → approve plan |
| ▶️ **Run** | Launch `cloudy run` · live output streaming |
| 📜 **History** | Browse past runs, costs, task outcomes |
| 🧠 **Memory** | View `CLAUDE.md` and `.claude/MEMORY.md` for the project |

### 💬 Chat tab

The Chat tab shows both Cloudy sessions (started from the web) and Claude Code CLI sessions (from your terminal). CLI sessions are read-only while the CLI is active. Once you close the terminal, inactive CC sessions unlock — type to resume the exact conversation via `claude --resume`.

If you re-open the CLI while the web is mid-reply, the daemon detects the file change and instantly re-locks the session in the browser.

**Slash commands** (type `/` to autocomplete):

| Command | Action |
|---------|--------|
| `/help` | Show all commands |
| `/clear` | New chat session |
| `/cost` | Token usage + cost for this session |
| `/model <haiku\|sonnet\|opus>` | Switch model |
| `/status` | Show project status |
| `/memory` | Open Memory tab |
| `/plan <file>` | Add spec to Plan tab |

### 🔗 URL routing

The dashboard uses hash-based routing — refresh always restores your position:

```
http://localhost:3117/#/myproject/chat/cc%3A1498d6da-...
                          ↑project  ↑tab  ↑session id
```

---

## 🖱️ Terminal UI (TUI)

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

```bash
cloudy run --no-tui       # disable (useful for CI or piping output)
cloudy run --tui          # force on even in non-TTY contexts
```

---

## ⚙️ Execution Engines

### Claude Code (default)

Uses the `claude` CLI with `--dangerously-skip-permissions` for full autonomous operation.

```bash
cloudy run --engine claude-code --execution-model sonnet
```

### Pi-mono

Abstraction layer supporting OpenAI, Google, Ollama, and other providers.

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

## 🤖 Models

```bash
# Same model for everything
cloudy run --model opus

# Mix per phase — cheap task review, quality execution, deep holistic review
cloudy run --execution-model sonnet --task-review-model haiku --run-review-model opus

# Auto-route by task complexity
cloudy run --model-auto

# Persist defaults
cloudy config --set models.execution=sonnet
cloudy config --set models.validation=haiku
cloudy config --set review.model=opus
```

| Phase | Flag | Default | Notes |
|-------|------|---------|-------|
| 🧠 Planning | `--planning-model` | sonnet | Goal → task graph |
| 🔨 Execution | `--execution-model` | sonnet | Builds the code |
| 🔍 Task review | `--task-review-model` | haiku | Per-task diff review, runs every task |
| 🔭 Run review | `--run-review-model` | opus | Holistic post-run review, runs once at the end |

With `--model-auto`, task complexity (acceptance criteria count, description length, dep count, context size) determines the model automatically.

---

## 🌱 Dynamic Subtasks

If Claude discovers unexpected work mid-task, it can extend the plan:

```
## SUBTASKS
- [task-2-a] Add OAuth provider config (depends: task-2)
- [task-2-b] Implement token refresh (depends: task-2-a)
```

Cloudy parses this, adds the subtasks to the live queue, and runs them in order.

---

## 🎁 Wrap-up

Add a `wrapUpPrompt` to your plan to run a final prompt after all tasks complete:

```json
// .cloudy/state.json  (or set via plan edit)
{
  "wrapUpPrompt": "Run make smoke. If it passes, write a one-paragraph summary of what was built to SUMMARY.md."
}
```

---

## 🛠️ Other Commands

```bash
# ✅ Validate completed tasks (re-run acceptance checks)
cloudy validate
cloudy validate task-3
cloudy validate --no-ai-review

# ↩️ Roll back a task to its pre-execution git checkpoint
cloudy rollback task-3

# 📊 Show progress, cost, logs
cloudy status
cloudy status --watch
cloudy status --cost

# 🔁 Convergence loop: run until a condition passes
cloudy loop "make all tests pass" --until "npm test" --max-iterations 5

# 👁️ Preview what cloudy would do without executing
cloudy dry-run

# ⚙️ View/update config
cloudy config
cloudy config --set parallel=true

# 🗑️ Clear all state
cloudy reset --force
```

---

## 📝 Writing Good Specs

Cloudy is only as good as the specs you give it. The most common cause of incomplete implementations isn't a model failure — it's an incomplete spec. Claude will implement exactly what you describe, no more. **The spec is the complete contract. The agent fills in the gaps with guesses.**

### 📁 Complete the Files list

Every file in the full data pipeline must be listed. The most common mistake is describing a feature at the UI or API layer without tracing where the data actually comes from.

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

**Rule:** trace the data from its source (parser, DB, external API) to where it's consumed. Every layer must be listed. Watch out for `(no changes needed)` — it's often wrong.

### 🎯 Write behaviour-based acceptance criteria

Every criterion should be falsifiable by running a command or making an API call.

❌ **Surface checks** — pass even when broken:
```markdown
- Checkbox is present in the dialog
- `requires` field added to Task model
```

✅ **Behaviour checks** — actually verify the feature works:
```markdown
- `POST /api/v1/spaces/{id}/ingest-spec` with a spec containing
  `**Dependencies:** TASK-2601` creates a task with `requires: ["TASK-2601"]`
  in the API response
- With autoQueue=true: dep-zero tasks created as `ready`, tasks with requires
  set as `backlog` — verified by `GET /api/v1/tasks` after import
```

### 📋 Quick checklist

Before running `cloudy init`:

- [ ] Every integration type / enum value named in Steps has its own AC line
- [ ] Every model field is verified in an API `GET` response criterion
- [ ] Every threshold has a "fires" AND a "does NOT fire" criterion
- [ ] No criterion uses "renders", "exists", or "is created" without a data check
- [ ] A cross-task integration check covers the full data flow end-to-end
- [ ] Validation commands match the commands that will actually run
- [ ] No two tasks make contradictory assumptions about the same state
- [ ] Negative cases present: 404s, 422s, disabled items excluded, below-threshold no-ops

---

## ⚙️ Configuration

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
  "review": {
    "enabled": true,
    "model": "opus"
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

## 📁 Project State

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

## 📄 License

MIT
