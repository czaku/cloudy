# cloudy

AI task orchestration CLI. Planning → execution → 3-phase validation. TypeScript + Commander.

---

## Screenshot Storage

Save every screenshot to `~/Desktop/screenshots/cloudy/`.

```bash
export PROJECT_SCREENSHOT_DIR=~/Desktop/screenshots/$(basename "$(git rev-parse --show-toplevel)")
mkdir -p "$PROJECT_SCREENSHOT_DIR"
```

Do not keep proof or review screenshots in `/tmp`.

---

## Project Management — Keel

This project is managed by **keel** ([vykeai/keel](https://github.com/vykeai/keel)). Keel is the single source of truth
for tasks, specs, decisions, and roadmap. **Do NOT create or maintain manual TASKS.md,
ROADMAP.md, or similar tracking files.**

### With MCP access (preferred)
- Read state: `keel_status`, `keel_list_tasks`
- Start work: `keel_update_task { id, status: "active", assignee: "claude" }`
- Finish: `keel_update_task { status: "done" }` + `keel_add_note` with summary
- Blocked: `keel_update_task { status: "blocked" }` + `keel_add_note` with reason
- Architecture changes: `keel_update_architecture_doc`
- Decisions: `keel_log_decision` before implementing
- Search first: `keel_search "topic"` — update existing, don't duplicate

### Without MCP
- CLI: `keel status`, `keel tasks`, `keel task update <id> --status active`
- Read `views/` for current state — never edit views (generated)

---

## Execution — Cloudy

Use **cloudy** ([vykeai/cloudy](https://github.com/vykeai/cloudy)) for multi-task orchestration.

```bash
cloudy plan --spec ./docs/spec.md          # decompose spec → task graph
cloudy run --execution-model sonnet        # execute all tasks
cloudy check                               # re-validate completed tasks
cloudy retry task-3                        # retry a failed task
cloudy rollback task-2                     # revert git to pre-task checkpoint
```

**From inside Claude Code sessions** — unset nesting vars:
```bash
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT cloudy run --spec spec.md
```

**Keel integration**: `cloudy run --keel-slug {project} --keel-task T-001` auto-updates keel task status.

---

## Skills — Runecode

**runecode** ([vykeai/runecode](https://github.com/vykeai/runecode)) provides 15+ reusable Claude Code skills:

| Skill | Purpose |
|-------|---------|
| `/standup` | Generate daily standup from git history |
| `/pr-description` | Write PR description from current diff |
| `/test-write` | Write tests for changed code |
| `/review-self` | Review your own code before committing |
| `/security-audit` | Audit changes for vulnerabilities |
| `/tech-debt` | Identify technical debt |
| `/dead-code` | Find unused exports and unreachable code |
| `/changelog` | Generate changelog from commits |

**Project health**: `runecode doctor` checks setup completeness. `runecode audit` scores and auto-fixes gaps.

---

## CLI Rules — Non-Negotiable

These apply to every CLI in the vykeai ecosystem:

1. **Exit codes matter**: `0` = success, non-zero = any failure — always exit with the correct code
2. **Stream separation**: errors and diagnostics to stderr, program output to stdout
3. **`--help` and `--version`** must work without side effects (no network calls, no file writes)
4. **Graceful failure**: missing files, bad flags, no TTY — all need clear, actionable error messages
5. **No interactive prompts in non-TTY** — detect `process.stdout.isTTY` and degrade gracefully
6. **Idempotent where possible** — running the same command twice should not produce side effects
7. **Consistent flag style**: `--long-flag` with `-s` short aliases. Never positional-only for important args

---

## Conventions

- Keep command behavior stable — downstream tools and CI scripts depend on flag names and output format
- Treat generated output (dist/, build/) as disposable artifacts — never hand-edit
- Backwards compatibility matters more than local convenience
- When launching subprocesses, strip environment variables that could cause nesting issues (e.g., `CLAUDECODE`)

---

## Architecture Notes

- CLI is infrastructure — avoid coupling it to one product or workflow
- Command names, flags, and output formats are public contracts
- Changes to public contracts require coordinated downstream updates
- If this CLI is used inside other agent sessions, keep nesting/env-stripping behavior intact

---

## Testing

```bash
npm test        # or: bun test, pytest, ./tests/test_*.sh
```

- Test all commands with expected input/output
- Test error paths exit non-zero
- Test `--help` output is accurate and complete
- Test across target platforms if path separators differ (macOS/Linux/Windows)

---

## Git Conventions

- Commit after every meaningful chunk of work
- Concise messages: `feat:`, `fix:`, `refactor:`
- Never commit `.env`, credentials, or secrets

---

## Do Not

- Break existing command-line interface without explicit instruction
- Mix user-facing output and diagnostics on the same stream
- Hardcode machine-specific paths, ports, or hostnames when config exists
- Add dependencies without justification — CLIs should be lean
- Use `console.log` for errors — use `console.error` or stderr
- Skip testing error paths and edge cases

---

## Definition of Done (CLI)

- [ ] `--help` output is accurate and complete
- [ ] All error paths exit non-zero
- [ ] Main commands have tests
- [ ] No breaking changes to existing flags/output format
- [ ] `/review-self` passed — no obvious issues in diff
- [ ] Changes committed (frequent, progressive — not batched at end)
- [ ] Keel task updated: `keel_update_task { status: "done" }` + `keel_add_note`
- [ ] If using cloudy: all three validation phases pass

---

## Worktree Discipline (CRITICAL — applies to ALL skills and agents)

Work is either **sequential** or **parallel**. Never orphan a worktree.

**Sequential work (one task at a time):**
- Stay on the active branch. Do NOT create a worktree.
- Commit and push directly on that branch.

**Parallel work (multiple tasks in flight — e.g. `/vy-go`, `/loop`, `/looperator-start`, multiple `Agent` calls):**
- Each parallel task MUST run in its own `git worktree add .worktrees/<task-id> HEAD`.
- Before the orchestrator exits, every worktree MUST be either:
  1. **Merged back** into the active branch (`git merge --no-ff .worktrees/<id>`), gates re-run on the merged result, then `git worktree remove .worktrees/<id>`, OR
  2. **Explicitly surfaced** to the user as "needs manual merge" with the branch name preserved — never silently left behind.
- If a merge fails: keep the worktree, mark the task blocked, tell the user. Do NOT delete unmerged work.
- Before finishing any session that spawned parallel agents, run `git worktree list` and account for every entry.

**Why:** prior `/vy-go` runs lost work because independent worktrees were abandoned when the orchestrator exited without merging. This rule is non-negotiable.

---

## Docker Container Naming

When creating Docker containers (docker-compose, Dockerfile, scripts), **always prefix container names with the project name** so they are identifiable in Docker Desktop and `docker ps`.

**Format:** `<project-name>-<variant>-local`

Examples:
- `univiirse-api-local`, `univiirse-db-local`, `univiirse-redis-local`
- `fitkind-api-local`, `fitkind-worker-local`
- `den-web-local`, `den-postgres-local`

In `docker-compose.yml`, set `container_name:` explicitly on every service:
```yaml
services:
  api:
    container_name: myproject-api-local
  db:
    container_name: myproject-db-local
```

**Why:** Generic names like `api`, `infra`, `tmp`, `e2e` are unidentifiable when multiple projects run simultaneously. The `-local` suffix distinguishes dev containers from production.

---

## No CI/CD Pipelines

**Do NOT create GitHub Actions workflows, CI configs, or automated pipeline files.**

This means:
- No `.github/workflows/*.yml`
- No `.gitlab-ci.yml`, `Jenkinsfile`, `Taskfile`, `Makefile` for CI
- No `circle.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`
- No pre-commit hooks that phone home or run cloud services

**Why:** CI/CD will be set up intentionally when the project approaches production. Agents creating workflows during early development generates thousands of notification emails and adds maintenance burden before it provides value. Build, test, and lint locally.

If the project already has CI files, leave them alone -- but do not create new ones or extend existing ones without explicit instruction.


---

## Boil the Ocean

The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that the user is genuinely impressed — not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't "good enough" — it's "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing. When asked for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.

---

## Worktree Discipline (CRITICAL — applies to ALL skills and agents)

Work is either **sequential** or **parallel**. Never orphan a worktree.

**Sequential work (one task at a time):**
- Stay on the active branch. Do NOT create a worktree.
- Commit and push directly on that branch.

**Parallel work (multiple tasks in flight — e.g. `/vy-go`, `/loop`, `/looperator-start`, multiple `Agent` calls):**
- Each parallel task MUST run in its own `git worktree add .worktrees/<task-id> HEAD`.
- Before the orchestrator exits, every worktree MUST be either:
  1. **Merged back** into the active branch (`git merge --no-ff .worktrees/<id>`), gates re-run on the merged result, then `git worktree remove .worktrees/<id>`, OR
  2. **Explicitly surfaced** to the user as "needs manual merge" with the branch name preserved — never silently left behind.
- If a merge fails: keep the worktree, mark the task blocked, tell the user. Do NOT delete unmerged work.
- Before finishing any session that spawned parallel agents, run `git worktree list` and account for every entry.

**Why:** prior `/vy-go` runs lost work because independent worktrees were abandoned when the orchestrator exited without merging. This rule is non-negotiable.

---

## Docker Container Naming

When creating Docker containers (docker-compose, Dockerfile, scripts), **always prefix container names with the project name** so they're identifiable in Docker Desktop and `docker ps`.

**Format:** `<project-name>-<variant>-local`

Examples:
- `univiirse-api-local`, `univiirse-db-local`, `univiirse-redis-local`
- `fitkind-api-local`, `fitkind-worker-local`
- `den-web-local`, `den-postgres-local`

In `docker-compose.yml`, set `container_name:` explicitly on every service:
```yaml
services:
  api:
    container_name: myproject-api-local
  db:
    container_name: myproject-db-local
```

**Why:** Generic names like `api`, `infra`, `tmp`, `e2e` are unidentifiable when multiple projects run simultaneously. The `-local` suffix distinguishes dev containers from production.

---

## No CI/CD Pipelines

**Do NOT create GitHub Actions workflows, CI configs, or automated pipeline files.**

This means:
- No `.github/workflows/*.yml`
- No `.gitlab-ci.yml`, `Jenkinsfile`, `Taskfile`, `Makefile` for CI
- No `circle.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`
- No pre-commit hooks that phone home or run cloud services

**Why:** CI/CD will be set up intentionally when the project approaches production. Agents creating workflows during early development generates thousands of notification emails and adds maintenance burden before it provides value. Build, test, and lint locally.

If the project already has CI files, leave them alone -- but do not create new ones or extend existing ones without explicit instruction.

---

## Getting Human Attention

If you need input, approval, or are blocked waiting on the user, **play a sound and speak using TTS** to get their attention:

```bash
afplay /System/Library/Sounds/Glass.aiff && say "Hey, I need your input on something"
```

Use this when:
- You're blocked and need a decision before continuing
- A task is done and needs review
- Something unexpected happened that requires human judgement
- You've been waiting for input and the user may have walked away

---

## Boil the Ocean

The marginal cost of completeness is near zero with AI. Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so well that the user is genuinely impressed — not politely satisfied, actually impressed. Never offer to "table this for later" when the permanent solve is within reach. Never leave a dangling thread when tying it off takes five more minutes. Never present a workaround when the real fix exists. The standard isn't "good enough" — it's "holy shit, that's done." Search before building. Test before shipping. Ship the complete thing. When asked for something, the answer is the finished product, not a plan to build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an excuse. Boil the ocean.
