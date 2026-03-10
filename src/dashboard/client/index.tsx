import React from 'react';
import { createRoot } from 'react-dom/client';
import { DaemonApp } from './DaemonApp';
import { ThemeProvider } from './hooks/useTheme';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root element found');

const root = createRoot(container);
root.render(
  <ThemeProvider>
    <DaemonApp />
  </ThemeProvider>
);
