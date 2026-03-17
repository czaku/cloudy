import { describe, expect, it } from 'vitest';
import { inferArtifactsFromAcceptanceCriteria, inferTaskType } from '../../src/planner/planner.js';

describe('inferTaskType', () => {
  it('marks screenshot proof work as verify', () => {
    expect(inferTaskType({
      title: 'Verify deterministic Google shell launch states',
      description: 'Capture screenshots and prove parity for root shell states.',
      acceptanceCriteria: ['android-shell-home.png exists under ~/Desktop/screenshots/demo-project/'],
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
      'android-shell-home.png, android-shell-library.png exist under ~/Desktop/screenshots/demo-project/',
    ])).toEqual([
      `${process.env.HOME ?? '~'}/Desktop/screenshots/demo-project/android-shell-home.png`,
      `${process.env.HOME ?? '~'}/Desktop/screenshots/demo-project/android-shell-library.png`,
    ]);
  });
});
