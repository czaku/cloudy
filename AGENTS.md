# cloudy

## What This Is
`cloudy` is the orchestration layer that turns a goal into a dependency-ordered task graph, routes work through local or API-backed runtimes via `omnai`, validates results, and serves a dashboard.

## Tech Stack
TypeScript, Commander, React dashboard, Ink, esbuild, Vitest, `omnai`, `@vykeai/fed`

## Key Commands
- `npm run build`
- `npm run dev`
- `npm test`
- `npm run typecheck`
- `cloudy plan --spec ./PRD.md`
- `cloudy run --verbose`

## Conventions
- Keep planning, execution, validation, and review phases distinct in both code and CLI UX.
- Treat `omnai` as the runtime boundary rather than hardcoding one provider or engine path.
- Preserve dashboard and CLI parity for the same run/task state.
- Keep `fed` integration compatible with the broader local tooling suite.

## Architecture Notes
- Cloudy is orchestration infrastructure, not a product-specific workflow runner.
- Nested Claude/Codex invocation rules matter because cloudy is often run from inside other agent sessions.
- Retry, validation, and task graph semantics are product-facing contracts.

## Do Not
- Collapse all runtime paths into a single provider-specific implementation.
- Mix planner state, executor state, and dashboard view state without explicit boundaries.
- Break `cloudy plan` or `cloudy run` flag behavior casually.

## Runtime Rules
- When launching local Claude sessions from within another Claude session, keep the `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` stripping behavior intact.
- Any runtime override flags added to the CLI should be reflected in the dashboard and run-state model.
