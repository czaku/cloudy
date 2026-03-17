import { describe, expect, it, vi } from 'vitest';

vi.mock('omnai', () => ({
  selectViaDaemon: async () => ({ engine: 'claude-code' }),
  OmnaiClient: class {
    async getEstate() {
      return {
        accounts: {
          'claude-main': {
            provider: 'claude',
            engine: 'claude-code',
            configDir: '/tmp/claude-main',
          },
          'codex-local': {
            provider: 'codex',
            engine: 'codex',
            configDir: '/tmp/codex-local',
          },
        },
      };
    }
  },
  loadEstate: async () => ({
    accounts: {},
  }),
}));

describe('resolveRuntimeAccount', () => {
  it('maps Claude account ids to CLAUDE_CONFIG_DIR', async () => {
    const { resolveRuntimeAccount } = await import('../../executor/claude-runner.js');
    const result = await resolveRuntimeAccount({ account: 'claude-main' });
    expect(result.engine).toBe('claude-code');
    expect(result.provider).toBe('claude');
    expect(result.env).toEqual({ CLAUDE_CONFIG_DIR: '/tmp/claude-main' });
  });

  it('maps Codex account ids to CODEX_HOME', async () => {
    const { resolveRuntimeAccount } = await import('../../executor/claude-runner.js');
    const result = await resolveRuntimeAccount({ account: 'codex-local' });
    expect(result.engine).toBe('codex');
    expect(result.provider).toBe('codex');
    expect(result.env).toEqual({ CODEX_HOME: '/tmp/codex-local' });
  });

  it('prefers explicit configDir overrides', async () => {
    const { resolveRuntimeAccount } = await import('../../executor/claude-runner.js');
    const result = await resolveRuntimeAccount({
      engine: 'claude-code',
      provider: 'claude',
      account: 'claude-main',
      configDir: '/tmp/custom-claude',
    });
    expect(result.env).toEqual({ CLAUDE_CONFIG_DIR: '/tmp/custom-claude' });
  });
});
