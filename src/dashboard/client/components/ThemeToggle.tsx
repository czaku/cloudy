import React from 'react';
import { useTheme } from '../hooks/useTheme';

const CYCLE: Array<'dark' | 'light' | 'system'> = ['dark', 'light', 'system'];

const ICONS: Record<string, string> = {
  dark: '🌙',
  light: '☀️',
  system: '💻',
};

const LABELS: Record<string, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }

  return (
    <button
      className="theme-toggle"
      onClick={cycle}
      title={`Theme: ${LABELS[theme]} (click to cycle)`}
    >
      {ICONS[theme]}
    </button>
  );
}
