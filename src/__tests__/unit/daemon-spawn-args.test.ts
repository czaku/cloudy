/**
 * Tests that verify the CLI arguments passed when the daemon spawns child processes.
 *
 * This would have caught the `--agent-output` / `--non-interactive` bug on the
 * scope (init) and pipeline commands, which don't support those flags.
 *
 * Strategy: parse the actual server.ts source to extract the args arrays passed
 * to spawnCloudyProcess. This is a static-analysis test — it validates the shape
 * of the spawn calls without running the server.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, '../../daemon/server.ts');

// Known flags that only exist on specific commands.
// Any of these appearing in a spawn for a command that doesn't support them is a bug.
const RUN_ONLY_FLAGS = ['--agent-output', '--non-interactive', '--dashboard-port', '--dashboard-only'];
const INIT_ONLY_FLAGS = ['--yes', '--no-review', '--spec'];

interface SpawnCall {
  type: 'init' | 'run' | 'chain';
  commandName: string; // first element of args array (e.g. 'scope', 'build', 'chain')
  args: string[];
  sourceLines: string;
}

async function parseSpawnCalls(): Promise<SpawnCall[]> {
  const source = await fs.readFile(SERVER_PATH, 'utf-8');
  const calls: SpawnCall[] = [];

  // Find all spawnCloudyProcess(projectId, ..., 'type', [...args]) calls
  // We use a simple line-range approach: find the call, capture lines until the closing ];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/spawnCloudyProcess\s*\([^,]+,\s*[^,]+,\s*'(init|run|chain)'\s*,\s*\[/);
    if (!match) continue;

    const type = match[1] as 'init' | 'run' | 'chain';

    // Collect lines until we find the closing ], of the args array
    let collected = '';
    let depth = 0;
    let inArgsArray = false;
    for (let j = i; j < Math.min(i + 20, lines.length); j++) {
      const l = lines[j];
      collected += l + '\n';
      for (const ch of l) {
        if (ch === '[') { depth++; inArgsArray = true; }
        if (ch === ']') { depth--; }
      }
      if (inArgsArray && depth === 0) break;
    }

    // Extract quoted string tokens from the args array
    const argsSection = collected.match(/\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]/s)?.[1] ?? '';
    const argTokens = [...argsSection.matchAll(/'([^']+)'/g)].map((m) => m[1]);

    if (argTokens.length > 0) {
      calls.push({
        type,
        commandName: argTokens[0],
        args: argTokens,
        sourceLines: collected.trim(),
      });
    }
  }

  return calls;
}

async function readServerSource(): Promise<string> {
  return fs.readFile(SERVER_PATH, 'utf-8');
}

describe('daemon spawnCloudyProcess — command/flag compatibility', () => {
  let spawnCalls: SpawnCall[];

  beforeAll(async () => {
    spawnCalls = await parseSpawnCalls();
  });

  it('found at least one spawn call for each type (init, run, chain)', () => {
    const types = new Set(spawnCalls.map((c) => c.type));
    expect(types).toContain('init');
    expect(types).toContain('run');
    expect(types).toContain('chain');
  });

  it('init spawns use "plan" as the command name', () => {
    const initCalls = spawnCalls.filter((c) => c.type === 'init');
    expect(initCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of initCalls) {
      expect(call.commandName).toBe('plan');
    }
  });

  it('run spawns use "run" or "build" as the command name', () => {
    const runCalls = spawnCalls.filter((c) => c.type === 'run');
    expect(runCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of runCalls) {
      expect(['run', 'build']).toContain(call.commandName);
    }
  });

  it('chain spawns use "chain" as the command name', () => {
    const chainCalls = spawnCalls.filter((c) => c.type === 'chain');
    expect(chainCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of chainCalls) {
      expect(call.commandName).toBe('chain');
    }
  });

  it('init spawns do NOT include --agent-output (scope command does not support it)', () => {
    const initCalls = spawnCalls.filter((c) => c.type === 'init');
    for (const call of initCalls) {
      expect(call.args).not.toContain('--agent-output');
    }
  });

  it('init spawns do NOT include --non-interactive (scope command does not support it)', () => {
    const initCalls = spawnCalls.filter((c) => c.type === 'init');
    for (const call of initCalls) {
      expect(call.args).not.toContain('--non-interactive');
    }
  });

  it('chain spawns do NOT include --agent-output (chain command does not support it)', () => {
    const chainCalls = spawnCalls.filter((c) => c.type === 'chain');
    for (const call of chainCalls) {
      expect(call.args).not.toContain('--agent-output');
    }
  });

  it('chain spawns do NOT include --non-interactive (chain command does not support it)', () => {
    const chainCalls = spawnCalls.filter((c) => c.type === 'chain');
    for (const call of chainCalls) {
      expect(call.args).not.toContain('--non-interactive');
    }
  });

  it('run spawns include --agent-output for structured output', () => {
    const runCalls = spawnCalls.filter((c) => c.type === 'run');
    // At least one run spawn should include --agent-output
    const withAgentOutput = runCalls.filter((c) => c.args.includes('--agent-output'));
    expect(withAgentOutput.length).toBeGreaterThanOrEqual(1);
  });
});

describe('daemon spawnCloudyProcess — init spawn flags', () => {
  let spawnCalls: SpawnCall[];

  beforeAll(async () => {
    spawnCalls = await parseSpawnCalls();
  });

  it('init spawn does not include --no-review (daemon spawns without TTY, Q&A auto-answered by AI)', () => {
    const initCalls = spawnCalls.filter((c) => c.type === 'init');
    for (const call of initCalls) {
      expect(call.args).not.toContain('--no-review');
    }
  });

  it('init spawn does not include --yes (daemon spawns without TTY, confirmation auto-accepted)', () => {
    const initCalls = spawnCalls.filter((c) => c.type === 'init');
    for (const call of initCalls) {
      expect(call.args).not.toContain('--yes');
    }
  });
});

describe('daemon server runtime flag forwarding', () => {
  let source: string;

  beforeAll(async () => {
    source = await readServerSource();
  });

  it('forwards planning runtime flags for daemon planning requests', () => {
    expect(source).toContain('--planning-engine');
    expect(source).toContain('--planning-provider');
    expect(source).toContain('--planning-model-id');
  });

  it('forwards execution runtime flags for daemon run and retry requests', () => {
    expect(source).toContain('--engine');
    expect(source).toContain('--provider');
    expect(source).toContain('--execution-model-id');
  });

  it('forwards validation and review runtime flags for run and chain requests', () => {
    expect(source).toContain('--validation-engine');
    expect(source).toContain('--validation-provider');
    expect(source).toContain('--validation-model-id');
    expect(source).toContain('--review-engine');
    expect(source).toContain('--review-provider');
    expect(source).toContain('--review-model-id');
  });
});
