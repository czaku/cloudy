import { describe, expect, it } from 'vitest';
import { inferArtifactsFromAcceptanceCriteria, inferTaskType } from '../../src/planner/planner.js';

describe('inferTaskType', () => {
  it('marks screenshot proof work as verify', () => {
    expect(inferTaskType({
      title: 'Verify deterministic Google shell launch states',
      description: 'Capture screenshots and prove parity for root shell states.',
      acceptanceCriteria: ['android-shell-journey.png exists under ~/Desktop/screenshots/fitkind/'],
      outputArtifacts: [],
    })).toBe('verify');
  });

  it('marks keel closeout work as closeout', () => {
    expect(inferTaskType({
      title: 'Record parity notes and close the Keel task',
      description: 'Update Keel and close the task once proof exists.',
      acceptanceCriteria: ['keel/tasks/T-009.json contains a note'],
      outputArtifacts: [],
    })).toBe('closeout');
  });
});

describe('inferArtifactsFromAcceptanceCriteria', () => {
  it('promotes screenshot files under a home-directory proof path', () => {
    expect(inferArtifactsFromAcceptanceCriteria([
      'android-shell-journey.png, android-shell-vault.png exist under ~/Desktop/screenshots/fitkind/',
    ])).toEqual([
      `${process.env.HOME ?? '~'}/Desktop/screenshots/fitkind/android-shell-journey.png`,
      `${process.env.HOME ?? '~'}/Desktop/screenshots/fitkind/android-shell-vault.png`,
    ]);
  });
});
