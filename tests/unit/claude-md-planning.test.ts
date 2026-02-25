import { describe, it, expect } from 'vitest';
import { buildPlanningPrompt } from '../../src/planner/prompts.js';

describe('buildPlanningPrompt with CLAUDE.md context', () => {
  it('includes claudeMd section when provided', () => {
    const prompt = buildPlanningPrompt('Build a blog', undefined, 'Always use TypeScript strict mode.');
    expect(prompt).toContain('# Project Context (CLAUDE.md)');
    expect(prompt).toContain('Always use TypeScript strict mode.');
  });

  it('does not include claudeMd section when not provided', () => {
    const prompt = buildPlanningPrompt('Build a blog');
    expect(prompt).not.toContain('# Project Context (CLAUDE.md)');
  });

  it('includes both spec and claudeMd when both provided', () => {
    const prompt = buildPlanningPrompt('Build a blog', 'Spec: users can post.', 'Use ESM modules.');
    expect(prompt).toContain('# Specification');
    expect(prompt).toContain('Spec: users can post.');
    expect(prompt).toContain('# Project Context (CLAUDE.md)');
    expect(prompt).toContain('Use ESM modules.');
  });

  it('spec appears before claudeMd in prompt', () => {
    const prompt = buildPlanningPrompt('Goal', 'spec content', 'claude md content');
    const specPos = prompt.indexOf('# Specification');
    const claudePos = prompt.indexOf('# Project Context (CLAUDE.md)');
    expect(specPos).toBeGreaterThan(-1);
    expect(claudePos).toBeGreaterThan(-1);
    expect(specPos).toBeLessThan(claudePos);
  });

  it('truncates claudeMd at 4000 chars', () => {
    const longMd = 'x'.repeat(6000);
    const prompt = buildPlanningPrompt('Goal', undefined, longMd);
    const after = prompt.slice(prompt.indexOf('# Project Context (CLAUDE.md)\n') + '# Project Context (CLAUDE.md)\n'.length);
    // Content ends at next section or end of string
    const content = after.split('\n\n')[0];
    expect(content.length).toBeLessThanOrEqual(4000);
  });

  it('empty string claudeMd is falsy — no claudeMd section', () => {
    const prompt = buildPlanningPrompt('Goal', undefined, '');
    expect(prompt).not.toContain('# Project Context (CLAUDE.md)');
  });
});
