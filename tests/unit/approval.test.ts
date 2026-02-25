import { describe, it, expect, vi } from 'vitest';
import { waitForApproval, type ApprovalRequest, type ApprovalAction, type ApprovalHandler } from '../../src/core/approval.js';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    taskId: 'task-3',
    title: 'JWT auth routes',
    description: 'Implement JWT',
    stage: 'pre_task',
    timeoutSec: 5,
    autoAction: 'continue',
    ...overrides,
  };
}

describe('waitForApproval', () => {
  it('returns handler response when handler resolves before timeout', async () => {
    const handler: ApprovalHandler = async () => ({ action: 'approved' });
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest({ timeoutSec: 10 }), handler, controller.signal);
    expect(result.action).toBe('approved');
  });

  it('returns timeout_continue when timeout fires with autoAction=continue', async () => {
    const handler: ApprovalHandler = () => new Promise(() => {}); // never resolves
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest({ timeoutSec: 0.05, autoAction: 'continue' }), handler, controller.signal);
    expect(result.action).toBe('timeout_continue');
  }, 2000);

  it('returns timeout_halt when timeout fires with autoAction=halt', async () => {
    const handler: ApprovalHandler = () => new Promise(() => {}); // never resolves
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest({ timeoutSec: 0.05, autoAction: 'halt' }), handler, controller.signal);
    expect(result.action).toBe('timeout_halt');
  }, 2000);

  it('returns halt immediately when abort signal is already fired', async () => {
    const handler: ApprovalHandler = async () => ({ action: 'approved' });
    const controller = new AbortController();
    controller.abort();
    const result = await waitForApproval(makeRequest(), handler, controller.signal);
    expect(result.action).toBe('halt');
  });

  it('returns halt when abort signal fires during wait', async () => {
    const handler: ApprovalHandler = () => new Promise(() => {}); // never resolves
    const controller = new AbortController();
    const promise = waitForApproval(makeRequest({ timeoutSec: 60 }), handler, controller.signal);
    setTimeout(() => controller.abort(), 30);
    const result = await promise;
    expect(result.action).toBe('halt');
  }, 2000);

  it('passes skipped action through from handler', async () => {
    const handler: ApprovalHandler = async () => ({ action: 'skipped' });
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest(), handler, controller.signal);
    expect(result.action).toBe('skipped');
  });

  it('passes retry_with_hint action through from handler', async () => {
    const handler: ApprovalHandler = async () => ({ action: 'retry_with_hint', hint: 'try a different approach' });
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest(), handler, controller.signal) as { action: 'retry_with_hint'; hint: string };
    expect(result.action).toBe('retry_with_hint');
    expect(result.hint).toBe('try a different approach');
  });

  it('returns timeout action when handler rejects', async () => {
    const handler: ApprovalHandler = async () => { throw new Error('handler failed'); };
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest({ timeoutSec: 10, autoAction: 'continue' }), handler, controller.signal);
    expect(result.action).toBe('timeout_continue');
  });

  it('handler wins if it resolves before timeout', async () => {
    let handlerCalled = false;
    const handler: ApprovalHandler = async () => {
      handlerCalled = true;
      return { action: 'approved' };
    };
    const controller = new AbortController();
    const result = await waitForApproval(makeRequest({ timeoutSec: 60 }), handler, controller.signal);
    expect(result.action).toBe('approved');
    expect(handlerCalled).toBe(true);
  });
});
