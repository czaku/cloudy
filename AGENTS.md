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
