# cloudy

## Tech Stack
React, TypeScript, Commander

## Key Commands
- `npm run dev` — start development
- `npm test` — run tests

## Conventions
- [Add your naming conventions here]
- [Add file organization rules here]

## Architecture Notes
- [Add important architectural decisions]
- [Add things Claude must NOT break]

## Do Not
- [Add anti-patterns specific to this project]
- [List generated files that should never be edited manually]

## CLI Rules
- Exit codes matter: 0 = success, non-zero = any failure — always exit with the correct code
- `--help` and `--version` must work without side effects
- Write errors and diagnostics to stderr, program output to stdout
- Graceful failure: missing files, bad flags, no TTY — all need clear error messages
- Test across target platforms — macOS/Linux/Windows path separators differ

## Definition of Done (CLI)
- [ ] `--help` output is accurate and complete
- [ ] All error paths exit non-zero
- [ ] Main commands have tests
- [ ] Committed AND pushed