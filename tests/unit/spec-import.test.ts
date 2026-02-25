import { describe, it, expect } from 'vitest';
import { buildPlanningPrompt } from '../../src/planner/prompts.js';

describe('buildPlanningPrompt with specContent', () => {
  it('includes goal without spec', () => {
    const prompt = buildPlanningPrompt('Build a blog');
    expect(prompt).toContain('Build a blog');
    expect(prompt).not.toContain('# Specification');
  });

  it('includes spec section when specContent is provided', () => {
    const prompt = buildPlanningPrompt('Build a blog', 'Users can create posts.\nPosts have titles and bodies.');
    expect(prompt).toContain('# Specification');
    expect(prompt).toContain('Users can create posts.');
    expect(prompt).toContain('Use this spec to derive specific tasks and acceptance criteria.');
  });

  it('includes both goal and spec in correct order', () => {
    const prompt = buildPlanningPrompt('Build auth API', 'Spec: JWT tokens required.');
    const goalPos = prompt.indexOf('Build auth API');
    const specPos = prompt.indexOf('# Specification');
    expect(goalPos).toBeGreaterThan(-1);
    expect(specPos).toBeGreaterThan(-1);
    // Spec comes after goal
    expect(specPos).toBeGreaterThan(goalPos);
  });

  it('truncates spec content at 120000 chars', () => {
    const longSpec = 'x'.repeat(130000);
    const prompt = buildPlanningPrompt('Build something', longSpec);
    // Extract spec content between header and guidance line
    const after = prompt.slice(prompt.indexOf('# Specification\n') + '# Specification\n'.length);
    const specContent = after.slice(0, after.indexOf('\n\nUse this spec'));
    expect(specContent.length).toBe(120000);
  });

  it('spec exactly 120000 chars is not truncated', () => {
    const exactSpec = 'y'.repeat(120000);
    const prompt = buildPlanningPrompt('Goal', exactSpec);
    const after = prompt.slice(prompt.indexOf('# Specification\n') + '# Specification\n'.length);
    const specContent = after.slice(0, after.indexOf('\n\nUse this spec'));
    expect(specContent.length).toBe(120000);
  });

  it('spec shorter than 8000 chars is not truncated', () => {
    const shortSpec = 'hello spec';
    const prompt = buildPlanningPrompt('Goal', shortSpec);
    expect(prompt).toContain('hello spec');
  });

  it('backward compat: no spec = no spec section', () => {
    const prompt = buildPlanningPrompt('Some goal');
    expect(prompt).not.toContain('# Specification');
    expect(prompt).not.toContain('Use this spec');
  });

  it('empty string spec is falsy — no spec section', () => {
    const prompt = buildPlanningPrompt('Goal', '');
    expect(prompt).not.toContain('# Specification');
  });
});
