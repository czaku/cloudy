import React from 'react';
import { Box, Text } from 'ink';
import type { Task } from '../../core/types.js';

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
  failed: '✗',
  skipped: '⊘',
  rolled_back: '↺',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'green',
  failed: 'red',
  skipped: 'gray',
  rolled_back: 'magenta',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m${secs}s` : `${mins}m`;
}

interface TaskListProps {
  tasks: Task[];
  activeTaskId?: string;
  selectedTaskId?: string;
  costByTask?: Record<string, number>;
  durationByTask?: Record<string, number>;
  engineByTask?: Record<string, string>;
  /** Max visible rows (for virtual scrolling) */
  maxVisible?: number;
}

export function TaskList({
  tasks,
  activeTaskId,
  selectedTaskId,
  costByTask = {},
  durationByTask = {},
  engineByTask = {},
  maxVisible = 14,
}: TaskListProps) {
  const completed = tasks.filter((t) => t.status === 'completed').length;

  // Virtual scroll: keep selected task visible, centered in window
  const selectedIdx = Math.max(0, tasks.findIndex((t) => t.id === selectedTaskId));
  const half = Math.floor(maxVisible / 2);
  const maxOffset = Math.max(0, tasks.length - maxVisible);
  const offset = Math.min(maxOffset, Math.max(0, selectedIdx - half));
  const visibleTasks = tasks.slice(offset, offset + maxVisible);
  const showScrollUp = offset > 0;
  const showScrollDown = offset + maxVisible < tasks.length;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Tasks </Text>
        <Text dimColor>({completed}/{tasks.length})</Text>
        {showScrollUp && <Text dimColor>  ↑{offset}</Text>}
      </Box>

      {/* Task rows */}
      {visibleTasks.map((task) => {
        const isActive = task.id === activeTaskId;
        const isSelected = task.id === selectedTaskId;
        const icon = STATUS_ICON[task.status] ?? '?';
        const iconColor = STATUS_COLOR[task.status] ?? 'white';
        const cost = costByTask[task.id];
        const duration = durationByTask[task.id];
        const rawEngine = engineByTask[task.id];
        const engineBadge = rawEngine === 'pi-mono' ? 'pi' : rawEngine ? 'cc' : null;
        const engineColor = rawEngine === 'pi-mono' ? 'yellow' : 'cyan';

        // Compact sub-info line (only when task has run)
        const hasInfo = cost !== undefined || duration !== undefined || engineBadge;

        return (
          <Box key={task.id} flexDirection="column" marginBottom={0}>
            {/* Main row: cursor + icon + id only — title lives in the right panel */}
            <Box flexDirection="row">
              <Box flexShrink={0}>
                <Text color={isSelected ? 'white' : 'gray'}>{isSelected ? '▶ ' : '  '}</Text>
              </Box>
              <Box flexShrink={0}>
                <Text color={iconColor}>{icon} </Text>
              </Box>
              <Text
                bold={isActive || isSelected}
                color={isActive ? 'yellow' : isSelected ? 'white' : 'gray'}
              >
                {task.id}
              </Text>
            </Box>

            {/* Sub-info line (duration / cost / engine badge) */}
            {hasInfo && (
              <Box marginLeft={4}>
                {duration !== undefined && (
                  <Text dimColor>{formatDuration(duration)}  </Text>
                )}
                {cost !== undefined && cost > 0 && (
                  <Text dimColor>${cost.toFixed(2)}  </Text>
                )}
                {engineBadge && (
                  <Text color={engineColor}>{engineBadge}</Text>
                )}
              </Box>
            )}

            {/* Error hint */}
            {task.error && task.status === 'failed' && (
              <Box marginLeft={4}>
                <Text color="red" dimColor wrap="truncate">
                  {task.error.split('\n')[0]}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Scroll indicator bottom */}
      {showScrollDown && (
        <Text dimColor>  ↓{tasks.length - offset - maxVisible} more</Text>
      )}
    </Box>
  );
}
