export interface ApprovalRequest {
  taskId: string;
  title: string;
  description: string;
  stage: 'pre_task' | 'failure_escalation';
  context?: string;
  timeoutSec: number;
  autoAction: 'continue' | 'halt';
}

export type ApprovalAction =
  | { action: 'approved' }
  | { action: 'skipped' }
  | { action: 'halt' }
  | { action: 'retry_with_hint'; hint: string }
  | { action: 'timeout_continue' }
  | { action: 'timeout_halt' };

export type ApprovalHandler = (req: ApprovalRequest) => Promise<ApprovalAction>;

/**
 * Races the approval handler against a timeout and an AbortSignal.
 * Returns the handler's action if it responds in time, otherwise the timeout action.
 */
export async function waitForApproval(
  req: ApprovalRequest,
  handler: ApprovalHandler,
  signal: AbortSignal,
): Promise<ApprovalAction> {
  return new Promise<ApprovalAction>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function settle(result: ApprovalAction): void {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    }

    // Abort signal wins immediately
    if (signal.aborted) {
      settle({ action: 'halt' });
      return;
    }

    const onAbort = (): void => settle({ action: 'halt' });
    signal.addEventListener('abort', onAbort, { once: true });

    // Timeout
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      settle(
        req.autoAction === 'halt'
          ? { action: 'timeout_halt' }
          : { action: 'timeout_continue' },
      );
    }, req.timeoutSec * 1000);

    // Handler
    handler(req).then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        settle(result);
      },
      () => {
        signal.removeEventListener('abort', onAbort);
        settle(req.autoAction === 'halt' ? { action: 'timeout_halt' } : { action: 'timeout_continue' });
      },
    );
  });
}
