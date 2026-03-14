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

  it('includes planning runtime fields in the plan request payload', () => {
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planningEngine', planningEngine)");
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planningProvider', planningProvider)");
    expect(source).toContain("addOptionalRuntimeField(runtimePayload, 'planningModelId', planningModelId)");
  });

  it('includes execution, validation, and review runtime fields in run payloads', () => {
    expect(source).toContain("addOptionalRuntimeField(payload, 'engine', executionEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'provider', executionProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'executionModelId', executionModelId)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'validationEngine', validationEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'validationProvider', validationProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'validationModelId', validationModelId)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'reviewEngine', reviewEngine)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'reviewProvider', reviewProvider)");
    expect(source).toContain("addOptionalRuntimeField(payload, 'reviewModelId', reviewModelId)");
  });

  it('renders runtime controls in both planning and run flows', () => {
    expect(source).toContain('Planning runtime');
    expect(source).toContain('Execution route');
    expect(source).toContain('Validation route');
    expect(source).toContain('Review route');
  });

  it('surfaces daemon request failures in planning and run flows', () => {
    expect(source).toContain('Network error while starting planning.');
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
});
