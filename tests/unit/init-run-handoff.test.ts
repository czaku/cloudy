import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INIT_PATH = path.join(__dirname, '../../src/cli/commands/init.ts');

describe('init auto-run handoff', () => {
  let source = '';

  beforeAll(async () => {
    source = await fs.readFile(INIT_PATH, 'utf-8');
  });

  it('forwards execution runtime flags when init auto-spawns cloudy run', () => {
    expect(source).toContain("'--build-engine'");
    expect(source).toContain("'--build-provider'");
    expect(source).toContain("'--build-account'");
    expect(source).toContain("'--build-model-id'");
    expect(source).toContain("'--build-effort'");
  });

  it('forwards validation and review account routing when init auto-spawns cloudy run', () => {
    expect(source).toContain("'--task-review-engine'");
    expect(source).toContain("'--task-review-provider'");
    expect(source).toContain("'--task-review-account'");
    expect(source).toContain("'--task-review-model-id'");
    expect(source).toContain("'--task-review-effort'");
    expect(source).toContain("'--run-review-engine'");
    expect(source).toContain("'--run-review-provider'");
    expect(source).toContain("'--run-review-account'");
    expect(source).toContain("'--run-review-model-id'");
    expect(source).toContain("'--run-review-effort'");
  });
});
