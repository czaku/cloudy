import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Dirent } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ProjectMeta, ProjectStatusSnapshot, SpecFile } from '../core/types.js';
import { listProjects, addProject, removeProject, findProject } from './registry.js';
import { detectSpecFiles, scanClaudeCodeSessions, loadClaudeCodeMessages, computeSessionStats } from './scanner.js';
import { CLAWDASH_DIR, RUNS_DIR } from '../config/defaults.js';
import { readJson, ensureDir, writeJson } from '../utils/fs.js';

// ── CC session resume tracker ─────────────────────────────────────────
// Tracks active web-initiated claude --resume processes so we can detect
// when the CLI takes over the same session file.
interface CcResumeEntry {
  child: ChildProcess;
  projectId: string;
  jsonlPath: string;
  watchTimer: ReturnType<typeof setInterval>;
  cleanupTimer: ReturnType<typeof setTimeout>;
  sizeAtExit: number;
  exited: boolean;
}
const ccResumeSessions = new Map<string, CcResumeEntry>(); // keyed by bare ccSessionId

function getCcJsonlPath(projectPath: string, ccSessionId: string): string {
  const encoded = projectPath.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded, `${ccSessionId}.jsonl`);
}

function stopCcWatcher(ccSessionId: string) {
  const entry = ccResumeSessions.get(ccSessionId);
  if (!entry) return;
  clearInterval(entry.watchTimer);
  clearTimeout(entry.cleanupTimer);
  ccResumeSessions.delete(ccSessionId);
}

const PLANS_DIR_NAME = 'plans';

// ── SavedPlan type ────────────────────────────────────────────────────

interface SavedPlan {
  id: string;
  name: string;
  goal: string;
  tasks: Array<{ id: string; title: string; status: string; description?: string }>;
  specPaths: string[];
  status: 'ready' | 'running' | 'completed' | 'failed';
  createdAt: string;
  taskCount: number;
  completedCount: number;
}

// ── Plan persistence helpers ──────────────────────────────────────────

function getPlansDir(projectPath: string): string {
  return path.join(projectPath, CLAWDASH_DIR, PLANS_DIR_NAME);
}

async function savePlanFromState(projectPath: string, planName: string, specPaths: string[]): Promise<SavedPlan | null> {
  try {
    const stateFile = path.join(projectPath, CLAWDASH_DIR, 'state.json');
    const state = await readJson<{ plan?: { goal?: string; tasks?: Array<{ id: string; title: string; status: string; description?: string }> } }>(stateFile);
    if (!state?.plan) return null;

    const id = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tasks = state.plan.tasks ?? [];
    const plan: SavedPlan = {
      id,
      name: planName || state.plan.goal || 'Unnamed Plan',
      goal: state.plan.goal ?? '',
      tasks,
      specPaths,
      status: 'ready',
      createdAt: new Date().toISOString(),
      taskCount: tasks.length,
      completedCount: tasks.filter((t) => t.status === 'completed').length,
    };

    await ensureDir(getPlansDir(projectPath));
    await writeJson(path.join(getPlansDir(projectPath), `${id}.json`), plan);
    return plan;
  } catch {
    return null;
  }
}

async function loadAllPlans(projectPath: string): Promise<SavedPlan[]> {
  const dir = getPlansDir(projectPath);
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    const plans = await Promise.all(
      files.map((f) => readJson<SavedPlan>(path.join(dir, f)).catch(() => null))
    );
    return (plans.filter(Boolean) as SavedPlan[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

// ── Chat session types ────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

interface ChatSession {
  id: string;
  projectId: string;
  name: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  streamingContent: string; // in-progress assistant message
}

// ── Chat disk persistence ─────────────────────────────────────────────

const CHATS_DIR = 'chats';
const CC_PREFIX = 'cc:';
const CC_NAMES_DIR = 'cc-names';

async function getCCName(projectPath: string, sessionId: string): Promise<string | null> {
  try {
    const f = path.join(projectPath, CLAWDASH_DIR, CC_NAMES_DIR, `${sessionId}.txt`);
    return (await fs.readFile(f, 'utf-8')).trim() || null;
  } catch { return null; }
}

async function setCCName(projectPath: string, sessionId: string, name: string): Promise<void> {
  const dir = path.join(projectPath, CLAWDASH_DIR, CC_NAMES_DIR);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `${sessionId}.txt`), name, 'utf-8');
}

function getChatsDir(projectPath: string): string {
  return path.join(projectPath, CLAWDASH_DIR, CHATS_DIR);
}

function getChatFile(projectPath: string, sessionId: string): string {
  return path.join(getChatsDir(projectPath), `${sessionId}.json`);
}

async function loadChatSession(projectPath: string, sessionId: string): Promise<ChatSession | null> {
  return readJson<ChatSession>(getChatFile(projectPath, sessionId));
}

async function saveChatSession(projectPath: string, session: ChatSession): Promise<void> {
  await ensureDir(getChatsDir(projectPath));
  const { streamingContent: _, ...toSave } = session; // don't persist streaming state
  await writeJson(getChatFile(projectPath, session.id), { ...toSave, streamingContent: '' });
}

async function listChatSessions(projectPath: string): Promise<ChatSession[]> {
  try {
    const dir = getChatsDir(projectPath);
    const entries = await fs.readdir(dir);
    const sessions: ChatSession[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const session = await readJson<ChatSession>(path.join(dir, entry));
      if (session?.id) sessions.push({ ...session, streamingContent: '' });
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

async function deleteChatSession(projectPath: string, sessionId: string): Promise<void> {
  try {
    await fs.unlink(getChatFile(projectPath, sessionId));
  } catch { /* already gone */ }
}

// ── SSE client tracking ──────────────────────────────────────────────

interface SseClient {
  res: http.ServerResponse;
  id: string;
}

let sseClients: SseClient[] = [];

function sendSse(client: SseClient, data: unknown): void {
  try {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected
  }
}

function broadcastSse(data: unknown): void {
  for (const client of sseClients) {
    sendSse(client, data);
  }
}

// ── Active child processes (per project) ────────────────────────────

interface ActiveProcess {
  type: 'init' | 'run' | 'pipeline';
  child: ChildProcess;
  projectId: string;
}

const activeProcesses = new Map<string, ActiveProcess>();

// ── Per-project output ring buffer (for replay on reconnect) ─────────

const projectOutputBuffer = new Map<string, string[]>();
const OUTPUT_BUFFER_MAX = 200;

// ── Active streaming sessions (in-memory only, not persisted) ────────

const activeChatStreams = new Map<string, ChatSession>(); // sessionId → live session during streaming

// ── Project status snapshots ─────────────────────────────────────────

async function getProjectStatus(meta: ProjectMeta): Promise<ProjectStatusSnapshot> {
  const cloudyDir = path.join(meta.path, CLAWDASH_DIR);

  let status: ProjectStatusSnapshot['status'] = 'idle';
  let lastRunAt: string | null = null;
  let activePlan = false;
  let taskProgress: { done: number; total: number } | null = null;
  let costUsd: number | null = null;

  try {
    // Check if there's an active plan
    const stateFile = path.join(cloudyDir, 'state.json');
    const state = await readJson<{ plan?: { tasks?: Array<{ status: string; completedAt?: string }> }; completedAt?: string; startedAt?: string; costSummary?: { totalEstimatedUsd?: number } }>(stateFile);

    if (state?.plan) {
      activePlan = true;
      const tasks = state.plan.tasks ?? [];
      const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
      const total = tasks.length;
      if (total > 0) taskProgress = { done, total };

      if (state.costSummary?.totalEstimatedUsd) {
        costUsd = state.costSummary.totalEstimatedUsd;
      }

      const inProgress = tasks.some((t) => t.status === 'in_progress');
      if (inProgress) {
        status = 'running';
      } else if (state.completedAt) {
        const anyFailed = tasks.some((t) => t.status === 'failed');
        status = anyFailed ? 'failed' : 'completed';
        lastRunAt = state.completedAt;
      }
    }

    // Check current run for heartbeat status
    const currentFile = path.join(cloudyDir, 'current');
    try {
      const currentRun = (await fs.readFile(currentFile, 'utf-8')).trim();
      const statusFile = path.join(cloudyDir, RUNS_DIR, currentRun, 'status.json');
      const runStatus = await readJson<{ timestamp?: string; completedTasks?: number; totalTasks?: number; costUsd?: number }>(statusFile);
      if (runStatus) {
        if (runStatus.completedTasks !== undefined && runStatus.totalTasks !== undefined) {
          taskProgress = { done: runStatus.completedTasks, total: runStatus.totalTasks };
        }
        if (runStatus.costUsd) costUsd = runStatus.costUsd;
        if (runStatus.timestamp) lastRunAt = runStatus.timestamp;
      }
    } catch { /* no current run */ }
  } catch { /* no state yet */ }

  const proc = activeProcesses.get(meta.id);

  return {
    id: meta.id,
    name: meta.name,
    path: meta.path,
    status: proc ? 'running' : status,
    lastRunAt,
    activePlan,
    taskProgress,
    costUsd,
    activeProcess: proc?.type ?? null,
  };
}

// ── Request body parsing ──────────────────────────────────────────────

function parseBody(req: http.IncomingMessage, maxBytes = 1_048_576 /* 1 MB */): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cl = req.headers['content-length'];
    if (cl && parseInt(cl, 10) > maxBytes) {
      req.resume(); // drain so socket stays reusable
      reject(new Error('Request body too large'));
      return;
    }
    let body = '';
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) { req.destroy(); reject(new Error('Request body too large')); return; }
      body += chunk.toString();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function send404(res: http.ServerResponse): void {
  sendJson(res, 404, { error: 'Not found' });
}

// ── Dashboard HTML ────────────────────────────────────────────────────

function getDashboardHtml(bundlePath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>☁️ Cloudy Dashboard ☁️</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d1117; color: #e6edf3; font-family: 'SF Mono', 'Cascadia Code', monospace; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${bundlePath}"></script>
</body>
</html>`;
}

// ── Spawn child process ───────────────────────────────────────────────

function spawnCloudyProcess(
  projectId: string,
  projectPath: string,
  type: 'init' | 'run' | 'pipeline',
  args: string[],
  planName?: string,
  specPaths?: string[],
): ChildProcess {
  const cloudyBin = process.argv[1]; // path to cloudy.js
  const child = spawn(process.execPath, [cloudyBin, ...args], {
    cwd: projectPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const proc: ActiveProcess = { type, child, projectId };
  activeProcesses.set(projectId, proc);

  const sseOutputType = type === 'init' ? 'plan_output' : 'run_output_daemon';

  // Line-buffer to avoid splitting mid-JSON-line
  function pushToBuffer(line: string) {
    const buf = projectOutputBuffer.get(projectId) ?? [];
    buf.push(line);
    if (buf.length > OUTPUT_BUFFER_MAX) buf.shift();
    projectOutputBuffer.set(projectId, buf);
  }

  // Strip ANSI codes and drop pure spinner/progress lines before broadcast
  // eslint-disable-next-line no-control-regex
  const _ansiRe = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
  function isSpinnerLine(raw: string): boolean {
    const s = raw.replace(_ansiRe, '').trim();
    if (!s || s.length <= 2) return true;
    // "Planning with sonnet… (287s)..◎" — per-second progress ticker (any variant)
    if (/^Planning with \S+/.test(s)) return true;
    // "[project] Claude" / "[project]|" / "[project]□[?25l" — terminal UI chrome
    if (/^\[[\w-]+\]/.test(s)) return true;
    // clack interactive prompt chrome — "◆ What would you like to do?"
    if (/^[◆◇]\s/.test(s)) return true;
    // clack option rows — "● ✅ Approve" / "○ ✍ Revise" / "○ ✗ Cancel"
    if (/^[●○◉◎•]\s/.test(s)) return true;
    // clack box drawing — "└", "│" alone or with whitespace
    if (/^[└│┌┐┘├┤┬┴┼─]\s*$/.test(s)) return true;
    // lone spinner chars
    if (/^[.◎○◉oO|\\\/\-]+$/.test(s)) return true;
    return false;
  }

  let stdoutBuf = '';
  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        // Structured question marker from cloudy scope — broadcast as plan_question SSE, not output
        if (line.includes('CLOUDY_PLAN_QUESTION:')) {
          const jsonStr = line.slice(line.indexOf('CLOUDY_PLAN_QUESTION:') + 'CLOUDY_PLAN_QUESTION:'.length).trim();
          try {
            const q = JSON.parse(jsonStr);
            broadcastSse({ type: 'plan_question', projectId, ...q });
          } catch { /* malformed — ignore */ }
          continue;
        }
        if (!isSpinnerLine(line)) {
          broadcastSse({ type: sseOutputType, projectId, line });
          pushToBuffer(line);
        }
      }
    });
  }

  let stderrBuf = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() && !isSpinnerLine(line)) {
          broadcastSse({ type: sseOutputType, projectId, line });
          pushToBuffer(line);
        }
      }
    });
  }

  child.on('exit', (code) => {
    activeProcesses.delete(projectId);
    projectOutputBuffer.delete(projectId);
    if (type === 'init') {
      broadcastSse({ type: code === 0 ? 'plan_completed' : 'plan_failed', projectId, code });
      if (code === 0 && planName) {
        savePlanFromState(projectPath, planName, specPaths ?? []).then((plan) => {
          if (plan) broadcastSse({ type: 'plan_saved', projectId, plan });
        });
      }
    } else {
      broadcastSse({ type: code === 0 ? 'run_completed_daemon' : 'run_failed_daemon', projectId, code });
    }
  });

  return child;
}

// ── Chat execution ────────────────────────────────────────────────────

async function streamChatMessage(
  projectPath: string,
  sessionId: string,
  userMessage: string,
  opts: { effort?: string; maxBudgetUsd?: number } = {},
): Promise<void> {
  // Load session from disk
  let session = await loadChatSession(projectPath, sessionId);
  if (!session) {
    // Create a default session if not found
    session = {
      id: sessionId,
      projectId: '',
      name: userMessage.slice(0, 40),
      model: 'sonnet',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      streamingContent: '',
    };
  }

  // Add user message to history
  session.messages.push({ role: 'user', content: userMessage, ts: new Date().toISOString() });
  session.streamingContent = '';
  session.updatedAt = new Date().toISOString();

  // Keep in active streams map
  activeChatStreams.set(sessionId, session);

  // Build system prompt with project context
  let systemPrompt = `You are a helpful AI assistant working in the context of a software project.
You help the developer understand, plan, and improve their codebase.
When asked to plan a feature or task, describe what you'd do in clear steps.
Project directory: ${projectPath}`;

  // Try to load CLAUDE.md for project context
  try {
    const claudeMd = await fs.readFile(`${projectPath}/CLAUDE.md`, 'utf-8');
    systemPrompt += `\n\nProject context (CLAUDE.md):\n${claudeMd.slice(0, 3000)}`;
  } catch { /* no CLAUDE.md */ }

  // Build conversation history as a single prompt
  const historyText = session.messages
    .slice(0, -1) // exclude the message we just added
    .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const fullPrompt = historyText
    ? `${historyText}\n\nHuman: ${userMessage}`
    : userMessage;

  // Spawn claude --print with the conversation
  const { findClaudeBinary } = await import('../utils/claude-path.js');
  const { resolveModelId, isValidModel } = await import('../config/model-config.js');

  let claudeBin: string;
  try {
    claudeBin = await findClaudeBinary();
  } catch {
    const errMsg = 'Claude binary not found';
    broadcastSse({ type: 'chat_error', sessionId: session.id, error: errMsg });
    activeChatStreams.delete(sessionId);
    return;
  }

  const modelKey = isValidModel(session.model) ? session.model : 'sonnet';
  const modelId = resolveModelId(modelKey);

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--model', modelId,
    '--system-prompt', systemPrompt,
  ];
  if (opts.effort && ['low', 'medium', 'high'].includes(opts.effort)) {
    args.push('--effort', opts.effort);
  }
  if (opts.maxBudgetUsd && opts.maxBudgetUsd > 0) {
    args.push('--max-budget-usd', String(opts.maxBudgetUsd));
  }
  args.push(fullPrompt);

  const child = spawn(claudeBin, args, {
    cwd: projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let assistantContent = '';

  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text') {
                // Stream token by token (split into words for smooth streaming)
                const newText = block.text.slice(assistantContent.length);
                assistantContent = block.text;
                session!.streamingContent = assistantContent;
                if (newText) {
                  broadcastSse({ type: 'chat_token', sessionId: session!.id, token: newText });
                }
              }
            }
          }
        } catch { /* not JSON — ignore */ }
      }
    });
  }

  await new Promise<void>((resolve) => {
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });

  // Commit final assistant message
  if (assistantContent) {
    session.messages.push({ role: 'assistant', content: assistantContent, ts: new Date().toISOString() });
  } else {
    session.messages.push({ role: 'assistant', content: '(no response)', ts: new Date().toISOString() });
  }
  session.streamingContent = '';
  session.updatedAt = new Date().toISOString();

  // Save to disk
  await saveChatSession(projectPath, session);

  // Remove from active streams
  activeChatStreams.delete(sessionId);

  broadcastSse({ type: 'chat_done', sessionId: session.id, message: session.messages[session.messages.length - 1] });
}

// ── Chat streaming for CC sessions (resume) ──────────────────────────

async function streamChatMessageResume(
  projectPath: string,
  ccSessionId: string,  // bare UUID, no cc: prefix
  userMessage: string,
  projectId: string,
): Promise<void> {
  const { findClaudeBinary } = await import('../utils/claude-path.js');
  let claudeBin: string;
  try {
    claudeBin = await findClaudeBinary();
  } catch {
    broadcastSse({ type: 'chat_error', sessionId: `${CC_PREFIX}${ccSessionId}`, error: 'Claude binary not found' });
    return;
  }

  const compositeId = `${CC_PREFIX}${ccSessionId}`;
  const jsonlPath = getCcJsonlPath(projectPath, ccSessionId);

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--resume', ccSessionId,
    userMessage,
  ];

  const child = spawn(claudeBin, args, {
    cwd: projectPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let assistantContent = '';
  let sizeAtExit = 0;
  let exited = false;

  if (child.stdout) {
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'text') {
                const newText = block.text.slice(assistantContent.length);
                assistantContent = block.text;
                if (newText) {
                  broadcastSse({ type: 'chat_token', sessionId: compositeId, token: newText });
                }
              }
            }
          }
        } catch { /* skip */ }
      }
    });
  }

  child.on('exit', async () => {
    exited = true;
    try { sizeAtExit = (await fs.stat(jsonlPath)).size; } catch { sizeAtExit = 0; }
  });

  // Watch the JSONL file: if it grows AFTER our child exits, the CLI took over → re-lock
  const watchTimer = setInterval(async () => {
    if (!exited) return; // child still running — all writes are ours
    try {
      const stat = await fs.stat(jsonlPath);
      if (stat.size > sizeAtExit) {
        // External write detected — CLI has resumed this session
        stopCcWatcher(ccSessionId);
        broadcastSse({ type: 'cc_session_locked', sessionId: compositeId, projectId });
      }
    } catch { /* file gone — ignore */ }
  }, 1000);

  // Auto-clean watcher after 60s max (user unlikely to resume that far after)
  const cleanupTimer = setTimeout(() => stopCcWatcher(ccSessionId), 60_000);

  ccResumeSessions.set(ccSessionId, { child, projectId, jsonlPath, watchTimer, cleanupTimer, sizeAtExit, exited });

  await new Promise<void>((resolve) => {
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });

  const finalMessage = { role: 'assistant' as const, content: assistantContent || '(no response)', ts: new Date().toISOString() };
  broadcastSse({ type: 'chat_done', sessionId: compositeId, message: finalMessage });
}

// ── HTTP request handler ──────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, bundleDir: string): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── Static assets ────────────────────────────────────────────────
  if (pathname === '/bundle.js') {
    try {
      const bundleFile = path.join(bundleDir, 'bundle.js');
      const content = await fs.readFile(bundleFile);
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(content);
      return;
    } catch {
      send404(res);
      return;
    }
  }

  // ── SSE live stream ──────────────────────────────────────────────
  if (pathname === '/api/live' && method === 'GET') {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':\n\n'); // keep-alive comment

    const client: SseClient = { res, id: clientId };
    sseClients.push(client);

    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== client);
    });

    // Send initial snapshot
    const projects = await listProjects().catch(() => [] as ProjectMeta[]);
    const snapshots = await Promise.all(projects.map(getProjectStatus));
    sendSse(client, { type: 'project_status', projects: snapshots });

    // Replay buffered output lines for any active process
    for (const [pid, lines] of projectOutputBuffer) {
      const proc = activeProcesses.get(pid);
      const outputType = proc?.type === 'init' ? 'plan_output' : 'run_output_daemon';
      for (const line of lines) {
        sendSse(client, { type: outputType, projectId: pid, line });
      }
    }
    return;
  }

  // ── Projects list ────────────────────────────────────────────────
  if (pathname === '/api/projects' && method === 'GET') {
    const projects = await listProjects().catch(() => [] as ProjectMeta[]);
    const snapshots = await Promise.all(projects.map(getProjectStatus));
    sendJson(res, 200, snapshots);
    return;
  }

  // ── Register project ────────────────────────────────────────────
  if (pathname === '/api/projects/register' && method === 'POST') {
    try {
      const body = await parseBody(req) as Partial<ProjectMeta>;
      if (!body.id || !body.name || !body.path) {
        sendJson(res, 400, { error: 'id, name, and path are required' });
        return;
      }
      await addProject({
        id: body.id,
        name: body.name,
        path: body.path,
        registeredAt: new Date().toISOString(),
      });
      sendJson(res, 200, { ok: true });
      broadcastSse({ type: 'project_registered', projectId: body.id });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return;
  }

  // ── Project-specific routes ──────────────────────────────────────
  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    const subpath = projectMatch[2] ?? '';

    // DELETE /api/projects/:id
    if (method === 'DELETE' && subpath === '') {
      await removeProject(projectId).catch(() => {});
      sendJson(res, 200, { ok: true });
      broadcastSse({ type: 'project_removed', projectId });
      return;
    }

    const meta = await findProject(projectId).catch(() => undefined);
    if (!meta && subpath !== '') {
      send404(res);
      return;
    }

    // GET /api/projects/:id
    if (method === 'GET' && subpath === '') {
      if (!meta) { send404(res); return; }
      const snapshot = await getProjectStatus(meta);
      sendJson(res, 200, snapshot);
      return;
    }

    // GET /api/projects/:id/specs
    if (method === 'GET' && subpath === '/specs') {
      if (!meta) { send404(res); return; }
      const specs = await detectSpecFiles(meta.path).catch(() => [] as SpecFile[]);
      sendJson(res, 200, specs);
      return;
    }

    // GET /api/projects/:id/state
    if (method === 'GET' && subpath === '/state') {
      if (!meta) { send404(res); return; }
      try {
        const stateFile = path.join(meta.path, CLAWDASH_DIR, 'state.json');
        const state = await readJson(stateFile);
        sendJson(res, 200, state ?? {});
      } catch {
        sendJson(res, 200, {});
      }
      return;
    }

    // GET /api/projects/:id/runs
    if (method === 'GET' && subpath === '/runs') {
      if (!meta) { send404(res); return; }
      try {
        const runsDir = path.join(meta.path, CLAWDASH_DIR, RUNS_DIR);
        const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => [] as Dirent[]);
        const runNames = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
          .reverse()
          .slice(0, 20);
        sendJson(res, 200, runNames);
      } catch {
        sendJson(res, 200, []);
      }
      return;
    }

    // GET /api/projects/:id/run-log/:runName
    if (method === 'GET' && subpath.startsWith('/run-log/')) {
      if (!meta) { send404(res); return; }
      const runName = decodeURIComponent(subpath.slice('/run-log/'.length));
      const logFile = path.join(meta.path, CLAWDASH_DIR, RUNS_DIR, runName, 'logs', 'cloudy.log');
      try {
        const content = await fs.readFile(logFile, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(content.slice(-8000)); // last 8KB
      } catch {
        res.writeHead(404);
        res.end('Log not found');
      }
      return;
    }

    // GET /api/projects/:id/memory  (CLAUDE.md + .claude/MEMORY.md etc)
    if (method === 'GET' && subpath === '/memory') {
      if (!meta) { send404(res); return; }
      const candidates = [
        path.join(meta.path, 'CLAUDE.md'),
        path.join(meta.path, '.claude', 'MEMORY.md'),
        path.join(meta.path, '.claude', 'memory', 'MEMORY.md'),
      ];
      const files: Array<{ path: string; content: string }> = [];
      for (const f of candidates) {
        try {
          const content = await fs.readFile(f, 'utf-8');
          files.push({ path: f.replace(meta.path + '/', ''), content });
        } catch { /* file doesn't exist — skip */ }
      }
      const combined = files.map((r) => `# ${r.path}\n\n${r.content}`).join('\n\n---\n\n');
      sendJson(res, 200, { files, content: combined });
      return;
    }

    // GET /api/projects/:id/plans
    if (method === 'GET' && subpath === '/plans') {
      if (!meta) { send404(res); return; }
      const plans = await loadAllPlans(meta.path);
      sendJson(res, 200, plans);
      return;
    }

    // DELETE /api/projects/:id/plans/:planId
    if (method === 'DELETE' && subpath.startsWith('/plans/')) {
      if (!meta) { send404(res); return; }
      const planId = subpath.slice('/plans/'.length);
      const planFile = path.join(getPlansDir(meta.path), `${planId}.json`);
      try {
        await fs.unlink(planFile);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 404, { error: 'Plan not found' });
      }
      return;
    }

    // POST /api/projects/:id/plan
    if (method === 'POST' && subpath === '/plan') {
      if (!meta) { send404(res); return; }
      if (activeProcesses.has(projectId)) {
        sendJson(res, 409, { error: 'A process is already running. Stop it first.' });
        return;
      }
      try {
        const body = await parseBody(req) as { specPaths?: string[]; planName?: string; model?: string };

        // Fast-fail: check spec sizes before spawning anything
        const MAX_FILE_BYTES = 30_000;
        const MAX_COMBINED_BYTES = 50_000;
        const specPaths = body.specPaths ?? [];
        let combinedBytes = 0;
        for (const sp of specPaths) {
          let stat: { size: number } | null = null;
          try { stat = await fs.stat(sp); } catch { /* file not found — let init handle it */ }
          if (stat && stat.size > MAX_FILE_BYTES) {
            sendJson(res, 422, {
              error: `Spec file "${path.basename(sp)}" is ${Math.round(stat.size / 1024)}KB — exceeds the ${Math.round(MAX_FILE_BYTES / 1024)}KB limit.`,
              hint: 'Good specs are focused: one feature, 2–10KB. Large files like TASKS.md are reference docs — not specs. Write a dedicated spec for the feature you want to build.',
            });
            return;
          }
          combinedBytes += stat?.size ?? 0;
        }
        if (combinedBytes > MAX_COMBINED_BYTES) {
          sendJson(res, 422, {
            error: `Combined specs are ${Math.round(combinedBytes / 1024)}KB — exceeds the ${Math.round(MAX_COMBINED_BYTES / 1024)}KB combined limit.`,
            hint: 'Plan one feature at a time. Split your work into separate spec files and run cloudy init once per feature.',
          });
          return;
        }

        const specArgs: string[] = [];
        for (const sp of specPaths) specArgs.push('--spec', sp);
        const modelArg = body.model ? ['--model', body.model] : ['--model', 'sonnet'];
        // Generate a stable run-name so scope exits immediately after saving the plan
        // (--run-name triggers pipeline-mode exit, preventing scope from auto-spawning cloudy run)
        const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '');
        const slug = specPaths[0]
          ? path.basename(specPaths[0], '.md').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24)
          : 'plan';
        const runName = `scope-${ts}-${slug}`;
        spawnCloudyProcess(projectId, meta.path, 'init', [
          'scope', ...specArgs, ...modelArg, '--run-name', runName,
        ], body.planName, specPaths);
        sendJson(res, 200, { ok: true, started: true });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }

    // POST /api/projects/:id/plan-input
    if (method === 'POST' && subpath === '/plan-input') {
      const proc = activeProcesses.get(projectId);
      if (!proc || !proc.child.stdin) {
        sendJson(res, 404, { error: 'No active planning process' });
        return;
      }
      try {
        const body = await parseBody(req) as { answer?: string; action?: string; feedback?: string };
        const line = (body.answer ?? body.action ?? '') + '\n';
        proc.child.stdin.write(line);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }

    // POST /api/projects/:id/run
    if (method === 'POST' && subpath === '/run') {
      if (!meta) { send404(res); return; }
      if (activeProcesses.has(projectId)) {
        sendJson(res, 409, { error: 'A process is already running. Stop it first.' });
        return;
      }
      try {
        const body = await parseBody(req) as { executionModel?: string; reviewModel?: string; planIds?: string[] };
        const execModel = body.executionModel ?? 'sonnet';
        const reviewModel = body.reviewModel ?? 'sonnet';

        if (body.planIds?.length) {
          // Load the first plan and run it
          const planFile = path.join(getPlansDir(meta.path), `${body.planIds[0]}.json`);
          const plan = await readJson<SavedPlan>(planFile).catch(() => null);
          if (plan?.specPaths?.length) {
            const specArgs: string[] = [];
            for (const sp of plan.specPaths) specArgs.push('--spec', sp);
            spawnCloudyProcess(projectId, meta.path, 'run', ['run', '--agent-output', ...specArgs]);
            sendJson(res, 200, { ok: true, started: true });
            return;
          }
        }

        spawnCloudyProcess(projectId, meta.path, 'run', [
          'build',
          '--non-interactive',
          '--agent-output',
          '--execution-model', execModel,
          '--task-review-model', 'haiku',
          '--run-review-model', reviewModel,
          '--heartbeat-interval', '5',
        ]);
        broadcastSse({ type: 'run_started', projectId });
        sendJson(res, 200, { ok: true, started: true });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }

    // POST /api/projects/:id/pipeline
    if (method === 'POST' && subpath === '/pipeline') {
      if (!meta) { send404(res); return; }
      if (activeProcesses.has(projectId)) {
        sendJson(res, 409, { error: 'A process is already running. Stop it first.' });
        return;
      }
      try {
        const body = await parseBody(req) as { specPaths?: string[] };
        const specArgs: string[] = [];
        for (const sp of body.specPaths ?? []) {
          specArgs.push('--spec', sp);
        }
        spawnCloudyProcess(projectId, meta.path, 'pipeline', [
          'pipeline', ...specArgs,
        ]);
        sendJson(res, 200, { ok: true, started: true });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }

    // POST /api/projects/:id/stop
    if (method === 'POST' && subpath === '/stop') {
      const proc = activeProcesses.get(projectId);
      if (!proc) {
        sendJson(res, 404, { error: 'No active process' });
        return;
      }
      proc.child.kill('SIGTERM');
      sendJson(res, 200, { ok: true });
      return;
    }

    // POST /api/projects/:id/retry
    if (method === 'POST' && subpath === '/retry') {
      if (!meta) { send404(res); return; }
      if (activeProcesses.has(projectId)) {
        sendJson(res, 409, { error: 'A process is already running. Stop it first.' });
        return;
      }
      try {
        const body = await parseBody(req) as { taskId?: string; executionModel?: string; reviewModel?: string };
        const execModel = body.executionModel ?? 'sonnet';
        const reviewModel = body.reviewModel ?? 'sonnet';
        const retryArgs = body.taskId ? ['--retry', body.taskId] : ['--retry-failed'];
        spawnCloudyProcess(projectId, meta.path, 'run', [
          'build', '--non-interactive', '--agent-output',
          '--execution-model', execModel,
          '--task-review-model', 'haiku',
          '--run-review-model', reviewModel,
          '--heartbeat-interval', '5',
          ...retryArgs,
        ]);
        broadcastSse({ type: 'run_started', projectId });
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }

    // GET /api/projects/:id/chats
    if (method === 'GET' && subpath === '/chats') {
      if (!meta) { send404(res); return; }
      const [cloudySessions, ccSessions] = await Promise.all([
        listChatSessions(meta.path),
        scanClaudeCodeSessions(meta.path),
      ]);
      const cloudyItems = cloudySessions.map((s) => ({
        id: s.id,
        name: s.name,
        model: s.model,
        source: 'cloudy' as const,
        locked: false,
        messageCount: s.messages.length,
        updatedAt: s.updatedAt,
        preview: s.messages.find((m) => m.role === 'user')?.content.slice(0, 80) ?? '',
      }));
      const ccItems = await Promise.all(ccSessions.map(async (s) => {
        const override = await getCCName(meta!.path, s.id);
        return {
          id: `${CC_PREFIX}${s.id}`,
          name: override ?? s.name,
          model: 'claude-code',
          source: 'claude-code' as const,
          locked: s.active,
          messageCount: s.messageCount,
          updatedAt: s.updatedAt,
          preview: s.preview,
        };
      }));
      // Filter out trivial CC sessions (agent sub-tasks, tool invocations, etc.)
      const meaningfulCcItems = ccItems.filter((s) => s.messageCount >= 5);
      // Merge and sort by updatedAt descending
      const all = [...cloudyItems, ...meaningfulCcItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      sendJson(res, 200, all);
      return;
    }

    // POST /api/projects/:id/chats  (create session)
    if (method === 'POST' && subpath === '/chats') {
      if (!meta) { send404(res); return; }
      const body = await parseBody(req) as { model?: string; name?: string };
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const session: ChatSession = {
        id: sessionId,
        projectId,
        name: body.name ?? 'New chat',
        model: body.model ?? 'sonnet',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        streamingContent: '',
      };
      await saveChatSession(meta.path, session);
      sendJson(res, 200, session);
      return;
    }

    // PATCH /api/projects/:id/chats/:sessionId  (rename/update)
    // GET /api/projects/:id/chats/:sessionId/stats  (CC session stats)
    if (method === 'GET' && subpath.match(/^\/chats\/cc:[^/]+\/stats$/)) {
      if (!meta) { send404(res); return; }
      const sessionId = subpath.replace('/chats/cc:', '').replace('/stats', '');
      const stats = await computeSessionStats(meta.path, sessionId);
      sendJson(res, 200, stats);
      return;
    }

    // PATCH /api/projects/:id/chats/cc:sessionId  (rename CC session)
    if (method === 'PATCH' && subpath.startsWith('/chats/cc:')) {
      if (!meta) { send404(res); return; }
      const sessionId = subpath.replace('/chats/cc:', '');
      const body = await parseBody(req) as { name?: string };
      if (body.name) {
        await setCCName(meta.path, sessionId, body.name.trim());
        sendJson(res, 200, { ok: true });
      } else {
        sendJson(res, 400, { error: 'name required' });
      }
      return;
    }

    // PATCH /api/projects/:id/chats/:sessionId  (rename/update cloudy session)
    const patchMatch = subpath.match(/^\/chats\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      if (!meta) { send404(res); return; }
      const sessionId = patchMatch[1];
      const body = await parseBody(req) as { name?: string; model?: string };
      const session = await loadChatSession(meta.path, sessionId);
      if (!session) { send404(res); return; }
      if (body.name !== undefined) session.name = body.name;
      if (body.model !== undefined) session.model = body.model;
      session.updatedAt = new Date().toISOString();
      await saveChatSession(meta.path, session);
      sendJson(res, 200, session);
      return;
    }

    // GET /api/projects/:id/chats/:sessionId  (full session)
    const getSessionMatch = subpath.match(/^\/chats\/([^/]+)$/);
    if (method === 'GET' && getSessionMatch) {
      if (!meta) { send404(res); return; }
      const rawId = getSessionMatch[1];
      if (rawId.startsWith(CC_PREFIX)) {
        const ccId = rawId.slice(CC_PREFIX.length);
        const messages = await loadClaudeCodeMessages(meta.path, ccId);
        sendJson(res, 200, { id: rawId, name: '', model: 'claude-code', source: 'claude-code', messages, createdAt: '', updatedAt: '' });
        return;
      }
      const session = await loadChatSession(meta.path, rawId);
      if (!session) { send404(res); return; }
      sendJson(res, 200, session);
      return;
    }

    // DELETE /api/projects/:id/chats/:sessionId
    const chatDeleteMatch = subpath.match(/^\/chats\/([^/]+)$/);
    if (method === 'DELETE' && chatDeleteMatch) {
      if (!meta) { send404(res); return; }
      await deleteChatSession(meta.path, chatDeleteMatch[1]);
      sendJson(res, 200, { ok: true });
      return;
    }

    // POST /api/projects/:id/chat  (send message — creates session if needed)
    if (method === 'POST' && subpath === '/chat') {
      if (!meta) { send404(res); return; }
      try {
        const body = await parseBody(req) as { sessionId?: string; message: string; model?: string; effort?: string; maxBudgetUsd?: number };
        if (!body.message?.trim()) {
          sendJson(res, 400, { error: 'message required' });
          return;
        }

        // Reject if CC session is locked (CLI active or web resume already in-flight)
        if (body.sessionId?.startsWith(CC_PREFIX)) {
          const ccId = (body.sessionId as string).slice(CC_PREFIX.length);
          // Already streaming a reply for this session?
          if (ccResumeSessions.has(ccId)) {
            sendJson(res, 423, { error: 'Already streaming a response for this session' });
            return;
          }
          const { scanClaudeCodeSessions: scan } = await import('./scanner.js');
          const sessions = await scan(meta.path);
          const ccSession = sessions.find((s) => s.id === ccId);
          if (ccSession?.active) {
            sendJson(res, 423, { error: 'Session is currently open in Claude Code CLI' });
            return;
          }
        }

        let sessionId = body.sessionId;
        if (!sessionId) {
          // Create new session
          sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const newSession: ChatSession = {
            id: sessionId,
            projectId,
            name: body.message.slice(0, 40).trim(),
            model: body.model ?? 'sonnet',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            streamingContent: '',
          };
          await saveChatSession(meta.path, newSession);
          broadcastSse({ type: 'chat_session_created', projectId, session: { id: sessionId, name: newSession.name, model: newSession.model } });
        }

        // Update model if provided
        if (body.model) {
          const s = await loadChatSession(meta.path, sessionId);
          if (s) { s.model = body.model; await saveChatSession(meta.path, s); }
        }

        // Send response immediately, stream via SSE
        sendJson(res, 200, { sessionId, ok: true });

        // Stream in background
        const streamFn = sessionId.startsWith(CC_PREFIX)
          ? streamChatMessageResume(meta.path, sessionId.slice(CC_PREFIX.length), body.message.trim(), projectId)
          : streamChatMessage(meta.path, sessionId, body.message.trim(), { effort: body.effort, maxBudgetUsd: body.maxBudgetUsd });
        streamFn.catch((err: unknown) => {
          broadcastSse({ type: 'chat_error', sessionId, error: String(err) });
        });
      } catch (err) {
        sendJson(res, 500, { error: String(err) });
      }
      return;
    }
  }

  // ── Root dashboard ──────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    const html = getDashboardHtml('/bundle.js');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  send404(res);
}

// ── Start server ──────────────────────────────────────────────────────

export async function startDaemonServer(port: number, bundleDir: string): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, bundleDir);
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => {
      resolve(server);
    });
  });
}

// ── Background status broadcast ───────────────────────────────────────

export function startStatusBroadcast(intervalMs = 5000): NodeJS.Timeout {
  return setInterval(async () => {
    if (sseClients.length === 0) return;
    const projects = await listProjects().catch(() => [] as ProjectMeta[]);
    const snapshots = await Promise.all(projects.map(getProjectStatus));
    broadcastSse({ type: 'project_status', projects: snapshots });
  }, intervalMs);
}
