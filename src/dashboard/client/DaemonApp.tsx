import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from './hooks/useTheme';
import { stripAnsi } from './utils/parseOutput';

// ── Types ──────────────────────────────────────────────────────────────

interface ProjectStatusSnapshot {
  id: string;
  name: string;
  path: string;
  status: 'idle' | 'planning' | 'running' | 'completed' | 'failed';
  lastRunAt: string | null;
  activePlan: boolean;
  taskProgress: { done: number; total: number } | null;
  costUsd: number | null;
  activeProcess: 'init' | 'run' | 'pipeline' | null;
  processes?: Array<{
    id: string;
    type: 'init' | 'run' | 'pipeline';
    specName?: string;
    startedAt: string;
  }>;
}

interface SpecFile {
  path: string;
  relativePath: string;
  title: string;
  headings: string[];
  sizeBytes: number;
}

interface SseEvent {
  type: string;
  [key: string]: unknown;
}

interface SavedPlan {
  id: string;
  name: string;
  goal: string;
  tasks: Array<{ id: string; title: string; status: string }>;
  specPaths: string[];
  status: 'ready' | 'running' | 'completed' | 'failed';
  createdAt: string;
  taskCount: number;
  completedCount: number;
  deliveredAt?: string;
  specSha?: string;
}

type ActiveTab = 'dashboard' | 'chat' | 'plan' | 'run' | 'history' | 'memory';

interface PlanChatMsg {
  id: string;
  kind: 'agent-log' | 'question' | 'answer' | 'summary' | 'error';
  logs?: Array<{ level: string; msg: string }>;
  question?: {
    questionType: string;
    options?: string[];
    text: string;
    index: number;
    total: number;
    timeoutSec: number;
  };
  answered?: string | string[] | boolean;
  answerText?: string;
  plan?: SavedPlan;
  errorText?: string;
}

interface CCSessionStats {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  durationMs: number;
  messageCount: number;
  lastTool: string | null;
  firstTs: string | null;
  lastTs: string | null;
  model: string | null;
}

interface RuntimeRouteConfig {
  engine?: string;
  provider?: string;
  modelId?: string;
}

interface ProjectRuntimeConfig {
  engine?: string;
  provider?: string;
  executionModelId?: string;
  planningRuntime?: RuntimeRouteConfig;
  validationRuntime?: RuntimeRouteConfig;
  reviewRuntime?: RuntimeRouteConfig;
}

// ── Helpers ────────────────────────────────────────────────────────────

function statusColor(status: ProjectStatusSnapshot['status']): string {
  switch (status) {
    case 'planning': return '#a78bfa';
    case 'running': return '#e8703a';
    case 'completed': return '#22c55e';
    case 'failed': return '#ef4444';
    default: return '#4b5563';
  }
}

function statusLabel(snap: ProjectStatusSnapshot): string {
  if (snap.status === 'planning') return '⟳ planning';
  if (snap.activeProcess) return snap.activeProcess;
  return snap.status;
}

function formatCost(usd: number | null): string {
  if (usd === null || usd === 0) return '';
  return `$${usd.toFixed(4)}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? `${response.status} ${response.statusText}`;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function addOptionalRuntimeField(
  payload: Record<string, string>,
  key: string,
  value: string,
): void {
  const normalized = optionalText(value);
  if (normalized) payload[key] = normalized;
}

function routeSummary(route?: RuntimeRouteConfig): string {
  if (!route?.engine && !route?.provider && !route?.modelId) return 'project default';
  const parts = [route.engine, route.provider].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' / ') : 'custom route';
  return route.modelId ? `${base} · ${route.modelId}` : base;
}

function useProjectRuntimeConfig(projectId: string): ProjectRuntimeConfig | null {
  const [config, setConfig] = useState<ProjectRuntimeConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/config`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: ProjectRuntimeConfig | null) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return config;
}

// ── Plumpy icon components ─────────────────────────────────────────────

function IconChat({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M16,2H5C3.343,2,2,3.343,2,5v9c0,1.622,1.29,2.936,2.9,2.99l0.756,2.32c0.234,0.718,1.148,0.927,1.672,0.383L9.916,17H16 c1.657,0,3-1.343,3-3V5C19,3.343,17.657,2,16,2z" opacity=".35"/>
      <path d="M19,4h-0.184C18.928,4.314,19,4.647,19,5v9c0,1.657-1.343,3-3,3H9.916l-1.922,1.999C7.996,18.999,7.998,19,8,19h6.084 l2.589,2.693c0.523,0.544,1.438,0.335,1.672-0.383l0.756-2.32C20.71,18.936,22,17.622,22,16V7C22,5.343,20.657,4,19,4z"/>
    </svg>
  );
}

function IconPipeline({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M21.277,8.424c1.195-1.997-0.239-4.535-2.566-4.541L5.288,3.847C2.956,3.841,1.509,6.382,2.704,8.384l0.928,1.555H20.37 L21.277,8.424z"/>
      <polygon points="20.361,9.939 3.623,9.939 7.204,15.939 16.768,15.939" opacity=".35"/>
      <path d="M7.209,15.939l2.203,3.691c1.163,1.948,3.984,1.95,5.15,0.004l2.212-3.694H7.209z"/>
    </svg>
  );
}

function IconRocket({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M17.677,13.346L16,12.517V7.233c0-1.279-0.508-2.506-1.413-3.41 L13.355,2.59c-0.748-0.748-1.961-0.748-2.709,0L9.413,3.823C8.508,4.728,8,5.954,8,7.233v5.284l-1.677,0.829 c-0.834,0.412-1.43,1.189-1.613,2.101L4.42,16.901C4.203,17.987,5.033,19,6.14,19H17.86c1.107,0,1.938-1.013,1.721-2.099 l-0.291-1.454C19.107,14.535,18.511,13.758,17.677,13.346z" opacity=".35"/>
      <circle cx="12" cy="8" r="2"/>
      <path d="M9,19c0,0.983,0.724,2.206,1.461,3.197c0.771,1.038,2.307,1.038,3.079,0C14.276,21.206,15,19.983,15,19H9z"/>
    </svg>
  );
}

function IconAI({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M12,4.5C12,3.119,10.881,2,9.5,2C8.275,2,7.26,2.883,7.046,4.046C5.33,4.271,4,5.723,4,7.5 c0,0.165,0.026,0.323,0.049,0.482C2.812,8.893,2,10.347,2,12s0.812,3.107,2.049,4.018C4.026,16.177,4,16.335,4,16.5 c0,1.777,1.33,3.229,3.046,3.454C7.26,21.117,8.275,22,9.5,22c1.381,0,2.5-1.119,2.5-2.5C12,19.352,12,4.654,12,4.5z" opacity=".35"/>
      <path d="M12,4.5C12,3.119,13.119,2,14.5,2c1.225,0,2.24,0.883,2.454,2.046C18.67,4.271,20,5.723,20,7.5 c0,0.165-0.026,0.323-0.049,0.482C21.188,8.893,22,10.347,22,12s-0.812,3.107-2.049,4.018C19.974,16.177,20,16.335,20,16.5 c0,1.777-1.33,3.229-3.046,3.454C16.74,21.117,15.725,22,14.5,22c-1.381,0-2.5-1.119-2.5-2.5C12,19.352,12,4.654,12,4.5z" opacity=".35"/>
      <path d="M10,8c0-1.105-0.895-2-2-2S6,6.895,6,8c0,0.738,0.405,1.376,1,1.723V10H2.43C2.15,10.61,2,11.29,2,12h6c0.55,0,1-0.45,1-1 V9.723C9.595,9.376,10,8.738,10,8z"/>
      <path d="M17,14.277c0.595,0.346,1,0.984,1,1.723c0,1.105-0.895,2-2,2s-2-0.895-2-2c0-0.738,0.405-1.376,1-1.723V13 c0-0.55,0.45-1,1-1h6c0-1.132-0.387-2.165-1.024-3h-3.253c-0.346,0.595-0.984,1-1.723,1c-1.105,0-2-0.895-2-2c0-1.105,0.895-2,2-2 c0.738,0,1.376,0.405,1.723,1h2.231c-0.223-1.542-1.448-2.751-2.999-2.954C16.74,2.883,15.725,2,14.5,2C13.119,2,12,3.119,12,4.5 c0,0.076,0,14.741,0,15c0,1.381,1.119,2.5,2.5,2.5c1.225,0,2.24-0.883,2.454-2.046C18.67,19.729,20,18.277,20,16.5 c0-0.165-0.026-0.323-0.049-0.482c0.702-0.517,1.26-1.213,1.617-2.018H17V14.277z"/>
      <path d="M8,14c-0.738,0-1.376,0.405-1.723,1H3.03c0.28,0.39,0.63,0.73,1.02,1.02C4.03,16.18,4,16.33,4,16.5 c0,0.17,0.01,0.34,0.04,0.5h2.237C6.624,17.595,7.262,18,8,18c1.105,0,2-0.895,2-2C10,14.895,9.105,14,8,14z"/>
    </svg>
  );
}

function IconLock({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M18,21H6c-1.657,0-3-1.343-3-3v-8c0-1.657,1.343-3,3-3h12c1.657,0,3,1.343,3,3v8 C21,19.657,19.657,21,18,21z" opacity=".35"/>
      <path d="M8,7c0-2.209,1.791-4,4-4s4,1.791,4,4h2c0-3.314-2.686-6-6-6S6,3.686,6,7H8z"/>
      <path d="M12,12c-1.105,0-2,0.895-2,2s0.895,2,2,2s2-0.895,2-2S13.105,12,12,12z"/>
    </svg>
  );
}

function IconCloud({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M19.483,8.192C18.345,5.161,15.429,3,12,3 c-4.112,0-7.496,3.104-7.945,7.095C1.746,10.538,0,12.562,0,15c0,2.761,2.239,5,5,5h13c3.314,0,6-2.686,6-6 C24,11.199,22.078,8.854,19.483,8.192z" opacity=".35"/>
    </svg>
  );
}

function IconChecklist({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M19.5,4c-0.386,0-6.614,0-7,0C11.672,4,11,4.672,11,5.5S11.672,7,12.5,7c0.386,0,6.614,0,7,0C20.328,7,21,6.328,21,5.5 S20.328,4,19.5,4z"/>
      <path d="M19.5,11c-0.386,0-6.614,0-7,0c-0.828,0-1.5,0.672-1.5,1.5s0.672,1.5,1.5,1.5c0.386,0,6.614,0,7,0 c0.828,0,1.5-0.672,1.5-1.5S20.328,11,19.5,11z"/>
      <path d="M19.5,18c-0.386,0-6.614,0-7,0c-0.828,0-1.5,0.672-1.5,1.5s0.672,1.5,1.5,1.5c0.386,0,6.614,0,7,0 c0.828,0,1.5-0.672,1.5-1.5S20.328,18,19.5,18z" opacity=".35"/>
      <path d="M6,15H5c-1.105,0-2-0.895-2-2v-1c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1C8,14.105,7.105,15,6,15z"/>
      <path d="M6,8H5C3.895,8,3,7.105,3,6V5c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1C8,7.105,7.105,8,6,8z"/>
      <path d="M6,22H5c-1.105,0-2-0.895-2-2v-1c0-1.105,0.895-2,2-2h1c1.105,0,2,0.895,2,2v1 C8,21.105,7.105,22,6,22z" opacity=".35"/>
    </svg>
  );
}

function IconLightning({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color}>
      <path d="M18.673,13.092l0.051-0.081l-0.003-0.007C18.894,12.708,19,12.368,19,12c0-0.974-0.697-1.783-1.619-1.962L14,9V4 c0-1.105-0.895-2-2-2c-0.712,0-1.333,0.375-1.688,0.936l-0.005-0.001l-4.944,7.921C5.136,11.18,5,11.573,5,12 c0,0.91,0.611,1.669,1.442,1.911l0.002,0.006L10,15v5c0,1.105,0.895,2,2,2c0.773,0,1.436-0.444,1.769-1.086l4.88-7.785 C18.658,13.117,18.665,13.104,18.673,13.092z" opacity=".35"/>
    </svg>
  );
}

function IconTrafficLight({ status }: { status: 'idle' | 'running' | 'error' | 'completed' }) {
  // status → which light is active
  // idle/completed → green (bottom, cy=18)
  // running → amber (middle, cy=12)
  // error → red (top, cy=6)
  const activeLight = status === 'running' ? 'amber' : status === 'error' ? 'red' : 'green';

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={40} height={40}>
      {/* Housing */}
      <path d="M20,5.344V5c0-0.552-0.448-1-1-1h-0.184C18.403,2.837,17.304,2,16,2H8C6.696,2,5.597,2.837,5.184,4H5C4.448,4,4,4.448,4,5 v0.344c0,0.837,0.395,1.575,1,2.061V10c-0.552,0-1,0.448-1,1v0.344c0,0.837,0.395,1.575,1,2.061V16c-0.552,0-1,0.448-1,1v0.344 c0,0.858,0.414,1.613,1.045,2.098C5.26,20.888,6.495,22,8,22h8c1.505,0,2.74-1.112,2.955-2.558C19.586,18.956,20,18.202,20,17.344 V17c0-0.552-0.448-1-1-1v-2.595c0.605-0.487,1-1.224,1-2.061V11c0-0.552-0.448-1-1-1V7.405C19.605,6.918,20,6.181,20,5.344z" fill="#333" opacity="0.6"/>
      {/* Red light (top) */}
      <circle cx="12" cy="6" r="2.2"
        fill={activeLight === 'red' ? '#ef4444' : '#1a1a1a'}
        className={activeLight === 'red' ? 'traffic-light-active' : ''}
      />
      {/* Amber light (middle) */}
      <circle cx="12" cy="12" r="2.2"
        fill={activeLight === 'amber' ? '#f59e0b' : '#1a1a1a'}
        className={activeLight === 'amber' ? 'traffic-light-active' : ''}
      />
      {/* Green light (bottom) */}
      <circle cx="12" cy="18" r="2.2"
        fill={activeLight === 'green' ? '#22c55e' : '#1a1a1a'}
        className={activeLight === 'green' ? 'traffic-light-active' : ''}
      />
    </svg>
  );
}

// ── CSS injection ──────────────────────────────────────────────────────

const DAEMON_CSS = `
/* ── CSS custom properties (dark default) ── */
:root {
  --bg-primary: #141414;
  --bg-secondary: #1e1e1e;
  --bg-card: #252525;
  --bg-card-hover: #2e2e2e;
  --bg-terminal: #0d0d0d;
  --border: #333333;
  --border-subtle: #2a2a2a;
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b0;
  --text-muted: #787878;
  --accent-gray: #6b7280;
  --accent-orange: #e8703a;
  --accent-lavender: #a78bfa;
  --accent-green: #22c55e;
  --accent-red: #ef4444;
}
:root.light {
  --bg-primary: #f8f9fc;
  --bg-secondary: #ffffff;
  --bg-card: #ffffff;
  --bg-card-hover: #f1f3f9;
  --bg-terminal: #f4f5f8;
  --border: #d5d9e2;
  --border-subtle: #e5e8ef;
  --text-primary: #1a1d2e;
  --text-secondary: #4b5568;
  --text-muted: #8493a8;
  --accent-gray: #6b7280;
  --accent-orange: #d4622e;
  --accent-lavender: #7c5cec;
  --accent-green: #16a34a;
  --accent-red: #dc2626;
}

/* ── Skeleton / ghost loader ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-card-hover) 50%, var(--bg-card) 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 4px;
}
.skeleton-text { height: 12px; margin-bottom: 6px; }
.skeleton-text.wide { width: 80%; }
.skeleton-text.medium { width: 55%; }
.skeleton-text.narrow { width: 35%; }
.skeleton-block { height: 60px; width: 100%; margin-bottom: 8px; border-radius: 6px; }

/* ── Spinner ── */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border);
  border-top-color: #e8703a;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
.spinner.sm { width: 14px; height: 14px; border-width: 2px; }
.spinner.lg { width: 28px; height: 28px; border-width: 3px; }

.daemon-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
}
.daemon-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  gap: 12px;
  flex-shrink: 0;
}
.daemon-header-title {
  font-size: 14px;
  font-weight: 600;
  color: #e8703a;
  letter-spacing: 0.02em;
}
.daemon-header-sub {
  color: var(--text-muted);
  font-size: 12px;
}
@keyframes ticker-in {
  0%   { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes torch-sweep {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.ticker-text {
  display: inline-block;
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.015em;
  /* dark mode: muted → warm orange → soft amber → warm orange → muted, lazy sweep */
  background: linear-gradient(90deg,
    #787878 0%, #787878 30%,
    #c96030 46%, #e89060 50%, #c96030 54%,
    #787878 70%, #787878 100%
  );
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ticker-in 0.35s cubic-bezier(0.22,1,0.36,1) both,
             torch-sweep 3.2s ease-in-out 0.8s both;
}
.light .ticker-text {
  /* light mode: secondary → deep orange → amber → deep orange → secondary sweep */
  background: linear-gradient(90deg,
    #6b7280 0%, #6b7280 30%,
    #b83c00 46%, #c2600a 50%, #b83c00 54%,
    #6b7280 70%, #6b7280 100%
  );
  background-size: 400% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.daemon-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}
.daemon-header-dot.disconnected {
  background: #ef4444;
}
.daemon-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.daemon-sidebar {
  width: 220px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  background: var(--bg-primary);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.daemon-sidebar-project {
  padding: 14px 14px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
  border-left: 3px solid transparent;
}
.daemon-sidebar-project:hover {
  background: var(--bg-secondary);
}
.daemon-sidebar-project.selected {
  background: var(--bg-card);
  border-left-color: #e8703a;
}
.daemon-sidebar-project-name {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
}
.daemon-sidebar-project-meta {
  color: var(--text-muted);
  font-size: 12px;
  margin-top: 2px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.daemon-sidebar-project-pill {
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.daemon-sidebar-progress {
  height: 2px;
  background: var(--border);
  border-radius: 1px;
  margin-top: 5px;
  overflow: hidden;
}
.daemon-sidebar-progress-fill {
  height: 100%;
  background: #e8703a;
  border-radius: 1px;
  transition: width 0.3s;
}
.daemon-sidebar-add {
  padding: 10px 12px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  border-top: 1px solid var(--border);
}
.daemon-sidebar-add:hover {
  color: #e8703a;
}
.daemon-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.daemon-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 0 16px;
  flex-shrink: 0;
}
.daemon-tab {
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 13px;
  border-bottom: 2px solid transparent;
  transition: color 0.1s;
  font-weight: 500;
}
.daemon-tab:hover {
  color: var(--text-secondary);
}
.daemon-tab.active {
  color: #e8703a;
  border-bottom-color: #e8703a;
}
/* Tab info pill */
.tab-info-pill { position: relative; display: flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 20px; font-size: 12px; color: var(--text-muted); cursor: default; border: 1px solid transparent; transition: border-color 0.15s, background 0.15s; flex-shrink: 0; }
.tab-info-pill:hover, .tab-info-pill:focus { border-color: var(--border); background: var(--bg-card); outline: none; }
.tab-info-pill-name { font-weight: 600; color: var(--text-secondary); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-info-popover { display: none; position: absolute; right: 0; top: calc(100% + 6px); background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; min-width: 260px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 200; flex-direction: column; gap: 6px; }
.tab-info-pill:hover .tab-info-popover, .tab-info-pill:focus .tab-info-popover { display: flex; }
.tab-info-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 11px; }
.tab-info-row span:first-child { color: var(--text-muted); white-space: nowrap; }
.tab-info-row span:last-child { color: var(--text-secondary); text-align: right; word-break: break-all; }
.daemon-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.daemon-content.chat-content {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.daemon-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  flex-direction: column;
  gap: 8px;
}
.daemon-empty-title {
  font-size: 14px;
  color: var(--accent-gray);
}
.daemon-empty-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.daemon-onboarding {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 32px;
  padding: 40px 24px;
  max-width: 520px;
  margin: 0 auto;
  text-align: center;
}
.daemon-onboarding-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.daemon-onboarding-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}
.daemon-onboarding-sub {
  font-size: 13px;
  color: var(--text-muted);
}
.daemon-onboarding-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  text-align: left;
}
.daemon-onboarding-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
}
.daemon-onboarding-step-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(232,112,58,0.15);
  color: #e8703a;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.daemon-onboarding-step-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}
.daemon-onboarding-step-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.daemon-onboarding-step-desc code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  background: rgba(255,255,255,0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}
.daemon-onboarding-cta {
  background: #e8703a;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 11px 24px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}
.daemon-onboarding-cta:hover { opacity: 0.85; }
.daemon-onboarding-cli {
  font-size: 11px;
  color: var(--text-muted);
}
.daemon-onboarding-cli code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  background: rgba(255,255,255,0.06);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 10px;
  color: var(--text-primary);
}
.daemon-section-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.daemon-spec-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.daemon-spec-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.1s;
}
.daemon-spec-item:hover {
  border-color: #555555;
}
.daemon-spec-item.selected {
  border-color: #e8703a;
  background: var(--bg-card);
}
.daemon-spec-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 12px;
}
.daemon-spec-path {
  color: var(--text-muted);
  font-size: 11px;
  margin-top: 2px;
}
.daemon-spec-headings {
  color: var(--accent-gray);
  font-size: 10px;
  margin-top: 3px;
}
.daemon-btn {
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 0.1s, border-color 0.1s;
}
.daemon-btn:hover:not(:disabled) {
  background: var(--bg-card-hover);
  border-color: #555555;
}
.daemon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.daemon-btn.primary {
  background: rgba(232,112,58,0.2);
  border-color: #e8703a;
  color: #e8703a;
}
.daemon-btn.primary:hover:not(:disabled) {
  background: rgba(232,112,58,0.3);
}
.daemon-btn.danger {
  background: #da3633;
  border-color: #f85149;
  color: #fff;
}
.daemon-btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.daemon-output-log {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 10px;
  height: 280px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}
.daemon-qa-card {
  background: var(--bg-card);
  border: 1px solid #e8703a;
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 14px;
}
.daemon-qa-label {
  font-size: 11px;
  color: #e8703a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.daemon-qa-question {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 10px;
  line-height: 1.5;
}
.daemon-qa-input {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  width: 100%;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.daemon-qa-input:focus {
  outline: none;
  border-color: #e8703a;
}
.daemon-plan-summary {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 14px;
}
.daemon-plan-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.daemon-plan-task:last-child {
  border-bottom: none;
}
.daemon-task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.daemon-run-stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: 6px;
  margin-bottom: 8px;
}
/* Custom model picker */
.model-picker { position: relative; display: inline-block; }
.model-picker-btn { display: flex; align-items: center; gap: 6px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; color: var(--text-primary); font-family: inherit; transition: border-color 0.12s; white-space: nowrap; }
.model-picker-btn:hover { border-color: #a78bfa; }
.model-picker-btn .mp-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.model-picker-btn .mp-name { font-weight: 600; }
.model-picker-btn .mp-chevron { font-size: 9px; color: var(--text-muted); margin-left: 2px; }
.model-picker-dropdown { min-width: 220px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 3px; }
.model-picker-dropdown-fixed { position: fixed; z-index: 9999; }
.model-picker-item { padding: 8px 10px; border-radius: 7px; cursor: pointer; transition: background 0.1s; display: flex; flex-direction: column; gap: 2px; }
.model-picker-item:hover { background: var(--bg-secondary); }
.model-picker-item.selected { background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.25); }
.mp-item-header { display: flex; align-items: center; gap: 7px; }
.mp-item-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mp-item-name { font-size: 12px; font-weight: 700; color: var(--text-primary); flex: 1; }
.mp-item-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 6px; letter-spacing: 0.04em; }
.mp-item-desc { font-size: 10px; color: var(--text-muted); padding-left: 14px; line-height: 1.4; }
.mp-item-meta { display: flex; align-items: center; gap: 8px; padding-left: 14px; margin-top: 1px; }
.mp-item-meta-pill { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border); }
.daemon-model-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.daemon-pipeline-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 6px;
}
.daemon-pipeline-index {
  width: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}
.daemon-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}
.daemon-no-project {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
}
.chat-sessions-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-secondary); flex-shrink: 0; overflow-x: auto;
}
.chat-session-tab {
  padding: 3px 10px; border-radius: 12px; font-size: 11px;
  cursor: pointer; background: var(--bg-card); border: 1px solid var(--border);
  color: var(--text-secondary); white-space: nowrap; transition: all 0.1s;
}
.chat-session-tab.active {
  background: rgba(232,112,58,0.15); border-color: #e8703a; color: #e8703a;
}
.chat-session-tab:hover:not(.active) { border-color: #555; color: var(--text-primary); }
.chat-filter-bar { display: flex; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; background: var(--bg-secondary); }
.chat-filter-chip { padding: 2px 9px; border-radius: 12px; border: 1px solid var(--border); background: none; color: var(--text-muted); font-size: 10px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.chat-filter-chip:hover { color: var(--text-secondary); border-color: #555; }
.chat-filter-chip.active { background: rgba(148,163,184,0.15); border-color: rgba(148,163,184,0.4); color: var(--text-primary); }
.chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 12px; line-height: 1.6; }
.chat-msg.user { align-self: flex-end; background: rgba(59,130,246,0.22); border: 1px solid rgba(59,130,246,0.5); color: var(--text-primary); }
.chat-msg.assistant { align-self: flex-start; background: rgba(232,112,58,0.22); border: 1px solid rgba(232,112,58,0.5); color: var(--text-primary); }
.chat-msg-role { font-size: 12px; margin-bottom: 4px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.chat-msg.user .chat-msg-role { color: #60a5fa; }
.chat-msg.assistant .chat-msg-role { color: #e8703a; }
.chat-msg-ts { font-weight: 400; opacity: 0.5; font-size: 9px; font-family: 'SF Mono', monospace; white-space: nowrap; }
.chat-input-row { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); background: var(--bg-secondary); flex-shrink: 0; }
.chat-input { flex: 1; background: var(--bg-primary); border: 1px solid var(--border); color: var(--text-primary); padding: 7px 10px; border-radius: 6px; font-family: inherit; font-size: 12px; resize: none; }
.chat-input:focus { outline: none; border-color: #e8703a; }
.chat-cursor { display: inline-block; width: 8px; height: 14px; background: #a78bfa; animation: blink 1s step-end infinite; vertical-align: text-bottom; margin-left: 2px; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.chat-thinking-dots { display: flex; align-items: center; gap: 4px; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; border-bottom-left-radius: 3px; }
.chat-thinking-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); display: inline-block; animation: thinking-bounce 1.2s ease-in-out infinite; }
.chat-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.chat-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes thinking-bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-5px);opacity:1} }
.chat-hint { font-size: 10px; color: var(--text-muted); padding: 4px 12px; }
.chat-hint kbd { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; font-family: inherit; font-size: 10px; }
/* ── Slash command autocomplete ── */
.slash-menu {
  position: absolute; bottom: calc(100% + 2px); left: 0; right: 0; z-index: 9999;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px 6px 0 0; z-index: 100; overflow: hidden;
  box-shadow: 0 -4px 16px rgba(0,0,0,0.2);
}
.slash-menu-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  cursor: pointer; font-size: 12px; transition: background 0.1s;
}
.slash-menu-item:hover, .slash-menu-item.active { background: var(--bg-hover); }
.slash-menu-cmd { font-family: 'SF Mono', monospace; font-weight: 600; color: #e8703a; min-width: 80px; }
.slash-menu-usage { font-family: 'SF Mono', monospace; font-size: 11px; color: var(--text-secondary); min-width: 160px; }
.slash-menu-desc { color: var(--text-muted); font-size: 11px; }
/* ── Memory tab ── */
.memory-tab { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.memory-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.memory-content {
  flex: 1; overflow: auto; padding: 16px 18px;
  font-family: 'SF Mono', monospace; font-size: 12px; line-height: 1.6;
  color: var(--text-primary); background: var(--bg-primary);
  white-space: pre-wrap; word-break: break-word; margin: 0;
}
.cc-status-bar {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px;
  background: var(--bg-secondary); border-top: 1px solid var(--border);
  font-size: 12px; font-family: 'SF Mono', monospace; color: var(--text-muted);
  flex-shrink: 0; white-space: nowrap; overflow: hidden;
}
.cc-status-bar.active { color: #e8703a; }
.cc-status-asterisk { animation: blink 0.8s step-end infinite; font-weight: 700; }
.light .cc-status-bar { background: var(--bg-secondary); border-top-color: var(--border); }
/* ── Icon styling ── */
.daemon-tab { display: flex; align-items: center; gap: 6px; }
.tab-icon { flex-shrink: 0; opacity: 0.7; }
.daemon-tab.active .tab-icon { opacity: 1; }
/* ── Pulsing dot for running projects ── */
@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(232,112,58,0.5); }
  70% { box-shadow: 0 0 0 6px rgba(232,112,58,0); }
  100% { box-shadow: 0 0 0 0 rgba(232,112,58,0); }
}
.status-dot-running { animation: pulse-ring 1.5s ease-out infinite; }
/* ── Source badges ── */
.session-badge {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
  padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
  line-height: 1.4;
}
.session-badge.cc {
  background: rgba(232,112,58,0.2); color: #e8703a; border: 1px solid rgba(232,112,58,0.4);
}
.session-badge.cw {
  background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.3);
}
/* ── Locked session ── */
.chat-session-item.locked { border-left: 2px solid rgba(239,68,68,0.6); background: rgba(239,68,68,0.04); cursor: pointer; }
.chat-session-item.locked:hover { background: rgba(239,68,68,0.08) !important; }
.chat-session-item.locked .chat-session-name { color: #ef4444; }
.chat-session-item.locked .chat-session-meta { color: rgba(239,68,68,0.6); }
/* ── Improved sidebar ── */
.daemon-sidebar-header {
  padding: 8px 12px 6px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom: 1px solid var(--border-subtle);
}
/* ── Locked banner ── */
.locked-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  background: rgba(232,112,58,0.08); border-bottom: 1px solid rgba(232,112,58,0.2);
  color: #e8703a; font-size: 11px; flex-shrink: 0;
}
/* ── Chat sidebar layout ── */
.chat-layout { display: flex; flex: 1; overflow: hidden; }
.chat-sidebar {
  width: 200px; border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column;
  background: var(--bg-primary); flex-shrink: 0;
  overflow: hidden;
}
.chat-sidebar-header {
  padding: 8px 10px 6px;
  font-size: 10px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between;
}
.chat-sidebar-list { flex: 1; overflow-y: auto; }
.chat-group-label {
  padding: 6px 10px 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted); user-select: none;
}
.chat-compaction-badge {
  font-size: 10px; color: var(--text-muted); cursor: help;
}
.chat-tool-cycle {
  display: flex; flex-direction: column; gap: 2px; align-items: center;
  padding: 2px 0; opacity: 0.85;
}
.chat-load-earlier {
  display: flex; align-items: center; gap: 6px; justify-content: center;
  padding: 8px; font-size: 11px; color: var(--text-muted);
  cursor: pointer; border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 8px;
}
.chat-load-earlier:hover { color: var(--text-secondary); }
.chat-segment-divider {
  display: flex; align-items: center; gap: 8px;
  font-size: 9px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 0.08em; padding: 4px 0; margin: 4px 0;
}
.chat-segment-divider::before, .chat-segment-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border-subtle);
}
.chat-segment-divider span { cursor: help; }
.chat-session-item {
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.1s;
  position: relative;
}
.chat-session-item:hover { background: var(--bg-secondary); }
.chat-session-item.active { background: var(--bg-card); border-left: 2px solid #a78bfa; }
.chat-session-item-top {
  display: flex; align-items: center; gap: 5px; margin-bottom: 3px;
}
.chat-session-name {
  font-size: 12px; color: var(--text-primary); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis;
  flex: 1;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.chat-session-meta {
  font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chat-session-delete {
  position: absolute; right: 6px; top: 6px;
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; font-size: 14px; line-height: 1;
  padding: 2px 4px; border-radius: 3px;
  opacity: 0; transition: opacity 0.1s, color 0.1s;
}
.chat-session-item:hover .chat-session-delete { opacity: 1; }
.chat-session-delete:hover { color: #ef4444; }
.chat-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.chat-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.chat-title-input {
  background: transparent; border: none; color: var(--text-primary);
  font-family: inherit; font-size: 13px; font-weight: 600;
  flex: 1; cursor: pointer; padding: 2px 4px;
  border-radius: 3px;
}
.chat-title-input:hover { background: var(--bg-card); }
.chat-title-input:focus { outline: 1px solid #e8703a; background: var(--bg-card); cursor: text; }
.chat-new-btn {
  padding: 4px 10px;
  background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3);
  color: #a78bfa; border-radius: 4px; cursor: pointer;
  font-size: 11px; font-family: inherit;
  transition: background 0.1s;
}
.chat-new-btn:hover { background: rgba(167,139,250,0.2); }
/* ── Empty state with icon ── */
.daemon-empty-icon { opacity: 0.3; margin-bottom: 12px; }
/* ── Header improvement ── */
.daemon-header-badge {
  padding: 2px 7px; background: rgba(232,112,58,0.15);
  border: 1px solid rgba(232,112,58,0.3); border-radius: 3px;
  font-size: 10px; color: #e8703a; font-weight: 600; letter-spacing: 0.04em;
}
/* ── Plan search bar ── */
.plan-search-input {
  width: 100%; padding: 7px 32px 7px 10px;
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-primary);
  font-family: inherit; font-size: 12px;
  outline: none; box-sizing: border-box;
  transition: border-color 0.15s;
}
.plan-search-input:focus { border-color: #e8703a; }
.plan-search-input::placeholder { color: var(--text-muted); }
.plan-search-chips {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.plan-search-chip {
  padding: 3px 9px; border-radius: 12px; font-size: 11px;
  cursor: pointer; background: var(--bg-secondary);
  border: 1px solid var(--border); color: var(--text-secondary);
  font-family: inherit; transition: all 0.1s; white-space: nowrap;
}
.plan-search-chip:hover { border-color: #e8703a; color: #e8703a; }
.plan-search-chip.active {
  background: rgba(232,112,58,0.15); border-color: #e8703a; color: #e8703a;
}
/* ── Tool blocks ── */
.chat-msg-blocks { display: flex; flex-direction: column; gap: 3px; }
.tool-block {
  display: flex; align-items: flex-start; gap: 5px;
  padding: 4px 7px; border-radius: 4px; cursor: pointer;
  font-size: 11px; line-height: 1.4; font-family: 'SF Mono', 'Cascadia Code', monospace;
  flex-wrap: wrap;
}
.tool-block.tool-call {
  background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.2);
  color: var(--text-secondary); border-radius: 20px; max-width: 75%;
}
.tool-block.tool-call:hover { background: rgba(148,163,184,0.14); }
.tool-block.tool-result {
  background: rgba(148,163,184,0.06); border: 1px solid rgba(148,163,184,0.15);
  color: var(--text-muted); border-radius: 20px; max-width: 75%;
}
.tool-block.tool-result.error {
  background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.2); color: #ef4444;
}
.tool-block.tool-result:hover { background: rgba(148,163,184,0.10); }
.tool-block-header { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.tool-block-icon { flex-shrink: 0; }
.tool-block-name { color: rgba(148,163,184,0.9); font-weight: 600; flex-shrink: 0; }
.tool-block-preview { color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tool-block-toggle { color: var(--text-muted); flex-shrink: 0; margin-left: auto; }
.tool-block-expanded { width: 100%; margin-top: 4px; }
.tool-block-code {
  margin: 0; padding: 8px 10px; width: 100%; box-sizing: border-box;
  background: var(--bg-primary); border-radius: 4px; border: 1px solid var(--border);
  font-size: 10.5px; font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
  overflow-y: auto; max-height: 400px; line-height: 1.5;
}
.tool-block-code.bash { color: #86efac; }
/* ── Dashboard tab ── */
.dashboard-tab { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.dashboard-hero { padding: 16px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }
.dashboard-hero-name { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.dashboard-hero-path { font-size: 11px; color: var(--text-muted); font-family: 'SF Mono', monospace; margin-bottom: 6px; }
.dashboard-hero-status { font-size: 12px; font-weight: 600; }
.dashboard-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.dashboard-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; cursor: default; transition: border-color 0.15s;
  display: flex; flex-direction: column; gap: 2px;
}
.dashboard-card[title] { cursor: pointer; }
.dashboard-card[title]:hover { border-color: #a78bfa; }
.dashboard-card-icon { margin-bottom: 6px; opacity: 0.85; }
.dashboard-card-value { font-size: 26px; font-weight: 700; color: var(--text-primary); line-height: 1; }
.dashboard-card-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; margin-top: 2px; }
.dashboard-card-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.dashboard-live-banner {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.25);
  border-radius: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;
}
.dashboard-live-banner:hover { background: rgba(239,68,68,0.12); }
.dashboard-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dashboard-actions .daemon-btn { display: flex; align-items: center; gap: 5px; }
/* Traffic light animation */
@keyframes traffic-pulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px currentColor); }
  50% { opacity: 0.6; filter: drop-shadow(0 0 8px currentColor); }
}
@keyframes traffic-pulse-fast {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 4px currentColor); }
  50% { opacity: 0.5; filter: drop-shadow(0 0 12px currentColor); }
}
.traffic-light-active {
  animation: traffic-pulse 2s ease-in-out infinite;
}
/* faster pulse for running */
circle.traffic-light-active[fill="#f59e0b"] {
  animation: traffic-pulse-fast 1s ease-in-out infinite;
}
/* History tab */
.history-tab { display: flex; flex-direction: column; height: 100%; overflow-y: auto; }
.history-header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0; }
.history-group { }
.history-group-label { padding: 8px 16px 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.history-run-card { margin: 0 12px 6px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--bg-card); }
.history-run-header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; transition: background 0.1s; }
.history-run-header:hover { background: var(--bg-secondary); }
.history-run-icon { flex-shrink: 0; }
.history-run-info { flex: 1; min-width: 0; }
.history-run-name { font-size: 12px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; }
.history-run-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 10px; color: var(--text-muted); }
.history-run-badge { padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
.history-run-badge.chain { background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.25); }
.history-run-toggle { color: var(--text-muted); flex-shrink: 0; }
.history-run-log { padding: 10px 14px; background: var(--bg-primary); border-top: 1px solid var(--border); font-size: 10px; font-family: 'SF Mono', monospace; color: var(--text-secondary); white-space: pre-wrap; max-height: 300px; overflow-y: auto; word-break: break-all; }
/* ── Light theme overrides ── */
.light .daemon-root,
.light .daemon-header,
.light .daemon-sidebar,
.light .daemon-main,
.light .daemon-tabs,
.light .chat-sidebar,
.light .chat-main,
.light .chat-header {
  color-scheme: light;
}
.light .daemon-root { background: var(--bg-primary); color: var(--text-primary); }
.light .daemon-header { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .daemon-sidebar { background: var(--bg-primary); border-right-color: var(--border); }
.light .daemon-sidebar-project { border-bottom-color: var(--border-subtle); }
.light .daemon-sidebar-project:hover { background: var(--bg-secondary); }
.light .daemon-sidebar-project.selected { background: var(--bg-card); }
.light .daemon-tabs { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .daemon-content { background: var(--bg-primary); }
.light .daemon-spec-item { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-spec-item:hover { border-color: var(--accent-orange); }
.light .daemon-output-log { background: var(--bg-secondary); border-color: var(--border); color: var(--text-secondary); }
.light .daemon-btn { background: var(--bg-card); border-color: var(--border); color: var(--text-primary); }
.light .daemon-btn:hover:not(:disabled) { background: var(--bg-card-hover); }
.light .daemon-model-select { background: var(--bg-secondary); border-color: var(--border); color: var(--text-primary); }
.light .daemon-pipeline-item { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-plan-summary { background: var(--bg-secondary); border-color: var(--border); }
.light .daemon-run-stat { background: var(--bg-secondary); border-color: var(--border); color: var(--text-secondary); }
.light .daemon-qa-card { background: var(--bg-card); }
.light .daemon-qa-input { background: var(--bg-primary); border-color: var(--border); color: var(--text-primary); }
.light .chat-sidebar { background: var(--bg-primary); border-right-color: var(--border); }
.light .chat-session-item { border-bottom-color: var(--border-subtle); }
.light .chat-session-item:hover { background: var(--bg-secondary); }
.light .chat-session-item.active { background: var(--bg-card); }
.light .chat-header { background: var(--bg-secondary); border-bottom-color: var(--border); }
.light .chat-messages { background: var(--bg-primary); }
.light .chat-input-row { background: var(--bg-secondary); border-top-color: var(--border); }
.light .chat-input { background: var(--bg-primary); border-color: var(--border); color: var(--text-primary); }
.light .chat-msg.user { background: rgba(59,130,246,0.15); }
.light .chat-msg.assistant { background: rgba(232,112,58,0.15); }
.light .locked-banner { background: rgba(232,112,58,0.06); }
/* Build tab */
.build-tab { display: flex; height: 100%; overflow: hidden; }
.build-left { width: 40%; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.build-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-primary); }
.build-section-header { padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.build-left-body { flex: 1; overflow-y: auto; padding: 10px; }
.spec-drag-card { display: flex; align-items: flex-start; gap: 6px; padding: 7px 8px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-card); margin-bottom: 5px; cursor: grab; transition: border-color 0.12s, box-shadow 0.12s; user-select: none; }
.spec-drag-card:hover { border-color: #a78bfa; box-shadow: 0 0 0 1px rgba(167,139,250,0.2); }
.spec-drag-card.in-chain { border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.04); }
.spec-drag-card.spec-card-oversized { border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.04); }
.spec-drag-card.spec-card-oversized:hover { border-color: #f87171; }
.spec-drag-card.dragging { opacity: 0.4; }
.spec-drag-handle { color: var(--text-muted); font-size: 13px; cursor: grab; flex-shrink: 0; line-height: 1; padding-top: 1px; }
.spec-card-title { font-size: 11px; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
.spec-card-path { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
.chain-canvas { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; align-items: center; }
.chain-name-row { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.chain-name-input { background: none; border: none; color: var(--text-primary); font-size: 13px; font-weight: 600; outline: none; flex: 1; }
.chain-name-input::placeholder { color: var(--text-muted); font-weight: 400; }
.chain-empty-drop { width: 100%; max-width: 340px; border: 2px dashed var(--border); border-radius: 10px; padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 12px; transition: border-color 0.15s, background 0.15s; }
.chain-empty-drop.drag-over { border-color: #a78bfa; background: rgba(167,139,250,0.06); color: var(--text-secondary); }
.chain-step-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 340px; }
.chain-drop-zone { width: 100%; height: 20px; border-radius: 4px; transition: background 0.12s, height 0.12s; display: flex; align-items: center; justify-content: center; }
.chain-drop-zone.drag-over { height: 36px; background: rgba(167,139,250,0.1); border: 1px dashed #a78bfa; }
.chain-step-card { width: 100%; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; cursor: default; transition: border-color 0.12s; position: relative; }
.chain-step-card:hover { border-color: #a78bfa; }
.chain-step-card.dragging { opacity: 0.3; }
.chain-step-num { width: 20px; height: 20px; border-radius: 50%; background: rgba(167,139,250,0.2); color: #a78bfa; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.chain-step-drag { color: var(--text-muted); cursor: grab; flex-shrink: 0; font-size: 14px; }
.chain-step-info { flex: 1; min-width: 0; }
.chain-step-title { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chain-step-type { font-size: 10px; color: var(--text-muted); }
.chain-step-delete { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.1s; padding: 2px 4px; }
.chain-step-card:hover .chain-step-delete { opacity: 1; }
.chain-step-delete:hover { color: #ef4444; }
.chain-connector { display: flex; flex-direction: column; align-items: center; color: var(--text-muted); gap: 0; }
.chain-connector-line { width: 2px; height: 16px; background: var(--border); }
.chain-connector-arrow { font-size: 10px; color: var(--border); }
.chain-step-type-select { background: none; border: none; color: var(--text-muted); font-size: 10px; cursor: pointer; padding: 0; outline: none; }
.chain-footer { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
/* Saved plans panel */
.plan-split { display: flex; height: 100%; overflow: hidden; }
.plan-left { flex: 1; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
.plan-right { width: 280px; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
.plan-right-header { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.plan-right-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.saved-plan-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: default; transition: border-color 0.12s; position: relative; }
.saved-plan-card:hover { border-color: #a78bfa; }
.saved-plan-name { font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.saved-plan-goal { font-size: 10px; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.saved-plan-footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.saved-plan-badge { padding: 1px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; background: rgba(167,139,250,0.12); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }
.saved-plan-status { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; }
.saved-plan-status.ready { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.saved-plan-status.running { background: rgba(232,112,58,0.1); color: #e8703a; border: 1px solid rgba(232,112,58,0.2); }
.saved-plan-status.completed { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.saved-plan-status.failed { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.saved-plan-time { font-size: 10px; color: var(--text-muted); }
.saved-plan-delete { position: absolute; right: 6px; top: 6px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; opacity: 0; transition: opacity 0.1s; padding: 2px 5px; }
.saved-plan-card:hover .saved-plan-delete { opacity: 1; }
.saved-plan-delete:hover { color: #ef4444; }
/* Plan name input */
.plan-name-row { padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.plan-name-input { flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; font-size: 12px; color: var(--text-primary); outline: none; font-family: inherit; }
.plan-name-input:focus { border-color: #a78bfa; }
.plan-name-input::placeholder { color: var(--text-muted); }
/* OutputLog fill mode */
.output-panel-fill { display: flex; flex-direction: column; flex: 1; overflow: hidden; border: none; border-radius: 0; }
.output-panel-fill .output-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.output-panel-fill .output-log { flex: 1; overflow-y: auto; }
/* Plan chat view — replaces split during planning */
.plan-chat-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.plan-chat-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); flex-shrink: 0; }
.plan-chat-back { background: none; border: 1px solid var(--border); border-radius: 5px; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 3px 8px; }
.plan-chat-back:hover { color: var(--text-primary); border-color: var(--text-muted); }
.plan-chat-title { font-size: 12px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px; }
.plan-chat-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.plan-chat-input-area { flex-shrink: 0; border-top: 1px solid var(--border); }
/* Planning status body — replaces output log */
.plan-status-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; gap: 24px; }
.plan-status-working { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.plan-status-label { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.plan-status-sub { font-size: 12px; color: var(--text-muted); }
.plan-status-error { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #f87171; font-size: 13px; text-align: center; }
/* Planning progress log */
.plan-log-list { width: 100%; max-width: 520px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.plan-log-line { font-size: 11px; font-family: monospace; padding: 2px 0; color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
.plan-log-line.warn { color: #fb923c; }
.plan-log-line.error { color: #f87171; }
/* Question card */
.plan-question-card { width: 100%; max-width: 480px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.plan-question-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a78bfa; }
.plan-question-text { font-size: 14px; font-weight: 600; color: var(--text-primary); line-height: 1.5; }
.plan-question-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 13px; color: var(--text-primary); font-family: inherit; resize: vertical; outline: none; }
.plan-question-input:focus { border-color: #a78bfa; }
.plan-question-actions { display: flex; gap: 8px; }
.plan-question-timeout { font-size: 10px; color: var(--text-muted); }
/* Completed plan task list */
.plan-result { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 12px; }
.plan-result-header { display: flex; align-items: baseline; gap: 10px; }
.plan-result-count { font-size: 22px; font-weight: 800; color: #22c55e; }
.plan-result-goal { font-size: 13px; color: var(--text-muted); }
.plan-result-tasks { display: flex; flex-direction: column; gap: 4px; }
.plan-result-task { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; }
.plan-result-task-num { font-size: 10px; font-weight: 700; color: var(--text-muted); min-width: 16px; }
.plan-result-task-title { font-size: 12px; color: var(--text-primary); }
.plan-result-actions { margin-top: 4px; }
/* Q&A choice chips */
.plan-qa-choices { padding: 10px 12px 0; }
.plan-qa-question { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600; }
.plan-qa-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.plan-qa-chip { background: rgba(232,112,58,0.1); border: 1px solid rgba(232,112,58,0.4); color: #e8703a; border-radius: 20px; padding: 5px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.12s, transform 0.1s; }
.plan-qa-chip:hover { background: rgba(232,112,58,0.2); transform: translateY(-1px); }
/* Planning working state bar */
.plan-working-bar { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
.plan-working-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); }
.plan-guidance-details summary { font-size: 11px; color: var(--text-muted); cursor: pointer; user-select: none; opacity: 0.7; }
.plan-guidance-details summary:hover { opacity: 1; color: var(--text-secondary); }
.plan-guidance-details[open] summary { opacity: 1; margin-bottom: 6px; }
/* Plan action footer — sticky bottom of left panel */
.plan-action-footer { flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg-secondary); padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
.plan-action-footer-idle { display: flex; align-items: center; justify-content: center; padding: 8px 0; font-size: 11px; color: var(--text-muted); }
.plan-size-error { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.25); border-radius: 5px; font-size: 11px; color: #f87171; }
.plan-action-name-input { background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; padding: 5px 10px; font-size: 11px; color: var(--text-primary); outline: none; font-family: inherit; width: 100%; box-sizing: border-box; }
.plan-action-name-input:focus { border-color: #a78bfa; }
.plan-action-name-input::placeholder { color: var(--text-muted); }
.plan-action-btn-row { display: flex; gap: 6px; align-items: center; }
.plan-action-btn { flex: 1; background: linear-gradient(135deg, #e8703a 0%, #e85c3a 100%); color: #fff; border: none; border-radius: 6px; padding: 9px 14px; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s, transform 0.1s; letter-spacing: 0.01em; }
.plan-action-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.plan-action-btn:active:not(:disabled) { transform: translateY(0); }
.plan-action-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.plan-action-btn.planning { background: linear-gradient(135deg, #a78bfa 0%, #7c5fa3 100%); }
.plan-stop-btn { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 9px 12px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.12s; flex-shrink: 0; }
.plan-stop-btn:hover { background: rgba(239,68,68,0.2); }
.plan-spec-chip { display: inline-flex; align-items: center; gap: 3px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.25); border-radius: 10px; padding: 1px 8px; font-size: 10px; color: #a78bfa; font-weight: 600; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default; }
/* Register project dialog */
.register-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.register-dialog { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 440px; max-width: calc(100vw - 40px); display: flex; flex-direction: column; gap: 6px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
.register-dialog-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
.register-dialog-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.5; }
.register-dialog-sub code { background: var(--bg-secondary); border-radius: 3px; padding: 1px 5px; font-size: 11px; color: var(--text-secondary); }
.register-dialog-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-top: 4px; }
.register-dialog-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 7px; padding: 9px 12px; font-size: 13px; color: var(--text-primary); outline: none; font-family: 'SF Mono', monospace; }
.register-dialog-input:focus { border-color: rgba(139,92,246,0.5); }
.register-dialog-error { font-size: 11px; color: #ef4444; margin-top: 4px; }
.register-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.plan-selection-count { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.plan-selection-clear { background: none; border: none; color: #a78bfa; font-size: 10px; cursor: pointer; padding: 0; text-decoration: underline; }
.plan-selection-clear:hover { color: #c4b5fd; }
/* Run tab split */
.run-split { display: flex; height: 100%; overflow: hidden; }
.run-left { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.run-right { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 16px; gap: 12px; }
.run-left-header { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.run-left-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.run-plan-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; display: flex; align-items: center; gap: 7px; cursor: grab; transition: border-color 0.12s; user-select: none; }
.run-plan-card:hover { border-color: #a78bfa; }
.run-plan-card.in-chain { border-color: rgba(34,197,94,0.35); }
.run-plan-drag-handle { color: var(--text-muted); font-size: 13px; flex-shrink: 0; }
.run-plan-info { flex: 1; min-width: 0; }
.run-plan-name { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.run-plan-tasks { font-size: 10px; color: var(--text-muted); }
/* Traffic light section */
.run-traffic-light { display: flex; align-items: center; gap: 16px; padding: 14px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }
.run-traffic-status-text { }
.run-traffic-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.run-traffic-sub { font-size: 11px; color: var(--text-muted); }
/* Run progress view */
.run-progress-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-primary); }
.run-progress-hero { display: flex; align-items: center; gap: 20px; padding: 20px 20px 16px; flex-shrink: 0; }
.run-progress-ring-wrap { position: relative; width: 100px; height: 100px; flex-shrink: 0; }
.run-progress-ring-wrap svg { transform: rotate(-90deg); }
.run-progress-ring-bg { fill: none; stroke: var(--border); stroke-width: 6; }
.run-progress-ring-fill { fill: none; stroke: #a78bfa; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1); }
.run-progress-ring-fill.complete { stroke: #22c55e; }
.run-progress-ring-fill.failed { stroke: #ef4444; }
.run-progress-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.run-progress-info { flex: 1; min-width: 0; }
.run-progress-headline { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.3px; }
.run-progress-subline { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.run-progress-bar-wrap { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.run-progress-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #a78bfa, #c084fc); background-size: 200% 100%; transition: width 0.6s cubic-bezier(.4,0,.2,1); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.run-progress-bar.running { animation: shimmer 2s linear infinite; }
.run-progress-bar.complete { background: linear-gradient(90deg, #16a34a, #22c55e); animation: none; }
.run-progress-bar.failed { background: #ef4444; animation: none; }
.run-task-list { flex: 1; overflow-y: auto; padding: 0 16px 10px; display: flex; flex-direction: column; gap: 6px; }
.run-task-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border); font-size: 12px; transition: all 0.3s ease; border-left: 3px solid transparent; }
.run-task-item.run-task-completed { border-left-color: #22c55e; opacity: 0.75; }
.run-task-item.run-task-failed { border-left-color: #ef4444; background: rgba(239,68,68,0.04); }
@keyframes task-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.15), 0 0 0 0 rgba(167,139,250,0.1); border-left-color: #a78bfa; } 50% { box-shadow: 0 0 12px 2px rgba(167,139,250,0.12), 0 0 0 0 rgba(167,139,250,0); border-left-color: #c084fc; } }
.run-task-item.run-task-in_progress { border-left-color: #a78bfa; background: rgba(167,139,250,0.06); animation: task-pulse 2s ease-in-out infinite; }
.run-task-item.run-task-skipped { opacity: 0.45; }
.run-task-icon-wrap { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.run-task-icon-wrap.status-completed { background: rgba(34,197,94,0.15); color: #22c55e; }
.run-task-icon-wrap.status-failed { background: rgba(239,68,68,0.15); color: #ef4444; }
.run-task-icon-wrap.status-in_progress { background: rgba(167,139,250,0.2); color: #a78bfa; }
.run-task-icon-wrap.status-pending { background: var(--bg-secondary); color: var(--text-muted); }
.run-task-icon-wrap.status-skipped { background: var(--bg-secondary); color: var(--text-muted); }
@keyframes spin-icon { to { transform: rotate(360deg); } }
.run-task-icon-wrap.status-in_progress .spin { display: inline-block; animation: spin-icon 1s linear infinite; }
.run-task-title { flex: 1; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.run-task-item.run-task-completed .run-task-title { color: var(--text-muted); font-weight: 400; }
.run-task-item.run-task-skipped .run-task-title { color: var(--text-muted); font-weight: 400; }
.run-task-status-label { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }
.run-task-item.run-task-in_progress .run-task-status-label { color: #a78bfa; }
.run-task-item.run-task-completed .run-task-status-label { color: #22c55e; }
.run-task-item.run-task-failed .run-task-status-label { color: #ef4444; }
.run-task-retry-btn { font-size: 10px; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.4); background: none; color: #ef4444; cursor: pointer; flex-shrink: 0; }
.run-task-retry-btn:hover { background: rgba(239,68,68,0.08); }
.run-task-expand-btn { font-size: 10px; width: 18px; text-align: center; color: var(--text-muted); cursor: pointer; flex-shrink: 0; transition: transform 0.15s; user-select: none; }
.run-task-expand-btn.open { transform: rotate(90deg); }
.run-task-detail { padding: 10px 12px 12px 44px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 8px; }
.run-task-detail-section { }
.run-task-detail-label { font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px; }
.run-task-detail-text { line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; }
.run-task-detail-files { display: flex; flex-wrap: wrap; gap: 4px; }
.run-task-detail-file { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; font-family: 'SF Mono', monospace; font-size: 9px; color: var(--text-muted); }
.run-task-detail-criteria { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
.run-task-detail-criteria li { display: flex; gap: 6px; align-items: flex-start; }
.run-task-detail-criteria li::before { content: '·'; color: #a78bfa; flex-shrink: 0; }
/* Live output terminal */
.run-task-live-output { background: #0a0a0f; border: 1px solid rgba(139,92,246,0.2); border-radius: 6px; padding: 8px 10px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scroll-behavior: smooth; }
.run-task-live-line { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 10px; color: #c4c4d0; line-height: 1.4; word-break: break-all; white-space: pre-wrap; }
.run-task-live-line:last-child { color: #a78bfa; }
/* Question banner */
.run-question-banner { margin: 0 12px 8px; background: rgba(245,158,11,0.08); border: 1.5px solid rgba(245,158,11,0.5); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; animation: pulse-border 1.5s ease-in-out infinite; }
@keyframes pulse-border { 0%,100% { border-color: rgba(245,158,11,0.5); } 50% { border-color: rgba(245,158,11,0.95); box-shadow: 0 0 12px rgba(245,158,11,0.25); } }
.run-question-banner-header { display: flex; align-items: center; gap: 8px; }
.run-question-banner-icon { font-size: 16px; }
.run-question-banner-title { flex: 1; font-size: 12px; font-weight: 700; color: #f59e0b; }
.run-question-banner-timer { font-size: 11px; font-weight: 700; color: #f59e0b; background: rgba(245,158,11,0.15); border-radius: 10px; padding: 2px 8px; }
.run-question-banner-text { font-size: 12px; color: var(--text-primary); line-height: 1.5; }
.run-question-banner-options { display: flex; flex-wrap: wrap; gap: 6px; }
.run-question-option { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; font-size: 11px; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.run-question-option:hover { border-color: #f59e0b; color: #f59e0b; }
.run-question-option.selected { background: rgba(245,158,11,0.15); border-color: #f59e0b; color: #f59e0b; font-weight: 600; }
.run-question-input { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; font-size: 12px; color: var(--text-primary); outline: none; width: 100%; box-sizing: border-box; }
.run-question-input:focus { border-color: #f59e0b; }
.run-question-submit { align-self: flex-start; background: #f59e0b; color: #000; border: none; border-radius: 6px; padding: 6px 14px; font-size: 11px; font-weight: 700; cursor: pointer; }
.run-question-submit:hover { background: #fbbf24; }
/* Stuck task banner */
.run-stuck-banner { margin: 0 12px 8px; background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.3); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 11px; color: #f59e0b; }
.run-stuck-banner span { flex: 1; }
.run-stuck-reset-btn { background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); border-radius: 6px; padding: 4px 10px; font-size: 11px; color: #f59e0b; cursor: pointer; white-space: nowrap; }
.run-stuck-reset-btn:hover { background: rgba(245,158,11,0.25); }
.run-progress-footer { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
@keyframes celebrate { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
.run-complete-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #22c55e; animation: celebrate 0.4s ease-out; }
.run-failed-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; color: #ef4444; }
/* Activity badge */
.activity-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 10px; font-size: 10px;
  background: rgba(232,112,58,0.08); border: 1px solid rgba(232,112,58,0.2);
  color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
}
.activity-badge.active {
  background: rgba(232,112,58,0.12); border-color: rgba(232,112,58,0.35); color: #e8703a;
}
.activity-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #e8703a; flex-shrink: 0;
  animation: traffic-pulse-fast 1s ease-in-out infinite;
}
.activity-text { font-weight: 600; }
.activity-sep { opacity: 0.4; }
.activity-stat { font-family: 'SF Mono', monospace; }
/* ── Plan chat bubbles ── */
.plan-chat-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.pcb-agent { max-width: 80%; align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px 12px 12px 2px; padding: 10px 14px; }
.pcb-user { max-width: 80%; align-self: flex-end; background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.3); border-radius: 12px 12px 2px 12px; padding: 10px 14px; }
.pcb-label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.pcb-log-lines { display: flex; flex-direction: column; gap: 2px; }
.pcb-log-line { font-size: 11px; font-family: monospace; color: var(--text-secondary); }
.pcb-log-line.warn { color: #fb923c; }
.pcb-q-text { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; line-height: 1.5; }
.pcb-q-badge { font-size: 10px; font-weight: 700; color: #a78bfa; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px; }
.pcb-select-options { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.pcb-select-option { padding: 5px 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.12s; }
.pcb-select-option:hover, .pcb-select-option.selected { border-color: #a78bfa; background: rgba(167,139,250,0.12); color: #a78bfa; }
.pcb-confirm-btns { display: flex; gap: 8px; margin-bottom: 10px; }
.pcb-q-textarea { width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: monospace; padding: 8px; resize: none; outline: none; margin-bottom: 10px; box-sizing: border-box; }
.pcb-q-textarea:focus { border-color: #a78bfa; }
.pcb-q-actions { display: flex; gap: 8px; }
.pcb-q-timeout { font-size: 10px; color: var(--text-muted); margin-top: 6px; }
.pcb-answered-text { font-size: 11px; color: var(--text-muted); font-style: italic; }
.pcb-summary-tasks { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.pcb-summary-task { font-size: 11px; color: var(--text-secondary); display: flex; gap: 6px; align-items: flex-start; }
.pcb-error { color: #f87171; }
/* ── Plan delivered badge ── */
.plan-delivered-badge { display: inline-flex; align-items: center; gap: 4px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 10px; padding: 1px 8px; font-size: 9px; font-weight: 700; color: #22c55e; font-family: 'SF Mono', monospace; }
/* ── Active planning session cards ── */
.plan-active-session-card { background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.3); border-radius: 8px; padding: 10px 12px; cursor: pointer; margin-bottom: 6px; }
.plan-active-session-card:hover { border-color: rgba(139,92,246,0.5); }
.plan-active-session-header { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.plan-active-session-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.plan-active-session-meta { font-size: 11px; color: var(--text-muted); }
/* ── Process switcher pills ── */
.plan-process-switcher { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; background: var(--bg-secondary); }
.plan-process-pill { padding: 3px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; border: 1px solid rgba(139,92,246,0.35); background: rgba(139,92,246,0.08); color: #a78bfa; white-space: nowrap; transition: all 0.1s; }
.plan-process-pill:hover { border-color: rgba(139,92,246,0.6); background: rgba(139,92,246,0.15); }
/* ── Advanced run options ── */
.run-advanced-options { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.run-advanced-toggle { padding: 8px 12px; font-size: 11px; color: var(--text-muted); cursor: pointer; list-style: none; display: block; }
.run-advanced-toggle::-webkit-details-marker { display: none; }
.run-advanced-body { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); }
.run-advanced-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-secondary); cursor: pointer; }
.run-advanced-row input[type=number], .run-advanced-row select { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-size: 11px; color: var(--text-primary); }
.runtime-field-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.runtime-field-title { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
.runtime-clear-btn { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 10px; text-decoration: underline; padding: 0; }
.runtime-hint { font-size: 11px; line-height: 1.45; color: var(--text-muted); }
.runtime-preset-row { display: flex; flex-wrap: wrap; gap: 6px; }
.runtime-preset-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer; padding: 4px 9px; font-size: 10px; }
.runtime-preset-btn:hover { border-color: rgba(167,139,250,0.45); color: var(--text-primary); }
.runtime-preset-btn.active { border-color: rgba(167,139,250,0.6); background: rgba(167,139,250,0.12); color: #c4b5fd; }
.runtime-preset-meta { color: var(--text-muted); font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; }
.inline-error-banner { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(239,68,68,0.28); background: rgba(127,29,29,0.18); }
.inline-error-title { font-size: 11px; font-weight: 700; color: #fca5a5; margin-bottom: 2px; }
.inline-error-body { font-size: 11px; color: #fecaca; line-height: 1.45; word-break: break-word; }
.inline-error-action { flex-shrink: 0; border-radius: 8px; border: 1px solid rgba(248,113,113,0.4); background: rgba(255,255,255,0.03); color: #fecaca; cursor: pointer; padding: 6px 9px; font-size: 10px; }
.inline-error-action:hover { background: rgba(248,113,113,0.08); }
`;

function injectStyles() {
  if (document.getElementById('daemon-styles')) return;
  const style = document.createElement('style');
  style.id = 'daemon-styles';
  style.textContent = DAEMON_CSS;
  document.head.appendChild(style);
}

// ── ProjectSidebar ─────────────────────────────────────────────────────

interface ProjectSidebarProps {
  projects: ProjectStatusSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function RegisterProjectDialog({ onClose, onRegistered }: { onClose: () => void; onRegistered: (id: string) => void }) {
  const [dirPath, setDirPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-derive project name from path
  function deriveName(p: string) {
    return p.trim().split('/').filter(Boolean).pop() ?? '';
  }

  async function handleSubmit() {
    const p = dirPath.trim();
    if (!p) { setError('Enter a directory path.'); return; }
    const projectName = name.trim() || deriveName(p);
    const id = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/projects/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, name: projectName, path: p }),
      });
      const data = await r.json() as { ok?: boolean; error?: string };
      if (data.ok) { onRegistered(id); onClose(); }
      else setError(data.error ?? 'Registration failed');
    } catch { setError('Network error'); }
    setLoading(false);
  }

  return (
    <div className="register-overlay" onClick={onClose}>
      <div className="register-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="register-dialog-title">Register project</div>
        <div className="register-dialog-sub">Point cloudy at a local directory that has (or will have) a <code>.cloudy/</code> folder.</div>
        <label className="register-dialog-label">Directory path</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="register-dialog-input"
            style={{ flex: 1 }}
            value={dirPath}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setDirPath(v);
              if (!name) setName(deriveName(v));
            }}
            placeholder="/Users/you/dev/my-project"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
          />
          <button
            className="daemon-btn"
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={async () => {
              try {
                const r = await fetch('/api/pick-directory');
                const data = await r.json() as { path?: string; error?: string };
                if (data.path) {
                  setDirPath(data.path);
                  if (!name) setName(deriveName(data.path));
                }
              } catch { /* cancelled or unsupported */ }
            }}
          >
            Browse…
          </button>
        </div>
        <label className="register-dialog-label" style={{ marginTop: 10 }}>Project name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(auto-detected)</span></label>
        <input
          className="register-dialog-input"
          value={name}
          onChange={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder={deriveName(dirPath) || 'my-project'}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
        />
        {error && <div className="register-dialog-error">{error}</div>}
        <div className="register-dialog-actions">
          <button className="daemon-btn" onClick={onClose}>Cancel</button>
          <button className="daemon-btn primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Registering…' : '+ Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSidebar({ projects, selectedId, onSelect }: ProjectSidebarProps) {
  const [showRegister, setShowRegister] = useState(false);
  return (
    <>
    {showRegister && (
      <RegisterProjectDialog
        onClose={() => setShowRegister(false)}
        onRegistered={(id) => { onSelect(id); }}
      />
    )}
    <div className="daemon-sidebar">
      {projects.length === 0 && (
        <div style={{ padding: '20px 12px', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
          No projects yet.<br />Register one to get started.
        </div>
      )}
      {projects.map((proj) => {
        return (
          <div key={proj.id}
            className={`daemon-sidebar-project${selectedId === proj.id ? ' selected' : ''}`}
            onClick={() => onSelect(proj.id)}
          >
            <div className="daemon-sidebar-project-name">
              <span
                className={proj.status === 'running' ? 'status-dot-running' : ''}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: statusColor(proj.status),
                  display: 'inline-block', flexShrink: 0,
                }}
              />
              {proj.name}
            </div>

            {/* Meta pills row */}
            <div className="daemon-sidebar-project-meta">
              {/* Activity status */}
              <span className="daemon-sidebar-project-pill" style={{
                background: proj.activeProcess ? 'rgba(232,112,58,0.12)' :
                            proj.status === 'error' || proj.status === 'failed' ? 'rgba(239,68,68,0.1)' : 'var(--bg-card)',
                color: proj.activeProcess ? '#e8703a' :
                       proj.status === 'error' || proj.status === 'failed' ? '#ef4444' : 'var(--text-muted)',
                border: `1px solid ${proj.activeProcess ? 'rgba(232,112,58,0.25)' :
                         proj.status === 'error' || proj.status === 'failed' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
              }}>
                {proj.activeProcess === 'init'     ? '⚡ planning'  :
               proj.activeProcess === 'run'      ? '⚡ running'   :
               proj.activeProcess === 'chain' ? '⚡ chaining'  :
               proj.status === 'failed'          ? '✗ error'      :
                                                   '○ idle'}
              </span>

              {proj.lastRunAt && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {relativeTime(proj.lastRunAt)}
                </span>
              )}

              {proj.costUsd ? (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatCost(proj.costUsd)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      <div
        className="daemon-sidebar-add"
        onClick={() => setShowRegister(true)}
      >
        + register project
      </div>
    </div>
    </>
  );
}

// ── BuildTab ───────────────────────────────────────────────────────────

interface BuildTabProps {
  project: ProjectStatusSnapshot;
  onPlanSavedEvent?: SavedPlan | null;
}

interface ChainStep {
  id: string;
  specPath: string;
  title: string;
  relativePath: string;
  stepType: 'plan' | 'run' | 'review';
}

const QUICK_SEARCHES = [
  { label: '📋 spec', q: 'spec' },
  { label: '🗺 roadmap', q: 'roadmap' },
  { label: '✅ tasks', q: 'tasks' },
  { label: '🎯 goals', q: 'goals' },
  { label: '🏗 requirements', q: 'requirements' },
  { label: '🔖 vision', q: 'vision' },
  { label: '🛤 phase', q: 'phase' },
  { label: '🚀 launch', q: 'launch' },
];

// ── PlanChatBubble ─────────────────────────────────────────────────────

interface PlanChatBubbleProps {
  msg: PlanChatMsg;
  isPending: boolean;
  onAnswer: (answer: string, display: string) => void;
  onAiDecide: () => void;
}

function PlanChatBubble({ msg, isPending, onAnswer, onAiDecide }: PlanChatBubbleProps) {
  const [textAnswer, setTextAnswer] = React.useState('');
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>([]);

  if (msg.kind === 'agent-log') {
    return (
      <div className="pcb-agent">
        <div className="pcb-label">Agent</div>
        <div className="pcb-log-lines">
          {(msg.logs ?? []).map((l, i) => (
            <div key={i} className={`pcb-log-line${l.level === 'warn' ? ' warn' : ''}`}>
              {l.level === 'warn' ? '⚠ ' : ''}{l.msg}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (msg.kind === 'answer') {
    return (
      <div className="pcb-user">
        <div className="pcb-label" style={{ textAlign: 'right' }}>You</div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{msg.answerText}</div>
      </div>
    );
  }

  if (msg.kind === 'error') {
    return (
      <div className="pcb-agent pcb-error">
        <div className="pcb-label" style={{ color: '#f87171' }}>Error</div>
        <div style={{ fontSize: 13 }}>{msg.errorText}</div>
      </div>
    );
  }

  if (msg.kind === 'summary' && msg.plan) {
    const plan = msg.plan;
    return (
      <div className="pcb-agent">
        <div className="pcb-label" style={{ color: '#22c55e' }}>Plan Ready</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{plan.tasks.length} tasks</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{plan.goal}</span>
        </div>
        <div className="pcb-summary-tasks">
          {plan.tasks.map((t, i) => (
            <div key={t.id} className="pcb-summary-task">
              <span style={{ color: 'var(--text-muted)', minWidth: 16 }}>{i + 1}</span>
              <span>{t.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (msg.kind === 'question' && msg.question) {
    const q = msg.question;
    const isAnswered = msg.answered !== undefined;

    return (
      <div className="pcb-agent" style={{ maxWidth: '90%' }}>
        <div className="pcb-q-badge">Question {q.index} of {q.total}</div>
        <div className="pcb-q-text">{q.text}</div>

        {isAnswered ? (
          <div className="pcb-answered-text">
            Answered: {Array.isArray(msg.answered) ? (msg.answered as string[]).join(', ') : String(msg.answered)}
          </div>
        ) : isPending ? (
          <>
            {(q.questionType === 'select') && q.options && (
              <div className="pcb-select-options">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    className="pcb-select-option"
                    onClick={() => onAnswer(opt, opt)}
                  >{opt}</button>
                ))}
              </div>
            )}

            {(q.questionType === 'multiselect') && q.options && (
              <>
                <div className="pcb-select-options">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      className={`pcb-select-option${selectedOptions.includes(opt) ? ' selected' : ''}`}
                      onClick={() => setSelectedOptions((prev) =>
                        prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
                      )}
                    >{opt}</button>
                  ))}
                </div>
                <div className="pcb-q-actions">
                  <button className="plan-action-btn"
                    onClick={() => onAnswer(selectedOptions.join(', '), selectedOptions.join(', '))}
                    disabled={selectedOptions.length === 0}
                  >Send</button>
                  <button className="daemon-btn" onClick={onAiDecide}>Let AI decide</button>
                </div>
              </>
            )}

            {q.questionType === 'confirm' && (
              <div className="pcb-confirm-btns">
                <button className="plan-action-btn" onClick={() => onAnswer('yes', 'Yes')}>Yes</button>
                <button className="daemon-btn" onClick={() => onAnswer('no', 'No')}>No</button>
              </div>
            )}

            {(q.questionType === 'text' || (q.questionType !== 'select' && q.questionType !== 'multiselect' && q.questionType !== 'confirm')) && (
              <>
                <textarea
                  className="pcb-q-textarea"
                  rows={3}
                  placeholder="Type your answer… (leave blank to let AI decide)"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const val = textAnswer.trim();
                      if (val) onAnswer(val, val); else onAiDecide();
                    }
                  }}
                  autoFocus
                />
                <div className="pcb-q-actions">
                  <button className="plan-action-btn" onClick={() => { const v = textAnswer.trim(); if (v) onAnswer(v, v); else onAiDecide(); }}>Send</button>
                  <button className="daemon-btn" onClick={onAiDecide}>Let AI decide</button>
                </div>
              </>
            )}

            <div className="pcb-q-timeout">Auto-answers in {q.timeoutSec}s if no response</div>
          </>
        ) : null}
      </div>
    );
  }

  return null;
}

function PlanBuildTab({ project, onPlanSavedEvent }: BuildTabProps) {
  // ── Left panel state ────────────────────────────────────────────────
  const [specs, setSpecs] = useState<SpecFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planName, setPlanName] = useState('');

  // ── Saved plans state ───────────────────────────────────────────────
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  // ── Planning (scope) state ──────────────────────────────────────────
  const [selectedSpecs, setSelectedSpecs] = useState<Set<string>>(new Set());
  const [showPlanOutput, setShowPlanOutput] = useState(false);
  const [planModel, setPlanModel] = useState('sonnet');
  const [requestError, setRequestError] = useState('');
  const [planningEngine, setPlanningEngine] = useState('');
  const [planningProvider, setPlanningProvider] = useState('');
  const [planningModelId, setPlanningModelId] = useState('');
  const [chatMsgs, setChatMsgs] = useState<PlanChatMsg[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<PlanChatMsg | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isPlanning = project.activeProcess === 'init';
  const projectConfig = useProjectRuntimeConfig(project.id);

  const MAX_SPEC_FILE_BYTES = 30_000;
  const MAX_SPEC_COMBINED_BYTES = 50_000;

  const selectedSpecObjects = specs.filter((s) => selectedSpecs.has(s.path));
  const oversizedFiles = selectedSpecObjects.filter((s) => s.sizeBytes > MAX_SPEC_FILE_BYTES);
  const combinedBytes = selectedSpecObjects.reduce((sum, s) => sum + s.sizeBytes, 0);
  const combinedTooBig = combinedBytes > MAX_SPEC_COMBINED_BYTES;
  const specSizeError = oversizedFiles.length > 0
    ? `"${oversizedFiles[0].title}" is ${Math.round(oversizedFiles[0].sizeBytes / 1024)}KB — max is ${Math.round(MAX_SPEC_FILE_BYTES / 1024)}KB per file.`
    : combinedTooBig
      ? `Combined selection is ${Math.round(combinedBytes / 1024)}KB — max is ${Math.round(MAX_SPEC_COMBINED_BYTES / 1024)}KB.`
      : null;

  const filteredSpecs = search.trim()
    ? specs.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.relativePath.toLowerCase().includes(q) ||
          s.headings.some((h) => h.toLowerCase().includes(q))
        );
      })
    : specs;

  // Load specs
  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${project.id}/specs`)
      .then((r) => r.json())
      .then((data: SpecFile[]) => setSpecs(data))
      .catch(() => setSpecs([]))
      .finally(() => setLoading(false));
  }, [project.id]);

  // Load saved plans
  const loadSavedPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/plans`);
      if (res.ok) {
        const data: SavedPlan[] = await res.json();
        setSavedPlans(data);
      }
    } catch { /* ignore */ } finally {
      setPlansLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadSavedPlans(); }, [loadSavedPlans]);

  // Refresh saved plans + append summary chat msg when plan_saved SSE event arrives
  useEffect(() => {
    if (onPlanSavedEvent) {
      setSavedPlans((prev) => [onPlanSavedEvent, ...prev.filter((p) => p.id !== onPlanSavedEvent.id)]);
      setPendingQuestion(null);
      setChatMsgs((prev) => [
        ...prev,
        {
          id: `summary-${Date.now()}`,
          kind: 'summary',
          plan: onPlanSavedEvent,
        },
      ]);
    }
  }, [onPlanSavedEvent]);

  // Listen for plan_question / plan_progress / plan_failed events scoped to this project
  useEffect(() => {
    const es = new EventSource('/api/live');
    const lastAgentMsgTimeRef = { current: 0 };
    es.onmessage = (e) => {
      let ev: { type: string; projectId?: string; questionType?: string; question?: string; options?: string[]; index?: number; total?: number; timeoutSec?: number; level?: string; msg?: string } | null = null;
      try { ev = JSON.parse(e.data); } catch { return; }
      if (!ev || ev.projectId !== project.id) return;
      if (ev.type === 'plan_progress') {
        const now = Date.now();
        const logEntry = { level: ev.level ?? 'info', msg: ev.msg ?? '' };
        setChatMsgs((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === 'agent-log' && now - lastAgentMsgTimeRef.current < 3000) {
            // Append to last agent-log bubble
            const updated = { ...last, logs: [...(last.logs ?? []), logEntry] };
            return [...prev.slice(0, -1), updated];
          }
          lastAgentMsgTimeRef.current = now;
          return [
            ...prev,
            {
              id: `log-${now}-${Math.random()}`,
              kind: 'agent-log' as const,
              logs: [logEntry],
            },
          ];
        });
        lastAgentMsgTimeRef.current = now;
      } else if (ev.type === 'plan_question') {
        const qMsg: PlanChatMsg = {
          id: `q-${Date.now()}`,
          kind: 'question',
          question: {
            questionType: ev.questionType ?? 'text',
            options: ev.options,
            text: ev.question ?? '',
            index: ev.index ?? 1,
            total: ev.total ?? 1,
            timeoutSec: ev.timeoutSec ?? 60,
          },
        };
        setChatMsgs((prev) => [...prev, qMsg]);
        setPendingQuestion(qMsg);
      } else if (ev.type === 'plan_failed') {
        setPendingQuestion(null);
        setChatMsgs((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            kind: 'error',
            errorText: 'Planning failed — check your spec or try again.',
          },
        ]);
      } else if (ev.type === 'plan_completed' && !onPlanSavedEvent) {
        setPendingQuestion(null);
      }
    };
    return () => es.close();
  }, [project.id]);

  useEffect(() => {
    if (isPlanning) { setShowPlanOutput(true); setChatMsgs([]); setPendingQuestion(null); }
  }, [isPlanning]);

  useEffect(() => {
    if (!requestError) return;
    setRequestError('');
  }, [planningEngine, planningProvider, planningModelId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  // ── Left panel: planning actions ────────────────────────────────────
  function toggleSpec(specPath: string) {
    setSelectedSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(specPath)) next.delete(specPath);
      else next.add(specPath);
      return next;
    });
  }

  function clearPlanningRuntimeOverrides() {
    setPlanningEngine('');
    setPlanningProvider('');
    setPlanningModelId('');
    setRequestError('');
  }

  async function handleScope() {
    if (selectedSpecs.size === 0 || specSizeError) return;
    setRequestError('');
    setShowPlanOutput(true);
    const runtimePayload: Record<string, string> = {};
    addOptionalRuntimeField(runtimePayload, 'planningEngine', planningEngine);
    addOptionalRuntimeField(runtimePayload, 'planningProvider', planningProvider);
    addOptionalRuntimeField(runtimePayload, 'planningModelId', planningModelId);
    const response = await apiPost(`/api/projects/${project.id}/plan`, {
      specPaths: Array.from(selectedSpecs),
      planName: planName.trim() || undefined,
      model: planModel,
      ...runtimePayload,
    }).catch(() => null);
    if (!response) {
      setRequestError('Network error while starting planning.');
      setShowPlanOutput(false);
      return;
    }
    if (!response.ok) {
      setRequestError(await getApiErrorMessage(response));
      setShowPlanOutput(false);
    }
  }

  async function submitAnswer(answerText: string, displayText: string) {
    if (!pendingQuestion) return;
    // Mark the question as answered in chatMsgs
    const qId = pendingQuestion.id;
    setChatMsgs((prev) =>
      prev.map((m) => m.id === qId ? { ...m, answered: answerText } : m)
    );
    // Append right-aligned answer bubble
    setChatMsgs((prev) => [
      ...prev,
      {
        id: `ans-${Date.now()}`,
        kind: 'answer',
        answerText: displayText,
      },
    ]);
    setPendingQuestion(null);
    await apiPost(`/api/projects/${project.id}/plan-input`, { answer: answerText });
  }

  function handleBackFromPlan() {
    setShowPlanOutput(false);
  }

  async function deletePlan(planId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/projects/${project.id}/plans/${planId}`, { method: 'DELETE' });
    setSavedPlans((prev) => prev.filter((p) => p.id !== planId));
  }


  // ─── Render ──────────────────────────────────────────────────────────
  // When planning is active or output exists, switch to full-height chat view
  if (showPlanOutput) {
    const hasError = chatMsgs.some((m) => m.kind === 'error');
    const hasSummary = chatMsgs.some((m) => m.kind === 'summary');
    return (
      <div className="plan-split">
        <div className="plan-chat-view">
          {/* Header */}
          <div className="plan-chat-header">
            <button className="plan-chat-back" onClick={handleBackFromPlan}>← Specs</button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div className="plan-chat-title">
                {isPlanning
                  ? <><span className="spinner" style={{ width: 12, height: 12, flexShrink: 0 }} />Planning…</>
                  : hasError ? '✗ Planning failed'
                  : hasSummary ? '✓ Plan ready'
                  : 'Planning'}
              </div>
              {/* Spec chips: prefer local state (pre-refresh), fall back to server process list */}
              {(() => {
                const activeInitProcs = (project.processes ?? []).filter(p => p.type === 'init');
                const specChips = selectedSpecObjects.length > 0
                  ? selectedSpecObjects.map(s => ({ key: s.path, label: s.title, hint: s.path }))
                  : activeInitProcs.map(p => ({ key: p.id, label: p.specName ?? 'spec', hint: p.startedAt }));
                return specChips.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {specChips.map((chip) => (
                      <span key={chip.key} title={chip.hint} className="plan-spec-chip">📄 {chip.label}</span>
                    ))}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {planModel}</span>
                  </div>
                ) : null;
              })()}
            </div>
            {isPlanning && (
              <button className="plan-stop-btn" style={{ marginLeft: 'auto', flexShrink: 0 }}
                onClick={() => fetch(`/api/projects/${project.id}/stop`, { method: 'POST' }).catch(() => {})}>
                ✕ Stop
              </button>
            )}
          </div>

          {/* Process switcher — shows all active planning sessions (tabs for parallel planning) */}
          {(project.processes ?? []).filter(p => p.type === 'init').length > 0 && (
            <div className="plan-process-switcher">
              {(project.processes ?? []).filter(p => p.type === 'init').map((proc, i) => (
                <span key={proc.id} className="plan-process-pill active">
                  <span className="spin" style={{ fontSize: 10 }}>⚡</span>
                  {proc.specName ?? `Session ${i + 1}`}
                  <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>
                    {Math.floor((Date.now() - new Date(proc.startedAt).getTime()) / 1000)}s
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Chat body */}
          <div className="plan-chat-scroll">
            {/* Empty / initial state while planning hasn't emitted anything yet */}
            {chatMsgs.length === 0 && isPlanning && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: 'var(--text-muted)', fontSize: 12 }}>
                <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                {(() => {
                  const activeProcs = (project.processes ?? []).filter(p => p.type === 'init');
                  const displaySpecs = selectedSpecObjects.length > 0
                    ? selectedSpecObjects.map(s => ({ key: s.path, label: s.title, path: s.path }))
                    : activeProcs.map(p => ({ key: p.id, label: p.specName ?? 'spec', path: p.startedAt }));
                  return (
                    <>
                      <span>Claude is reading your spec{displaySpecs.length > 1 ? 's' : ''}…</span>
                      {displaySpecs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          {displaySpecs.map((spec) => (
                            <span key={spec.key} title={spec.path} style={{ fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>
                              📄 {spec.label}
                            </span>
                          ))}
                          {displaySpecs[0]?.path && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {displaySpecs[0].path}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>This takes 2–5 minutes. No input needed.</span>
              </div>
            )}

            {chatMsgs.map((msg) => (
              <PlanChatBubble
                key={msg.id}
                msg={msg}
                isPending={pendingQuestion?.id === msg.id}
                onAnswer={(answer, display) => submitAnswer(answer, display)}
                onAiDecide={() => submitAnswer('', 'AI decides…')}
              />
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* ── Right panel: Ready to Deliver plans (always visible) ── */}
        <div className="plan-right">
          {(() => {
            const readyPlans = savedPlans.filter(p => p.status !== 'completed');
            const deliveredPlans = savedPlans.filter(p => p.status === 'completed');
            return (<>
              <div className="plan-right-header">
                <IconPipeline size={12} color="currentColor" />
                Ready to Deliver
                {readyPlans.length > 0 && (
                  <span style={{ marginLeft: 'auto', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {readyPlans.length}
                  </span>
                )}
              </div>

              <div className="plan-right-body">
                {/* Active planning sessions */}
                {(project.processes ?? []).filter(p => p.type === 'init').map(proc => (
                  <div key={proc.id} className="plan-active-session-card">
                    <div className="plan-active-session-header">
                      <span style={{ fontSize: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚡</span>
                      <span className="plan-active-session-name">{proc.specName ?? 'Planning…'}</span>
                    </div>
                    <div className="plan-active-session-meta">
                      Planning · {proc.startedAt ? `${Math.floor((Date.now() - new Date(proc.startedAt).getTime()) / 1000)}s ago` : ''}
                    </div>
                  </div>
                ))}
                {plansLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[0, 1].map((i) => (
                      <div key={i} className="skeleton skeleton-block" style={{ height: 72, opacity: 1 - i * 0.3 }} />
                    ))}
                  </div>
                )}
                {!plansLoading && readyPlans.length === 0 && deliveredPlans.length === 0 && (
                  <div className="daemon-empty" style={{ padding: '24px 12px', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>No plans yet</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Select specs on the left and plan them</div>
                  </div>
                )}
                {!plansLoading && readyPlans.map((plan) => (
                  <div key={plan.id} className="saved-plan-card">
                    <button className="saved-plan-delete" onClick={(e) => deletePlan(plan.id, e)} title="Delete plan">×</button>
                    <div className="saved-plan-name">{plan.name}</div>
                    {plan.goal && plan.goal !== plan.name && (
                      <div className="saved-plan-goal" title={plan.goal}>{plan.goal}</div>
                    )}
                    <div className="saved-plan-footer">
                      <span className="saved-plan-badge">{plan.taskCount} tasks</span>
                      <span className={`saved-plan-status ${plan.status}`}>{plan.status}</span>
                      <span className="saved-plan-time">{relativeTime(plan.createdAt)}</span>
                    </div>
                  </div>
                ))}
                {!plansLoading && deliveredPlans.length > 0 && (
                  <details className="plan-delivered-section" style={{ marginTop: readyPlans.length > 0 ? 8 : 0 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', userSelect: 'none' }}>
                      ✓ Delivered ({deliveredPlans.length})
                    </summary>
                    {deliveredPlans.map((plan) => (
                      <div key={plan.id} className="saved-plan-card" style={{ opacity: 0.7 }}>
                        <button className="saved-plan-delete" onClick={(e) => deletePlan(plan.id, e)} title="Delete plan">×</button>
                        <div className="saved-plan-name">{plan.name}</div>
                        {plan.deliveredAt && (
                          <span className="plan-delivered-badge">
                            ✓ delivered {plan.specSha ? `· #${plan.specSha}` : ''}
                          </span>
                        )}
                        <div className="saved-plan-footer">
                          <span className="saved-plan-badge">{plan.taskCount} tasks</span>
                          <span className="saved-plan-time">{relativeTime(plan.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </>);
          })()}
        </div>
      </div>
    );
  }

  // ── Spec selector (default view) ─────────────────────────────────────
  return (
    <div className="plan-split">
      <div className="plan-left">
        <div className="build-section-header">
          <IconChecklist size={13} color="currentColor" />
          Spec Files
        </div>
        <div className="build-left-body">
          {/* Search */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <input
                className="plan-search-input"
                type="text"
                placeholder="🔍 Search specs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >×</button>
              )}
            </div>
            <div className="plan-search-chips">
              {QUICK_SEARCHES.map((qs) => (
                <button
                  key={qs.q}
                  className={`plan-search-chip${search === qs.q ? ' active' : ''}`}
                  onClick={() => setSearch(search === qs.q ? '' : qs.q)}
                >{qs.label}</button>
              ))}
            </div>
          </div>

          {/* Spec count + selection */}
          <div className="daemon-section-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{search ? `${filteredSpecs.length} of ${specs.length}` : `${specs.length} spec files`}</span>
            {selectedSpecs.size > 0 && (
              <>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>{selectedSpecs.size} selected</span>
                <button onClick={() => setSelectedSpecs(new Set())}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0, textDecoration: 'underline' }}>clear</button>
              </>
            )}
          </div>

          {/* Skeletons */}
          {loading && [0,1,2,3].map((i) => (
            <div key={i} className="skeleton skeleton-block" style={{ height: 44, opacity: 1 - i * 0.15, marginBottom: 5 }} />
          ))}

          {/* Empty states */}
          {!loading && specs.length === 0 && (
            <div className="daemon-empty" style={{ padding: '20px 0' }}>
              <div className="daemon-empty-icon"><IconChecklist size={32} color="#e8703a" /></div>
              <div className="daemon-empty-title" style={{ fontSize: 12 }}>No spec files found</div>
              <div className="daemon-empty-sub" style={{ fontSize: 11 }}>Add .md files with Goals / Tasks sections</div>
            </div>
          )}
          {!loading && specs.length > 0 && filteredSpecs.length === 0 && (
            <div className="daemon-empty" style={{ padding: '16px 0' }}>
              <div className="daemon-empty-title" style={{ fontSize: 12 }}>No matches for "{search}"</div>
            </div>
          )}

          {/* Spec cards */}
          {!loading && filteredSpecs.map((spec) => {
            const isSelected = selectedSpecs.has(spec.path);
            const kb = Math.round(spec.sizeBytes / 1024);
            const tooBig = spec.sizeBytes > MAX_SPEC_FILE_BYTES;
            return (
              <div key={spec.path} className={`spec-drag-card${isSelected ? ' in-chain' : ''}${tooBig ? ' spec-card-oversized' : ''}`}
                onClick={() => toggleSpec(spec.path)} title={tooBig ? `${kb}KB — exceeds 30KB limit. Write a focused spec for one feature.` : 'Click to select'}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggleSpec(spec.path)}
                  onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="spec-card-title">
                    {isSelected && <span style={{ color: '#22c55e', marginRight: 4 }}>✓</span>}
                    {tooBig && <span style={{ marginRight: 4 }} title="Too large">⚠️</span>}
                    {spec.title}
                  </div>
                  <div className="spec-card-path" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{spec.relativePath}</span>
                    <span style={{ color: tooBig ? '#f87171' : 'var(--text-muted)', fontWeight: tooBig ? 600 : 400, fontSize: 10 }}>{kb}KB</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky action footer */}
        {selectedSpecs.size > 0 ? (
          <div className="plan-action-footer">
            {specSizeError ? (
              <div className="plan-size-error">
                <span>⚠️ {specSizeError}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                  Good specs are focused: one feature, 2–10KB. Large files like TASKS.md are reference docs — not specs.
                </span>
              </div>
            ) : (
              <input className="plan-action-name-input" type="text"
                placeholder="Plan name (optional)…" value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScope(); }} />
            )}
            <div className="plan-action-btn-row">
              <button className="plan-action-btn" onClick={handleScope} disabled={!!specSizeError}
                style={specSizeError ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
                ✦ Plan {selectedSpecs.size} spec{selectedSpecs.size !== 1 ? 's' : ''} →
              </button>
              <ModelPicker value={planModel} onChange={setPlanModel} label="Model" />
              <button className="plan-stop-btn"
                style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.3)' }}
                onClick={() => { setSelectedSpecs(new Set()); setPlanName(''); }} title="Clear selection">✕</button>
            </div>
            {requestError ? (
              <InlineErrorBanner
                title="Planning could not start"
                message={requestError}
                actionLabel="Use defaults"
                onAction={clearPlanningRuntimeOverrides}
              />
            ) : null}
            <details className="run-advanced-options" style={{ marginTop: 8, width: '100%' }}>
              <summary className="run-advanced-toggle">Planning runtime</summary>
              <div className="run-advanced-body">
                <RuntimeConfigFields
                  title="Planning route"
                  engine={planningEngine}
                  provider={planningProvider}
                  modelId={planningModelId}
                  onEngineChange={setPlanningEngine}
                  onProviderChange={setPlanningProvider}
                  onModelIdChange={setPlanningModelId}
                  onClear={clearPlanningRuntimeOverrides}
                  hint="Leave blank to follow the project planning route. Presets below cover the common subscription and API paths."
                  defaultRoute={projectConfig?.planningRuntime}
                />
              </div>
            </details>
          </div>
        ) : (
          <div className="plan-action-footer">
            <div className="plan-action-footer-idle">☝ Select specs above to create a plan</div>
          </div>
        )}
      </div>

      {/* Right panel: Ready to Deliver plans */}
      <div className="plan-right">
        {(() => {
          const readyPlans = savedPlans.filter(p => p.status !== 'completed');
          const deliveredPlans = savedPlans.filter(p => p.status === 'completed');
          return (<>
            <div className="plan-right-header">
              <IconPipeline size={12} color="currentColor" />
              Ready to Deliver
              {readyPlans.length > 0 && (
                <span style={{ marginLeft: 'auto', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                  {readyPlans.length}
                </span>
              )}
            </div>
            <div className="plan-right-body">
              {/* Active planning sessions */}
              {(project.processes ?? []).filter(p => p.type === 'init').map(proc => (
                <div key={proc.id} className="plan-active-session-card">
                  <div className="plan-active-session-header">
                    <span style={{ fontSize: 12, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚡</span>
                    <span className="plan-active-session-name">{proc.specName ?? 'Planning…'}</span>
                  </div>
                  <div className="plan-active-session-meta">
                    Planning · {proc.startedAt ? `${Math.floor((Date.now() - new Date(proc.startedAt).getTime()) / 1000)}s ago` : ''}
                  </div>
                </div>
              ))}
              {plansLoading && [0,1].map((i) => (
                <div key={i} className="skeleton skeleton-block" style={{ height: 72, opacity: 1 - i * 0.3 }} />
              ))}
              {!plansLoading && readyPlans.length === 0 && deliveredPlans.length === 0 && (
                <div className="daemon-empty" style={{ padding: '24px 12px', fontSize: 11, textAlign: 'center' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>No plans yet</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Select specs on the left and plan them</div>
                </div>
              )}
              {!plansLoading && readyPlans.map((plan) => (
                <div key={plan.id} className="saved-plan-card">
                  <button className="saved-plan-delete" onClick={(e) => deletePlan(plan.id, e)} title="Delete plan">×</button>
                  <div className="saved-plan-name">{plan.name}</div>
                  {plan.goal && plan.goal !== plan.name && (
                    <div className="saved-plan-goal" title={plan.goal}>{plan.goal}</div>
                  )}
                  <div className="saved-plan-footer">
                    <span className="saved-plan-badge">{plan.taskCount} tasks</span>
                    <span className={`saved-plan-status ${plan.status}`}>{plan.status}</span>
                    <span className="saved-plan-time">{relativeTime(plan.createdAt)}</span>
                  </div>
                </div>
              ))}
              {!plansLoading && deliveredPlans.length > 0 && (
                <details className="plan-delivered-section" style={{ marginTop: readyPlans.length > 0 ? 8 : 0 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', userSelect: 'none' }}>
                    ✓ Delivered ({deliveredPlans.length})
                  </summary>
                  {deliveredPlans.map((plan) => (
                    <div key={plan.id} className="saved-plan-card" style={{ opacity: 0.7 }}>
                      <button className="saved-plan-delete" onClick={(e) => deletePlan(plan.id, e)} title="Delete plan">×</button>
                      <div className="saved-plan-name">{plan.name}</div>
                      {plan.deliveredAt && (
                        <span className="plan-delivered-badge">
                          ✓ delivered {plan.specSha ? `· #${plan.specSha}` : ''}
                        </span>
                      )}
                      <div className="saved-plan-footer">
                        <span className="saved-plan-badge">{plan.taskCount} tasks</span>
                        <span className="saved-plan-time">{relativeTime(plan.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </>);
        })()}
      </div>
    </div>
  );
}

// ── ModelPicker ─────────────────────────────────────────────────────────

const MODEL_INFO: Record<string, { dot: string; badge: string; badgeColor: string; desc: string; speed: string; cost: string; effort: string }> = {
  haiku: {
    dot: '#60a5fa',
    badge: 'FAST',
    badgeColor: 'rgba(96,165,250,0.15)',
    desc: 'Claude Haiku — lightweight tasks, quick edits',
    speed: '⚡ fastest',
    cost: '$',
    effort: 'low effort',
  },
  sonnet: {
    dot: '#a78bfa',
    badge: 'BALANCED',
    badgeColor: 'rgba(167,139,250,0.15)',
    desc: 'Claude Sonnet — best for most coding tasks',
    speed: '◎ balanced',
    cost: '$$',
    effort: 'medium effort',
  },
  opus: {
    dot: '#f97316',
    badge: 'POWERFUL',
    badgeColor: 'rgba(249,115,22,0.15)',
    desc: 'Claude Opus — complex reasoning, architecture',
    speed: '◉ deliberate',
    cost: '$$$',
    effort: 'high effort',
  },
};

interface RuntimePreset {
  label: string;
  meta: string;
  engine: string;
  provider: string;
  modelId?: string;
}

const RUNTIME_ROUTE_PRESETS: RuntimePreset[] = [
  { label: 'Claude Code', meta: 'subscription', engine: 'claude-code', provider: 'claude' },
  { label: 'Codex CLI', meta: 'subscription', engine: 'codex', provider: 'codex' },
  { label: 'OpenAI API', meta: 'via pi-mono', engine: 'pi-mono', provider: 'openai' },
];

function ModelPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const info = MODEL_INFO[value] ?? MODEL_INFO['sonnet'];

  function openDropdown() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 280;
    setDropPos({ top: openUp ? r.top : r.bottom + 4, left: r.left, openUp });
    setOpen(true);
  }

  useEffect(() => {
    function onClose(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.model-picker-dropdown-fixed') && !btnRef.current?.contains(target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClose);
    return () => document.removeEventListener('mousedown', onClose);
  }, [open]);

  // Close on scroll/resize
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <div className="model-picker">
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
        <button ref={btnRef} className="model-picker-btn" onClick={() => open ? setOpen(false) : openDropdown()}>
          <span className="mp-dot" style={{ background: info.dot }} />
          <span className="mp-name">{value}</span>
          <span className="mp-chevron">{open ? '▲' : '▼'}</span>
        </button>
      </div>
      {open && dropPos && (
        <div
          className="model-picker-dropdown model-picker-dropdown-fixed"
          style={{
            position: 'fixed',
            left: dropPos.left,
            ...(dropPos.openUp ? { bottom: window.innerHeight - dropPos.top } : { top: dropPos.top }),
            zIndex: 9999,
          }}
        >
          {Object.entries(MODEL_INFO).map(([model, mi]) => (
            <div
              key={model}
              className={`model-picker-item${value === model ? ' selected' : ''}`}
              onClick={() => { onChange(model); setOpen(false); }}
            >
              <div className="mp-item-header">
                <span className="mp-item-dot" style={{ background: mi.dot }} />
                <span className="mp-item-name">{model}</span>
                <span className="mp-item-badge" style={{ background: mi.badgeColor, color: mi.dot }}>{mi.badge}</span>
              </div>
              <div className="mp-item-desc">{mi.desc}</div>
              <div className="mp-item-meta">
                <span className="mp-item-meta-pill">{mi.speed}</span>
                <span className="mp-item-meta-pill">{mi.cost}</span>
                <span className="mp-item-meta-pill">{mi.effort}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineErrorBanner({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="inline-error-banner" role="alert">
      <div style={{ minWidth: 0 }}>
        <div className="inline-error-title">{title}</div>
        <div className="inline-error-body">{message}</div>
      </div>
      {actionLabel && onAction ? (
        <button className="inline-error-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function RuntimeRouteSummaryBar({
  routes,
}: {
  routes: Array<{ label: string; route?: RuntimeRouteConfig; override?: RuntimeRouteConfig | null }>;
}) {
  return (
    <div className="runtime-preset-row" style={{ gap: 8 }}>
      {routes.map(({ label, route, override }) => {
        const active = override && (override.engine || override.provider || override.modelId)
          ? override
          : route;
        const isOverride = Boolean(override && (override.engine || override.provider || override.modelId));
        return (
          <div
            key={label}
            className={`runtime-preset-btn${isOverride ? ' active' : ''}`}
            style={{ cursor: 'default' }}
            title={isOverride ? 'Active override' : 'Project default'}
          >
            <span>{label}</span>
            <span className="runtime-preset-meta">{isOverride ? 'override' : 'default'}</span>
            <span style={{ color: 'var(--text-muted)' }}>{routeSummary(active)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RuntimeConfigFields({
  title,
  engine,
  provider,
  modelId,
  onEngineChange,
  onProviderChange,
  onModelIdChange,
  onClear,
  hint,
  defaultRoute,
  presets = RUNTIME_ROUTE_PRESETS,
}: {
  title: string;
  engine: string;
  provider: string;
  modelId: string;
  onEngineChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onModelIdChange: (value: string) => void;
  onClear?: () => void;
  hint?: string;
  defaultRoute?: RuntimeRouteConfig;
  presets?: RuntimePreset[];
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 9px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 12,
  };
  const hasOverride = Boolean(engine || provider || modelId);
  const activeRoute = hasOverride
    ? routeSummary({ engine: optionalText(engine), provider: optionalText(provider), modelId: optionalText(modelId) })
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div className="runtime-field-head">
        <div className="runtime-field-title">{title}</div>
        {hasOverride && onClear ? (
          <button className="runtime-clear-btn" onClick={onClear}>
            Use defaults
          </button>
        ) : null}
      </div>
      <div className="runtime-hint">
        {hint ?? 'Leave these blank to use the project defaults. Set both engine and provider when you want to force a specific route.'}
      </div>
      <div className="runtime-hint">
        Default: <strong>{routeSummary(defaultRoute)}</strong>
        {activeRoute ? <> · Override: <strong>{activeRoute}</strong></> : null}
      </div>
      <div className="runtime-preset-row">
        {presets.map((preset) => {
          const isActive = engine === preset.engine && provider === preset.provider && (preset.modelId ? modelId === preset.modelId : true);
          return (
            <button
              key={`${title}-${preset.label}`}
              className={`runtime-preset-btn${isActive ? ' active' : ''}`}
              onClick={() => {
                onEngineChange(preset.engine);
                onProviderChange(preset.provider);
                onModelIdChange(preset.modelId ?? '');
              }}
              title={`${preset.engine} + ${preset.provider}`}
            >
              <span>{preset.label}</span>
              <span className="runtime-preset-meta">{preset.meta}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Engine</span>
          <input
            style={inputStyle}
            placeholder="claude-code, codex"
            value={engine}
            onChange={(e) => onEngineChange((e.target as HTMLInputElement).value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Provider</span>
          <input
            style={inputStyle}
            placeholder="claude, codex, openai"
            value={provider}
            onChange={(e) => onProviderChange((e.target as HTMLInputElement).value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Model ID</span>
          <input
            style={inputStyle}
            placeholder="o3, codex-mini"
            value={modelId}
            onChange={(e) => onModelIdChange((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
    </div>
  );
}

// ── RunTab ─────────────────────────────────────────────────────────────

interface RunTabProps {
  project: ProjectStatusSnapshot;
}

interface PlanChainStep {
  id: string;
  planId: string;
  planName: string;
  taskCount: number;
}

interface RunTask {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  status: string;
  retries?: number;
  durationMs?: number;
  resultSummary?: string;
  filesWritten?: string[];
  sessionId?: string;
}

function taskStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓';
    case 'failed': return '✗';
    case 'in_progress': return '⚡';
    case 'skipped': return '⊘';
    case 'rolled_back': return '↩';
    default: return '○';
  }
}

interface RunQuestion {
  text: string;
  questionType: string;
  options?: string[];
  index: number;
  total: number;
  timeoutSec: number;
  arrivedAt: number; // Date.now()
  processId?: string; // for routing answer to correct parallel init process
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* audio blocked */ }
}

function RunTab({ project }: RunTabProps) {
  const [executionModel, setExecutionModel] = useState('sonnet');
  const [executionEngine, setExecutionEngine] = useState('');
  const [executionProvider, setExecutionProvider] = useState('');
  const [executionModelId, setExecutionModelId] = useState('');
  const [taskReviewModel, setTaskReviewModel] = useState('haiku');
  const [runReviewModel, setRunReviewModel] = useState('sonnet');
  const [qualityReviewModel, setQualityReviewModel] = useState('');
  const [requestError, setRequestError] = useState('');
  const [validationEngine, setValidationEngine] = useState('');
  const [validationProvider, setValidationProvider] = useState('');
  const [validationModelId, setValidationModelId] = useState('');
  const [reviewEngine, setReviewEngine] = useState('');
  const [reviewProvider, setReviewProvider] = useState('');
  const [reviewModelId, setReviewModelId] = useState('');
  const [parallel, setParallel] = useState(false);
  const [maxParallel, setMaxParallel] = useState(3);
  const [worktrees, setWorktrees] = useState(false);
  const [noValidate, setNoValidate] = useState(false);
  const [maxRetries, setMaxRetries] = useState(3);
  const [effort, setEffort] = useState('');
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [chainSteps, setChainSteps] = useState<PlanChainStep[]>([]);
  const [chainName, setChainName] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropOnEmpty, setDropOnEmpty] = useState(false);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [runTasks, setRunTasks] = useState<RunTask[]>([]);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [costUsd, setCostUsd] = useState(0);
  const [viewMode, setViewMode] = useState<'config' | 'progress'>('config');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const prevIsRunning = useRef(false);
  // Live output lines from the currently-running task (last 20 lines)
  const [taskOutputLines, setTaskOutputLines] = useState<string[]>([]);
  const activeTaskIdRef = useRef<string | null>(null);
  // Active question waiting for response
  const [activeQuestion, setActiveQuestion] = useState<RunQuestion | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState('');
  // Question timer countdown
  const [questionSecsLeft, setQuestionSecsLeft] = useState(0);
  const projectConfig = useProjectRuntimeConfig(project.id);

  const isRunning = project.activeProcess === 'run' || project.status === 'running';

  // SSE subscription for live output + questions during run
  useEffect(() => {
    const es = new EventSource('/api/live');
    es.onmessage = (e) => {
      let ev: { type: string; projectId?: string; line?: string; questionType?: string; question?: string; options?: string[]; index?: number; total?: number; timeoutSec?: number } | null = null;
      try { ev = JSON.parse(e.data); } catch { return; }
      if (!ev || ev.projectId !== project.id) return;
      if (ev.type === 'run_output_daemon' && ev.line) {
        // Strip ANSI, skip spinner-only lines
        // eslint-disable-next-line no-control-regex
        const clean = ev.line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, '').trim();
        if (clean) {
          setTaskOutputLines((prev) => {
            const next = [...prev, clean];
            return next.length > 20 ? next.slice(-20) : next;
          });
        }
      } else if (ev.type === 'plan_question') {
        const q: RunQuestion = {
          text: ev.question ?? '',
          questionType: ev.questionType ?? 'text',
          options: ev.options,
          index: ev.index ?? 1,
          total: ev.total ?? 1,
          timeoutSec: ev.timeoutSec ?? 60,
          arrivedAt: Date.now(),
          processId: ev.processId as string | undefined,
        };
        setActiveQuestion(q);
        setQuestionSecsLeft(q.timeoutSec);
        setQuestionAnswer(q.options?.[0] ?? '');
        playBeep();
      } else if (ev.type === 'run_output_daemon' || ev.type === 'run_completed_daemon' || ev.type === 'run_failed_daemon') {
        if (ev.type !== 'run_output_daemon') setActiveQuestion(null);
      }
    };
    return () => es.close();
  }, [project.id]);

  // Reset output buffer when active task changes
  useEffect(() => {
    const inProgressTask = runTasks.find((t) => t.status === 'in_progress');
    const tid = inProgressTask?.id ?? null;
    if (tid !== activeTaskIdRef.current) {
      activeTaskIdRef.current = tid;
      setTaskOutputLines([]);
    }
  }, [runTasks]);

  // Question timer countdown
  useEffect(() => {
    if (!activeQuestion) return;
    setQuestionSecsLeft(activeQuestion.timeoutSec);
    const t = setInterval(() => {
      setQuestionSecsLeft((s) => {
        if (s <= 1) { clearInterval(t); setActiveQuestion(null); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [activeQuestion?.arrivedAt]);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/plans`)
      .then((r) => r.json())
      .then((d: SavedPlan[]) => setSavedPlans(d))
      .catch(() => {});
  }, [project.id]);

  useEffect(() => {
    if (!requestError) return;
    setRequestError('');
  }, [
    executionEngine,
    executionProvider,
    executionModelId,
    validationEngine,
    validationProvider,
    validationModelId,
    reviewEngine,
    reviewProvider,
    reviewModelId,
  ]);

  async function fetchRunState() {
    try {
      const r = await fetch(`/api/projects/${project.id}/state`);
      const data = await r.json() as { plan?: { tasks?: RunTask[] }; costSummary?: { totalEstimatedUsd?: number } };
      const tasks = data?.plan?.tasks ?? [];
      if (tasks.length > 0) {
        setRunTasks(tasks);
        setCostUsd(data?.costSummary?.totalEstimatedUsd ?? 0);
      }
    } catch { /* ignore */ }
  }

  // Hydrate on mount: always load the current run state so a refresh restores the view
  useEffect(() => {
    setStateLoaded(false);
    fetchRunState().then(() => {
      // After loading, show progress view if there are tasks (running or completed/failed)
      setRunTasks((tasks) => {
        if (tasks.length > 0) setViewMode('progress');
        return tasks;
      });
      setStateLoaded(true);
    });
  }, [project.id]);

  // Poll state while running
  useEffect(() => {
    if (!isRunning) return;
    setViewMode('progress');
    fetchRunState();
    const interval = setInterval(fetchRunState, 3000);
    return () => clearInterval(interval);
  }, [isRunning, project.id]);

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishMessage, setFinishMessage] = useState('');
  const [finishLoading, setFinishLoading] = useState(false);
  const pendingFinishCheck = useRef(false);

  // Fetch final state once when run finishes
  useEffect(() => {
    if (prevIsRunning.current && !isRunning) {
      pendingFinishCheck.current = true;
      setTimeout(fetchRunState, 600);
    }
    prevIsRunning.current = isRunning;
  }, [isRunning]);

  // After runTasks updates following a run completion, show finishing modal if no failures
  useEffect(() => {
    if (pendingFinishCheck.current && runTasks.length > 0) {
      pendingFinishCheck.current = false;
      const failed = runTasks.filter((t) => t.status === 'failed').length;
      if (failed === 0) {
        setShowFinishModal(true);
      }
    }
  }, [runTasks]);

  async function handleFinish(action: 'merge' | 'push-pr' | 'keep' | 'discard') {
    setFinishLoading(true);
    try {
      const res = await apiPost(`/api/projects/${project.id}/finish`, { action });
      const data = await res.json() as { ok?: boolean; message?: string; url?: string; error?: string };
      setFinishMessage(data.error ?? data.message ?? (data.url ? `PR: ${data.url}` : 'Done'));
    } catch (e) {
      setFinishMessage(String(e));
    }
    setFinishLoading(false);
  }

  function buildRunRuntimePayload(): Record<string, string> {
    const payload: Record<string, string> = {};
    addOptionalRuntimeField(payload, 'engine', executionEngine);
    addOptionalRuntimeField(payload, 'provider', executionProvider);
    addOptionalRuntimeField(payload, 'executionModelId', executionModelId);
    addOptionalRuntimeField(payload, 'validationEngine', validationEngine);
    addOptionalRuntimeField(payload, 'validationProvider', validationProvider);
    addOptionalRuntimeField(payload, 'validationModelId', validationModelId);
    addOptionalRuntimeField(payload, 'reviewEngine', reviewEngine);
    addOptionalRuntimeField(payload, 'reviewProvider', reviewProvider);
    addOptionalRuntimeField(payload, 'reviewModelId', reviewModelId);
    return payload;
  }

  function clearRunRuntimeOverrides() {
    setExecutionEngine('');
    setExecutionProvider('');
    setExecutionModelId('');
    setValidationEngine('');
    setValidationProvider('');
    setValidationModelId('');
    setReviewEngine('');
    setReviewProvider('');
    setReviewModelId('');
    setRequestError('');
  }

  const executionOverrideRoute: RuntimeRouteConfig = {
    engine: optionalText(executionEngine),
    provider: optionalText(executionProvider),
    modelId: optionalText(executionModelId),
  };
  const validationOverrideRoute: RuntimeRouteConfig = {
    engine: optionalText(validationEngine),
    provider: optionalText(validationProvider),
    modelId: optionalText(validationModelId),
  };
  const reviewOverrideRoute: RuntimeRouteConfig = {
    engine: optionalText(reviewEngine),
    provider: optionalText(reviewProvider),
    modelId: optionalText(reviewModelId),
  };

  async function handleRetryTask(taskId: string) {
    if (effectivelyRunning) return;
    setRequestError('');
    setViewMode('progress');
    const response = await apiPost(`/api/projects/${project.id}/retry`, {
      taskId,
      executionModel,
      taskReviewModel,
      runReviewModel,
      qualityReviewModel: qualityReviewModel || undefined,
      worktrees: worktrees || undefined,
      ...buildRunRuntimePayload(),
    }).catch(() => null);
    if (!response) {
      setRequestError('Network error while retrying the task.');
      return;
    }
    if (!response.ok) {
      setRequestError(await getApiErrorMessage(response));
    }
  }

  async function handleRetryFailed() {
    if (effectivelyRunning) return;
    setRequestError('');
    setViewMode('progress');
    const response = await apiPost(`/api/projects/${project.id}/retry`, {
      executionModel,
      taskReviewModel,
      runReviewModel,
      qualityReviewModel: qualityReviewModel || undefined,
      worktrees: worktrees || undefined,
      ...buildRunRuntimePayload(),
    }).catch(() => null);
    if (!response) {
      setRequestError('Network error while retrying failed tasks.');
      return;
    }
    if (!response.ok) {
      setRequestError(await getApiErrorMessage(response));
    }
  }

  const chainPlanIds = new Set(chainSteps.map((s) => s.planId));

  function handlePlanDragStart(e: React.DragEvent, plan: SavedPlan) {
    e.dataTransfer.setData('planId', plan.id);
    e.dataTransfer.setData('planName', plan.name);
    e.dataTransfer.setData('drag-type', 'from-plans');
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleStepDragStart(e: React.DragEvent, stepId: string) {
    setDraggingStepId(stepId);
    e.dataTransfer.setData('drag-type', 'chain-step');
    e.dataTransfer.setData('step-id', stepId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleCanvasDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const dragType = e.dataTransfer.getData('drag-type');
    if (dragType === 'from-plans') {
      const planId = e.dataTransfer.getData('planId');
      const planName = e.dataTransfer.getData('planName');
      if (!planId || chainPlanIds.has(planId)) return;
      const plan = savedPlans.find((p) => p.id === planId);
      const step: PlanChainStep = { id: `${planId}-${Date.now()}`, planId, planName, taskCount: plan?.taskCount ?? 0 };
      setChainSteps((prev) => [...prev, step]);
    }
    setDropOnEmpty(false);
  }

  function handleDropZoneDrop(e: React.DragEvent, insertIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    const dragType = e.dataTransfer.getData('drag-type');

    if (dragType === 'from-plans') {
      const planId = e.dataTransfer.getData('planId');
      const planName = e.dataTransfer.getData('planName');
      if (!planId || chainPlanIds.has(planId)) return;
      const plan = savedPlans.find((p) => p.id === planId);
      const step: PlanChainStep = { id: `${planId}-${Date.now()}`, planId, planName, taskCount: plan?.taskCount ?? 0 };
      setChainSteps((prev) => {
        const next = [...prev];
        next.splice(insertIndex, 0, step);
        return next;
      });
    } else if (dragType === 'chain-step') {
      const stepId = e.dataTransfer.getData('step-id');
      setChainSteps((prev) => {
        const fromIndex = prev.findIndex((s) => s.id === stepId);
        if (fromIndex === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        const target = fromIndex < insertIndex ? insertIndex - 1 : insertIndex;
        next.splice(target, 0, moved);
        return next;
      });
    }

    setDragOverIndex(null);
    setDraggingStepId(null);
  }

  function removeStep(stepId: string) {
    setChainSteps((prev) => prev.filter((s) => s.id !== stepId));
  }

  async function handleQuestionSubmit() {
    if (!activeQuestion || !questionAnswer.trim()) return;
    const payload: Record<string, string> = { answer: questionAnswer.trim() };
    if (activeQuestion.processId) payload.processId = activeQuestion.processId;
    await apiPost(`/api/projects/${project.id}/plan-input`, payload).catch(() => {});
    setActiveQuestion(null);
    setQuestionAnswer('');
  }

  async function handleRunChain() {
    if (chainSteps.length === 0 || isRunning) return;
    setRequestError('');
    setViewMode('progress');
    const response = await apiPost(`/api/projects/${project.id}/run`, {
      planIds: chainSteps.map((s) => s.planId),
      executionModel,
      taskReviewModel,
      runReviewModel,
      parallel: parallel || undefined,
      maxParallel: parallel ? maxParallel : undefined,
      worktrees: worktrees || undefined,
      noValidate: noValidate || undefined,
      maxRetries: maxRetries !== 3 ? maxRetries : undefined,
      effort: effort || undefined,
      qualityReviewModel: qualityReviewModel || undefined,
      ...buildRunRuntimePayload(),
    }).catch(() => null);
    if (!response) {
      setRequestError('Network error while starting the run.');
      setViewMode('config');
      return;
    }
    if (!response.ok) {
      setRequestError(await getApiErrorMessage(response));
      setViewMode('config');
    }
  }

  const trafficStatus = isRunning ? 'running' : project.status === 'failed' ? 'error' : chainSteps.length > 0 ? 'completed' : 'idle';

  const failedTasks = runTasks.filter((t) => t.status === 'failed');
  const doneTasks = runTasks.filter((t) => t.status === 'completed' || t.status === 'skipped');
  const progressPct = runTasks.length > 0 ? (doneTasks.length / runTasks.length) * 100 : 0;
  // A task has active work if daemon says running OR tasks report in_progress/pending
  const hasActiveTasks = runTasks.some((t) => t.status === 'in_progress'); // pending = never started, not stuck
  const effectivelyRunning = isRunning || hasActiveTasks;
  const runTrafficStatus = effectivelyRunning ? 'running' : failedTasks.length > 0 ? 'error' : runTasks.length > 0 ? 'completed' : 'idle';

  // Live elapsed timer
  const [elapsed, setElapsed] = React.useState(0);
  const runStartRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (isRunning) {
      if (!runStartRef.current) runStartRef.current = Date.now();
      const t = setInterval(() => setElapsed(Math.floor((Date.now() - (runStartRef.current ?? Date.now())) / 1000)), 500);
      return () => clearInterval(t);
    } else {
      runStartRef.current = null;
    }
  }, [isRunning]);
  function fmtElapsed(s: number) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // SVG ring constants
  const RING_R = 40, RING_C = 2 * Math.PI * RING_R; // ~251.3

  // Stuck = process ended but tasks still show in_progress (only after state has loaded)
  const isStuck = stateLoaded && !isRunning && hasActiveTasks;

  // Progress view: shown while running or after a run has results
  if (viewMode === 'progress' && (isRunning || runTasks.length > 0)) {
    const ringClass = !effectivelyRunning && failedTasks.length > 0 ? 'failed' : !effectivelyRunning && progressPct === 100 ? 'complete' : '';
    const barClass = !effectivelyRunning && failedTasks.length > 0 ? 'failed' : !effectivelyRunning && progressPct === 100 ? 'complete' : 'running';
    const inProgressTask = runTasks.find((t) => t.status === 'in_progress');

    return (
      <div className="run-progress-view">
        {/* Finishing workflow modal */}
        {showFinishModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 28, minWidth: 340, maxWidth: 440 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>🏁 Implementation complete</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>What would you like to do with this branch?</div>
              {finishMessage ? (
                <div style={{ fontSize: 13, padding: '10px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 16 }}>{finishMessage}</div>
              ) : null}
              {!finishMessage && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="daemon-btn primary" disabled={finishLoading} onClick={() => handleFinish('merge')}>Merge into base branch</button>
                  <button className="daemon-btn" disabled={finishLoading} onClick={() => handleFinish('push-pr')}>Push + open Pull Request</button>
                  <button className="daemon-btn" disabled={finishLoading} onClick={() => handleFinish('keep')}>Keep branch as-is</button>
                  <button className="daemon-btn" disabled={finishLoading} style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }} onClick={() => handleFinish('discard')}>Discard this work</button>
                </div>
              )}
              <button className="daemon-btn" style={{ marginTop: 16, width: '100%', fontSize: 11 }} onClick={() => setShowFinishModal(false)}>Close</button>
            </div>
          </div>
        )}
        {/* Hero section: ring + info */}
        <div className="run-progress-hero">
          <div className="run-progress-ring-wrap">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle className="run-progress-ring-bg" cx="50" cy="50" r={RING_R} />
              <circle
                className={`run-progress-ring-fill${ringClass ? ` ${ringClass}` : ''}`}
                cx="50" cy="50" r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progressPct / 100)}
              />
            </svg>
            <div className="run-progress-ring-pct">{Math.round(progressPct)}%</div>
          </div>
          <div className="run-progress-info">
            <div className="run-progress-headline">
              {effectivelyRunning ? (
                <>⚡ Running</>
              ) : failedTasks.length > 0 ? (
                <span className="run-failed-badge">✗ Run failed</span>
              ) : (
                <span className="run-complete-badge">✓ Complete</span>
              )}
            </div>
            <div className="run-progress-subline">
              {doneTasks.length} of {runTasks.length} tasks done
              {costUsd > 0 && ` · $${costUsd.toFixed(3)}`}
              {effectivelyRunning && elapsed > 0 && ` · ${fmtElapsed(elapsed)}`}
            </div>
            {inProgressTask && (
              <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 4, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ⚡ {inProgressTask.title}
              </div>
            )}
            <div className="run-progress-bar-wrap" style={{ marginTop: 10 }}>
              <div className={`run-progress-bar ${barClass}`} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>

        {/* Question banner — shown whenever a question is waiting regardless of expansion */}
        {activeQuestion && (
          <div className="run-question-banner">
            <div className="run-question-banner-header">
              <span className="run-question-banner-icon">❓</span>
              <span className="run-question-banner-title">Question {activeQuestion.index}/{activeQuestion.total} — needs your answer</span>
              <span className="run-question-banner-timer">{questionSecsLeft}s</span>
            </div>
            <div className="run-question-banner-text">{activeQuestion.text}</div>
            {activeQuestion.options ? (
              <div className="run-question-banner-options">
                {activeQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    className={`run-question-option${questionAnswer === opt ? ' selected' : ''}`}
                    onClick={() => setQuestionAnswer(opt)}
                  >{opt}</button>
                ))}
              </div>
            ) : (
              <input
                className="run-question-input"
                value={questionAnswer}
                onChange={(e) => setQuestionAnswer((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleQuestionSubmit(); }}
                placeholder="Type your answer…"
                autoFocus
              />
            )}
            <button className="run-question-submit" onClick={handleQuestionSubmit}>Send answer ↵</button>
          </div>
        )}

        {/* Stuck task banner */}
        {isStuck && (
          <div className="run-stuck-banner">
            <span>⚠ Process ended with tasks still in progress — server will auto-reset on next connect.</span>
            <button className="run-stuck-reset-btn" onClick={async () => {
              await apiPost(`/api/projects/${project.id}/retry`, {
                executionModel,
                taskReviewModel,
                runReviewModel,
                qualityReviewModel: qualityReviewModel || undefined,
                worktrees: worktrees || undefined,
                ...buildRunRuntimePayload(),
              }).catch(() => {});
              setViewMode('progress');
            }}>↺ Retry now</button>
          </div>
        )}

        {/* Task list */}
        <div className="run-task-list">
          {runTasks.map((task) => {
            const iconMap: Record<string, string> = { completed: '✓', failed: '✗', in_progress: '⚡', skipped: '⊘', pending: '○', retrying: '↩' };
            const statusLabel: Record<string, string> = { completed: 'done', failed: 'failed', in_progress: 'running', skipped: 'skipped', pending: 'waiting', retrying: 'retrying' };
            const isExpanded = expandedTasks.has(task.id);
            const isActiveTask = task.status === 'in_progress';
            const hasDetail = task.description || task.resultSummary || (task.filesWritten?.length ?? 0) > 0 || (task.acceptanceCriteria?.length ?? 0) > 0 || isActiveTask;
            const toggleExpand = () => setExpandedTasks((prev) => {
              const next = new Set(prev);
              if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
              return next;
            });
            return (
              <div key={task.id} className={`run-task-item run-task-${task.status}`} style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0, cursor: hasDetail ? 'pointer' : 'default' }} onClick={hasDetail ? toggleExpand : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  <div className={`run-task-icon-wrap status-${task.status}`}>
                    {task.status === 'in_progress' ? <span className="spin">⚡</span> : iconMap[task.status] ?? '○'}
                  </div>
                  <span className="run-task-title">{task.title}</span>
                  {task.durationMs && task.durationMs > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{task.durationMs > 60000 ? `${Math.floor(task.durationMs/60000)}m` : `${Math.round(task.durationMs/1000)}s`}</span>
                  )}
                  {(task.retries ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>↺{task.retries}</span>
                  )}
                  <span className="run-task-status-label">{statusLabel[task.status] ?? task.status}</span>
                  {task.status === 'failed' && !effectivelyRunning && (
                    <button className="run-task-retry-btn" onClick={(e) => { e.stopPropagation(); handleRetryTask(task.id); }}>↺</button>
                  )}
                  {hasDetail && <span className={`run-task-expand-btn${isExpanded ? ' open' : ''}`}>▶</span>}
                </div>
                {isExpanded && hasDetail && (
                  <div className="run-task-detail" onClick={(e) => e.stopPropagation()}>
                    {/* Live output for the active task */}
                    {isActiveTask && taskOutputLines.length > 0 && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Live output</div>
                        <div className="run-task-live-output">
                          {taskOutputLines.map((line, i) => (
                            <div key={i} className="run-task-live-line">{line}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {isActiveTask && taskOutputLines.length === 0 && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Live output</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>Waiting for output…</div>
                      </div>
                    )}
                    {task.description && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Description</div>
                        <div className="run-task-detail-text">{task.description}</div>
                      </div>
                    )}
                    {task.resultSummary && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Result</div>
                        <div className="run-task-detail-text">{task.resultSummary}</div>
                      </div>
                    )}
                    {(task.acceptanceCriteria?.length ?? 0) > 0 && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Acceptance Criteria</div>
                        <ul className="run-task-detail-criteria">
                          {task.acceptanceCriteria!.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}
                    {(task.filesWritten?.length ?? 0) > 0 && (
                      <div className="run-task-detail-section">
                        <div className="run-task-detail-label">Files written</div>
                        <div className="run-task-detail-files">
                          {task.filesWritten!.map((f) => <span key={f} className="run-task-detail-file">{f.replace(/^.*\/([^/]+)$/, '$1')}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {runTasks.length === 0 && effectivelyRunning && (
            <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '40px 8px', textAlign: 'center' }}>
              <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto 8px' }} />
              Spinning up tasks…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="run-progress-footer">
          {requestError ? (
            <div style={{ flexBasis: '100%' }}>
              <InlineErrorBanner
                title="Run request failed"
                message={requestError}
                actionLabel="Use defaults"
                onAction={clearRunRuntimeOverrides}
              />
            </div>
          ) : null}
          {effectivelyRunning && (
            <button
              className="daemon-btn"
              onClick={() => fetch(`/api/projects/${project.id}/stop`, { method: 'POST' }).catch(() => {})}
              style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}
            >✕ Stop</button>
          )}
          {!effectivelyRunning && failedTasks.length > 0 && (
            <>
              <ModelPicker value={executionModel} onChange={setExecutionModel} label="Execution" />
              <ModelPicker value={taskReviewModel} onChange={setTaskReviewModel} label="Task Review" />
              <ModelPicker value={runReviewModel} onChange={setRunReviewModel} label="Run Review" />
              <ModelPicker value={qualityReviewModel} onChange={setQualityReviewModel} label="Quality Review" />
              <details className="run-advanced-options" style={{ minWidth: 280 }}>
                <summary className="run-advanced-toggle">Runtime</summary>
                <div className="run-advanced-body">
                  <RuntimeRouteSummaryBar
                    routes={[
                      { label: 'Execution', route: { engine: projectConfig?.engine, provider: projectConfig?.provider, modelId: projectConfig?.executionModelId }, override: executionOverrideRoute },
                      { label: 'Validation', route: projectConfig?.validationRuntime, override: validationOverrideRoute },
                      { label: 'Review', route: projectConfig?.reviewRuntime, override: reviewOverrideRoute },
                    ]}
                  />
                  <RuntimeConfigFields
                    title="Execution route"
                    engine={executionEngine}
                    provider={executionProvider}
                    modelId={executionModelId}
                    onEngineChange={setExecutionEngine}
                    onProviderChange={setExecutionProvider}
                    onModelIdChange={setExecutionModelId}
                    onClear={clearRunRuntimeOverrides}
                    hint="Execution defaults come from project config. Override here only when this retry needs a specific implementation route."
                    defaultRoute={{ engine: projectConfig?.engine, provider: projectConfig?.provider, modelId: projectConfig?.executionModelId }}
                  />
                  <RuntimeConfigFields
                    title="Validation route"
                    engine={validationEngine}
                    provider={validationProvider}
                    modelId={validationModelId}
                    onEngineChange={setValidationEngine}
                    onProviderChange={setValidationProvider}
                    onModelIdChange={setValidationModelId}
                    onClear={clearRunRuntimeOverrides}
                    hint="Validation can stay on the project default or be pinned to a cheaper or stricter review route."
                    defaultRoute={projectConfig?.validationRuntime}
                  />
                  <RuntimeConfigFields
                    title="Review route"
                    engine={reviewEngine}
                    provider={reviewProvider}
                    modelId={reviewModelId}
                    onEngineChange={setReviewEngine}
                    onProviderChange={setReviewProvider}
                    onModelIdChange={setReviewModelId}
                    onClear={clearRunRuntimeOverrides}
                    hint="Holistic review usually shares the validation route, but you can pin it separately for a final pass."
                    defaultRoute={projectConfig?.reviewRuntime}
                  />
                </div>
              </details>
              <button className="daemon-btn primary" onClick={handleRetryFailed}>
                ↺ Retry failed ({failedTasks.length})
              </button>
            </>
          )}
          {!effectivelyRunning && (
            <button className="daemon-btn" onClick={() => { setRunTasks([]); setElapsed(0); setViewMode('config'); }} style={{ fontSize: 11 }}>
              ← New chain
            </button>
          )}
        </div>
      </div>
    );
  }

  // Config view: chain builder (default)
  return (
    <div className="run-split">
      {/* ── Left panel: Ready to Deliver ── */}
      <div className="run-left">
        <div className="run-left-header">Ready to Deliver</div>
        <div className="run-left-body">
          {(() => {
            const readyPlans = savedPlans.filter(p => p.status !== 'completed');
            if (readyPlans.length === 0) return (
              <div style={{ padding: '16px 8px', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
                No ready plans.<br />Create them in the Plan tab.
              </div>
            );
            return readyPlans.map((plan) => {
              const inChain = chainPlanIds.has(plan.id);
              return (
                <div
                  key={plan.id}
                  className={`run-plan-card${inChain ? ' in-chain' : ''}`}
                  draggable
                  onDragStart={(e) => handlePlanDragStart(e, plan)}
                  title={inChain ? 'Already in chain' : 'Drag to chain'}
                >
                  <span className="run-plan-drag-handle">⠿</span>
                  <div className="run-plan-info">
                    <div className="run-plan-name">
                      {inChain && <span style={{ color: '#22c55e', marginRight: 4 }}>✓</span>}
                      {plan.name}
                    </div>
                    <div className="run-plan-tasks">{plan.taskCount} tasks · {relativeTime(plan.createdAt)}</div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ── Right panel: Chain canvas ── */}
      <div className="run-right">
        {/* Traffic light */}
        <div className="run-traffic-light">
          <IconTrafficLight status={trafficStatus} />
          <div className="run-traffic-status-text">
            <div className="run-traffic-title">
              {chainSteps.length === 0 ? 'No chain' : 'Ready'}
            </div>
            <div className="run-traffic-sub">
              {chainSteps.length === 0
                ? 'Drag plans from the left to build a chain'
                : `${chainSteps.length} plan${chainSteps.length !== 1 ? 's' : ''} queued`}
            </div>
          </div>
        </div>

        {/* Chain name */}
        <div className="chain-name-row">
          <input
            className="chain-name-input"
            placeholder="Name this chain…"
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
          />
        </div>

        {/* Chain canvas */}
        <div
          className="chain-canvas"
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {chainSteps.length === 0 ? (
            <div
              className={`chain-empty-drop${dropOnEmpty ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDropOnEmpty(true); }}
              onDragLeave={() => setDropOnEmpty(false)}
              onDrop={(e) => { e.stopPropagation(); setDropOnEmpty(false); handleCanvasDrop(e); }}
            >
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>⠿⠿</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Drag plans here to build your chain</div>
              <div style={{ fontSize: 11 }}>Drop plan cards from the left panel to add steps</div>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 340 }}>
              {/* Drop zone before first step */}
              <div
                className={`chain-drop-zone${dragOverIndex === 0 ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(0); }}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDropZoneDrop(e, 0)}
              />
              {chainSteps.map((step, i) => (
                <div key={step.id} className="chain-step-wrapper">
                  <div
                    className={`chain-step-card${draggingStepId === step.id ? ' dragging' : ''}`}
                    draggable
                    onDragStart={(e) => handleStepDragStart(e, step.id)}
                    onDragEnd={() => { setDraggingStepId(null); setDragOverIndex(null); }}
                  >
                    <span className="chain-step-drag">⠿⠿</span>
                    <div className="chain-step-num">{i + 1}</div>
                    <div className="chain-step-info">
                      <div className="chain-step-title">{step.planName}</div>
                      <div className="chain-step-type">{step.taskCount} tasks · Run</div>
                    </div>
                    <button
                      className="chain-step-delete"
                      onClick={() => removeStep(step.id)}
                      title="Remove step"
                    >×</button>
                  </div>
                  {i < chainSteps.length - 1 && (
                    <div className="chain-connector">
                      <div className="chain-connector-line" />
                      <div className="chain-connector-arrow">▼</div>
                      <div className="chain-connector-line" />
                    </div>
                  )}
                  {/* Drop zone after each step */}
                  <div
                    className={`chain-drop-zone${dragOverIndex === i + 1 ? ' drag-over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i + 1); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => handleDropZoneDrop(e, i + 1)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with model pickers + run button */}
        <div className="chain-footer" style={{ flexDirection: 'column', gap: 8 }}>
          {requestError ? (
            <InlineErrorBanner
              title="Run request failed"
              message={requestError}
              actionLabel="Use defaults"
              onAction={clearRunRuntimeOverrides}
            />
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ModelPicker value={executionModel} onChange={setExecutionModel} label="Execution" />
            <ModelPicker value={taskReviewModel} onChange={setTaskReviewModel} label="Task Review" />
            <ModelPicker value={runReviewModel} onChange={setRunReviewModel} label="Run Review" />
            <ModelPicker value={qualityReviewModel} onChange={setQualityReviewModel} label="Quality Review" />
            <button
              className="daemon-btn primary"
              disabled={chainSteps.length === 0}
              onClick={handleRunChain}
            >
              {`▶ Run Chain (${chainSteps.length})`}
            </button>
            {chainSteps.length > 0 && (
              <button className="daemon-btn" onClick={() => setChainSteps([])} style={{ fontSize: 11 }}>Clear</button>
            )}
          </div>
          {/* Advanced options */}
          <details className="run-advanced-options">
            <summary className="run-advanced-toggle">Advanced options</summary>
            <div className="run-advanced-body">
              <RuntimeRouteSummaryBar
                routes={[
                  { label: 'Execution', route: { engine: projectConfig?.engine, provider: projectConfig?.provider, modelId: projectConfig?.executionModelId }, override: executionOverrideRoute },
                  { label: 'Validation', route: projectConfig?.validationRuntime, override: validationOverrideRoute },
                  { label: 'Review', route: projectConfig?.reviewRuntime, override: reviewOverrideRoute },
                ]}
              />
              <label className="run-advanced-row">
                <input type="checkbox" checked={parallel} onChange={e => setParallel((e.target as HTMLInputElement).checked)} />
                <span>Parallel task execution</span>
                {parallel && (
                  <input type="number" min={1} max={8} value={maxParallel} onChange={e => setMaxParallel(Number((e.target as HTMLInputElement).value))} style={{ width: 48 }} />
                )}
              </label>
              <label className="run-advanced-row" title="Each task runs in its own git worktree — merges back on success, discards on failure">
                <input type="checkbox" checked={worktrees} onChange={e => setWorktrees((e.target as HTMLInputElement).checked)} />
                <span>Worktree isolation per task</span>
              </label>
              <label className="run-advanced-row">
                <input type="checkbox" checked={noValidate} onChange={e => setNoValidate((e.target as HTMLInputElement).checked)} />
                <span>Skip validation</span>
              </label>
              <label className="run-advanced-row">
                <span>Max retries</span>
                <input type="number" min={1} max={5} value={maxRetries} onChange={e => setMaxRetries(Number((e.target as HTMLInputElement).value))} style={{ width: 48 }} />
              </label>
              <label className="run-advanced-row">
                <span>Thinking effort</span>
                <select value={effort} onChange={e => setEffort((e.target as HTMLSelectElement).value)}>
                  <option value="">default</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high (extended)</option>
                  <option value="max">max (opus only)</option>
                </select>
              </label>
              <RuntimeConfigFields
                title="Execution route"
                engine={executionEngine}
                provider={executionProvider}
                modelId={executionModelId}
                onEngineChange={setExecutionEngine}
                onProviderChange={setExecutionProvider}
                onModelIdChange={setExecutionModelId}
                onClear={clearRunRuntimeOverrides}
                hint="Execution defaults come from project config. Override here only when this chain needs a specific implementation route."
                defaultRoute={{ engine: projectConfig?.engine, provider: projectConfig?.provider, modelId: projectConfig?.executionModelId }}
              />
              <RuntimeConfigFields
                title="Validation route"
                engine={validationEngine}
                provider={validationProvider}
                modelId={validationModelId}
                onEngineChange={setValidationEngine}
                onProviderChange={setValidationProvider}
                onModelIdChange={setValidationModelId}
                onClear={clearRunRuntimeOverrides}
                hint="Validation can stay on the project default or be pinned to a cheaper or stricter review route."
                defaultRoute={projectConfig?.validationRuntime}
              />
              <RuntimeConfigFields
                title="Review route"
                engine={reviewEngine}
                provider={reviewProvider}
                modelId={reviewModelId}
                onEngineChange={setReviewEngine}
                onProviderChange={setReviewProvider}
                onModelIdChange={setReviewModelId}
                onClear={clearRunRuntimeOverrides}
                hint="Holistic review usually shares the validation route, but you can pin it separately for a final pass."
                defaultRoute={projectConfig?.reviewRuntime}
              />
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── RichMessage ────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  Bash: '⌨', Read: '📖', Write: '✏️', Edit: '✏️', Grep: '🔍', Glob: '🗂',
  Agent: '🤖', WebFetch: '🌐', WebSearch: '🌐', TodoWrite: '📝', TodoRead: '📝',
};

function ToolBlock({ block, role }: { block: CCBlock; role: 'user' | 'assistant' }) {
  const [open, setOpen] = useState(false);

  if (block.type === 'tool_use') {
    const icon = TOOL_ICONS[block.toolName ?? ''] ?? '🔧';
    const name = block.toolName ?? '';
    const input = block.toolInput ?? {};
    const preview = toolPreview(name, input);

    // Extract the "main content" to show expanded
    let expandedContent = '';
    let expandedLang = '';
    if (name === 'Bash') {
      expandedContent = String(input.command ?? '');
      expandedLang = 'bash';
    } else if (name === 'Write') {
      expandedContent = String(input.content ?? '').slice(0, 6000);
      expandedLang = String(input.file_path ?? '').split('.').pop() ?? '';
    } else if (name === 'Edit') {
      expandedContent = `old:\n${String(input.old_string ?? '').slice(0, 2000)}\n\nnew:\n${String(input.new_string ?? '').slice(0, 2000)}`;
      expandedLang = '';
    } else {
      expandedContent = JSON.stringify(input, null, 2);
    }

    return (
      <div className="tool-block tool-call" onClick={() => setOpen((v) => !v)}>
        <div className="tool-block-header">
          <span className="tool-block-icon">{icon}</span>
          <span className="tool-block-name">{name}</span>
          {preview && <span className="tool-block-preview">{preview}</span>}
          <span className="tool-block-toggle">{open ? '▾' : '▸'}</span>
        </div>
        {open && expandedContent && (
          <div className="tool-block-expanded">
            {expandedLang === 'bash' ? (
              <pre className="tool-block-code bash"><code>{expandedContent}</code></pre>
            ) : (
              <pre className="tool-block-code"><code>{expandedContent}</code></pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (block.type === 'tool_result') {
    const content = block.resultContent ?? '';
    const lines = content.split('\n');
    const preview = lines[0]?.slice(0, 140) ?? '';
    const hasMore = lines.length > 1 || content.length > 140;

    return (
      <div className={`tool-block tool-result${block.isError ? ' error' : ''}`} onClick={() => hasMore ? setOpen((v) => !v) : undefined}>
        <div className="tool-block-header">
          <span className="tool-block-icon" style={{ color: block.isError ? '#ef4444' : 'rgba(148,163,184,0.7)' }}>
            {block.isError ? '✗' : '✓'}
          </span>
          <span className="tool-block-preview" style={{ flex: 1, fontFamily: "'SF Mono', monospace", fontSize: 10 }}>
            {open ? '' : preview}
            {!open && hasMore && <span style={{ opacity: 0.5 }}> …</span>}
          </span>
          {hasMore && <span className="tool-block-toggle">{open ? '▾' : '▸'}</span>}
        </div>
        {open && (
          <pre className="tool-block-code" style={{ color: block.isError ? '#fca5a5' : undefined }}>
            <code>{content}</code>
          </pre>
        )}
      </div>
    );
  }

  return null;
}

function toolPreview(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash') return String(input.command ?? '').slice(0, 60);
  if (name === 'Read') return String(input.file_path ?? '').replace(/^.*\//, '');
  if (name === 'Write' || name === 'Edit') return String(input.file_path ?? '').replace(/^.*\//, '');
  if (name === 'Grep') return `"${String(input.pattern ?? '').slice(0, 30)}"`;
  if (name === 'Glob') return String(input.pattern ?? '');
  if (name === 'Agent') return String(input.description ?? '').slice(0, 50);
  if (name === 'WebSearch') return String(input.query ?? '').slice(0, 50);
  if (name === 'WebFetch') return String(input.url ?? '').slice(0, 50);
  return '';
}

// ── Lightweight markdown renderer ──────────────────────────────────────

function renderInline(text: string, key?: number): React.ReactNode {
  // Handle **bold**, *italic*, `inline code`
  const segments = text.split(/(``[^`]+``|`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return (
    <React.Fragment key={key}>
      {segments.map((seg, i) => {
        if ((seg.startsWith('``') && seg.endsWith('``')) || (seg.startsWith('`') && seg.endsWith('`'))) {
          const inner = seg.startsWith('``') ? seg.slice(2, -2) : seg.slice(1, -1);
          return <code key={i} style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 3, fontSize: '0.9em', fontFamily: "'SF Mono', monospace", color: '#e8703a' }}>{inner}</code>;
        }
        if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={i}>{seg.slice(2, -2)}</strong>;
        if (seg.startsWith('*') && seg.endsWith('*')) return <em key={i}>{seg.slice(1, -1)}</em>;
        return <React.Fragment key={i}>{seg}</React.Fragment>;
      })}
    </React.Fragment>
  );
}

function MarkdownText({ text }: { text: string }) {
  // Split on fenced code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, pi) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3).split('\n');
          const lang = lines[0].trim();
          const code = lines.slice(1).join('\n').replace(/```\s*$/, '').trimEnd();
          return (
            <div key={pi} style={{ margin: '8px 0', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {lang && (
                <div style={{ background: 'var(--bg-card)', padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}>
                  {lang}
                </div>
              )}
              <pre style={{ margin: 0, padding: '10px', background: 'var(--bg-primary)', fontSize: 11, lineHeight: 1.6, overflowX: 'auto', fontFamily: "'SF Mono', 'Fira Code', monospace", color: 'var(--text-secondary)', whiteSpace: 'pre' }}>
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        // Prose: render line by line
        const lines = part.split('\n');
        return (
          <div key={pi}>
            {lines.map((line, li) => {
              const hMatch = line.match(/^(#{1,3})\s+(.*)/);
              if (hMatch) {
                const sz = [18, 15, 13][hMatch[1].length - 1];
                return <div key={li} style={{ fontWeight: 700, fontSize: sz, margin: '8px 0 3px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(hMatch[2])}</div>;
              }
              const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
              if (bulletMatch) {
                const indent = bulletMatch[1].length;
                return <div key={li} style={{ display: 'flex', gap: 6, paddingLeft: indent * 8, lineHeight: 1.5 }}><span style={{ opacity: 0.5, flexShrink: 0, marginTop: 1 }}>•</span><span>{renderInline(bulletMatch[3])}</span></div>;
              }
              if (line.trim() === '') return <div key={li} style={{ height: 6 }} />;
              return <div key={li} style={{ lineHeight: 1.5 }}>{renderInline(line)}</div>;
            })}
          </div>
        );
      })}
    </>
  );
}

function RichMessage({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const hasBlocks = msg.blocks && msg.blocks.length > 0;
  const isUser = msg.role === 'user';

  // Detect pure tool-cycle user messages (only tool_result blocks, no human text)
  // These are API-level plumbing, not human-typed messages — render compactly without "you" bubble
  const isPureToolCycle = isUser && hasBlocks && msg.blocks!.every((b) => b.type === 'tool_result') && !msg.content.trim();
  if (isPureToolCycle) {
    return (
      <div className="chat-tool-cycle">
        {msg.blocks!.map((block, i) => <ToolBlock key={i} block={block} role={msg.role} />)}
      </div>
    );
  }

  const hasOnlyText = !hasBlocks || msg.blocks!.every((b) => b.type === 'text');

  const tsLabel = msg.ts && msg.ts !== '__streaming__'
    ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div className={`chat-msg ${msg.role}`}>
      <div className="chat-msg-role">
        <span>{isUser ? '👤 you' : '🤖 claude'}</span>
        {tsLabel && <span className="chat-msg-ts">{tsLabel}</span>}
      </div>
      {hasOnlyText ? (
        <div>
          {isUser
            ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
            : <MarkdownText text={msg.content} />}
          {isStreaming && <span className="chat-cursor" />}
        </div>
      ) : (
        <div className="chat-msg-blocks">
          {msg.blocks!.map((block, i) => {
            if (block.type === 'text') {
              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  {isUser
                    ? <span style={{ whiteSpace: 'pre-wrap' }}>{block.text}</span>
                    : <MarkdownText text={block.text ?? ''} />}
                  {isStreaming && i === msg.blocks!.length - 1 && <span className="chat-cursor" />}
                </div>
              );
            }
            return <ToolBlock key={i} block={block} role={msg.role} />;
          })}
        </div>
      )}
    </div>
  );
}

// ── ActivityBadge ──────────────────────────────────────────────────────

function ActivityBadge({ stats, isActive }: { stats: CCSessionStats; isActive: boolean }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      if (!stats.firstTs) return;
      const ms = Date.now() - new Date(stats.firstTs).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setElapsed(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    update();
    if (!isActive) return;
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [stats.firstTs, isActive]);

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheWriteTokens + stats.cacheReadTokens;
  const tokLabel = totalTokens >= 1000000
    ? `${(totalTokens / 1000000).toFixed(1)}M`
    : totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens);

  return (
    <div className={`activity-badge${isActive ? ' active' : ''}`}>
      {isActive && <span className="activity-dot" />}
      <span className="activity-text">
        {isActive ? (stats.lastTool ? `${stats.lastTool}…` : 'Working…') : 'idle'}
      </span>
      <span className="activity-sep">·</span>
      <span className="activity-stat">⏱ {elapsed}</span>
      <span className="activity-sep">·</span>
      <span className="activity-stat">↓ {tokLabel} tok</span>
      <span className="activity-sep">·</span>
      <span className="activity-stat">≈ ${stats.costUsd.toFixed(4)}</span>
      {stats.model && (
        <>
          <span className="activity-sep">·</span>
          <span className="activity-stat" style={{ opacity: 0.7 }}>{stats.model.replace('claude-', '').replace(/-\d+$/, '')}</span>
        </>
      )}
    </div>
  );
}

// ── CcStatusBar — bottom CLI-style status bar ─────────────────────────

function CcStatusBar({ stats, isActive }: { stats: CCSessionStats; isActive: boolean }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      if (!stats.firstTs) { setElapsed(''); return; }
      const ms = Date.now() - new Date(stats.firstTs).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setElapsed(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [stats.firstTs]);

  const totalTokens = stats.inputTokens + stats.outputTokens + stats.cacheWriteTokens + stats.cacheReadTokens;
  const tokLabel = totalTokens >= 1_000_000
    ? `${(totalTokens / 1_000_000).toFixed(1)}M`
    : totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : String(totalTokens);

  const label = isActive
    ? (stats.lastTool ? stats.lastTool : 'Working')
    : 'idle';

  return (
    <div className={`cc-status-bar${isActive ? ' active' : ''}`}>
      {isActive && <span className="cc-status-asterisk">*</span>}
      <span style={{ fontWeight: 600 }}>{label}</span>
      {elapsed && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>⏱ {elapsed}</span>
        </>
      )}
      {totalTokens > 0 && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>↓ {tokLabel} tok</span>
        </>
      )}
      {stats.costUsd > 0 && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>≈ ${stats.costUsd.toFixed(4)}</span>
        </>
      )}
      {stats.model && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ opacity: 0.6 }}>{stats.model.replace('claude-', '').replace(/-\d{8}$/, '')}</span>
        </>
      )}
    </div>
  );
}

// ── DashboardTab ───────────────────────────────────────────────────────

interface DashboardStats {
  totalChats: number;
  ccChats: number;
  cloudyChats: number;
  totalMessages: number;
  activeCC: boolean;
  specFiles: number;
  lastActive: string | null;
}

function DashboardTab({ project, onSwitchTab }: { project: ProjectStatusSnapshot; onSwitchTab: (tab: ActiveTab) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    async function load() {
      const [chatsRes, planRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/chats`).catch(() => null),
        fetch(`/api/projects/${project.id}/plan`).catch(() => null),
      ]);
      const chats: ChatSessionMeta[] = chatsRes?.ok ? await chatsRes.json() : [];
      const plan = planRes?.ok ? await planRes.json() : { specs: [] };
      const ccChats = chats.filter((c) => c.source === 'claude-code');
      const cloudyChats = chats.filter((c) => c.source === 'cloudy');
      setStats({
        totalChats: chats.length,
        ccChats: ccChats.length,
        cloudyChats: cloudyChats.length,
        totalMessages: chats.reduce((s, c) => s + c.messageCount, 0),
        activeCC: ccChats.some((c) => c.locked),
        specFiles: (plan.specs ?? []).length,
        lastActive: chats[0]?.updatedAt ?? null,
      });
    }
    load();
  }, [project.id]);

  const statusColor = project.status === 'running' ? '#22c55e' : project.status === 'error' ? '#ef4444' : '#6b7280';
  const statusLabel = project.status === 'running' ? '● Running' : project.status === 'error' ? '● Error' : '○ Idle';

  return (
    <div className="dashboard-tab">
      {/* Project header */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-name">{project.name}</div>
        <div className="dashboard-hero-path">{project.path}</div>
        <div className="dashboard-hero-status" style={{ color: statusColor }}>{statusLabel}</div>
      </div>

      {/* Stat cards */}
      <div className="dashboard-cards">
        <div className="dashboard-card" onClick={() => onSwitchTab('chat')} title="Go to Chat">
          <div className="dashboard-card-icon"><IconChat size={20} color="#a78bfa" /></div>
          <div className="dashboard-card-value">{stats?.totalChats ?? '—'}</div>
          <div className="dashboard-card-label">conversations</div>
          <div className="dashboard-card-sub">
            {stats ? `${stats.ccChats} CC · ${stats.cloudyChats} Cloudy` : ''}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-icon"><IconAI size={20} color="#e8703a" /></div>
          <div className="dashboard-card-value">{stats?.totalMessages ?? '—'}</div>
          <div className="dashboard-card-label">messages</div>
          <div className="dashboard-card-sub">
            {stats?.lastActive ? `last ${relativeTime(stats.lastActive)}` : ''}
          </div>
        </div>

        <div className="dashboard-card" onClick={() => onSwitchTab('plan')} title="Go to Build">
          <div className="dashboard-card-icon"><IconChecklist size={20} color="#38bdf8" /></div>
          <div className="dashboard-card-value">{stats?.specFiles ?? '—'}</div>
          <div className="dashboard-card-label">spec files</div>
          <div className="dashboard-card-sub">in plan</div>
        </div>

        <div className="dashboard-card" onClick={() => onSwitchTab('run')} title="Go to Run">
          <div className="dashboard-card-icon"><IconRocket size={20} color="#fb923c" /></div>
          <div className="dashboard-card-value">{project.runCount ?? 0}</div>
          <div className="dashboard-card-label">runs</div>
          <div className="dashboard-card-sub">
            {project.lastRunAt ? `last ${relativeTime(project.lastRunAt)}` : 'never run'}
          </div>
        </div>
      </div>

      {/* Live CC session callout */}
      {stats?.activeCC && (
        <div className="dashboard-live-banner" onClick={() => onSwitchTab('chat')}>
          <span style={{ color: '#ef4444' }}>●</span>
          <span>Claude Code CLI session active — <u>watch live</u></span>
        </div>
      )}

      {/* Quick actions */}
      <div className="dashboard-actions">
        <button className="daemon-btn" onClick={() => onSwitchTab('chat')}>
          <IconChat size={13} color="currentColor" /> New Chat
        </button>
        <button className="daemon-btn" onClick={() => onSwitchTab('plan')}>
          <IconChecklist size={13} color="currentColor" /> Build
        </button>
        <button className="daemon-btn" onClick={() => onSwitchTab('run')}>
          <IconRocket size={13} color="currentColor" /> Run
        </button>
      </div>
    </div>
  );
}

// ── Slash commands registry ────────────────────────────────────────────

const SLASH_COMMANDS = [
  { name: 'help',    description: 'Show available commands',           usage: '/help' },
  { name: 'clear',   description: 'Start a new chat session',          usage: '/clear' },
  { name: 'cost',    description: 'Show token usage and cost for session', usage: '/cost' },
  { name: 'model',   description: 'Switch model (haiku/sonnet/opus)',  usage: '/model <model>' },
  { name: 'status',  description: 'Show project status',               usage: '/status' },
  { name: 'memory',  description: 'Open project memory / CLAUDE.md',  usage: '/memory' },
  { name: 'plan',    description: 'Add a spec file to the Plan tab',   usage: '/plan <file>' },
  { name: 'compact', description: 'Compact context (CLI only)',         usage: '/compact' },
] as const;

type SlashCommand = typeof SLASH_COMMANDS[number];

// ── ChatTab ────────────────────────────────────────────────────────────

interface CCBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolId?: string;
  toolUseId?: string;
  resultContent?: string;
  isError?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  blocks?: CCBlock[];
  ts: string;
}

interface ChatSessionMeta {
  id: string;
  name: string;
  model: string;
  source: 'cloudy' | 'claude-code';
  locked: boolean;
  messageCount: number;
  updatedAt: string;
  preview: string;
}

interface ChatSessionFull extends ChatSessionMeta {
  messages: ChatMessage[];
}

interface ChatTabProps {
  project: ProjectStatusSnapshot;
  onSwitchTab: (tab: ActiveTab) => void;
  initialSessionId?: string | null;
  onSessionSelect?: (sessionId: string | null) => void;
}

function ChatTab({ project, onSwitchTab, initialSessionId, onSessionSelect }: ChatTabProps) {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initialSessionId ?? null);
  const [activeSession, setActiveSession] = useState<ChatSessionFull | null>(null);
  // Older CC segments for the currently-open CC session (newest-first after the active one)
  const [ccSegments, setCcSegments] = useState<ChatSessionMeta[]>([]);
  const [loadedSegmentIdx, setLoadedSegmentIdx] = useState(0);
  const [prependedMessages, setPrependedMessages] = useState<ChatMessage[]>([]);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [liveWatch, setLiveWatch] = useState(true); // auto-poll CC sessions
  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [lockedMsg, setLockedMsg] = useState(false);
  const [ccStats, setCcStats] = useState<CCSessionStats | null>(null);
  const [cumulativeStats, setCumulativeStats] = useState<CCSessionStats | null>(null);
  const [cloudyStats, setCloudyStats] = useState<CCSessionStats | null>(null);
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>(() => {
    const saved = localStorage.getItem('chat-effort');
    return (saved === 'low' || saved === 'medium' || saved === 'high') ? saved : 'medium';
  });
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number>(() => {
    return parseFloat(localStorage.getItem('chat-budget') ?? '0') || 0;
  });
  const [yolo, setYolo] = useState<boolean>(() => localStorage.getItem('chat-yolo') !== 'false');
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; items: SlashCommand[]; idx: number }>({ open: false, items: [], idx: 0 });
  const [msgFilter, setMsgFilter] = useState<'all' | 'mine' | 'claude' | 'tools'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist effort + budget + yolo to localStorage
  useEffect(() => { localStorage.setItem('chat-effort', effort); }, [effort]);
  useEffect(() => { localStorage.setItem('chat-budget', String(maxBudgetUsd)); }, [maxBudgetUsd]);
  useEffect(() => { localStorage.setItem('chat-yolo', String(yolo)); }, [yolo]);

  const model = activeSession?.model ?? 'sonnet';

  const loadSessions = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/chats`).catch(() => null);
    if (res?.ok) {
      const data: ChatSessionMeta[] = await res.json();
      setSessions(data);
    }
  }, [project.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Auto-select session from URL once sessions are loaded
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current || !initialSessionId || sessions.length === 0) return;
    const found = sessions.find((s) => s.id === initialSessionId);
    if (found) { didAutoSelect.current = true; selectSession(found); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, initialSessionId]);

  // Load full session when selected
  useEffect(() => {
    if (!activeSessionId) { setActiveSession(null); return; }
    fetch(`/api/projects/${project.id}/chats/${activeSessionId}`)
      .then((r) => r.json())
      .then((s: ChatSessionFull) => setActiveSession(s))
      .catch(() => {});
  }, [activeSessionId, project.id]);

  // Live polling for CC sessions
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!activeSessionId || !lockedMsg || !liveWatch) return;

    // Poll every 2s while watching a locked CC session
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/projects/${project.id}/chats/${activeSessionId}`).catch(() => null);
      if (!res?.ok) return;
      const s: ChatSessionFull = await res.json();
      setActiveSession((prev) => {
        // Only update if message count changed
        if (prev && prev.messages.length === s.messages.length) return prev;
        return s;
      });
      // Refresh session list too (message count / locked status may change)
      loadSessions();

      // Also fetch stats for active CC session + update cumulative
      if (activeSessionId?.startsWith('cc:')) {
        const statsRes = await fetch(`/api/projects/${project.id}/chats/${activeSessionId}/stats`).catch(() => null);
        if (statsRes?.ok) {
          const st: CCSessionStats = await statsRes.json();
          setCcStats(st);
        }
        // Refresh cumulative (older segments don't change, but active one does)
        if (ccSegments.length > 0) {
          const allIds = [activeSessionId, ...ccSegments.map((s) => s.id)];
          const results = await Promise.all(
            allIds.map((id) =>
              fetch(`/api/projects/${project.id}/chats/${id}/stats`)
                .then((r) => r.ok ? r.json() as Promise<CCSessionStats> : null)
                .catch(() => null)
            )
          );
          const valid = results.filter(Boolean) as CCSessionStats[];
          if (valid.length > 0) {
            const merged: CCSessionStats = {
              inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
              costUsd: 0, durationMs: 0, messageCount: 0,
              lastTool: valid[0].lastTool, firstTs: null, lastTs: null, model: valid[0].model,
            };
            for (const s of valid) {
              merged.inputTokens += s.inputTokens;
              merged.outputTokens += s.outputTokens;
              merged.cacheWriteTokens += s.cacheWriteTokens;
              merged.cacheReadTokens += s.cacheReadTokens;
              merged.costUsd += s.costUsd;
              merged.messageCount += s.messageCount;
              if (s.firstTs && (!merged.firstTs || s.firstTs < merged.firstTs)) merged.firstTs = s.firstTs;
              if (s.lastTs && (!merged.lastTs || s.lastTs > merged.lastTs)) merged.lastTs = s.lastTs;
            }
            if (merged.firstTs && merged.lastTs) {
              merged.durationMs = new Date(merged.lastTs).getTime() - new Date(merged.firstTs).getTime();
            }
            setCumulativeStats(merged);
          }
        }
      }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeSessionId, lockedMsg, liveWatch, project.id, loadSessions]);

  // Fetch stats when active CC session changes + compute cumulative across all segments
  useEffect(() => {
    setCloudyStats(null);
    if (!activeSessionId?.startsWith('cc:')) { setCcStats(null); setCumulativeStats(null); return; }
    fetch(`/api/projects/${project.id}/chats/${activeSessionId}/stats`)
      .then((r) => r.json())
      .then((s: CCSessionStats) => setCcStats(s))
      .catch(() => {});
  }, [activeSessionId, project.id]);

  // Cumulative stats: sum all CC segments (older ones + active)
  useEffect(() => {
    if (!activeSessionId?.startsWith('cc:') || ccSegments.length === 0) {
      // No segments — cumulative = same as active stats (handled by display)
      setCumulativeStats(null);
      return;
    }
    const allIds = [activeSessionId, ...ccSegments.map((s) => s.id)];
    Promise.all(
      allIds.map((id) =>
        fetch(`/api/projects/${project.id}/chats/${id}/stats`)
          .then((r) => r.ok ? r.json() as Promise<CCSessionStats> : null)
          .catch(() => null)
      )
    ).then((results) => {
      const valid = results.filter(Boolean) as CCSessionStats[];
      if (valid.length === 0) return;
      const merged: CCSessionStats = {
        inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
        costUsd: 0, durationMs: 0, messageCount: 0,
        lastTool: valid[0].lastTool,
        firstTs: null, lastTs: null,
        model: valid[0].model,
      };
      for (const s of valid) {
        merged.inputTokens += s.inputTokens;
        merged.outputTokens += s.outputTokens;
        merged.cacheWriteTokens += s.cacheWriteTokens;
        merged.cacheReadTokens += s.cacheReadTokens;
        merged.costUsd += s.costUsd;
        merged.messageCount += s.messageCount;
        if (s.firstTs && (!merged.firstTs || s.firstTs < merged.firstTs)) merged.firstTs = s.firstTs;
        if (s.lastTs && (!merged.lastTs || s.lastTs > merged.lastTs)) merged.lastTs = s.lastTs;
      }
      if (merged.firstTs && merged.lastTs) {
        merged.durationMs = new Date(merged.lastTs).getTime() - new Date(merged.firstTs).getTime();
      }
      setCumulativeStats(merged);
    });
  }, [activeSessionId, ccSegments, project.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, streaming]);

  // SSE
  useEffect(() => {
    const es = new EventSource('/api/live');
    es.onmessage = (e) => {
      let event: SseEvent;
      try { event = JSON.parse(e.data); } catch { return; }
      if (event.type === 'chat_token' && event.sessionId === activeSessionId) {
        const token = stripAnsi(event.token as string);
        setActiveSession((prev) => {
          if (!prev) return prev;
          const msgs = [...prev.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant' && last.ts === '__streaming__') {
            msgs[msgs.length - 1] = { ...last, content: last.content + token };
          } else {
            msgs.push({ role: 'assistant', content: token, ts: '__streaming__' });
          }
          return { ...prev, messages: msgs };
        });
      } else if (event.type === 'chat_stats' && event.sessionId === activeSessionId) {
        setCloudyStats((prev) => ({
          inputTokens: (prev?.inputTokens ?? 0) + (event.inputTokens as number ?? 0),
          outputTokens: (prev?.outputTokens ?? 0) + (event.outputTokens as number ?? 0),
          cacheReadTokens: (prev?.cacheReadTokens ?? 0) + (event.cacheReadTokens as number ?? 0),
          cacheWriteTokens: (prev?.cacheWriteTokens ?? 0) + (event.cacheWriteTokens as number ?? 0),
          costUsd: (prev?.costUsd ?? 0) + (event.costUsd as number ?? 0),
          durationMs: (prev?.durationMs ?? 0) + (event.durationMs as number ?? 0),
          messageCount: (prev?.messageCount ?? 0) + 1,
          lastTool: null,
          firstTs: prev?.firstTs ?? new Date().toISOString(),
          lastTs: new Date().toISOString(),
          model: null,
        }));
      } else if (event.type === 'chat_tool_call' && event.sessionId === activeSessionId) {
        // Inject a synthetic tool-call message into the stream
        setActiveSession((prev) => {
          if (!prev) return prev;
          const synth: ChatMessage = {
            role: 'assistant',
            content: '',
            ts: '__tool__',
            blocks: [{ type: 'tool_use', toolName: event.toolName as string, toolInput: event.toolInput as Record<string, unknown>, toolId: '' }],
          };
          return { ...prev, messages: [...prev.messages, synth] };
        });
      } else if (event.type === 'chat_tool_result' && event.sessionId === activeSessionId) {
        setActiveSession((prev) => {
          if (!prev) return prev;
          const synth: ChatMessage = {
            role: 'user',
            content: '',
            ts: '__tool__',
            blocks: [{ type: 'tool_result', resultContent: event.content as string, isError: !!(event.isError), toolUseId: '' }],
          };
          return { ...prev, messages: [...prev.messages, synth] };
        });
      } else if (event.type === 'chat_done' && event.sessionId === activeSessionId) {
        setStreaming(false);
        setActiveSession((prev) => {
          if (!prev) return prev;
          const now = new Date().toISOString();
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.ts === '__streaming__' || m.ts === '__tool__' ? { ...m, ts: now } : m
            ),
          };
        });
        loadSessions();
      } else if (event.type === 'chat_session_created') {
        loadSessions();
      } else if (event.type === 'cc_session_locked' && event.sessionId === activeSessionId) {
        // CLI took over the session — re-lock and stop streaming
        setStreaming(false);
        setLockedMsg(true);
        setActiveSession((prev) => {
          if (!prev) return prev;
          const msgs = prev.messages.map((m) =>
            m.ts === '__streaming__' ? { ...m, ts: new Date().toISOString() } : m
          );
          return {
            ...prev,
            messages: [...msgs, {
              role: 'assistant' as const,
              content: '🔒 Claude Code CLI opened this session — control returned to terminal.',
              ts: new Date().toISOString(),
            }],
          };
        });
        loadSessions();
      }
    };
    return () => es.close();
  }, [activeSessionId, loadSessions]);

  async function createNewSession() {
    const res = await fetch(`/api/projects/${project.id}/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'sonnet' }),
    });
    if (res.ok) {
      const session: ChatSessionFull = await res.json();
      setSessions((prev) => [{
        id: session.id, name: session.name, model: session.model,
        source: 'cloudy', locked: false, messageCount: 0,
        updatedAt: session.updatedAt, preview: '',
      }, ...prev]);
      setActiveSessionId(session.id);
      setActiveSession(session);
      setLockedMsg(false);
      onSessionSelect?.(session.id);
    }
  }

  function selectSession(s: ChatSessionMeta) {
    // Reset segment state on new selection
    setPrependedMessages([]);
    setLoadedSegmentIdx(0);
    setCcSegments([]);

    // CC sessions are always read-only in the dashboard — prevent conflicts with CLI
    setLockedMsg(s.locked); // only lock when CLI is actively using the session
    setActiveSessionId(s.id);
    onSessionSelect?.(s.id);
    // Don't clear activeSession — the load effect will populate it (even for locked sessions)

    // If CC session, find all older CC segments for scroll-back loading
    if (s.source === 'claude-code') {
      const ccList = sessions.filter((x) => x.source === 'claude-code'); // already sorted newest-first
      const idx = ccList.findIndex((x) => x.id === s.id);
      if (idx >= 0) setCcSegments(ccList.slice(idx + 1));
    }
  }

  async function loadEarlierSegment() {
    if (loadingEarlier || loadedSegmentIdx >= ccSegments.length) return;
    setLoadingEarlier(true);
    const seg = ccSegments[loadedSegmentIdx];
    try {
      const res = await fetch(`/api/projects/${project.id}/chats/${seg.id}`);
      if (res.ok) {
        const data: ChatSessionFull = await res.json();
        setPrependedMessages((prev) => [...data.messages, ...prev]);
        setLoadedSegmentIdx((i) => i + 1);
      }
    } finally {
      setLoadingEarlier(false);
    }
  }

  function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 80) loadEarlierSegment();
  }

  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/projects/${project.id}/chats/${sessionId}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setActiveSession(null);
    }
  }

  function addSystemMessages(userMsg: string, assistantMsg: string) {
    setActiveSession((prev) => prev ? {
      ...prev,
      messages: [...prev.messages,
        { role: 'user' as const, content: userMsg, ts: new Date().toISOString() },
        { role: 'assistant' as const, content: assistantMsg, ts: new Date().toISOString() },
      ],
    } : prev);
  }

  async function sendMessage() {
    const msg = input.trim();
    if (!msg || streaming) return;
    setSlashMenu({ open: false, items: [], idx: 0 });

    // ── Slash command handlers ──────────────────────────────────────────
    if (msg === '/help') {
      addSystemMessages('/help', [
        '**Available slash commands**',
        '',
        '`/help` — show this help',
        '`/clear` — start a new chat session',
        '`/cost` — show token usage and cost',
        '`/model <haiku|sonnet|opus>` — switch model',
        '`/status` — show project status',
        '`/memory` — open project memory / CLAUDE.md tab',
        '`/plan <file>` — add a spec to the Plan tab',
        '`/compact` — compact context (CLI-only)',
        '',
        '**CLI commands**',
        '`cloudy plan` — create a plan from a spec',
        '`cloudy run` — execute the current plan',
        '`cloudy pipeline` — chain multiple specs into one run',
        '`cloudy daemon` — manage the daemon',
      ].join('\n'));
      setInput('');
      return;
    }

    if (msg === '/clear') {
      setInput('');
      await createNewSession();
      return;
    }

    if (msg === '/cost') {
      const stats = cumulativeStats ?? ccStats;
      const costMsg = stats
        ? [
            '**Token usage & cost**',
            '',
            `• Input tokens: ${stats.inputTokens.toLocaleString()}`,
            `• Output tokens: ${stats.outputTokens.toLocaleString()}`,
            `• Cache write: ${stats.cacheWriteTokens.toLocaleString()}`,
            `• Cache read: ${stats.cacheReadTokens.toLocaleString()}`,
            `• **Total cost: $${stats.costUsd.toFixed(6)}**`,
            `• Model: \`${stats.model ?? 'unknown'}\``,
          ].join('\n')
        : 'No stats available for this session.';
      addSystemMessages('/cost', costMsg);
      setInput('');
      return;
    }

    if (msg.startsWith('/model ') || msg === '/model') {
      const newModel = msg.slice(7).trim();
      const valid = ['haiku', 'sonnet', 'opus'];
      if (!valid.includes(newModel)) {
        addSystemMessages(msg, `Unknown model: \`${newModel || '(none)'}\`. Available: \`haiku\`, \`sonnet\`, \`opus\``);
      } else {
        await changeModel(newModel);
        addSystemMessages(msg, `Switched to \`${newModel}\``);
      }
      setInput('');
      return;
    }

    if (msg === '/status') {
      const lines = [
        `**Project: ${project.name}**`,
        '',
        `• Path: \`${project.path}\``,
        `• Status: ${project.status}`,
        `• Last run: ${relativeTime(project.lastRunAt) || 'never'}`,
      ];
      if (project.taskProgress) lines.push(`• Tasks: ${project.taskProgress.done}/${project.taskProgress.total}`);
      if (project.costUsd) lines.push(`• Cost: $${project.costUsd.toFixed(4)}`);
      addSystemMessages('/status', lines.join('\n'));
      setInput('');
      return;
    }

    if (msg === '/memory') {
      setInput('');
      onSwitchTab('memory' as ActiveTab);
      return;
    }

    if (msg === '/compact') {
      addSystemMessages('/compact', '`/compact` is a CLI-only command. Run it in your terminal:\n```\ncloudy compact\n```\nor use Claude Code directly.');
      setInput('');
      return;
    }

    if (msg.startsWith('/plan ') || msg.startsWith('/scope ')) {
      const spec = msg.slice(msg.indexOf(' ') + 1).trim();
      await apiPost(`/api/projects/${project.id}/plan`, { specPaths: spec ? [spec] : [] });
      onSwitchTab('plan');
      setInput('');
      return;
    }

    // Unknown slash command
    if (msg.startsWith('/')) {
      const cmdName = msg.split(' ')[0];
      addSystemMessages(msg, `Unknown command: \`${cmdName}\`. Type \`/help\` for available commands.`);
      setInput('');
      return;
    }

    setInput('');
    setStreaming(true);

    setActiveSession((prev) => prev ? {
      ...prev,
      messages: [...prev.messages, { role: 'user', content: msg, ts: new Date().toISOString() }],
    } : prev);

    const res = await apiPost(`/api/projects/${project.id}/chat`, {
      sessionId: activeSessionId,
      message: msg,
      effort,
      skipPermissions: yolo,
      ...(maxBudgetUsd > 0 ? { maxBudgetUsd } : {}),
    });

    if (!res.ok) {
      setStreaming(false);
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      if (res.status === 423) {
        setLockedMsg(true);
      } else {
        alert(`Error: ${(err as { error: string }).error}`);
      }
    }
  }

  async function renameSession() {
    if (!activeSessionId || !nameInput.trim()) { setEditingName(false); return; }
    // CC session rename
    if (activeSessionId?.startsWith('cc:')) {
      await fetch(`/api/projects/${project.id}/chats/${activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput }),
      });
      setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, name: nameInput } : s));
      setEditingName(false);
      return;
    }
    await fetch(`/api/projects/${project.id}/chats/${activeSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    setSessions((prev) => prev.map((s) => s.id === activeSessionId ? { ...s, name: nameInput.trim() } : s));
    setActiveSession((prev) => prev ? { ...prev, name: nameInput.trim() } : prev);
    setEditingName(false);
  }

  async function changeModel(newModel: string) {
    if (!activeSessionId) return;
    await fetch(`/api/projects/${project.id}/chats/${activeSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: newModel }),
    });
    setActiveSession((prev) => prev ? { ...prev, model: newModel } : prev);
  }

  const activeMeta = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <span>💬 chats</span>
          <button className="chat-new-btn" onClick={createNewSession} title="New chat">＋</button>
        </div>
        <div className="chat-sidebar-list">
          {sessions.length === 0 && (
            <div style={{ padding: '16px 10px', color: 'var(--text-muted)', fontSize: 11, textAlign: 'center' }}>
              No chats yet.<br />Start a new one ↑
            </div>
          )}
          {(() => {
            // Separate cloudy sessions from CC sessions
            // CC sessions = context compaction segments from same CLI conversation.
            // Show only the most recent CC session; collapse the rest behind a toggle.
            const cloudySessions = sessions.filter((s) => s.source === 'cloudy');
            const ccSessions = sessions.filter((s) => s.source === 'claude-code');
            const [latestCC, ...olderCC] = ccSessions; // already sorted newest-first

            const renderSession = (s: ChatSessionMeta, compactionCount = 0) => (
              <div
                key={s.id}
                className={`chat-session-item${activeSessionId === s.id ? ' active' : ''}${s.locked ? ' locked' : ''}`}
                onClick={() => selectSession(s)}
                title={s.locked ? '🔒 Active in Claude Code CLI — click to watch live' : s.preview}
              >
                <div className="chat-session-item-top">
                  <span className={`session-badge ${s.source === 'claude-code' ? 'cc' : 'cw'}`}>
                    {s.source === 'claude-code' ? 'CC' : '☁'}
                  </span>
                  {s.locked && <IconLock size={11} color="#ef4444" />}
                  <span className="chat-session-name">{s.name}</span>
                  {!s.locked && s.source === 'cloudy' && (
                    <button
                      className="chat-session-delete"
                      onClick={(e) => deleteSession(s.id, e)}
                      title="Delete"
                    >×</button>
                  )}
                </div>
                <div className="chat-session-meta">
                  {s.messageCount} msgs · {relativeTime(s.updatedAt)}
                  {compactionCount > 0 && (
                    <span
                      className="chat-compaction-badge"
                      title="Claude Code compacted context to free space. Scroll up in chat to load earlier messages."
                    > · {compactionCount}✂</span>
                  )}
                </div>
              </div>
            );

            return (
              <>
                {cloudySessions.length > 0 && (
                  <div>
                    <div className="chat-group-label">Cloudy</div>
                    {cloudySessions.map((s) => renderSession(s))}
                  </div>
                )}
                {latestCC && (
                  <div>
                    {renderSession(latestCC, olderCC.length)}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Main chat area */}
      <div className="chat-main">
        {!activeSessionId ? (
          <div className="daemon-empty" style={{ flex: 1 }}>
            <div className="daemon-empty-icon"><IconAI size={40} color="#a78bfa" /></div>
            <div className="daemon-empty-title">💬 Chat with Claude</div>
            <div className="daemon-empty-sub">Select a session or start a new one ↑</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              CC = Claude Code CLI sessions · ☁ = Cloudy sessions
            </div>
          </div>
        ) : (
          <>
            {/* Locked / active-in-CLI banner */}
            {lockedMsg && (
              <div className="locked-banner">
                <IconLock size={14} color={activeMeta?.locked ? '#ef4444' : '#a78bfa'} />
                <span style={{ color: activeMeta?.locked ? '#ef4444' : '#a78bfa' }}>
                  {activeMeta?.locked
                    ? 'Active in Claude Code CLI — live stream'
                    : 'Claude Code session — read-only · resume in terminal to continue'}
                </span>
              </div>
            )}
            <div className="chat-header">
              {editingName ? (
                <input
                  className="chat-title-input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={renameSession}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameSession(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                />
              ) : (
                <input
                  className="chat-title-input"
                  value={activeSession?.name ?? activeMeta?.name ?? ''}
                  readOnly={false}
                  onFocus={() => {
                    setNameInput(activeSession?.name ?? activeMeta?.name ?? '');
                    setEditingName(true);
                  }}
                  title="Click to rename"
                />
              )}
              {activeMeta?.source === 'cloudy' && !lockedMsg && (
                <>
                  <ModelPicker value={model} onChange={changeModel} label="Model" />
                  <select
                    className="daemon-model-select"
                    value={effort}
                    onChange={(e) => setEffort(e.target.value as 'low' | 'medium' | 'high')}
                    style={{ fontSize: 11 }}
                    title="Effort level"
                  >
                    <option value="low">🪶 low</option>
                    <option value="medium">⚖ medium</option>
                    <option value="high">🔥 high</option>
                  </select>
                  <input
                    type="number"
                    className="daemon-model-select"
                    value={maxBudgetUsd || ''}
                    onChange={(e) => setMaxBudgetUsd(parseFloat(e.target.value) || 0)}
                    placeholder="$ cap"
                    min={0}
                    step={0.1}
                    style={{ fontSize: 11, width: 64 }}
                    title="Max spend per response (USD, 0 = unlimited)"
                  />
                  <button
                    onClick={() => setYolo((v) => !v)}
                    title={yolo ? 'Yolo mode ON — file writes auto-approved. Click to require approval.' : 'Safe mode — file writes need approval. Click to enable yolo.'}
                    style={{
                      background: yolo ? 'rgba(239,68,68,0.12)' : 'var(--bg-card)',
                      border: `1px solid ${yolo ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                      color: yolo ? '#ef4444' : 'var(--text-muted)',
                      borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                      fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                  >
                    {yolo ? '🔓 yolo' : '🔒 safe'}
                  </button>
                </>
              )}
              {activeMeta?.source === 'claude-code' && (
                <span className="session-badge cc" style={{ fontSize: 10, padding: '2px 7px' }}>Claude Code</span>
              )}
            </div>
            <div className="chat-filter-bar">
              {(['all', 'mine', 'claude', 'tools'] as const).map((f) => (
                <button
                  key={f}
                  className={`chat-filter-chip${msgFilter === f ? ' active' : ''}`}
                  onClick={() => setMsgFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'mine' ? '🔵 Mine' : f === 'claude' ? '🟠 Claude' : '⚙️ Tools'}
                </button>
              ))}
            </div>
            <div className="chat-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
              {/* Load earlier indicator */}
              {ccSegments.length > 0 && loadedSegmentIdx < ccSegments.length && (
                <div className="chat-load-earlier" onClick={loadEarlierSegment}>
                  {loadingEarlier ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↑'}
                  {' '}
                  {loadingEarlier ? 'Loading…' : `Load earlier (${ccSegments.length - loadedSegmentIdx} compaction${ccSegments.length - loadedSegmentIdx !== 1 ? 's' : ''} remaining)`}
                </div>
              )}
              {prependedMessages
                .filter((msg) => {
                  if (msgFilter === 'all') return true;
                  if (msgFilter === 'mine') return msg.role === 'user' && (msg.content.trim() || msg.blocks?.some(b => b.type !== 'tool_result'));
                  if (msgFilter === 'claude') return msg.role === 'assistant';
                  if (msgFilter === 'tools') return msg.blocks?.some(b => b.type === 'tool_use' || b.type === 'tool_result');
                  return true;
                })
                .map((msg, i) => (
                  <RichMessage key={`pre-${i}`} msg={msg} />
                ))}
              {prependedMessages.length > 0 && (
                <div className="chat-segment-divider">
                  <span title="Claude Code compacted context here — new segment started">✂ compaction</span>
                </div>
              )}
              {(activeSession?.messages ?? [])
                .filter((msg) => {
                  if (msgFilter === 'all') return true;
                  if (msgFilter === 'mine') return msg.role === 'user' && (msg.content.trim() || msg.blocks?.some(b => b.type !== 'tool_result'));
                  if (msgFilter === 'claude') return msg.role === 'assistant';
                  if (msgFilter === 'tools') return msg.blocks?.some(b => b.type === 'tool_use' || b.type === 'tool_result');
                  return true;
                })
                .map((msg, i) => (
                  <RichMessage key={i} msg={msg} isStreaming={msg.ts === '__streaming__'} />
                ))}
              {streaming && !(activeSession?.messages ?? []).some(m => m.ts === '__streaming__') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(232,112,58,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🤖</div>
                  <div className="chat-thinking-dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {activeMeta?.source === 'claude-code' && (cumulativeStats ?? ccStats) && (
              <CcStatusBar stats={(cumulativeStats ?? ccStats)!} isActive={!!lockedMsg && liveWatch} />
            )}
            {activeMeta?.source === 'cloudy' && (activeSession?.messages?.length ?? 0) > 0 && (
              <CcStatusBar
                stats={cloudyStats ?? {
                  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
                  costUsd: 0, durationMs: 0, messageCount: 0, lastTool: null,
                  firstTs: activeSession?.messages?.[0]?.ts ?? null,
                  lastTs: activeSession?.messages?.[activeSession.messages.length - 1]?.ts ?? null,
                  model: null,
                }}
                isActive={streaming}
              />
            )}
            {!lockedMsg ? (
              <>
                <div style={{ position: 'relative' }}>
                {/* Slash command autocomplete */}
                {slashMenu.open && slashMenu.items.length > 0 && (
                  <div className="slash-menu">
                    {slashMenu.items.map((cmd, i) => (
                      <div
                        key={cmd.name}
                        className={`slash-menu-item${i === slashMenu.idx ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep focus on textarea
                          const hasArg = cmd.usage.includes('<');
                          setInput(hasArg ? `/${cmd.name} ` : `/${cmd.name}`);
                          setSlashMenu({ open: false, items: [], idx: 0 });
                        }}
                      >
                        <span className="slash-menu-cmd">/{cmd.name}</span>
                        <span className="slash-menu-usage">{cmd.usage}</span>
                        <span className="slash-menu-desc">{cmd.description}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="chat-input-row">
                  <textarea
                    className="chat-input"
                    rows={2}
                    placeholder={streaming ? '⏳ Claude is thinking...' : '💬 Message or /command (Enter to send, Shift+Enter for newline)'}
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      if (val.startsWith('/') && !val.includes('\n')) {
                        const query = val.slice(1).split(' ')[0].toLowerCase();
                        const hasSpace = val.includes(' ');
                        if (!hasSpace) {
                          const filtered = (SLASH_COMMANDS as readonly SlashCommand[]).filter((c) => c.name.startsWith(query));
                          setSlashMenu({ open: filtered.length > 0, items: filtered as SlashCommand[], idx: 0 });
                        } else {
                          setSlashMenu({ open: false, items: [], idx: 0 });
                        }
                      } else {
                        setSlashMenu({ open: false, items: [], idx: 0 });
                      }
                    }}
                    disabled={streaming}
                    onKeyDown={(e) => {
                      if (slashMenu.open) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSlashMenu((m) => ({ ...m, idx: Math.min(m.idx + 1, m.items.length - 1) }));
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSlashMenu((m) => ({ ...m, idx: Math.max(m.idx - 1, 0) }));
                          return;
                        }
                        if (e.key === 'Tab' || e.key === 'Enter') {
                          e.preventDefault();
                          const cmd = slashMenu.items[slashMenu.idx];
                          if (cmd) {
                            const hasArg = cmd.usage.includes('<');
                            setInput(hasArg ? `/${cmd.name} ` : `/${cmd.name}`);
                            setSlashMenu({ open: false, items: [], idx: 0 });
                            if (!hasArg) setTimeout(() => sendMessage(), 0);
                          }
                          return;
                        }
                        if (e.key === 'Escape') {
                          setSlashMenu({ open: false, items: [], idx: 0 });
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <button
                    className="daemon-btn primary"
                    onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                  >
                    {streaming ? '⏳' : '↑ Send'}
                  </button>
                </div>
                </div>{/* end position:relative wrapper */}
                <div className="chat-hint">
                  💡 type <kbd>/</kbd> for commands &nbsp;·&nbsp; Shift+Enter for newline
                </div>
              </>
            ) : (
              <div className="chat-hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span>🔒 Claude Code CLI is active · switch to terminal to send</span>
                <button
                  className="daemon-btn"
                  style={{ fontSize: 10, padding: '2px 8px' }}
                  onClick={() => setLiveWatch((v) => !v)}
                  title={liveWatch ? 'Pause live updates' : 'Resume live updates'}
                >
                  {liveWatch ? '⏸ pause' : '▶ watch live'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MemoryTab ──────────────────────────────────────────────────────────

interface MemoryFile {
  path: string;
  content: string;
}

function MemoryTab({ project }: { project: ProjectStatusSnapshot }) {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${project.id}/memory`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { files: MemoryFile[] }) => {
        setFiles(data.files);
        if (data.files.length > 0) setActiveFile(data.files[0].path);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, [project.id]);

  const active = files.find((f) => f.path === activeFile);

  return (
    <div className="memory-tab">
      <div className="memory-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>📋 Project Memory</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {files.map((f) => (
            <button
              key={f.path}
              className={`daemon-btn${activeFile === f.path ? ' primary' : ''}`}
              style={{ fontSize: 11 }}
              onClick={() => setActiveFile(f.path)}
            >
              {f.path.split('/').pop()}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>Loading memory files…</div>
      ) : files.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
          No memory files found.<br />
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            Create <code>CLAUDE.md</code> or <code>.claude/MEMORY.md</code> in your project.
          </span>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '2px 12px 6px', opacity: 0.6 }}>
            {active?.path}
          </div>
          <pre className="memory-content">{active?.content ?? ''}</pre>
        </>
      )}
    </div>
  );
}

// ── HistoryTab ──────────────────────────────────────────────────────────

interface RunEntry {
  name: string;
  date: string;   // parsed from name
  spec: string;   // parsed from name
  isPipeline: boolean;
}

// ── Header Ticker ────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  // ── Cloudy features & tips ───────────────────────────────────────────────
  '☁️  Cloudy: AI that codes while you sleep',
  '⚡  Parallel tasks run simultaneously across git worktrees — zero conflicts guaranteed',
  '🚀  Cloudy can plan, code, validate, and review — all while you grab a snack',
  '🎯  Confidence threshold: 0.85 — if the AI isn\'t sure, it asks. Refreshingly honest.',
  '🔮  Pipeline mode: chain multiple specs together. Watch your whole product build itself.',
  '💡  Tip: Use cloudy.local for a clean URL. No port numbers, no fuss.',
  '🌙  Running overnight? Use --heartbeat-interval to track progress while you dream.',
  '🔐  All AI decisions are logged. Every token, every cost, every choice. Full audit trail.',
  '🧩  Spec files are just markdown. Write naturally, Cloudy does the rest.',
  '🐛  Cloudy retries failed tasks automatically. Persistent like a senior dev at 11pm.',
  '🎨  Dark mode, light mode, system mode. We care about your eyes at 2am.',
  '🏆  Three AI tiers: fast (Mistral), mid (DeepSeek), top (Gemini 2.5 Pro). Best model wins.',
  '🧠  Claude thinks in tokens. One token ≈ ¾ of a word. Your whole codebase? Probably fits.',
  '📋  Planning Q&A: Cloudy asks clarifying questions before touching a single line of code.',
  '🔄  Re-run recovery: interrupted tasks reset to pending automatically. No lost work.',
  '💰  Cost tracking per task, per run, per model. Know exactly what your AI bill is doing.',
  '🌐  Daemon serves all your projects at once. One port, infinite projects.',
  '⚙️  Config lives in .cloudy/config.json — version-controllable, team-shareable.',
  '🛡️  Validation gate: TypeScript, lint, build, tests, AI review. Six layers of confidence.',
  '📡  SSE streaming: watch output in real time without polling. The dashboard just knows.',
  '🗂️  Saved plans persist across sessions. Build a library of reusable specs.',
  '🔗  Pipeline chains are drag-and-drop. Orchestrate your entire product in one screen.',
  '⏸️  Stop button kills the active process cleanly. SIGTERM, then clean up. No orphans.',
  '🌍  Multi-project: fitkind, univiirse, goala — all in the sidebar, all in one daemon.',
  '🔁  cloudy run --retry-failed resets only failed tasks. Resume from exactly where it broke.',
  '📝  Memory tab stores persistent context that shapes every future AI decision.',
  '🤝  Approval mode: review each task before it runs. You stay in control.',
  '🧪  --dry-run previews the plan without executing. Inspect before you commit.',
  '⚡  Fast model handles 75% of tasks. Cheap, quick, surprisingly smart.',
  '🧬  Mid model escalates complex tasks. DeepSeek V3 at $0.14/M — criminally good value.',
  '👑  Top model (Gemini 2.5 Pro) for the hard stuff. Worth every cent.',
  '📦  All three tiers configurable per project. Rotate models without touching code.',
  '🔍  Task dependency graph: Cloudy figures out what can run in parallel automatically.',
  '🌱  Start small: one spec file, one goal. Scale when you\'re ready.',
  '🏗️  Worktrees give each parallel task its own git branch. Merge when done.',
  '💬  Chat tab: talk to Claude about your project while it\'s running. Multitasking genius.',
  '📊  History tab: every run, every task, every outcome. Searchable, filterable.',
  '🎪  Engines: claude-code (default), pi-mono, goose. Each has its strengths.',
  '🔒  Locked sessions: protect important chat history from accidental deletion.',
  '🏷️  Project tags auto-filter your spec library. Find anything in milliseconds.',
  '🚦  Status indicator goes green on success, red on failure, orange on active. Always visible.',
  '📈  Cost per run displayed in History. Watch your AI spend go down as prompts improve.',
  '🌀  Spec search is fuzzy. Type anything, find everything.',
  '🎭  The daemon badge means it\'s always-on. Background server, always ready.',
  '🛠️  cloudy setup runs an interactive wizard. Never guess a config option again.',
  '🌊  Output ring buffer: reload the page, all recent output replays instantly.',
  '🧲  Drag specs into the pipeline chain. Order matters. Cloudy respects it.',
  '🎬  Run tab shows live output line by line as Claude codes. Like watching magic.',
  '🦾  AI model routing: auto mode picks the cheapest model that can handle each task.',
  '📮  Register a project once, access it forever. The daemon never forgets.',
  '🔧  Pre-commit hooks, lint, typecheck — all run inside the validation gate.',
  '🌟  Daily driver: open cloudy.local in the morning. Your AI dev team is already at work.',
  '🧯  Max cost limits: set a ceiling per task and per run. The AI won\'t overspend.',
  '🗺️  Topological sort ensures tasks run in the right order. Dependency-aware by default.',
  '🔊  Notifications: get pinged when runs complete. Never stare at a progress bar again.',
  '🪄  cloudy init <goal> turns a description into a full task plan in seconds.',
  '🎰  Random model fallbacks: if the primary is down, a backup kicks in automatically.',
  '🧲  MCP server: Claude Code and OpenClaw can drive Cloudy autonomously.',
  '⚗️  Validation commands are customisable. Add any shell command to the gate.',
  '🎓  Planning model is separate from execution. Use a cheaper model to plan, smarter to build.',
  '🌈  The ticker cycles through 500 items. You\'re reading number 64 right now.',
  // ── Developer jokes ───────────────────────────────────────────────────────
  '☕  Fun fact: 83% of developers admit to coding better after coffee. The other 17% are lying.',
  '🦀  "It works on my machine" — famous last words before Cloudy existed',
  '📊  The average developer context-switches 400 times per day. Cloudy doesn\'t have that problem.',
  '😅  There are only 10 types of people: those who understand binary and those who don\'t.',
  '🔥  A QA engineer walks into a bar. Orders 0 beers. Orders 999999999 beers. Orders -1 beers.',
  '💀  "It\'s not a bug, it\'s an undocumented feature." — every developer, always',
  '🤦  99 little bugs in the code. Take one down, patch it around. 127 little bugs in the code.',
  '🧟  Legacy code: code written by someone who is no longer available to explain it.',
  '🎯  Why do programmers prefer dark mode? Because light attracts bugs.',
  '🌙  A programmer\'s wife says "Go to the store, get a gallon of milk, and if they have eggs, get 12." He returns with 12 gallons of milk.',
  '💬  Documentation is like a love letter to your future self. Most devs never write love letters.',
  '🤖  A programmer is told "you have a problem. Use regex." Now they have two problems.',
  '🔮  "Talk is cheap. Show me the code." — Linus Torvalds',
  '😤  Hours of debugging can save you minutes of reading documentation.',
  '🕰️  The best way to predict the future is to implement it.',
  '💡  A clean codebase is a loved codebase. Cloudy keeps it clean.',
  '🎲  Rubber duck debugging: explain your code to a duck. The duck judges silently.',
  '🏃  Move fast and break things. Cloudy moves fast and validates things.',
  '🤷  Undefined is not a function. Neither is undefined is not a function.',
  '😱  HTTPS everywhere. Except that one internal dashboard running on HTTP on port 3000.',
  '🧩  Spaghetti code: when your codebase looks like someone threw the architecture at a wall.',
  '🌊  Imposter syndrome: feeling like a fraud while shipping features faster than anyone else.',
  '🎪  Senior developer: one who has made all the mistakes already.',
  '⚡  If debugging is the process of removing bugs, then programming is the process of adding them.',
  '🌀  The first rule of optimisation: don\'t. The second: don\'t yet.',
  '🔑  Any code of your own that you haven\'t looked at for 6 months might as well have been written by someone else.',
  '🎯  Premature optimisation is the root of all evil. Premature pessimisation is just sad.',
  '🤡  There are two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
  '🧠  Measuring programming progress by lines of code is like measuring aircraft building by weight.',
  '🎸  If you can\'t explain it simply, you don\'t understand it well enough. — Einstein (about your architecture)',
  '🏆  The best code is no code at all.',
  '🌍  Programs must be written for people to read, and only incidentally for machines to execute.',
  '🚀  First, solve the problem. Then, write the code.',
  '💀  Technical debt is like a loan. It has interest. Eventually it forecloses.',
  '🔭  Every great developer you know got there by solving problems they were unqualified to solve.',
  '🤝  The best way to get a project done faster is to start sooner.',
  '🎭  Software is like entropy: it always increases.',
  '🧯  The most dangerous phrase: "We\'ve always done it this way."',
  '🦋  A small change in requirements can cause a large change in implementation.',
  '🎨  Code is read more than it is written. Write for the reader.',
  '🌱  Junior devs: make it work. Mid devs: make it right. Senior devs: make it maintainable.',
  '🔐  Security is not a feature. It\'s a foundation.',
  '🎬  "First, make it work. Then make it right. Then make it fast." — Kent Beck',
  '🧪  TDD: write the test, watch it fail, write the code, watch it pass. Repeat forever.',
  '🌊  The best documentation is code so clear it doesn\'t need documentation.',
  '⚙️  Automate the boring stuff. That\'s why Cloudy exists.',
  '🦾  AI doesn\'t replace developers. It gives developers superpowers.',
  '🎯  A bug is just a feature you haven\'t appreciated yet.',
  '💬  Code review: where ego goes to die and software goes to live.',
  '🌙  Night owls: the most dangerous species in software engineering.',
  '🔥  Hot take: the real 10x developer is the one who writes 10x less code.',
  '🤔  Abstraction is good. Premature abstraction is the root of all evil\'s cousin.',
  '🎪  "Make it work, make it right, make it fast" — in that order. Not the other way.',
  '🏗️  Architecture astronauts: developers who over-engineer everything.',
  '🌟  The best feature is a deleted feature.',
  '🔮  Hindsight is always 20/20. Foresight is why we have version control.',
  '🧬  Refactoring: changing the internals without changing the externals. Like surgery.',
  '⚡  Fast feedback loops are the secret to good software. Cloudy closes the loop instantly.',
  '🎓  The best developers are the best at admitting they don\'t know something.',
  '🌈  Diversity in tech: we need more people who ask "why not?" instead of "why?"',
  '🛸  The cloud is just someone else\'s computer. Cloudy is your AI on your computer.',
  '🤓  There are 10 types of developers: full-stack, front-end, back-end, and devops. That\'s already 4.',
  '🎰  Random seed: the most reproducible way to get non-reproducible results.',
  '🌀  Recursion: see recursion.',
  '🔊  "Weeks of coding can save hours of planning." — unknown, ironic',
  '🎭  The hardest part of programming is thinking. The rest is typing.',
  '🦊  Clever code is the enemy of maintainable code.',
  '💫  Comments lie. Code doesn\'t. Trust the code.',
  '🌺  Beautiful code is code that makes you smile when you read it.',
  '🔬  Profiling before optimisation is like doing an autopsy before the patient is dead.',
  '🏄  Shipping is a feature. The most important feature.',
  '🎸  "Walking on water and developing software from a spec are easy if both are frozen." — Edward Berard',
  '🌊  Waterfall is dead. Long live… whatever we\'re calling it this week.',
  '🧲  The best code review comment: "This is clever. Delete it."',
  '🎯  Ship early, ship often, ship when it\'s ready. Pick two.',
  '🔭  Open source: standing on the shoulders of giants who are also standing on shoulders.',
  '🦄  Unicorn features: so complex they seem magical. Usually just nested callbacks.',
  '🌍  The internet runs on Linux. Linux runs on coffee. QED.',
  '🎪  Every codebase has a "here be dragons" comment somewhere.',
  '🚦  Green tests give false confidence. Red tests give true information.',
  '🤯  The more I learn, the more I realise how much I don\'t know. — every developer after year 5',
  '🌱  Greenfield project: the one time developers are actually excited.',
  '💀  Brownfield project: the reason they weren\'t excited last time.',
  '🎨  UX tip: if you need a tooltip to explain a button, redesign the button.',
  '🧯  Error messages should help users fix the problem, not describe the programmer\'s confusion.',
  '🔑  Authentication is hard. That\'s why we have Auth.js, Passport, and Stack Overflow.',
  '🌙  "The cloud is just someone else\'s computer" — that\'s not what we mean by Cloudy.',
  '⏰  Deadlines: the most effective compiler optimisation ever invented.',
  '🎬  Demo-driven development: it works perfectly until someone touches the keyboard.',
  '🤝  Pair programming: two heads are better than one, especially when one is Claude.',
  '🔄  CI/CD: continuous integration, continuous delivery, continuous anxiety.',
  '🌟  Production is the best test environment. Highly recommended by no one.',
  '🎰  "It\'s probably a race condition." — said before every race condition was found.',
  '🦋  Butterfly effect: changing a variable name in a utility causes a prod outage 3 months later.',
  '🧪  Unit tests: tiny assertions that your code does what you think it does.',
  '🌊  Integration tests: discovering that your code doesn\'t do what you think it does.',
  '⚡  E2E tests: proving that the user can do what you think the user wants to do.',
  '🎭  Manual testing: closing your eyes and hoping.',
  '🏆  100% test coverage: an achievement that means nothing and costs everything.',
  '🔮  The best test is no test in an environment so stable it never breaks. (Impossible.)',
  '💡  Good variable names: months of maintenance time saved per year.',
  '🤡  Variable names: x, y, temp, temp2, tempFinal, tempFinalActual, tempFinalActual2.',
  '🎯  "Always code as if the person who ends up maintaining your code will be a violent psychopath who knows where you live." — John Woods',
  '🌍  Internationalisation: i18n. Because typing 18 letters between i and n was too hard.',
  '🌐  Localisation: l10n. Making your app work everywhere except IE11.',
  '🛡️  CORS: the security feature that makes you feel like the bad guy.',
  '🔥  Hot reload: the greatest developer experience improvement since syntax highlighting.',
  '🎸  Stack traces: the treasure maps of debugging.',
  '🌈  Rainbow table: a hacker\'s best friend, a developer\'s worst nightmare.',
  '🧬  DNA of good software: readable, testable, maintainable, deletable.',
  '🦾  "The best tool is the one you actually use." — probably someone with an IDE preference.',
  '🏗️  Microservices: solving the monolith problem by creating 47 smaller problems.',
  '🚀  Serverless: someone else\'s server, your problem.',
  '🌀  Kubernetes: solving the Docker problem by adding 1000 YAML files.',
  '☁️  Cloud native: we\'ll figure out what it means after we bill for it.',
  '🔭  Observability: knowing what your system is doing instead of guessing.',
  '📊  Metrics lie. Logs mislead. Traces tell the truth.',
  '🤖  Machine learning: making computers bad at things they were good at, so they can be great.',
  '🎯  A/B testing: scientific method, but for button colours.',
  '💬  Dark patterns: designing against the user. Cloudy is designed for the developer.',
  '🎨  Good design is invisible. Bad design is a customer support ticket.',
  // ── Famous quotes ─────────────────────────────────────────────────────────
  '📚  "Any fool can write code that a computer can understand. Good programmers write code that humans can understand." — Martin Fowler',
  '🌍  "Programs must be written for people to read, and only incidentally for machines to execute." — Abelson & Sussman',
  '🔑  "Talk is cheap. Show me the code." — Linus Torvalds',
  '🧠  "The most damaging phrase in the language is: we\'ve always done it this way." — Grace Hopper',
  '🚀  "Move fast and break things. Unless you are breaking stuff, you are not moving fast enough." — Mark Zuckerberg',
  '🌱  "Make it work, make it right, make it fast." — Kent Beck',
  '⚡  "First, solve the problem. Then, write the code." — John Johnson',
  '🎯  "Simplicity is the soul of efficiency." — Austin Freeman',
  '🏆  "Programming is the art of telling another human what one wants the computer to do." — Donald Knuth',
  '🔮  "The best way to predict the future is to invent it." — Alan Kay',
  '🌊  "Software is a great combination between artistry and engineering." — Bill Gates',
  '🎸  "The function of good software is to make the complex appear simple." — Grady Booch',
  '🧬  "Software is eating the world." — Marc Andreessen',
  '💡  "Innovation distinguishes between a leader and a follower." — Steve Jobs',
  '🌟  "If you think good architecture is expensive, try bad architecture." — Brian Foote',
  '🎭  "In theory, theory and practice are the same. In practice, they are not." — Yogi Berra',
  '🦊  "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away." — Antoine de Saint-Exupéry',
  '🌈  "To iterate is human, to recurse divine." — L. Peter Deutsch',
  '🔥  "It always takes longer than you expect, even when you take into account Hofstadter\'s Law." — Hofstadter\'s Law',
  '🎪  "There are two ways to write error-free programs. Only the third one works." — Alan J. Perlis',
  '🧩  "Measuring programming progress by lines of code is like measuring aircraft building progress by weight." — Bill Gates',
  '⚙️  "The most important property of a program is whether it accomplishes the intention of its user." — C.A.R. Hoare',
  '🎓  "Everyone knows that debugging is twice as hard as writing a program in the first place." — Brian Kernighan',
  '🌙  "Debugging is like being the detective in a crime movie where you are also the murderer." — Filipe Fortes',
  '🔭  "The Internet is the world\'s largest library. It\'s just that all the books are on the floor." — John Allen Paulos',
  '🤖  "Artificial intelligence is no match for natural stupidity." — Albert Einstein (probably not)',
  '💬  "Weeks of coding can save you hours of planning." — unknown wise person',
  '🦾  "The best thing about a boolean is that even if you are wrong, you are only off by a bit." — unknown',
  '🎰  "In software, the only constant is change." — paraphrased Heraclitus',
  '🌺  "A computer once beat me at chess, but it was no match for me at kick boxing." — Emo Philips',
  '🛸  "The cloud is not a place, it\'s a practice." — unknown cloud marketer',
  '🔬  "Clean code always looks like it was written by someone who cares." — Robert C. Martin',
  '🏄  "The best error message is the one that never shows up." — Thomas Fuchs',
  '⏰  "One of the best programming skills you can have is knowing when to walk away for a while." — Oscar Godson',
  '🎬  "The purpose of software engineering is to control complexity, not to create it." — Pamela Zave',
  '🤔  "Code is like humor. When you have to explain it, it\'s bad." — Cory House',
  '🌊  "Programs are meant to be read by humans and only incidentally for computers to execute." — Donald Knuth',
  '🔐  "Security is always excessive until it\'s not enough." — Robbie Sinclair',
  '🎯  "Software comes from heaven when you have good architecture." — unknown architect',
  '🌍  "Real programmers don\'t read documentation. Real programmers ignore documentation." — unknown',
  '💀  "It\'s not a bug – it\'s an undocumented feature." — used on Stack Overflow, daily',
  '🤯  "Any sufficiently advanced technology is indistinguishable from magic." — Arthur C. Clarke',
  '🎨  "Design is not just what it looks like and feels like. Design is how it works." — Steve Jobs',
  '🧪  "Testing leads to failure, and failure leads to understanding." — Burt Rutan',
  '🌟  "Optimism is an occupational hazard of programming; feedback is the treatment." — Kent Beck',
  '🏗️  "The goal of Computer Science is to build something that will last at least until we\'ve finished building it." — unknown',
  '🚦  "Software testing proves the existence of bugs, not their absence." — Edsger Dijkstra',
  '💫  "Walking on water and developing software from a spec are easy if both are frozen." — Edward Berard',
  '🌀  "The most dangerous kind of waste is the waste we do not recognize." — Shigeo Shingo',
  '🎸  "You can\'t have great software without a great team, and most software teams behave like dysfunctional families." — Jim McCarthy',
  '🦋  "In programming, the hard part isn\'t solving problems, but deciding what problems to solve." — Paul Graham',
  '🔊  "A language that doesn\'t affect the way you think about programming is not worth knowing." — Alan Perlis',
  '🎭  "The art of programming is the art of organising complexity." — Edsger Dijkstra',
  '🌱  "Every great developer you know got there by solving problems they were unqualified to solve." — Patrick McKenzie',
  // ── Tech & AI facts ───────────────────────────────────────────────────────
  '🤖  The first computer bug was an actual moth found in a Harvard relay in 1947.',
  '📡  The internet backbone moves ~400 terabits per second. That\'s 50,000 HD movies per second.',
  '🔢  There are more possible chess games than atoms in the observable universe.',
  '🧠  Your brain runs at roughly 1 exaFLOP. Current fastest supercomputers: ~1 exaFLOP.',
  '💾  The Apollo 11 guidance computer had 4KB of RAM. Your phone has 8,000,000KB.',
  '🌐  There are ~1.9 billion websites. About 200 million are actively maintained.',
  '📱  More people on Earth have a mobile phone than have a toothbrush.',
  '🔌  The world\'s first hard drive (1956) stored 5MB and was the size of two refrigerators.',
  '🖥️  The first commercial computer, UNIVAC I (1951), weighed 8 tonnes and cost $1M ($11M today).',
  '🔊  The original iPhone had no App Store, no copy-paste, and no 3G. It still changed everything.',
  '🌍  Google processes ~8.5 billion searches per day. That\'s ~100,000 searches per second.',
  '🧬  The human genome contains ~3 billion base pairs. That\'s ~750MB of data.',
  '🛸  There are ~4,000 active satellites orbiting Earth. SpaceX plans 42,000 more for Starlink.',
  '☁️  Amazon Web Services was launched in 2006. It now generates ~$100B/year in revenue.',
  '🤖  GPT-4 was trained on an estimated 1 trillion tokens. That\'s about 750 billion words.',
  '💡  The first email was sent in 1971 by Ray Tomlinson. The message: "QWERTYUIOP".',
  '🔐  The RSA encryption algorithm was published in 1977. It still protects most internet traffic.',
  '🌊  Every 2 days, we create as much information as was created from the dawn of civilisation until 2003.',
  '🚀  Moore\'s Law: chip transistor count doubles roughly every 2 years. It\'s held since 1965.',
  '📊  Stack Overflow was founded in 2008. It now has 50M questions and answers.',
  '🎯  Linux powers 96.4% of the world\'s top 1 million web servers.',
  '🌐  The World Wide Web was invented by Tim Berners-Lee in 1989. He didn\'t patent it.',
  '🔭  The James Webb Space Telescope generates ~57GB of data per day, processed in real time.',
  '🧪  CRISPR gene editing was discovered in 2012. It won a Nobel Prize 8 years later.',
  '🏆  Python became the world\'s most popular programming language in 2022, overtaking JavaScript.',
  '🎸  Git was created by Linus Torvalds in 2005 in 10 days. To version-control Linux itself.',
  '🌙  The Moon is 384,400 km away. Light takes 1.28 seconds to travel there.',
  '⚡  Electricity travels through copper wire at about 2/3 the speed of light.',
  '🔮  The first version of JavaScript was written in 10 days by Brendan Eich in 1995.',
  '🎨  Photoshop 1.0 was 179KB. The current version is ~1.8GB. That\'s 10,000x the growth.',
  '🦾  GPT models are trained using Reinforcement Learning from Human Feedback (RLHF).',
  '🌺  The term "artificial intelligence" was coined by John McCarthy at a Dartmouth conference in 1956.',
  '💬  Claude is trained by Anthropic, founded by former OpenAI researchers in 2021.',
  '🔑  Public-key cryptography was invented in 1976 by Diffie and Hellman.',
  '🌈  QR codes were invented in 1994 by Masahiro Hara for Toyota\'s vehicle parts tracking.',
  '🎪  Bluetooth is named after Harald Bluetooth, a 10th-century Danish king.',
  '🧩  Wi-Fi doesn\'t stand for "Wireless Fidelity". It\'s just a brand name by the Wi-Fi Alliance.',
  '🌊  The first commercial SSD was released in 1991 for $1,000 and stored 20MB.',
  '🤯  TCP/IP — the foundation of the internet — was designed to survive nuclear war.',
  '🔬  The transistor was invented at Bell Labs in 1947. Three people shared the Nobel Prize for it.',
  '🏄  USB was invented in 1996 to replace the 27 different connectors on a PC. It added 2 more.',
  '🎬  JPEG compression was standardised in 1992. It\'s still the most used image format.',
  '⏰  The Y2K bug cost an estimated $300–600 billion to fix globally. And it worked.',
  '🧲  NFC (Near Field Communication) operates at 13.56 MHz, the same frequency as library security gates.',
  '📱  The App Store launched in July 2008 with 500 apps. It now has 1.8 million.',
  '🌍  Wikipedia has 6.7 million articles in English alone. 99.9% written by volunteers.',
  '🎰  Random number generators in computers aren\'t truly random. They\'re deterministic with good seeds.',
  '🦊  Firefox\'s old name was "Phoenix", then "Firebird". Mozilla kept getting name conflicts.',
  '🌱  Node.js was created by Ryan Dahl in 2009. The runtime is now downloaded 3 billion times/month.',
  '💀  Internet Explorer is officially dead (June 2022). Moment of silence.',
  '🔥  WebAssembly runs at near-native speed in the browser. The web is now a runtime.',
  '🎭  The dark web is ~4-5% of the total internet. The rest is just poorly indexed.',
  '🚦  HTTP/3 uses UDP instead of TCP. Faster, but the jokes are less reliable.',
  '🎯  GraphQL was created internally at Facebook in 2012, open-sourced in 2015.',
  '💫  Docker was released in 2013. It changed deployment forever in about 18 months.',
  '🌙  Kubernetes (k8s) was released by Google in 2014, based on their internal Borg system.',
  '🦋  React was open-sourced by Facebook in 2013. It now powers a third of the web.',
  '⚙️  Rust has been voted "most loved programming language" on Stack Overflow every year since 2016.',
  '🎓  MIT\'s OpenCourseWare has made university education free since 2001. 350M+ learners served.',
  '🌐  IPv4 has 4.3 billion addresses. We ran out in 2011. IPv6 has 340 undecillion addresses.',
  '🔊  The first tweet was sent by Jack Dorsey on March 21, 2006: "just setting up my twttr".',
  '🏗️  GitHub was founded in 2008. Microsoft acquired it in 2018 for $7.5 billion.',
  '🔐  SHA-256 (used in Bitcoin) has 2^256 possible outputs. That\'s more than atoms in the universe.',
  '🎸  The first video uploaded to YouTube (April 23, 2005): "Me at the zoo" by co-founder Jawed Karim.',
  '🌺  Amazon started as an online bookstore in a garage in Bellevue, Washington, in 1994.',
  '🧠  The term "debugging" was popularised after Grace Hopper found that actual moth in 1947.',
  '🤖  AlphaGo beat world Go champion Lee Sedol 4-1 in 2016. Sedol retired in 2019.',
  '🌊  DeepMind\'s AlphaFold solved protein folding — a 50-year science challenge — in 2020.',
  '🔭  The first photograph of a black hole was captured in 2019, 55 million light-years away.',
  '🚀  Falcon 9\'s first stage booster has been reflown over 20 times. Rockets are now reusable.',
  '⚡  Starship is the largest rocket ever built: 120m tall, 9M lbs thrust. More than the Moon rockets.',
  '💡  The Li-Fi technology uses light (not radio waves) to transmit data at 224 Gbps.',
  '🎯  5G can theoretically reach 20 Gbps. Your average 5G phone gets about 300 Mbps.',
  '🌍  The Bitcoin network uses more electricity than Argentina. Ethereum reduced its usage 99.95%.',
  '🎨  Pantone selects a "Color of the Year" every year since 2000. It affects global design trends.',
  '🧬  CRISPR was adapted from a bacterial immune system. Nature invented gene editing first.',
  '🌈  The first computer animation appeared in a movie in 1973: "Westworld".',
  '🔮  The first video game ever created was "Nim" in 1951, running on the Nimrod computer.',
  '🎪  Pong was the first commercially successful video game (1972). Revenue: $40M.',
  '🏆  The PlayStation 2 is the best-selling console ever: 155 million units (2000–2013).',
  '🧩  Tetris was created in 1984 by Alexey Pajitnov, a Soviet software engineer.',
  '🌊  The longest-running software bug was in the Therac-25 radiation machine. It killed people.',
  '💬  The first spam email was sent in 1978 by Gary Thuerk. He got a great response rate.',
  '🔑  PGP (Pretty Good Privacy) encryption was released in 1991. "Pretty good" undersells it.',
  '🌙  The first SMS was sent on December 3, 1992: "Merry Christmas".',
  '⏱️  Unix time started at 00:00:00 UTC on January 1, 1970. The 2038 problem is coming.',
  '🤯  The 2038 bug: 32-bit systems will overflow their Unix timestamp on January 19, 2038.',
  '🎬  CGI first replaced all live action in a movie with "Final Fantasy: The Spirits Within" (2001).',
  '🌍  Wikipedia is the 13th most visited website globally. It runs on a surprisingly modest server cluster.',
  '🦾  Transformer architecture (the "T" in GPT) was published by Google Brain in 2017: "Attention Is All You Need".',
  '🔥  "Attention Is All You Need" is the most cited ML paper ever. Over 100,000 citations.',
  '🧪  Anthropic was founded in 2021. Claude first launched in 2023.',
  '📡  Starlink has over 5,500 satellites in orbit. You can see them pass overhead on a clear night.',
  '🏄  WebGL brings 3D graphics to browsers using OpenGL ES. No plugins needed since 2011.',
  '💫  The Web Audio API lets browsers do real-time audio synthesis. Your DAW could run in Chrome.',
  '⚙️  V8, the JavaScript engine in Chrome and Node.js, was written in C++. Open sourced in 2008.',
  '🌺  LLVM was started as a university research project. It now compiles Swift, Rust, Clang, and more.',
  '🎸  GCC (GNU Compiler Collection) has compiled the world\'s code since 1987.',
  '🛡️  Let\'s Encrypt has issued over 3 billion certificates. Free HTTPS for everyone.',
  '🌐  The `.com` TLD was created in 1985. The first registered domain: symbolics.com (still live!).',
  '🔬  Quantum computers use qubits. A 50-qubit quantum computer can simultaneously represent 2^50 states.',
  '🌀  IBM\'s quantum computers are available via cloud API. You can program one right now.',
  '🎭  Google\'s quantum chip "Willow" solved in 5 minutes what would take a classical computer 10^25 years.',
  '🧲  Superconducting qubits operate at -273.14°C — colder than outer space.',
  '🎰  The RSA algorithm: if you could factor a 2048-bit number, you\'d break most internet security.',
  '🔊  Sound travels at 343 m/s. Data through fibre travels at ~200,000 km/s. Not comparable.',
  '🌱  The first GPS satellite was launched in 1978. Full GPS constellation: 1995.',
  '🎯  Your GPS accuracy: ~3 metres. Military GPS: ~30 cm. DGPS: ~10 cm.',
  '🌊  Undersea cables carry 99% of international internet traffic. Satellites carry the rest.',
  '🚦  The first computer mouse was invented by Douglas Engelbart in 1964. It was made of wood.',
  '🏗️  The QWERTY keyboard layout was designed in 1873 to slow typists down and prevent typewriter jams.',
  '💡  The first touchscreen was developed at CERN in 1973. For nuclear physics, not iPhones.',
  '🔭  The first computer virus ("Creeper") appeared in 1971 on ARPANET. It displayed "I\'m the creeper, catch me if you can!"',
  '🤖  The Turing Test was proposed by Alan Turing in 1950. Most people think AI passed it in 2023.',
  '🌍  Alan Turing, the father of computer science, cracked the Enigma code and saved millions of lives.',
  '🎓  Ada Lovelace wrote the first algorithm in 1843. For a machine that didn\'t exist yet.',
  '🌙  Margaret Hamilton coined the term "software engineering" and led the Apollo 11 software team.',
  '⚡  The fastest computers operate at ~1 exaFLOP. Human brain: same. Coincidence?',
  '🧬  DNA is a 4-letter code (A, T, G, C). Computer binary is a 2-letter code (0, 1). Nature was first.',
  '🔮  The halting problem: Alan Turing proved in 1936 you can never write a program that detects if any program will halt.',
  '🎪  Gödel\'s incompleteness theorem: any consistent mathematical system has true statements it cannot prove.',
  '🎯  P vs NP: the most famous unsolved problem in computer science. $1M prize if you solve it.',
  '🌊  Quantum supremacy means a quantum computer can do something a classical computer practically cannot.',
  '🔐  Zero-knowledge proofs: prove you know something without revealing what you know. Used in ZK-rollups.',
  '🦋  Chaos theory: tiny changes in initial conditions cause wildly different outcomes. Like production deployments.',
  '🌺  The butterfly effect was named after a 1972 paper: "Does the Flap of a Butterfly\'s Wings in Brazil set off a Tornado in Texas?"',
  '🎬  The simulation hypothesis: we might be living in a computer simulation. Elon Musk thinks there\'s a 1-in-a-billion chance we\'re not.',
  '🤯  If the universe is a simulation, whoever wrote it used floating-point arithmetic. Planck length is the pixel size.',
  '🧩  Conway\'s Game of Life is Turing complete. You can run a computer inside a cellular automaton.',
  '⚙️  APL (1966) is the most concise programming language. One line can sort an array: ⍋⍵.',
  '🌈  Brainfuck is a Turing-complete language with only 8 commands. Hello World is 106 chars.',
  '🎸  Whitespace is a programming language where only spaces, tabs, and newlines are significant.',
  '🌀  LOLCODE is a real programming language. `HAI` starts a program. `KTHXBYE` ends it.',
  '🎭  Rockstar is a programming language where programs are valid rock lyrics. "Tommy was a rebel" declares a variable.',
  '🏄  Malbolge is intentionally the hardest language ever created. The first working program took 2 years.',
  '🚀  Scratch (MIT) has 100M+ registered users. Most are under 16. The next generation is already coding.',
  '🌍  COBOL was written in 1959 and still processes $3 trillion in daily financial transactions.',
  '💬  FORTRAN (1957) is the oldest high-level language still in active use. Scientists love it.',
  '🔑  SQL was invented at IBM in 1970. It\'s still the dominant query language 54 years later.',
  '🧠  Lisp was invented in 1958. AI researchers have been saying it will have its moment for 66 years.',
  '🌱  Ruby on Rails launched in 2004 and defined "convention over configuration".',
  '🔥  npm (Node Package Manager) has 2.1 million packages. Most are used by 1 project.',
  '🎯  is-even on npm: 300K weekly downloads. It checks if a number is even. One line of math.',
  '🤦  left-pad incident (2016): removing an 11-line npm package broke thousands of builds worldwide.',
  '💫  The npm package "chalk" is downloaded 600 million times per week. It colours terminal text.',
  '⚡  "The real npm stands for Not a Package Manager." — true, it\'s recursive: npm isn\'t package manager.',
  '🌊  Dependency hell: when your 5-line project has 500MB of node_modules.',
  '🎨  node_modules is the heaviest object in the universe. Confirmed by JavaScript developers.',
  '🔭  The first open-source project was DECUS in 1975. It predates the term "open source" by 23 years.',
  '🌐  Apache HTTP Server (1995) still powers ~23% of all websites. 29-year-old software, still thriving.',
  '🦾  The Linux kernel has ~30 million lines of code and 4,300+ contributors. Open, forever.',
  '🛸  Android is based on Linux. So is ChromeOS. And most web servers. Linus Torvalds: quietly dominating.',
  '🔬  Apple\'s M-series chips use TSMC\'s 3nm process. Transistors are 3nm wide. DNA is 2nm wide.',
  '🏆  The M3 Ultra chip has 192GB unified memory and 192 billion transistors. In a desktop computer.',
  '🌙  RISC-V: an open-source CPU architecture that anyone can use. The Linux of hardware.',
  '⏰  Arm Holdings chips are in ~95% of smartphones. They design the architecture, others manufacture.',
  '🎰  NVIDIA\'s H100 GPU: $30,000. Trains AI models. Demand still outstrips supply by 10x.',
  '🎸  CUDA, NVIDIA\'s GPU programming platform, was released in 2007. It accidentally became the AI standard.',
  '🌺  AMD\'s comeback: Zen architecture (2017) made Intel competitive again. Competition is healthy.',
  '💡  RAM speeds have gone from 100MHz (1996) to 7200MHz (2024). 72x faster in 28 years.',
  '🔊  PCIe 5.0 NVMe SSDs read at 14,000 MB/s. In 1990, a HDD managed 5 MB/s.',
  '🎭  USB-C: one connector to rule them all. Except it comes in 47 incompatible standards.',
  '🧬  Thunderbolt 5 pushes 120 Gbps. That\'s 15 GB/s — a 4K movie in under a second.',
  '🌊  Wi-Fi 7 (802.11be) reaches 46 Gbps. Faster than most wired connections.',
  '🚦  6G research is already underway. Target: 1 Tbps. Launch: ~2030.',
  '🎯  The average age of a startup founder at exit is 47. Not 22.',
  '🌍  Y Combinator has funded 4,000+ companies including Airbnb, Dropbox, Stripe, Reddit.',
  '🏗️  Stripe processed $1 trillion in payments in 2023. Founded 2010. Two brothers from Ireland.',
  '🤖  OpenAI was founded as a non-profit in 2015. It\'s now valued at $157 billion.',
  '🔮  Anthropic raised $7.3 billion from Google and Amazon. Claude is well-funded.',
  '🌈  Notion was almost killed in 2018 when it had $4K in the bank. Now valued at $10 billion.',
  '🎪  Figma was acquired by Adobe for $20B in 2022. The deal was blocked. Figma stayed independent.',
  '💬  Linear was built by 4 engineers. It became the default issue tracker for thousands of startups.',
  '🦊  Vercel deploys Next.js in ~45 seconds. Next.js was built by Vercel. Convenient.',
  '🧩  Supabase is Firebase but open source. They might eat Firebase\'s lunch.',
  '🌱  PlanetScale was built on Vitess, the same database tech that powers YouTube.',
  '🔐  1Password, Bitwarden, and Dashlane all store your passwords… somewhere.',
  '⚡  Cloudflare handles ~20% of global internet traffic. Invisible infrastructure, everywhere.',
  '🌐  Fastly, Akamai, CloudFront: your content is probably cached 50ms from wherever you are.',
  '📡  Twilio started with one API: send an SMS. Now it\'s a $10B communications platform.',
  '🎬  Segment was acquired by Twilio for $3.2B. Started as a Harvard class project.',
  '🏄  Mixpanel, Amplitude, PostHog: analytics tools so you know if anyone actually uses your product.',
  '🌀  "If you\'re not embarrassed by the first version of your product, you\'ve launched too late." — Reid Hoffman',
  '🎓  "The best startups aren\'t necessarily the ones that look the best on paper." — Paul Graham',
  '🌟  "Make something people want." — Y Combinator\'s core thesis, in four words.',
  '🔊  "Do things that don\'t scale." — Paul Graham. Cloudy scales. Start unscaled.',
  '💡  "The way to get startup ideas is to look for problems, preferably problems you have yourself." — Paul Graham',
  '🏆  "Build for yourself first. If you\'re not your own target user, you\'re guessing." — common founder wisdom',
  '🚀  "Default alive vs default dead: can you reach profitability before running out of money?" — Paul Graham',
  '🎯  Ramen profitable: making just enough to survive. The minimum viable revenue.',
  '🌊  "If you can\'t explain it simply, you don\'t understand it well enough." — Albert Einstein',
  '🧠  "The definition of insanity is doing the same thing over and over and expecting different results." — commonly misattributed to Einstein',
  '🤯  "The best minds of my generation are thinking about how to make people click ads." — Jeff Hammerbacher, Facebook engineer',
  '🔭  "The Internet is the most important single development in the history of human communication since the invention of call waiting." — Dave Barry',
  '🌍  "Computers are incredibly fast, accurate, and stupid. Human beings are incredibly slow, inaccurate, and brilliant." — Einstein again (probably not)',
  '⚙️  "The question of whether a computer can think is no more interesting than the question of whether a submarine can swim." — Edsger Dijkstra',
  '🎸  "It is practically impossible to teach good programming to students that have had a prior exposure to BASIC." — Edsger Dijkstra',
  '🌺  "Object-oriented programming is an exceptionally bad idea which could only have originated in California." — Edsger Dijkstra',
  '🦾  "Beware of bugs in the above code; I have only proved it correct, not tried it." — Donald Knuth',
  '🧪  "If debugging is the process of removing bugs, then programming must be the process of putting them in." — Edsger Dijkstra',
  '🎪  "Inside every large program is a small program struggling to get out." — C.A.R. Hoare',
  '🌙  "The competent programmer is fully aware of the limited size of his own skull." — Edsger Dijkstra',
  '💀  "Controlling complexity is the essence of computer programming." — Brian Kernighan',
  '🌀  "There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton',
  '🔑  "You can\'t have a bug-free program if you haven\'t thought about what you want it to do." — Steve McConnell',
  '🎭  "Good code is its own best documentation." — Steve McConnell',
  '💫  "An idiot admires complexity, a genius admires simplicity." — Terry Davis',
  '🏗️  "Simplicity is prerequisite for reliability." — Edsger Dijkstra',
  '🌐  "The software isn\'t finished until the last user is dead." — Sidney Markowitz',
  '🔥  "All problems in computer science can be solved by another level of indirection." — David Wheeler',
  '⚡  "...except for the problem of too many layers of indirection." — Kevlin Henney (addendum)',
  '🎓  "A clever person solves a problem. A wise person avoids it." — Einstein (again, probably not)',
  '🎯  "The most effective debugging tool is still careful thought, coupled with judiciously placed print statements." — Brian Kernighan',
  '🌊  "A program is never finished until the programmer dies." — unknown wise developer',
  '🔮  "Most software today is very much like an Egyptian pyramid with millions of bricks piled on top of each other, with no structural integrity, but just done by brute force." — Alan Kay',
  '🌍  "The most important thing in the programming language is the name. A language will not succeed without a good name." — Larry Wall (creator of Perl)',
  '🎸  "Perl is another example of filling a tiny need expertly, and then being used for everything." — unknown',
  '🌱  "PHP is a minor evil perpetrated and created by incompetent amateurs." — Rasmus Lerdorf, creator of PHP',
  '🦊  "Java is to JavaScript as car is to carpet." — Chris Heilmann',
  '🧬  "TypeScript: JavaScript for people who know what a type is." — oversimplified but accurate',
  '🎨  "CSS is a programming language. It\'s just not Turing complete. Yet." — disputed',
  '🌈  "HTML is not a programming language." — said confidently, started a thousand wars.',
  '🤖  "Regex is a write-only language." — every developer who has to read regex they wrote 6 months ago',
  '🎰  "There are two kinds of languages: the ones people complain about and the ones nobody uses." — Bjarne Stroustrup',
  '🔊  "C makes it easy to shoot yourself in the foot. C++ makes it harder, but when you do, it blows away your whole leg." — Bjarne Stroustrup',
  '🌀  "Rust makes you feel like a responsible adult." — every Rust convert',
  '🏄  "Go is the language that made concurrency boring. In the best way." — Go developers',
  '🧩  "Haskell is a language in which everything is possible, nothing is practical, and the type system is sentient." — functional programmers',
  '⚙️  "Erlang was designed for fault tolerance. WhatsApp uses it for 2 billion users. QED." — distributed systems fans',
  '💡  "Elixir is Erlang for people who want nice syntax and a happy community." — Elixir community',
  '🎬  "Kotlin is Java if Java were written today." — JetBrains marketing, essentially',
  '🌊  "Swift is Objective-C if Objective-C had been written by someone who liked developers." — Apple ecosystem',
  '🚀  "Dart was Google\'s answer to JavaScript. Flutter was the question nobody knew to ask." — mobile devs',
  '🏆  "The best programming language is the one that gets the job done." — pragmatists everywhere',
  '🌙  You\'ve been staring at this ticker for a while. Your code isn\'t going to run itself. Wait — actually it is.',
  '🎯  The best time to start automating was yesterday. The second best time is right now.',
  '☁️  Cloudy is waiting. Your specs are loaded. What are we building next?',
  '🔮  Tomorrow\'s developers will describe their intent. AI will handle the implementation. Welcome to tomorrow.',
  '🌟  The next big thing is a small team with a big idea and an AI that codes faster than they can think.',
  '⚡  You\'re a founder. You don\'t need a team of 50. You need Cloudy and a great spec.',
  '🚀  Solo founders used to max out at simple SaaS. Now the ceiling is infinite.',
  '🧠  The bottleneck isn\'t talent anymore. It\'s clarity of thought. Write the spec. Cloudy does the rest.',
  '🌊  "Move fast and don\'t break things" — what Cloudy\'s validation gate is for.',
  '🎪  Every great product started as a markdown file describing the problem. Write yours.',
  '💬  The best spec is the one that\'s clear enough for an AI to execute and a human to review.',
  '🔭  Ten years ago, this required a team of ten. Today, it requires you and Cloudy.',
  '🌺  Build something you\'d use every day. That\'s how you know it\'s worth building.',
  '🏗️  The only question that matters: does it solve a real problem for a real person?',
  '🎸  Ship it. Iterate. Ship again. The loop is the product.',
  '🌍  Somewhere right now, a solo founder is shipping a product that will change an industry.',
  '🤯  The gap between idea and implementation is closing fast. Cloudy is part of why.',
  '🔐  Good software is secure by default, not as an afterthought. Build it right the first time.',
  '🌈  You\'re building with the most powerful developer tools ever created. Don\'t waste the opportunity.',
  '🎯  Clarity beats cleverness. Every time. Write clear specs, get clear code.',
  '⏰  Every hour Cloudy runs autonomously is an hour you spend on what actually matters.',
  '🌱  Start with the simplest version that solves the problem. Complexity is earned, not assumed.',
  '💫  The best feature you can build is the one your users are begging for.',
  '🔊  Listen to your users more than your competitors. They know what they need.',
  '🧪  Ship, measure, learn, repeat. The fastest feedback loop wins.',
  '🌀  Every product is a hypothesis. Cloudy helps you test them faster.',
  '🎭  Done is better than perfect. Perfect is better than never shipped.',
  '🦾  Your unfair advantage: you can ship faster than any team of the same size.',
  '🌐  The internet gives you access to every customer on Earth. Cloudy helps you serve them.',
  '🔬  Great products feel inevitable in hindsight. They\'re anything but in the building.',
  '🏄  The best business is one that solves a painful problem for a defined group of people.',
  '⚡  "I would have written a shorter letter, but I did not have the time." — Pascal. Write short specs.',
  '🎓  You don\'t need permission to build. You just need a spec and a cloudy daemon.',
  '🌙  3am ideas are either genius or terrible. Write them in a spec. Let Cloudy decide.',
  '🎯  Cloudy doesn\'t get tired. Doesn\'t get distracted. Doesn\'t context-switch. It just builds.',
  '☁️  This is the way.',
];

function shuffleTicker(): string[] {
  const a = [...TICKER_ITEMS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function HeaderTicker() {
  const queueRef = React.useRef<string[]>(shuffleTicker());
  const posRef   = React.useRef(Math.floor(Math.random() * queueRef.current.length));
  const [text, setText]       = React.useState(queueRef.current[posRef.current]);
  const [animKey, setAnimKey] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => {
      posRef.current += 1;
      if (posRef.current >= queueRef.current.length) {
        queueRef.current = shuffleTicker();
        posRef.current = 0;
      }
      setText(queueRef.current[posRef.current]);
      setAnimKey((k) => k + 1);
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{ overflow: 'hidden', maxWidth: '100%' }}>
        <span key={animKey} className="ticker-text">
          {text}
        </span>
      </div>
    </div>
  );
}

function parseRunName(name: string): RunEntry {
  // Format examples:
  // 2026-03-08-0926-the-only-suite-phase-5-cloudy-spec
  // pipeline-2026-03-08-0140-p1-cloudy-phase2-spec
  // Scope-2026-03-08-1946-dashboard-inbox
  // Run-2026-03-08-2019
  const lname = name.toLowerCase();
  const isPipeline = lname.startsWith('pipeline-');
  const isScope = lname.startsWith('scope-');

  // Search for date pattern anywhere in the name (handles prefixed names like "Scope-", "Run-")
  const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/);
  let date = '';
  let spec = '';
  if (dateMatch) {
    const [full, datePart, timePart] = dateMatch;
    const hours = timePart.slice(0, 2), mins = timePart.slice(2);
    date = `${datePart} ${hours}:${mins}`;
    const afterIdx = name.indexOf(full) + full.length;
    const afterDate = name.slice(afterIdx).replace(/^[-_]/, '');
    spec = afterDate.replace(/-/g, ' ').trim();
    // Fallback: strip known prefixes (pipeline-, scope-, run-) and the date portion
    if (!spec) {
      const withoutPrefix = name.replace(/^(pipeline-|scope-|run-)/i, '');
      spec = withoutPrefix.replace(full, '').replace(/^[-_]/, '').replace(/-/g, ' ').trim() || (isScope ? 'planning run' : 'build run');
    }
  } else {
    // No date at all — just prettify the name, stripping known prefixes
    spec = name.replace(/^(pipeline-|scope-|run-)/i, '').replace(/-/g, ' ').trim() || name;
  }
  return { name, date, spec, isPipeline };
}

interface RunStateTask { id: string; title: string; status: string; }
interface RunStateSummary { startedAt?: string; completedAt?: string; costSummary?: { totalEstimatedUsd?: number }; plan?: { tasks?: RunStateTask[] }; }

function fmtDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.round((end - new Date(startedAt).getTime()) / 1000);
  if (secs < 0) return null;
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function HistoryTab({ project }: { project: ProjectStatusSnapshot }) {
  const [runs, setRuns] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, RunStateSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${project.id}/runs`)
      .then((r) => r.json())
      .then((d: string[]) => {
        setRuns(d);
        // Eagerly fetch state.json for each run (for inline task counts)
        for (const name of d) {
          fetch(`/api/projects/${project.id}/run-state/${encodeURIComponent(name)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((s: RunStateSummary | null) => { if (s) setStates((prev) => ({ ...prev, [name]: s })); })
            .catch(() => {});
        }
      })
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [project.id]);

  async function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); return next; }
      next.add(name);
      return next;
    });
    if (!logs[name]) {
      const res = await fetch(`/api/projects/${project.id}/run-log/${encodeURIComponent(name)}`).catch(() => null);
      if (res?.ok) {
        const text = await res.text();
        setLogs((prev) => ({ ...prev, [name]: text }));
      } else {
        setLogs((prev) => ({ ...prev, [name]: '(log not available)' }));
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const entries = runs.map(parseRunName);

  // Group by date
  const groups: Record<string, RunEntry[]> = {};
  for (const e of entries) {
    const day = e.date.slice(0, 10) || today;
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  }

  function dayLabel(d: string) {
    if (d === today) return 'Today';
    if (d === yesterday) return 'Yesterday';
    return d;
  }

  return (
    <div className="history-tab">
      <div className="history-header">
        <IconRocket size={16} color="#e8703a" />
        <span>{runs.length} runs</span>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16 }}>
          {[1,2,3].map((i) => <div key={i} className="skeleton skeleton-block" style={{ height: 60, opacity: 1 - (i-1)*0.2 }} />)}
        </div>
      )}

      {!loading && runs.length === 0 && (
        <div className="daemon-empty">
          <div className="daemon-empty-icon"><IconRocket size={40} color="#e8703a" /></div>
          <div className="daemon-empty-title">No runs yet</div>
          <div className="daemon-empty-sub">Run a plan from the Run tab to see history here</div>
        </div>
      )}

      {Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([day, dayRuns]) => (
        <div key={day} className="history-group">
          <div className="history-group-label">{dayLabel(day)}</div>
          {dayRuns.map((entry) => {
            const isOpen = expanded.has(entry.name);
            const st = states[entry.name];
            const tasks = st?.plan?.tasks ?? [];
            const done = tasks.filter((t) => t.status === 'completed').length;
            const failed = tasks.filter((t) => t.status === 'failed').length;
            const total = tasks.length;
            const cost = st?.costSummary?.totalEstimatedUsd;
            const isScope = entry.name.toLowerCase().startsWith('scope-');
            const duration = fmtDuration(st?.startedAt, st?.completedAt);
            // Show date inline if it differs from group day (undated runs show today's date group)
            const dateStr = entry.date ? (() => {
              const [datePart, timePart] = entry.date.split(' ');
              const d = new Date(datePart + 'T00:00:00');
              const day = d.getDate();
              const month = d.toLocaleString('en-GB', { month: 'short' });
              return `${day} ${month} · ${timePart}`;
            })() : null; // e.g. "9 Mar · 07:27"
            return (
              <div key={entry.name} className="history-run-card">
                <div className="history-run-header" onClick={() => toggleExpand(entry.name)}>
                  <div className="history-run-icon">
                    {entry.isPipeline ? <IconPipeline size={16} color="#a78bfa" /> : isScope ? <span style={{ fontSize: 14 }}>📐</span> : <IconRocket size={16} color="#e8703a" />}
                  </div>
                  <div className="history-run-info">
                    <div className="history-run-name">{entry.spec || entry.name}</div>
                    <div className="history-run-meta">
                      {entry.isPipeline && <span className="history-run-badge chain">chain</span>}
                      {isScope && <span className="history-run-badge" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>plan</span>}
                      {dateStr && <span>{dateStr}</span>}
                      {duration && <span>· {duration}</span>}
                      {total > 0 && (
                        <span style={{ color: failed > 0 ? '#ef4444' : done === total ? '#10b981' : 'var(--text-muted)' }}>
                          · {done === total && failed === 0 ? `✓ passed` : failed > 0 ? `✗ ${failed} failed` : `${done}/${total} tasks`}
                        </span>
                      )}
                      {cost != null && <span>· ${cost.toFixed(2)}</span>}
                    </div>
                  </div>
                  <span className="history-run-toggle">{isOpen ? '▾' : '▸'}</span>
                </div>
                {isOpen && (
                  <>
                    {tasks.length > 0 && (
                      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {tasks.map((t) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                            <span style={{ color: t.status === 'completed' ? '#10b981' : t.status === 'failed' ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>
                              {t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'in_progress' ? '●' : '○'}
                            </span>
                            <span style={{ color: t.status === 'failed' ? '#ef4444' : t.status === 'completed' ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="history-run-log">
                      {logs[entry.name] ?? <span className="spinner" style={{ width: 12, height: 12 }} />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── DaemonApp (root) ───────────────────────────────────────────────────

export function DaemonApp() {
  injectStyles();

  const { theme, setTheme } = useTheme();
  const [projects, setProjects] = useState<ProjectStatusSnapshot[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // ── URL/hash routing: #/{projectId}/{tab}[/{sessionId}] ─────────────
  const ALL_TABS: ActiveTab[] = ['dashboard', 'chat', 'plan', 'run', 'history', 'memory'];

  function parseHash(): { id: string | null; tab: ActiveTab; sessionId: string | null } {
    const hash = window.location.hash.slice(1);
    const parts = hash.split('/').filter(Boolean);
    const id = parts[0] ? decodeURIComponent(parts[0]) : null;
    const tab = ALL_TABS.includes(parts[1] as ActiveTab) ? (parts[1] as ActiveTab) : 'dashboard';
    // parts[2] onward: session ID may contain colons (e.g. "cc:uuid") — must decode %3A
    const sessionId = parts.slice(2).length > 0 ? decodeURIComponent(parts.slice(2).join('/')) : null;
    return { id, tab, sessionId };
  }

  const initial = parseHash();
  const [selectedId, setSelectedId] = useState<string | null>(initial.id);
  const [activeTab, setActiveTab] = useState<ActiveTab>(initial.tab);
  const [urlSessionId, setUrlSessionId] = useState<string | null>(initial.sessionId);

  // Refs for use inside stable SSE closures
  const activeTabRef = useRef<ActiveTab>(initial.tab);
  const selectedIdRef = useRef<string | null>(initial.id);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Sync hash → state on back/forward
  useEffect(() => {
    function onHashChange() {
      const { id, tab, sessionId } = parseHash();
      setSelectedId(id);
      setActiveTab(tab);
      setUrlSessionId(sessionId);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync state → hash
  function pushHash(id: string | null, tab: ActiveTab, sessionId?: string | null) {
    let newHash = id ? `#/${id}/${tab}` : '#/';
    if (sessionId && tab === 'chat') newHash += `/${encodeURIComponent(sessionId)}`;
    if (window.location.hash !== newHash) window.location.hash = newHash;
  }

  function selectProject(id: string) {
    const newTab = id !== selectedId ? 'dashboard' : activeTab;
    setSelectedId(id);
    setActiveTab(newTab);
    setUrlSessionId(null);
    pushHash(id, newTab, null);
  }

  function setActiveTabAndPush(tab: ActiveTab) {
    setActiveTab(tab);
    if (tab !== 'chat') setUrlSessionId(null);
    pushHash(selectedId, tab, tab === 'chat' ? urlSessionId : null);
  }

  function onChatSessionSelect(sessionId: string | null) {
    setUrlSessionId(sessionId);
    pushHash(selectedId, 'chat', sessionId);
  }
  const [sseConnected, setSseConnected] = useState(false);
  // Per-project output lines, keyed by projectId
  // Last plan_saved event per project
  const [planSavedEvent, setPlanSavedEvent] = useState<SavedPlan | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  // ── Initial HTTP fetch so projects appear before SSE fires ──────────
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.ok ? r.json() : null)
      .then((data: ProjectStatusSnapshot[] | null) => {
        if (data?.length) { setProjects(data); setProjectsLoaded(true); }
      })
      .catch(() => {});
  }, []);

  // ── SSE connection ─────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource('/api/live');

      es.onopen = () => setSseConnected(true);

      es.onmessage = (e) => {
        let event: SseEvent;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }

        if (event.type === 'run_started') {
          // If currently on Dashboard (idle), jump to Run tab so the user sees the run
          if (activeTabRef.current === 'dashboard') {
            setActiveTab('run');
            const id = selectedIdRef.current;
            if (id) window.location.hash = `#/${id}/run`;
          }
        } else if (event.type === 'project_status') {
          setProjects((event.projects as ProjectStatusSnapshot[]) ?? []);
          setProjectsLoaded(true);
        } else if (event.type === 'plan_saved') {
          setPlanSavedEvent(event.plan as SavedPlan);
        } else if (event.type === 'project_registered' || event.type === 'project_removed') {
          fetch('/api/projects')
            .then((r) => r.json())
            .then((data: ProjectStatusSnapshot[]) => setProjects(data))
            .catch(() => {});
        } else if (
          event.type === 'plan_completed' || event.type === 'plan_failed' ||
          event.type === 'run_completed_daemon' || event.type === 'run_failed_daemon'
        ) {
          const pid = event.projectId as string;
          // Immediately refresh project list so activeProcess clears
          fetch('/api/projects')
            .then((r) => r.json())
            .then((data: ProjectStatusSnapshot[]) => setProjects(data))
            .catch(() => {});
        }
      };

      es.onerror = () => {
        setSseConnected(false);
        es?.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    // Initial load
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: ProjectStatusSnapshot[]) => {
        setProjects(data);
      })
      .catch(() => {});

    connect();

    const pollInterval = setInterval(() => {
      fetch('/api/projects')
        .then((r) => r.json())
        .then((data: ProjectStatusSnapshot[]) => setProjects(data))
        .catch(() => {});
    }, 30_000);

    return () => {
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
      clearInterval(pollInterval);
    };
  }, []);

  // Auto-select first project when list loads
  useEffect(() => {
    if (!selectedId && projects.length > 0) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);


  const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <IconLightning size={14} color="currentColor" /> },
    { id: 'chat', label: 'Chat', icon: <IconChat size={14} color="currentColor" /> },
    { id: 'plan', label: 'Plan', icon: <IconPipeline size={14} color="currentColor" /> },
    { id: 'run', label: 'Run', icon: <IconRocket size={14} color="currentColor" /> },
    { id: 'history', label: 'History', icon: <IconCloud size={14} color="currentColor" /> },
    { id: 'memory', label: 'Memory', icon: <span style={{ fontSize: 12 }}>📋</span> },
  ];

  return (
    <div className="daemon-root">
      {/* Header */}
      <div className="daemon-header">
        <div className="daemon-header-title">☁️ Cloudy Dashboard ⚡</div>
        <HeaderTicker />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
          title={`Theme: ${theme} (click to cycle dark → light → system)`}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          {theme === 'dark' ? '🌑' : theme === 'light' ? '☀️' : '💻'}
        </button>
      </div>

      {/* Body */}
      <div className="daemon-body">
        {/* Sidebar */}
        {!projectsLoaded ? (
          <div className="daemon-sidebar" style={{ padding: '10px 12px', gap: 10, display: 'flex', flexDirection: 'column' }}>
            {[1,2,3].map((i) => (
              <div key={i} style={{ opacity: 1 - (i-1)*0.25 }}>
                <div className="skeleton skeleton-text wide" style={{ marginBottom: 5 }} />
                <div className="skeleton skeleton-text narrow" />
              </div>
            ))}
          </div>
        ) : (
        <ProjectSidebar
          projects={projects}
          selectedId={selectedId}
          onSelect={selectProject}
        />
        )}

        {/* Main */}
        <div className="daemon-main">
          {!selectedProject ? (
            projectsLoaded && projects.length === 0 ? (
              /* ── Zero-state onboarding ── */
              <div className="daemon-onboarding">
                <div className="daemon-onboarding-hero">
                  <IconCloud size={56} color="#e8703a" />
                  <div className="daemon-onboarding-title">Welcome to Cloudy</div>
                  <div className="daemon-onboarding-sub">AI-powered task orchestration for your projects</div>
                </div>

                <div className="daemon-onboarding-steps">
                  <div className="daemon-onboarding-step">
                    <div className="daemon-onboarding-step-num">1</div>
                    <div>
                      <div className="daemon-onboarding-step-title">Register a project</div>
                      <div className="daemon-onboarding-step-desc">Point cloudy at any local directory — it doesn't need to be initialised yet.</div>
                    </div>
                  </div>
                  <div className="daemon-onboarding-step">
                    <div className="daemon-onboarding-step-num">2</div>
                    <div>
                      <div className="daemon-onboarding-step-title">Write a spec</div>
                      <div className="daemon-onboarding-step-desc">Create a markdown spec file describing what you want to build. Drop it in <code>specs/</code>.</div>
                    </div>
                  </div>
                  <div className="daemon-onboarding-step">
                    <div className="daemon-onboarding-step-num">3</div>
                    <div>
                      <div className="daemon-onboarding-step-title">Plan &amp; run</div>
                      <div className="daemon-onboarding-step-desc">Select specs in the Plan tab, generate a task plan, then execute it in the Run tab.</div>
                    </div>
                  </div>
                </div>

                <button
                  className="daemon-onboarding-cta"
                  onClick={() => {
                    // Trigger the register dialog via sidebar
                    const addBtn = document.querySelector<HTMLElement>('.daemon-sidebar-add');
                    addBtn?.click();
                  }}
                >
                  + Register your first project
                </button>

                <div className="daemon-onboarding-cli">
                  Or from the terminal:&nbsp;
                  <code>cloudy dashboard</code>
                  &nbsp;in any project directory
                </div>
              </div>
            ) : (
            <div className="daemon-empty">
              <div className="daemon-empty-icon"><IconCloud size={48} color="#e8703a" /></div>
              <div className="daemon-empty-title">Select a project</div>
              <div className="daemon-empty-sub">← Choose from the sidebar to get started</div>
            </div>
            )
          ) : (
            <>
              {/* Tabs */}
              <div className="daemon-tabs">
                {TABS.map((tab) => (
                  <div
                    key={tab.id}
                    className={`daemon-tab${activeTab === tab.id ? ' active' : ''}`}
                    onClick={() => setActiveTabAndPush(tab.id)}
                  >
                    <span className="tab-icon">{tab.icon}</span>
                    {tab.label}
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                {/* Compact project info pill with hover popover */}
                <div className="tab-info-pill" tabIndex={0}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(selectedProject.status), display: 'inline-block', flexShrink: 0 }} />
                  <span className="tab-info-pill-name">{selectedProject.name}</span>
                  <div className="tab-info-popover">
                    <div className="tab-info-row"><span>Project</span><span>{selectedProject.name}</span></div>
                    {selectedProject.lastRunAt && <div className="tab-info-row"><span>Last run</span><span>{relativeTime(selectedProject.lastRunAt)}</span></div>}
                    <div className="tab-info-row"><span>Host</span><span>{window.location.host}</span></div>
                    <div className="tab-info-row"><span>Path</span><span style={{ fontFamily: 'monospace', fontSize: 10 }}>{selectedProject.path}</span></div>
                  </div>
                </div>
              </div>

              {/* Tab content */}
              <div className={`daemon-content${['chat', 'plan', 'run', 'history', 'memory'].includes(activeTab) ? ' chat-content' : ''}`}>
                {activeTab === 'dashboard' && (
                  <DashboardTab
                    key={selectedProject.id}
                    project={selectedProject}
                    onSwitchTab={setActiveTabAndPush}
                  />
                )}
                {activeTab === 'plan' && (
                  <PlanBuildTab
                    key={selectedProject.id}
                    project={selectedProject}
                    onPlanSavedEvent={planSavedEvent}
                  />
                )}
                {activeTab === 'run' && (
                  <RunTab
                    key={selectedProject.id}
                    project={selectedProject}
                  />
                )}
                {activeTab === 'chat' && (
                  <ChatTab
                    key={selectedProject.id}
                    project={selectedProject}
                    onSwitchTab={setActiveTabAndPush}
                    initialSessionId={urlSessionId}
                    onSessionSelect={onChatSessionSelect}
                  />
                )}
                {activeTab === 'history' && (
                  <HistoryTab
                    key={selectedProject.id}
                    project={selectedProject}
                  />
                )}
                {activeTab === 'memory' && (
                  <MemoryTab
                    key={selectedProject.id}
                    project={selectedProject}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
