# Cloudy Federation

## Overview

Cloudy supports multi-machine federation: see runs from all your machines in one dashboard. Useful for seeing "what's running on the studio right now" from the MacBook.

## How It Works

Each cloudy daemon advertises itself on the local network via mDNS (Bonjour):

- Service type: `_cloudy._tcp.local`
- TXT record: `{ machine: "macbook-pro", port: 7844, version: "0.1.0" }`

Peers auto-discover each other. No IP addresses. No configuration. Same model as keel federation.

## Federation API (read-only HTTP)

Each cloudy daemon exposes a lightweight read-only federation API on a separate port (`:7844`):

```
GET /fed/runs              → most recent run per project
GET /fed/runs/:projectId   → full run state for that project
GET /fed/info              → { machine, version, projectCount }
```

These endpoints are read-only — no remote writes. The owning machine's cloudy is authoritative for its own runs.

## Dashboard: Federated View

The web dashboard aggregates local + peer runs. Projects are grouped by machine:

```
macbook-pro ●
  app-web     run-042   done   14/14 tasks
  keel        run-018   active  7/12 tasks

mac-studio ●
  runecode    run-005   active  3/8 tasks
```

Status indicators: ● online, ○ offline (cached last-known state).

## Identity & Trust

Cloudy federation follows the same identity model as keel:

- Identity is per-person, configured at `~/.keel/identity.json` (shared with keel)
- Same identity → auto-trusted (your own machines)
- Different identity → requires opt-in

## Implementation Plan

This feature is planned for Wave 2 of keel's development. Cloudy federation will be implemented alongside keel federation, sharing the same mDNS and identity infrastructure.

See `~/dev/keel/src/integrations/mdns.ts` for the reference implementation pattern.

## Relation to Keel

Cloudy is the execution layer. Keel is the knowledge layer above it. The federated dashboard in keel will aggregate both:

- **keel data**: project status, tasks, waves (from keel federation API on `:7843`)
- **cloudy data**: active runs, task progress, costs (from cloudy federation API on `:7844`)

This gives a single view of "what's running and what's planned" across all machines.
