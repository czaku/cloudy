import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  message: string;
  hints?: string[];
}

export function StatusBar({ message, hints = [] }: StatusBarProps) {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text>{message}</Text>
      {hints.length > 0 && (
        <Text dimColor>{hints.join(' | ')}</Text>
      )}
    </Box>
  );
}
