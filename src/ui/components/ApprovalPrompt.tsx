import React from 'react';
import { Box, Text } from 'ink';

interface ApprovalPromptProps {
  taskId: string;
  title: string;
  stage: 'pre_task' | 'failure_escalation';
  context?: string;
  timeoutSec: number;
  elapsed?: number;
}

export function ApprovalPrompt({
  taskId,
  title,
  stage,
  context,
  timeoutSec,
  elapsed = 0,
}: ApprovalPromptProps) {
  const remaining = Math.max(0, timeoutSec - elapsed);
  const stageLabel = stage === 'pre_task' ? 'Approval needed' : 'Failure escalation';

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      padding={1}
      marginTop={1}
    >
      <Box marginBottom={1}>
        <Text color="yellow" bold>⏸  {stageLabel}</Text>
        <Text dimColor>  ({remaining}s remaining)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold>{taskId}</Text>
        <Text>  {title}</Text>
      </Box>

      {context && (
        <Box marginBottom={1}>
          <Text dimColor>{context.split('\n')[0].slice(0, 80)}</Text>
        </Box>
      )}

      <Box>
        <Text dimColor>[</Text>
        <Text color="green">a</Text>
        <Text dimColor>]pprove  [</Text>
        <Text color="yellow">s</Text>
        <Text dimColor>]kip  [</Text>
        <Text color="red">n</Text>
        <Text dimColor>]o/halt</Text>
      </Box>
    </Box>
  );
}
