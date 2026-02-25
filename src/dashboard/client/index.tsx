import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DaemonApp } from './DaemonApp';
import { ThemeProvider } from './hooks/useTheme';
import './styles.css';

type Mode = 'detecting' | 'daemon' | 'project';

function Root() {
  const [mode, setMode] = useState<Mode>('detecting');

  useEffect(() => {
    fetch('/api/projects')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setMode('daemon');
            return;
          }
        }
        setMode('project');
      })
      .catch(() => setMode('project'));
  }, []);

  if (mode === 'detecting') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100vh', background: '#141414', color: '#5a5a5a', fontFamily: "'SF Mono', monospace", fontSize: 13 }}>
        <div style={{ width: 28, height: 28, border: '3px solid #2a2a2a', borderTopColor: '#e8703a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        ☁ connecting to daemon…
      </div>
    );
  }

  if (mode === 'daemon') {
    return (
      <ThemeProvider>
        <DaemonApp />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('No #root element found');

const root = createRoot(container);
root.render(<Root />);
