import { describe, it, expect } from 'vitest';
import { buildValidationPrompt, type PriorArtifact } from '../../src/planner/prompts.js';

const CRITERIA = [
  'send_message creates message in target agent inbox',
  'All required output files confirmed present on disk',
];

const DIFF = `diff --git a/api/routes.py b/api/routes.py
--- a/api/routes.py
+++ b/api/routes.py
@@ -100,3 +100,10 @@
+@router.post("/messages")
+async def create_message(body: dict):
+    return await msg_store.send_message(...)`;

describe('buildValidationPrompt — baseline', () => {
  it('includes the task title', () => {
    const prompt = buildValidationPrompt('My Task', CRITERIA, DIFF);
    expect(prompt).toContain('My Task');
  });

  it('includes each acceptance criterion', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    for (const c of CRITERIA) {
      expect(prompt).toContain(c);
    }
  });

  it('includes the git diff', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).toContain('@router.post("/messages")');
  });

  it('asks for JSON response', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).toContain('"passed"');
    expect(prompt).toContain('"criteriaResults"');
  });
});

describe('buildValidationPrompt — changed file sections (Issue 2 fix)', () => {
  it('includes file section when changedFileSections provided', () => {
    const sections = [
      { path: 'api/orchestrator.py', content: 'await send_message(...)', note: '1 changed section' },
    ];
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, sections);
    expect(prompt).toContain('api/orchestrator.py');
    expect(prompt).toContain('await send_message(...)');
  });

  it('includes the note annotation on changed file sections', () => {
    const sections = [
      { path: 'api/orchestrator.py', content: 'code here', note: '2 changed sections, ~80 lines changed' },
    ];
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, sections);
    expect(prompt).toContain('2 changed sections, ~80 lines changed');
  });

  it('omits file section when not provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).not.toContain('Changed Files');
  });

  it('omits file section when empty array', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, []);
    expect(prompt).not.toContain('Changed Files');
  });
});

describe('buildValidationPrompt — prior artifacts (Issue 1 & 3 fix)', () => {
  const priorArtifacts: PriorArtifact[] = [
    { file: 'api/messages.py', taskId: 'task-7', taskTitle: 'Agent message store' },
    { file: 'api/models.py', taskId: 'task-2', taskTitle: 'Pydantic models' },
  ];

  it('includes pre-existing files section when prior artifacts provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, priorArtifacts);
    expect(prompt).toContain('Pre-existing Files');
    expect(prompt).toContain('api/messages.py');
    expect(prompt).toContain('api/models.py');
  });

  it('attributes each prior artifact to its source task', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, priorArtifacts);
    expect(prompt).toContain('task-7');
    expect(prompt).toContain('Agent message store');
  });

  it('tells the reviewer not to expect prior files in the diff', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, priorArtifacts);
    expect(prompt).toMatch(/not.*expect.*diff|NOT.*diff|do not expect/i);
  });

  it('includes IMPORTANT instruction about prior files when prior artifacts present', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, priorArtifacts);
    // Should contain some form of the key instruction
    expect(prompt).toContain('earlier task');
  });

  it('omits prior files section when not provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).not.toContain('Pre-existing Files');
  });

  it('omits prior files section when empty array', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, []);
    expect(prompt).not.toContain('Pre-existing Files');
  });
});

describe('buildValidationPrompt — artifact check result (Issue 4 fix)', () => {
  it('shows checkmark when artifact check passed', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, undefined, true);
    expect(prompt).toContain('✓');
    expect(prompt).toContain('confirmed present on disk');
  });

  it('shows cross when artifact check failed', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, undefined, false);
    expect(prompt).toContain('✗');
    expect(prompt).toContain('missing');
  });

  it('omits artifact check section when not provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).not.toContain('Artifact Check Result');
  });

  it('instructs reviewer not to re-fail on disk-confirmed files', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, undefined, true);
    expect(prompt).toMatch(/do not fail.*missing|not.*fail.*exist/i);
  });
});

describe('buildValidationPrompt — task output artifacts (Issue 3 fix)', () => {
  const taskArtifacts = ['web/src/components/AgentInbox.tsx', 'web/src/components/InboxBadge.tsx'];

  it('includes responsibilities section when task artifacts provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF, undefined, undefined, undefined, taskArtifacts);
    expect(prompt).toContain("This Task's Output Files");
    expect(prompt).toContain('web/src/components/AgentInbox.tsx');
    expect(prompt).toContain('web/src/components/InboxBadge.tsx');
  });

  it('omits responsibilities section when not provided', () => {
    const prompt = buildValidationPrompt('Task', CRITERIA, DIFF);
    expect(prompt).not.toContain("This Task's Output Files");
  });
});

describe('buildValidationPrompt — combined (all 4 fixes together)', () => {
  it('includes all sections when all parameters provided', () => {
    const sections = [{ path: 'api/orchestrator.py', content: 'new code', note: '1 section' }];
    const priorArtifacts: PriorArtifact[] = [
      { file: 'api/messages.py', taskId: 'task-7', taskTitle: 'Message store' },
    ];
    const taskArtifacts = ['web/src/components/AgentInbox.tsx'];

    const prompt = buildValidationPrompt(
      'TASK-1806: Agent inbox UI',
      CRITERIA,
      DIFF,
      sections,
      priorArtifacts,
      true,
      taskArtifacts,
    );

    expect(prompt).toContain('TASK-1806');
    expect(prompt).toContain('api/orchestrator.py');   // changed file section
    expect(prompt).toContain('api/messages.py');        // prior artifact
    expect(prompt).toContain('✓');                      // artifact check passed
    expect(prompt).toContain('AgentInbox.tsx');         // task responsibility
  });

  it('validates the scenario that caused task-1 false negative in Phase 18', () => {
    // Task-1 (TASK-1802): reviewed by AI which said api/messages.py was missing.
    // api/messages.py was created by task-7 (TASK-1801), NOT in this diff.
    const priorArtifacts: PriorArtifact[] = [
      { file: 'api/messages.py', taskId: 'task-7', taskTitle: 'Agent message store' },
    ];

    const prompt = buildValidationPrompt(
      'TASK-1802: Message REST API endpoints',
      ['send_message creates message in target agent inbox file'],
      DIFF,
      undefined,
      priorArtifacts,
      true,
      ['web/src/app/api/v1/messages/route.ts'],
    );

    // The reviewer must be told api/messages.py pre-exists
    expect(prompt).toContain('api/messages.py');
    expect(prompt).toContain('task-7');
    // And that it should not expect it in the diff
    expect(prompt).toMatch(/NOT.*diff|not.*expect.*diff/i);
  });
});
