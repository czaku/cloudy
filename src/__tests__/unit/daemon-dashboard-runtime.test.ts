import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PATH = path.join(__dirname, '../../dashboard/client/DaemonApp.tsx');

describe('daemon dashboard runtime routing controls', () => {
  let source = '';

  beforeAll(async () => {
    source = await fs.readFile(DASHBOARD_PATH, 'utf-8');
  });

  it('includes plan runtime fields in the plan request payload', () => {
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planEngine', planEngine)");
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planProvider', planProvider)");
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planModelId', planModelId)");
  });

  it('includes build, task-review, and run-review runtime fields in run payloads', () => {
    expect(source).toContain("addOptionalRuntimeField(payload, 'buildEngine', buildEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'buildProvider', buildProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'buildModelId', buildModelId)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'taskReviewEngine', taskReviewEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'taskReviewProvider', taskReviewProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'taskReviewModelId', taskReviewModelId)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'runReviewEngine', runReviewEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'runReviewProvider', runReviewProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'runReviewModelId', runReviewModelId)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'keelSlug', keelSlug)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'keelTask', keelTask)");
  });

  it('renders runtime controls in both plan and run flows', () => {
    expect(source).toContain('Plan route');
    expect(source).toContain('Build route');
    expect(source).toContain('Task-review route');
    expect(source).toContain('Run-review route');
  });

  it('surfaces daemon request failures in plan and run flows', () => {
    expect(source).toContain('Network error while starting plan.');
    expect(source).toContain('Network error while starting the run.');
    expect(source).toContain('getApiErrorMessage(response)');
  });

  it('includes runtime guidance and presets for common routes', () => {
    expect(source).toContain('Use defaults');
    expect(source).toContain('Leave these blank to use the project defaults.');
    expect(source).toContain('Claude Code');
    expect(source).toContain('Codex CLI');
    expect(source).toContain('OpenAI API');
  });

  it('renders keel routing fields in the run flows', () => {
    expect(source).toContain('Keel slug');
    expect(source).toContain('Keel task');
  });
});
