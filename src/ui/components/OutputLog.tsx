import React from 'react';
import { Box, Text } from 'ink';

interface OutputLogProps {
  lines: string[];
  maxLines?: number;
}

export function OutputLog({ lines, maxLines = 10 }: OutputLogProps) {
  const visible = lines.slice(-maxLines);

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      <Text bold>Output</Text>
      {visible.map((line, i) => (
        <Text key={i} dimColor>
          {line}
        </Text>
      ))}
      {visible.length === 0 && <Text dimColor>Waiting for output...</Text>}
    </Box>
  );
}
