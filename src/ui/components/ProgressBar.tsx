import React from 'react';
import { Box, Text } from 'ink';

interface ProgressBarProps {
  completed: number;
  total: number;
  width?: number;
}

export function ProgressBar({ completed, total, width = 30 }: ProgressBarProps) {
  const pct = total > 0 ? completed / total : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = `${Math.round(pct * 100)}%`;

  return (
    <Box>
      <Text color="green">{bar}</Text>
      <Text> {completed}/{total} ({pctStr})</Text>
    </Box>
  );
}
