import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '../../core/types.js';

function formatEngineBadge(engine?: string): string | null {
  if (!engine) return null;
  switch (engine) {
    case 'claude-code': return 'cc';
    case 'codex': return 'codex';
    case 'pi-mono': return 'pi';
    case 'copilot': return 'gh';
    default: return engine;
  }
}

interface OutputPanelProps {
  task: Task | null;
  lines: string[];
  isActive: boolean;
  engine?: string;
  model?: string;
  maxLines?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
}

export function OutputPanel({
  task,
  lines,
  isActive,
  engine,
  model,
  maxLines = 18,
}: OutputPanelProps) {
  if (!task) {
    return (
      <Box flexDirection="column" paddingLeft={1} flexGrow={1}>
        <Text dimColor>Select a task with ↑/↓</Text>
      </Box>
    );
  }

  const engineBadge = formatEngineBadge(engine);
  const engineColor = 'cyan';

  const statusColor =
    task.status === 'completed' ? 'green' :
    task.status === 'failed' ? 'red' :
    task.status === 'in_progress' ? 'yellow' :
    task.status === 'skipped' ? 'gray' : 'gray';

  const statusIcon =
    task.status === 'completed' ? '●' :
    task.status === 'failed' ? '✗' :
    task.status === 'in_progress' ? '◐' :
    task.status === 'skipped' ? '⊘' : '○';

  // How many lines to reserve for metadata (title + desc + AC + error)
  // Output lines fill the rest
  const acCount = task.acceptanceCriteria.length;
  const hasError = task.status === 'failed' && task.error;
  const hasCriteriaResults = (task.acceptanceCriteriaResults?.length ?? 0) > 0;

  // Lines budget: header(1) + blank(1) + desc(2) + blank(1) + AC(acCount+1) + [error(2)] = varies
  // We show last N output lines to fill remaining space
  const visible = lines.slice(-maxLines);

  return (
    <Box flexDirection="column" paddingLeft={1} flexGrow={1}>

      {/* ── Header: status + task ID + title ── */}
      <Box marginBottom={1}>
        <Box flexShrink={0}>
          <Text color={statusColor} bold>{statusIcon} </Text>
        </Box>
        <Box flexShrink={0}>
          <Text bold color={isActive ? 'yellow' : 'white'}>{task.id}  </Text>
        </Box>
        <Text bold color={isActive ? 'yellow' : 'white'} wrap="truncate">
          {task.title}
        </Text>
      </Box>

      {/* ── Engine / duration badge ── */}
      {(engineBadge || task.durationMs) && (
        <Box marginBottom={1}>
          {engineBadge && (
            <Text color={engineColor} dimColor>[{engineBadge}{model ? `/${model}` : ''}]  </Text>
          )}
          {task.durationMs != null && task.durationMs > 0 && (
            <Text dimColor>{formatDuration(task.durationMs)}</Text>
          )}
        </Box>
      )}

      {/* ── Description ── */}
      <Box marginBottom={1}>
        <Text dimColor wrap="wrap">{task.description}</Text>
      </Box>

      {/* ── Acceptance criteria ── */}
      {task.acceptanceCriteria.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor bold>Criteria:</Text>
          {task.acceptanceCriteria.map((ac, i) => {
            const result = task.acceptanceCriteriaResults?.[i];
            const icon = result ? (result.passed ? '✓' : '✗') : '·';
            const color = result ? (result.passed ? 'green' : 'red') : 'gray';
            return (
              <Box key={i}>
                <Box flexShrink={0}>
                  <Text color={color}>{icon} </Text>
                </Box>
                <Text color={color} wrap="truncate">{ac}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Error message ── */}
      {hasError && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>Error:</Text>
          <Text color="red" wrap="wrap">
            {task.error!.split('\n').slice(0, 6).join('\n')}
          </Text>
        </Box>
      )}

      {/* ── Result summary ── */}
      {task.resultSummary && task.status === 'completed' && (
        <Box marginBottom={1}>
          <Text color="green" dimColor wrap="truncate">✓ {task.resultSummary}</Text>
        </Box>
      )}

      {/* ── Output log ── */}
      {(task.status === 'in_progress' || lines.length > 0) && (
        <Box flexDirection="column" borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor="gray" paddingTop={0} marginTop={0}>
          <Text dimColor bold>Output:</Text>
          {visible.length === 0 ? (
            <Text dimColor>{isActive ? 'Waiting for output...' : 'No output recorded'}</Text>
          ) : (
            visible.map((line, i) => (
              <Text key={i} dimColor wrap="truncate">
                {line.replace(/\n$/, '')}
              </Text>
            ))
          )}
        </Box>
      )}

    </Box>
  );
}
