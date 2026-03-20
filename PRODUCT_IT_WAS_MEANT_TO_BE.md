# Cloudy — Product Archaeology

## What It Was Meant To Be

**Give an agent a goal. Watch it build.**

Cloudy is a multi-task orchestration engine for AI coding agents. You hand it a spec, it decomposes the work into a dependency graph of tasks, executes them with three-phase validation (artifact check, build commands, AI review), and rolls back cleanly on failure. It integrates with Keel for task tracking and supports multiple execution models.

## Core Identity

- Spec-driven decomposition: one spec file becomes a full task graph
- Three-phase validation on every task ensures nothing ships broken
- Git checkpoint + rollback per task — safe to let it run unattended
- Keel integration for automatic task status updates
- Execution model abstraction — run with different backing agents

## The Gap It Fills

Without Cloudy, multi-file features require manual orchestration: break down the work, assign it, verify each piece, handle failures. Cloudy automates the entire loop so a single command can build a complete feature with confidence.

## Status

Active development. Core orchestration loop works. Worktree mode has known issues with monorepo test environments (use `worktrees: false` for projects with root-level test configs).
