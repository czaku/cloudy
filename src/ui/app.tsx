import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { CostSummary, Task } from '../core/types.js';
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
}

export function App({
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
}: AppProps) {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const selectedTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const selectedOutput = outputByTask[selectedTaskId ?? ''] ?? [];
  const selectedEngine = selectedTaskId ? engineByTask[selectedTaskId] : undefined;
  const selectedModel = selectedTaskId ? modelByTask[selectedTaskId] : undefined;
  const isSelectedActive = selectedTaskId === activeTaskId;

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
          />
        </Box>

        {/* Right: task detail + output panel */}
        <Box flexGrow={1} flexDirection="column" paddingLeft={1}>
          <OutputPanel
            task={selectedTask}
            lines={selectedOutput}
            isActive={isSelectedActive}
            engine={selectedEngine}
            model={selectedModel}
          />
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
