# Cloudy Skills & Presets — Design Proposal

## The Problem

Today cloudy is "domain-blind" — it decomposes goals into tasks and executes them, but it has zero opinion about **what good looks like**. If a user says "build me a login screen", cloudy will plan the tasks and run them, but it won't automatically:

- Test that the UI looks right on different screen sizes
- Check that iOS and Android designs are aligned
- Verify elements are well-positioned and don't visually clash
- Apply platform-specific conventions (Material Design, HIG, etc.)
- Ensure accessibility, contrast ratios, touch targets
- Run visual/snapshot testing even when the user didn't ask for it

The user has to spec all of this manually or it simply doesn't happen.

## The Idea: Built-in Skills & Presets

Add a **skills** system — curated bundles of domain knowledge that cloudy injects into planning, execution, and validation automatically. Think of them as "expert opinions" that ride alongside every task.

## Architecture

### 1. Skill Definition (`src/skills/`)

```
src/skills/
├── index.ts              # Registry, loader, resolver
├── types.ts              # Skill, Preset, SkillRule types
├── built-in/
│   ├── react-native.ts   # React Native / mobile skill
│   ├── web-ui.ts         # Web frontend skill
│   ├── api.ts            # Backend/API skill
│   ├── cli.ts            # CLI tool skill
│   └── ios-android.ts    # Cross-platform alignment skill
└── presets/
    ├── mobile-app.ts     # Combines: react-native + ios-android + web-ui
    ├── fullstack.ts      # Combines: web-ui + api
    └── cli-tool.ts       # Combines: cli
```

### 2. Skill Shape

Each skill provides four hooks into cloudy's pipeline:

```typescript
interface Skill {
  id: string;                        // e.g. 'web-ui'
  name: string;                      // e.g. 'Web UI Quality'
  description: string;

  // Auto-detection: does this skill apply to the current project?
  detect: (projectRoot: string) => Promise<boolean>;

  // Injected into the PLANNING prompt — shapes how tasks are decomposed
  planningGuidance: string;

  // Injected into every EXECUTION prompt — tells Claude what "good" looks like
  executionRules: string;

  // Extra acceptance criteria auto-appended to relevant tasks
  defaultAcceptanceCriteria: SkillRule[];

  // Extra validation commands/checks added automatically
  validationExtensions: ValidationExtension[];
}
```

### 3. What Each Built-in Skill Contains

#### `web-ui` — Web Frontend Quality
- **Planning guidance**: "Every UI task must include a responsive design subtask. Group related visual components so cross-component spacing can be validated."
- **Execution rules**:
  - Use semantic HTML, ARIA labels on interactive elements
  - Touch targets ≥ 44px, contrast ratio ≥ 4.5:1
  - No hardcoded pixel widths on containers (use max-width + responsive)
  - Text must not overflow its container at any viewport width
  - Loading/empty/error states for every data-dependent view
- **Default acceptance criteria**:
  - "No element overflows its parent container"
  - "All interactive elements have hover/focus states"
  - "Layout is coherent at 320px, 768px, and 1440px viewports"
- **Validation extensions**:
  - Run axe-core accessibility check if available
  - Run `tsc --noEmit` for type safety

#### `react-native` — Mobile App Quality
- **Planning guidance**: "Ensure every screen task covers both platforms. Add a dedicated cross-platform alignment task after every 3 screen tasks."
- **Execution rules**:
  - Use `Platform.select()` for platform-specific code, not inline `if`
  - SafeAreaView for all top-level screens
  - Avoid hardcoded dimensions — use `Dimensions`, `useWindowDimensions`, or flex
  - Test on both iOS and Android simulators when possible
  - Minimum touch target: 44pt (iOS) / 48dp (Android)
- **Default acceptance criteria**:
  - "Component renders without crashes on both platforms"
  - "No absolute positioning that breaks on different screen sizes"

#### `ios-android` — Cross-Platform Alignment
- **Planning guidance**: "After building screens, add a cross-platform audit task that verifies visual parity."
- **Execution rules**:
  - Navigation patterns: iOS uses bottom tabs + push nav; Android uses drawer + bottom nav
  - Typography: SF Pro on iOS, Roboto on Android — don't hardcode font families
  - Elevation: iOS uses shadow properties; Android uses `elevation` prop
  - Back button behavior: hardware back on Android, swipe-to-go-back on iOS
  - Status bar: light/dark content must match the screen background
- **Validation extensions**:
  - Generate a cross-platform checklist in the AI review prompt

#### `api` — Backend/API Quality
- **Planning guidance**: "Every API endpoint task must include input validation and error response format."
- **Execution rules**:
  - Return consistent error shapes `{ error: string, code: string }`
  - Validate all request bodies — never trust client input
  - Use proper HTTP status codes (don't 200 everything)
  - Include request ID in error responses for debugging
  - Paginate list endpoints by default
- **Default acceptance criteria**:
  - "Invalid input returns 400 with descriptive error message"
  - "Endpoint handles missing/malformed auth gracefully"

#### `cli` — CLI Tool Quality
- **Execution rules**:
  - Exit codes: 0 = success, non-zero = failure
  - `--help` and `--version` must work without side effects
  - Errors to stderr, output to stdout
  - Graceful failure on missing files, bad flags, no TTY
- **(Already partially in CLAUDE.md — this skill formalizes it)**

### 4. Presets — Skill Bundles

Presets combine multiple skills for common project archetypes:

| Preset | Skills Included |
|--------|----------------|
| `mobile-app` | react-native, ios-android, web-ui |
| `fullstack` | web-ui, api |
| `cli-tool` | cli |

Users set a preset in config:
```json
{ "preset": "mobile-app" }
```

Or cloudy **auto-detects** by scanning for signals:
- `react-native` in package.json → activate `react-native` + `ios-android`
- `next.config.*` or `vite.config.*` → activate `web-ui`
- `express`/`fastify`/`hono` in deps → activate `api`
- `bin` field in package.json → activate `cli`

### 5. Integration Points

#### A. Planning (`planner/prompts.ts`)
Append skill planning guidance to `buildPlanningPrompt()`:

```typescript
// After the existing prompt...
if (activeSkills.length > 0) {
  parts.push('\n# Quality Skills (apply automatically)\n');
  for (const skill of activeSkills) {
    parts.push(`## ${skill.name}\n${skill.planningGuidance}\n`);
  }
}
```

This causes the planner to **structure tasks differently** — e.g., adding cross-platform audit tasks, responsive design considerations, etc.

#### B. Execution (`executor/prompt-builder.ts`)
Inject execution rules into every task prompt:

```typescript
// After project conventions, before the task description
if (activeSkills.length > 0) {
  parts.push('# Quality Standards (enforced by active skills)');
  for (const skill of activeSkills) {
    parts.push(`## ${skill.name}`);
    parts.push(skill.executionRules);
  }
  parts.push('');
}
```

#### C. Acceptance Criteria (auto-append)
When building a task's acceptance criteria, merge in skill-provided defaults that match the task type:

```typescript
interface SkillRule {
  appliesTo: (task: Task) => boolean;  // e.g. title contains "screen" or "component"
  criterion: string;
}
```

#### D. Validation (`validator/validator.ts`)
Skills can contribute additional validation steps:

```typescript
interface ValidationExtension {
  name: string;
  appliesTo: (task: Task) => boolean;
  command?: string;          // shell command that must exit 0
  aiReviewAddendum?: string; // extra instructions for the AI reviewer
}
```

### 6. Config & CLI Surface

#### Config (`.cloudy/config.json`)
```json
{
  "preset": "mobile-app",
  "skills": ["web-ui", "api"],
  "skillOverrides": {
    "web-ui": {
      "minContrastRatio": 7.0,
      "viewportBreakpoints": [375, 768, 1024, 1440]
    }
  }
}
```

- `preset` — activate a named preset (can be combined with `skills`)
- `skills` — explicitly activate individual skills
- `skillOverrides` — tune skill parameters
- If neither `preset` nor `skills` is set, cloudy auto-detects

#### CLI
```bash
cloudy config set preset mobile-app     # set preset
cloudy config set skills web-ui,api     # set individual skills
cloudy skills list                       # show available skills + detection status
cloudy skills info web-ui               # show what a skill does
```

### 7. Implementation Plan (ordered tasks)

1. **Skill types & registry** — `src/skills/types.ts` + `src/skills/index.ts` with load/resolve/detect
2. **Built-in skills** — implement the 5 skills listed above in `src/skills/built-in/`
3. **Presets** — implement 3 preset bundles in `src/skills/presets/`
4. **Config integration** — add `preset`, `skills`, `skillOverrides` to `CloudyConfig` + defaults
5. **Planning integration** — modify `buildPlanningPrompt()` to inject skill guidance
6. **Execution integration** — modify `buildExecutionPrompt()` to inject execution rules
7. **Acceptance criteria injection** — merge skill rules into task acceptance criteria during planning
8. **Validation integration** — extend validator to run skill-provided checks
9. **CLI command** — add `cloudy skills` command (list, info)
10. **Auto-detection** — implement `detect()` for each skill (scan package.json, config files)
11. **Tests** — unit tests for skill loading, detection, prompt injection, validation extensions
12. **Documentation** — update README with skills/presets section

### 8. Design Principles

- **Additive, not breaking** — skills add guidance and checks; they never remove or override what the user specified
- **Quiet by default** — auto-detect and apply silently; users don't need to know about skills unless they want to tune them
- **Override-friendly** — every skill rule can be disabled per-project via `skillOverrides`
- **Composable** — skills are independent; presets are just named bundles
- **Cheap to add** — a new skill is a single `.ts` file exporting a `Skill` object; no framework, no plugin system
