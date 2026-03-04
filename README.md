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

```bash
npm install -g czaku/cloudy
```

That's it. npm clones from GitHub, builds from source, and links `cloudy` globally.

Verify:

```bash
cloudy --version
```

**Requirements:** Node.js 18+, `claude` on your PATH ([Claude Code](https://claude.ai/code))

**To update:**

```bash
npm install -g czaku/cloudy
```

**To uninstall:**

```bash
npm uninstall -g cloudy
```

**Local development:**

```bash
git clone https://github.com/czaku/cloudy.git
cd cloudy
npm install
npm run build
npm link
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

# Combine multiple specs into one plan
cloudy init --spec ./phase38-spec.md --spec ./phase38b-spec.md

# Skip interactive review
cloudy init --spec ./PRD.md --no-review

# Control the planning model
cloudy init --spec ./PRD.md --model-planning sonnet
```

The planner uses Claude to decompose your goal into concrete, ordered tasks — each with a title, description, acceptance criteria, context file patterns, expected output artifacts, and a time estimate. If you don't pass `--no-review`, you can approve the plan or describe changes in plain English and iterate before running.

**Init flow:** `init` only asks for the planning model upfront. After plan approval, if you choose to run immediately, it asks for execution model, validation model (per-task), final review model, and whether to launch the dashboard — then hands off to `cloudy run`.

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
| `--model-validation <m>` | Model for per-task validation |
| `--review-model <m>` | Model for holistic post-run review (`haiku`/`sonnet`/`opus`) |
| `--no-post-review` | Skip the holistic post-run review |
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
exactly what you describe, no more. **The spec is the complete contract. The agent fills
in the gaps with guesses.**

---

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

### Name every variant explicitly

If the spec mentions N types/states/enum values, write N acceptance criteria — one per
variant. The agent tests what is listed and skips the rest.

❌ **Lazy** — agent implements only the example variant:
```markdown
- `get_tool_manifest` returns the correct tools for all integration types
```

✅ **Exhaustive** — every type has its own verifiable criterion:
```markdown
- `get_tool_manifest([{type:"computer-use"}])` → `mcp_servers == ["peekaboo"]`
- `get_tool_manifest([{type:"browser"}])` → `mcp_servers == ["playwright"]`
- `get_tool_manifest([{type:"task_spawn"}])` → `"Bash" in tools`
- `get_tool_manifest([{type:"web-search"}])` → `"WebFetch" in tools` and `"WebSearch" in tools`
- `get_tool_manifest([{type:"filesystem"}])` → `restrictions == ["no_bash", "no_glob_outside_rootPath"]`
- `get_tool_manifest([{type:"github"}])` → `mcp_servers == []`, `"Bash" in tools`
- `get_tool_manifest([{type:"code"}])` → `"Bash" in tools`
```

Apply the same rule to: enum values, message types, status transitions, soul types,
error codes, model fields, condition variants, route handlers.

---

### Verify every model field at the API boundary

If the spec defines a model with 10 fields, the criterion for `GET /endpoint` must
verify all 10 are present in the response — not just the interesting ones.

❌ **Incomplete:**
```markdown
- POST /comms returns {id} and GET returns the message
```

✅ **Exhaustive:**
```markdown
- POST /comms then GET /comms/{id} returns all fields:
  `id`, `from_soul`, `to_soul`, `type`, `content`, `thread_id`, `timestamp`, `read`
- Optional fields `space_id`, `area_id`, `task_id` default to null when not provided
- Optional fields appear in the read-back when supplied in POST
```

---

### Include the negative case

For every "fires when X", add a "does NOT fire when below X". For every included type,
add an excluded type.

```markdown
✅ Negative criteria:
- Area Lead review fires when ≥ 3 tasks are blocked in a space
- Area Lead review does NOT fire when only 2 tasks are blocked (below threshold)
- Disabled integration is excluded from manifest — `get_tool_manifest([{type:"code", enabled:false}])` returns `tools == []`
- `web-search` gates do NOT include any gate with "typecheck" in its strategy
- Notion/Email/Slack toggle buttons are `disabled` — clicking does not change state
```

---

### Use concrete values in algorithms and formulas

Don't describe the formula — verify it with exact numbers.

❌ **Vague:**
```markdown
- Latency endpoint returns correct percentile values
```

✅ **Concrete:**
```markdown
- With run durations [100, 200, 300, 400] ms, GET /latency returns:
  p50=200, p75=300, p95=400, p99=400, mean=250, count=4
```

---

### Add a cross-task integration check

A final section that verifies the full data flow end-to-end becomes its own Cloudy
task and is your best defence against tasks that each pass in isolation but fail
when combined.

```markdown
## Cross-task integration check

- Full flow: create space → GET /integrations returns [] → preset picker visible
  → user picks "Software" → PUT /integrations [{code, github}]
  → GET /integrations returns [{type:"code",enabled:true}, {type:"github",enabled:true}]
- `python3 -m pytest api/tests/ -x -q` exits 0
- `bunx tsc --noEmit` exits 0
```

---

### Spot contradictions before running

Read the spec top-to-bottom looking for requirements that conflict. The agent will
silently resolve them — usually in the wrong direction. Classic example:

> **Task A:** Migration synthesises `[code, github]` for all new spaces.
> **Task B:** Preset picker shows when `integrations.length === 0`.

These cannot both be true. Find contradictions and resolve them explicitly in the spec
before handing to Cloudy.

---

### Quick checklist

Before running `cloudy init`, check:

- [ ] Every integration type / enum value / soul type named in Steps has its own AC line
- [ ] Every model field named in Steps is verified in an API `GET` response criterion
- [ ] Every threshold has a "fires" AND a "does NOT fire" criterion
- [ ] No criterion uses the words "renders", "exists", "is created", or "is accessible" without a data check
- [ ] A cross-task integration check covers the full data flow end-to-end
- [ ] Validation commands at the top match the commands that will actually run
- [ ] No two tasks make contradictory assumptions about the same state
- [ ] Negative cases present: 404s, 422s, disabled items excluded, below-threshold no-ops

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
