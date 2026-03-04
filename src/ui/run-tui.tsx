import React, { useEffect, useRef } from 'react';
import { render } from 'ink';
import type { CloudyConfig, ProjectState, OrchestratorEvent } from '../core/types.js';
import type { ApprovalAction, ApprovalRequest } from '../core/approval.js';
import { Orchestrator } from '../core/orchestrator.js';
import { useOrchestrator } from './hooks/useOrchestrator.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { App } from './app.js';

interface TuiRunnerProps {
  cwd: string;
  state: ProjectState;
  config: CloudyConfig;
  externalHandler?: (event: OrchestratorEvent) => void;
}

function TuiRunner({ cwd, state, config, externalHandler }: TuiRunnerProps) {
  const { state: uiState, handleEvent, selectTask, togglePause } = useOrchestrator(
    state.plan!.tasks,
  );
  const orchestratorRef = useRef<Orchestrator | null>(null);
  // Holds the resolver for the current pending approval promise
  const approvalResolveRef = useRef<((action: ApprovalAction) => void) | null>(null);
  useKeyboard({
    onQuit: () => process.exit(0),
    onAbort: () => {
      orchestratorRef.current?.abort();
    },
    onSelectUp: () => selectTask('up'),
    onSelectDown: () => selectTask('down'),
    onPause: togglePause,
    onSkip: () => {
      if (approvalResolveRef.current) {
        const resolve = approvalResolveRef.current;
        approvalResolveRef.current = null;
        resolve({ action: 'skipped' });
      } else {
        orchestratorRef.current?.abort();
      }
    },
    onApprove: () => {
      if (approvalResolveRef.current) {
        const resolve = approvalResolveRef.current;
        approvalResolveRef.current = null;
        resolve({ action: 'approved' });
      }
    },
    onDeny: () => {
      if (approvalResolveRef.current) {
        const resolve = approvalResolveRef.current;
        approvalResolveRef.current = null;
        resolve({ action: 'halt' });
      }
    },
  });


  useEffect(() => {
    const orchestrator = new Orchestrator({
      cwd,
      state,
      config,
      onEvent: (event) => {
        handleEvent(event);
        externalHandler?.(event);
      },
      onApprovalRequest: config.approval?.mode !== 'never'
        ? (req: ApprovalRequest): Promise<ApprovalAction> => {
            // Emit approval_requested event so the UI shows the prompt
            handleEvent({
              type: 'approval_requested',
              taskId: req.taskId,
              title: req.title,
              stage: req.stage,
              context: req.context,
              timeoutSec: req.timeoutSec,
            });
            // Return a promise that resolves when the user presses a/s/n
            return new Promise<ApprovalAction>((resolve) => {
              approvalResolveRef.current = (action) => {
                // Emit approval_resolved to clear the UI prompt
                handleEvent({
                  type: 'approval_resolved',
                  taskId: req.taskId,
                  action: action.action,
                  autoTriggered: false,
                });
                resolve(action);
              };
              // Auto-resolve on timeout
              setTimeout(() => {
                if (approvalResolveRef.current) {
                  const r = approvalResolveRef.current;
                  approvalResolveRef.current = null;
                  handleEvent({
                    type: 'approval_resolved',
                    taskId: req.taskId,
                    action: req.autoAction === 'halt' ? 'timeout_halt' : 'timeout_continue',
                    autoTriggered: true,
                  });
                  r(req.autoAction === 'halt' ? { action: 'timeout_halt' } : { action: 'timeout_continue' });
                }
              }, req.timeoutSec * 1000);
            });
          }
        : undefined,
    });
    orchestratorRef.current = orchestrator;

    orchestrator.run().catch((err) => {
      console.error(`Orchestration failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
  }, []);

  return (
    <App
      tasks={uiState.tasks}
      activeTaskId={uiState.activeTaskId}
      selectedTaskId={uiState.selectedTaskId}
      outputByTask={uiState.outputByTask}
      costByTask={uiState.costByTask}
      durationByTask={uiState.durationByTask}
      engineByTask={uiState.engineByTask}
      modelByTask={uiState.modelByTask}
      costSummary={uiState.costSummary}
      status={uiState.status}
      paused={uiState.paused}
      error={uiState.error}
      pendingApproval={uiState.pendingApproval}
      reviewStatus={uiState.reviewStatus}
      reviewResult={uiState.reviewResult}
      reviewOutput={uiState.reviewOutput}
      reviewError={uiState.reviewError}
      reviewModel={uiState.reviewModel}
      onReviewModelSelect={undefined}
    />
  );
}

export function runWithTui(options: TuiRunnerProps): void {
  render(
    <TuiRunner
      cwd={options.cwd}
      state={options.state}
      config={options.config}
      externalHandler={options.externalHandler}
    />,
  );
}
