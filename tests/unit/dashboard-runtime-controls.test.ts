import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PATH = path.join(__dirname, '../../src/dashboard/client/DaemonApp.tsx');

describe('dashboard runtime controls', () => {
  let source = '';

  beforeAll(async () => {
    source = await fs.readFile(DASHBOARD_PATH, 'utf-8');
  });

  it('exposes all four routing dimensions in runtime fields', () => {
    expect(source).toContain('>Engine<');
    expect(source).toContain('>Provider<');
    expect(source).toContain('>Account<');
    expect(source).toContain('>Model ID<');
  });

  it('uses planning terminology in dashboard shortcuts', () => {
    expect(source).toContain('title="Go to Plan"');
    expect(source).toContain('queued for planning');
    expect(source).toContain("onClick={() => onSwitchTab('plan')}");
    expect(source).toContain('IconChecklist size={13} color="currentColor" /> Plan');
    expect(source).not.toContain('title="Go to Build"');
  });

  it('wraps tab content in an error boundary instead of blanking the whole dashboard', () => {
    expect(source).toContain('class TabErrorBoundary extends React.Component');
    expect(source).toContain('tab crashed');
    expect(source).toContain('<TabErrorBoundary key={`${selectedProject.id}:${activeTab}`}');
    expect(source).toContain('Retry tab');
  });

  it('wires run-tab build route controls to build state setters', () => {
    expect(source).toContain('onEngineChange={setBuildEngine}');
    expect(source).toContain('onProviderChange={setBuildProvider}');
    expect(source).toContain('onModelIdChange={setBuildModelId}');
    expect(source).toContain('onEffortChange={(value) => { setBuildEffort(value); setEffort(value); }}');
    expect(source).toContain('onEngineChange={setTaskReviewEngine}');
    expect(source).toContain('onProviderChange={setTaskReviewProvider}');
    expect(source).toContain('onModelIdChange={setTaskReviewModelId}');
    expect(source).toContain('onEffortChange={setTaskReviewEffort}');
    expect(source).toContain('onEngineChange={setRunReviewEngine}');
    expect(source).toContain('onProviderChange={setRunReviewProvider}');
    expect(source).toContain('onModelIdChange={setRunReviewModelId}');
    expect(source).toContain('onEffortChange={setRunReviewEffort}');
    expect(source).not.toContain('onEngineChange={setExecutionEngine}');
    expect(source).not.toContain('onProviderChange={setExecutionProvider}');
    expect(source).not.toContain('onModelIdChange={setExecutionModelId}');
    expect(source).not.toContain('onEngineChange={setValidationEngine}');
    expect(source).not.toContain('onProviderChange={setValidationProvider}');
    expect(source).not.toContain('onModelIdChange={setValidationModelId}');
    expect(source).not.toContain('onEffortChange={setValidationEffort}');
    expect(source).not.toContain('onEngineChange={setReviewEngine}');
    expect(source).not.toContain('onProviderChange={setReviewProvider}');
    expect(source).not.toContain('onModelIdChange={setReviewModelId}');
    expect(source).not.toContain('onEffortChange={setReviewEffort}');
  });
});
