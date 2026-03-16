# Vision

cloudy is the execution layer for multi-agent software delivery.

It should not only run tasks. It should preserve truth about what happened:

- what changed
- what checks ran
- what passed or failed
- what proof exists
- what still looks risky
- whether Keel, docs, and acceptance state agree

## Why It Exists

Most agent runners are good at making edits and weak at closing the loop.

cloudy exists to make autonomous execution inspectable and governable:

- plan with explicit acceptance criteria
- execute with bounded task ownership
- validate deterministically and semantically
- write back trustworthy state into Keel
- support multi-agent cron-driven delivery without losing process truth

## Current Focus (2026-03)

- strengthen end-of-run assessment and Keel write-back
- stop equating "command exited 0" with "task is done"
- add proof contracts, acceptance reconciliation, and lane safety
- add a watchdog control loop for cron-triggered Cloudy execution
