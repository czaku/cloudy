import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { CostSummary, ReviewResult, Task } from '../core/types.js';
import type { ClaudeModel } from '../core/types.js';
import { TaskList } from './components/TaskList.js';
import { OutputPanel } from './components/OutputPanel.js';
import { ProgressBar } from './components/ProgressBar.js';
import { CostTrackerDisplay } from './components/CostTracker.js';
import { StatusBar } from './components/StatusBar.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';

interface PendingApproval {
  taskId: string;
  title: string;
  stage: 'pre_task' | 'failure_escalation';
  context?: string;
  timeoutSec: number;
  startedAt: number;
}

interface AppProps {
  planGoal?: string;
  tasks: Task[];
  activeTaskId: string | null;
  selectedTaskId: string | null;
  outputByTask: Record<string, string[]>;
  costByTask: Record<string, number>;
  durationByTask: Record<string, number>;
  engineByTask: Record<string, string>;
  modelByTask: Record<string, string>;
  costSummary: CostSummary;
  status: 'idle' | 'running' | 'completed' | 'failed';
  paused: boolean;
  error: string | null;
  pendingApproval: PendingApproval | null;
  reviewStatus?: 'idle' | 'model_select' | 'running' | 'completed' | 'failed';
  reviewResult?: ReviewResult | null;
  reviewOutput?: string[];
  reviewError?: string | null;
  reviewModel?: string | null;
  onReviewModelSelect?: (model: ClaudeModel | 'skip') => void;
}

export function App({
  planGoal,
  tasks,
  activeTaskId,
  selectedTaskId,
  outputByTask,
  costByTask,
  durationByTask,
  engineByTask,
  modelByTask,
  costSummary,
  status,
  paused,
  error,
  pendingApproval,
  reviewStatus = 'idle',
  reviewResult = null,
  reviewOutput = [],
  reviewError = null,
  reviewModel = null,
  onReviewModelSelect,
}: AppProps) {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const selectedOutput = outputByTask[selectedTaskId ?? ''] ?? [];
  const selectedEngine = selectedTaskId ? engineByTask[selectedTaskId] : undefined;
  const selectedModel = selectedTaskId ? modelByTask[selectedTaskId] : undefined;
  const isSelectedActive = selectedTaskId === activeTaskId;

  // Determine if we should show review content in the output panel
  const showingReview = reviewStatus === 'model_select' || reviewStatus === 'running' || reviewStatus === 'completed' || reviewStatus === 'failed';

  // Elapsed seconds for the approval countdown
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!pendingApproval) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - pendingApproval.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingApproval]);

  const statusMsg = paused
    ? '[paused]'
    : reviewStatus === 'model_select'
      ? 'Select review model: [h] Haiku  [s] Sonnet  [o] Opus  [x] Skip'
      : reviewStatus === 'running'
        ? `Reviewing with ${reviewModel ?? 'AI'}...`
        : reviewStatus === 'completed' && reviewResult
          ? `Review: ${reviewResult.verdict}`
          : reviewStatus === 'failed'
            ? `Review failed: ${reviewError ?? 'unknown'}`
            : status === 'running'
              ? `Running ${activeTaskId}...`
              : status === 'completed'
                ? 'All tasks completed!'
                : status === 'failed'
                  ? `Failed: ${error}`
                  : 'Ready';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">☁️  cloudy</Text>
        {planGoal && <Text bold>  {planGoal}</Text>}
        <Text dimColor>  ·  {tasks.length} tasks</Text>
        {paused && <Text color="yellow" bold>  [paused]</Text>}
      </Box>

      {/* Two-panel body */}
      <Box flexDirection="row" flexGrow={1} marginBottom={1}>
        {/* Left: task list — 22 chars wide, right divider */}
        <Box
          width={22}
          flexDirection="column"
          borderStyle="single"
          borderLeft={false}
          borderTop={false}
          borderBottom={false}
          paddingRight={1}
        >
          <TaskList
            tasks={tasks}
            activeTaskId={activeTaskId ?? undefined}
            selectedTaskId={selectedTaskId ?? undefined}
            costByTask={costByTask}
            durationByTask={durationByTask}
            engineByTask={engineByTask}
            maxVisible={18}
            reviewStatus={reviewStatus}
            reviewVerdict={reviewResult?.verdict}
          />
        </Box>

        {/* Right: task detail + output panel */}
        <Box flexGrow={1} flexDirection="column" paddingLeft={1}>
          {showingReview ? (
            <Box flexDirection="column">
              {/* Review model selection prompt */}
              {reviewStatus === 'model_select' && (
                <Box marginBottom={1}>
                  <Text bold color="cyan">Holistic Review</Text>
                  <Text dimColor>  Select model: </Text>
                  <Text color="yellow">[h] Haiku  </Text>
                  <Text color="cyan">[s] Sonnet  </Text>
                  <Text color="magenta">[o] Opus  </Text>
                  <Text dimColor>[x] Skip</Text>
                </Box>
              )}

              {/* Review running: show output */}
              {reviewStatus === 'running' && (
                <Box flexDirection="column">
                  <Box marginBottom={1}>
                    <Text bold color="cyan">Holistic Review</Text>
                    <Text dimColor>  {reviewModel ?? 'AI'} reviewing all changes...</Text>
                  </Box>
                  {reviewOutput.slice(-20).map((line, i) => (
                    <Text key={i} dimColor wrap="truncate">{line}</Text>
                  ))}
                </Box>
              )}

              {/* Review completed */}
              {reviewStatus === 'completed' && reviewResult && (
                <Box flexDirection="column">
                  <Box marginBottom={1}>
                    <Text bold color={reviewResult.verdict === 'PASS' ? 'green' : reviewResult.verdict === 'FAIL' ? 'red' : 'yellow'}>
                      Review: {reviewResult.verdict}
                    </Text>
                    <Text dimColor>  {reviewResult.model}  ~${reviewResult.costUsd.toFixed(4)}</Text>
                  </Box>
                  <Box marginBottom={1}>
                    <Text wrap="wrap">{reviewResult.summary}</Text>
                  </Box>
                  {reviewResult.issues.length > 0 && (
                    <Box flexDirection="column" marginBottom={1}>
                      <Text bold>Issues:</Text>
                      {reviewResult.issues.map((issue, i) => (
                        <Box key={i}>
                          <Text color={issue.severity === 'critical' ? 'red' : issue.severity === 'major' ? 'yellow' : 'gray'}>
                            [{issue.severity}] {issue.description}
                            {issue.location ? ` (${issue.location})` : ''}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                  )}
                  {reviewResult.conventionViolations.length > 0 && (
                    <Box flexDirection="column" marginBottom={1}>
                      <Text bold>Convention Violations:</Text>
                      {reviewResult.conventionViolations.map((v, i) => (
                        <Text key={i} color="yellow">{v}</Text>
                      ))}
                    </Box>
                  )}
                  {reviewResult.suggestions.length > 0 && (
                    <Box flexDirection="column">
                      <Text bold>Suggestions:</Text>
                      {reviewResult.suggestions.map((s, i) => (
                        <Text key={i} dimColor>{s}</Text>
                      ))}
                    </Box>
                  )}
                </Box>
              )}

              {/* Review failed */}
              {reviewStatus === 'failed' && (
                <Box flexDirection="column">
                  <Text bold color="red">Review Failed</Text>
                  <Text color="red" dimColor>{reviewError ?? 'Unknown error'}</Text>
                </Box>
              )}
            </Box>
          ) : (
            <OutputPanel
              task={selectedTask}
              lines={selectedOutput}
              isActive={isSelectedActive}
              engine={selectedEngine}
              model={selectedModel}
            />
          )}
        </Box>
      </Box>

      {/* Approval overlay — shown when orchestrator requests human approval */}
      {pendingApproval && (
        <ApprovalPrompt
          taskId={pendingApproval.taskId}
          title={pendingApproval.title}
          stage={pendingApproval.stage}
          context={pendingApproval.context}
          timeoutSec={pendingApproval.timeoutSec}
          elapsed={elapsed}
        />
      )}

      {/* Progress + cost */}
      <Box marginBottom={1}>
        <ProgressBar completed={completed} total={tasks.length} />
        <Box marginLeft={2}>
          <CostTrackerDisplay summary={costSummary} />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        message={statusMsg}
        hints={['↑↓ select', 'p pause', 's skip', 'q quit']}
      />
    </Box>
  );
}
