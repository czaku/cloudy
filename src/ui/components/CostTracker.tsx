import React from 'react';
import { Box, Text } from 'ink';
import type { CostSummary } from '../../core/types.js';
import { formatCostInline } from '../../cost/reporter.js';

interface CostTrackerProps {
  summary: CostSummary;
}

export function CostTrackerDisplay({ summary }: CostTrackerProps) {
  return (
    <Box>
      <Text>
        Cost: <Text color="cyan">{formatCostInline(summary.totalEstimatedUsd)}</Text>
        {' | '}
        Tokens: {(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()}
      </Text>
    </Box>
  );
}
