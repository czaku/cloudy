import { describe, expect, it, vi } from 'vitest';

vi.mock('omnai', () => ({
  selectViaDaemon: async () => ({ engine: 'claude-code' }),
  OmnaiClient: class {
    async getEstate() {
      return {
        accounts: {
          'claude-pole': {
            provider: 'claude',
            engine: 'claude-code',
            configDir: '/Users/luke/.claude-pole',
          },
          'codex-local': {
            provider: 'codex',
            engine: 'codex',
            configDir: '/Users/luke/.codex-alt',
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
    const result = await resolveRuntimeAccount({ accountId: 'claude-pole' });
    expect(result.engine).toBe('claude-code');
    expect(result.provider).toBe('claude');
    expect(result.env).toEqual({ CLAUDE_CONFIG_DIR: '/Users/luke/.claude-pole' });
  });

  it('maps Codex account ids to CODEX_HOME', async () => {
    const { resolveRuntimeAccount } = await import('../../executor/claude-runner.js');
    const result = await resolveRuntimeAccount({ accountId: 'codex-local' });
    expect(result.engine).toBe('codex');
    expect(result.provider).toBe('codex');
    expect(result.env).toEqual({ CODEX_HOME: '/Users/luke/.codex-alt' });
  });

  it('prefers explicit configDir overrides', async () => {
    const { resolveRuntimeAccount } = await import('../../executor/claude-runner.js');
    const result = await resolveRuntimeAccount({
      engine: 'claude-code',
      provider: 'claude',
      accountId: 'claude-pole',
      configDir: '/tmp/custom-claude',
    });
    expect(result.env).toEqual({ CLAUDE_CONFIG_DIR: '/tmp/custom-claude' });
  });
});
