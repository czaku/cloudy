import path from 'node:path';
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import os from 'node:os';
import type { ProjectMeta, SpecFile } from '../core/types.js';
import { PROJECT_META_FILE, CLAWDASH_DIR, CONFIG_FILE } from '../config/defaults.js';
import { readJson } from '../utils/fs.js';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'out']);
const EXCLUDED_FILENAMES = /^(CHANGELOG|readme|license|contributing|code_of_conduct)/i;

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function hasCloudyDir(projectPath: string): Promise<boolean> {
  const meta = path.join(projectPath, CLAWDASH_DIR, PROJECT_META_FILE);
  const cfg = path.join(projectPath, CLAWDASH_DIR, CONFIG_FILE);
  try {
    await fs.access(meta);
    return true;
  } catch {}
  try {
    await fs.access(cfg);
    return true;
  } catch {}
  return false;
}

async function readProjectMeta(projectPath: string): Promise<ProjectMeta | null> {
  const metaPath = path.join(projectPath, CLAWDASH_DIR, PROJECT_META_FILE);
  const data = await readJson<ProjectMeta>(metaPath);
  if (data?.id && data?.name) return { ...data, path: projectPath };
  // Fallback: derive from directory name
  const dirName = path.basename(projectPath);
  return {
    id: dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name: dirName,
    path: projectPath,
    registeredAt: new Date().toISOString(),
  };
}

export async function scanForProjects(scanPaths: string[]): Promise<ProjectMeta[]> {
  const found: ProjectMeta[] = [];
  const seen = new Set<string>();

  for (const rawScanPath of scanPaths) {
    const scanPath = expandPath(rawScanPath);
    if (!(await isDirectory(scanPath))) continue;

    let entries: string[] = [];
    try {
      entries = await fs.readdir(scanPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(scanPath, entry);
      if (seen.has(fullPath)) continue;
      if (!(await isDirectory(fullPath))) continue;
      if (await hasCloudyDir(fullPath)) {
        seen.add(fullPath);
        const meta = await readProjectMeta(fullPath);
        if (meta) found.push(meta);
      }
    }
  }

  return found;
}

export async function detectSpecFiles(projectPath: string): Promise<SpecFile[]> {
  const results: SpecFile[] = [];

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 3) return;
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(path.join(dir, entry.name), depth + 1);
        }
        continue;
      }

      if (!entry.name.endsWith('.md')) continue;
      if (EXCLUDED_FILENAMES.test(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 200_000) continue; // skip huge files

        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        // Find title: first non-empty, non-comment line
        const title = lines.find((l) => {
          const t = l.trim();
          return t.length > 0 && !t.startsWith('<!--');
        })?.replace(/^#+\s*/, '').trim() ?? path.basename(fullPath, '.md');

        // Collect all headings for preview
        const allHeadings = lines
          .filter((l) => /^#{1,3}\s/.test(l))
          .map((l) => l.replace(/^#+\s*/, '').trim())
          .slice(0, 8);

        results.push({
          path: fullPath,
          relativePath: path.relative(projectPath, fullPath),
          title,
          headings: allHeadings,
          sizeBytes: stat.size,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(projectPath);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// ── Claude Code session scanning ──────────────────────────────────────

export interface ClaudeCodeSession {
  id: string;           // the UUID session ID (without cc: prefix)
  source: 'claude-code';
  name: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;      // file modified within last 90 seconds
}

export interface ClaudeCodeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  // text
  text?: string;
  // tool_use
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolId?: string;
  // tool_result
  toolUseId?: string;
  resultContent?: string;
  isError?: boolean;
}

export interface ClaudeCodeMessage {
  role: 'user' | 'assistant';
  content: string;           // plain text summary (for backward compat)
  blocks: ClaudeCodeContentBlock[];
  ts: string;
}

function encodeProjectPath(projectPath: string): string {
  // Claude Code encodes paths by replacing all '/' with '-'
  return projectPath.replace(/\//g, '-');
}

function extractTextFromJSONLEntry(obj: Record<string, unknown>): string {
  // Claude Code JSONL: { type: 'user'|'assistant', message: { content: [{type:'text',text:'...'}] | string } }
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return '';
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text')
      .map((b) => String(b.text ?? ''))
      .join('');
  }
  return '';
}

export async function scanClaudeCodeSessions(projectPath: string): Promise<ClaudeCodeSession[]> {
  const encoded = encodeProjectPath(projectPath);
  const claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', encoded);

  try {
    const entries = await fs.readdir(claudeProjectDir);
    const sessions: ClaudeCodeSession[] = [];
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const sessionId = entry.replace('.jsonl', '');
      // Only UUID-format session IDs (not cloudy's timestamp-random format)
      if (!/^[0-9a-f-]{36}$/.test(sessionId)) continue;

      const filePath = path.join(claudeProjectDir, entry);
      try {
        const stat = await fs.stat(filePath);
        const active = now - stat.mtimeMs < 90_000;

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());

        let messageCount = 0;
        let firstUserText = '';
        let createdAt = stat.birthtime.toISOString();

        for (const line of lines) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const type = obj.type as string;
            if (type !== 'user' && type !== 'assistant') continue;
            messageCount++;
            const text = extractTextFromJSONLEntry(obj);
            if (type === 'user' && !firstUserText && text.trim()) {
              firstUserText = text.slice(0, 80).trim();
            }
            if (obj.timestamp && !createdAt) {
              createdAt = String(obj.timestamp);
            }
          } catch { /* skip malformed lines */ }
        }

        if (messageCount === 0) continue; // skip empty sessions

        // Skip sub-agent sessions: their first user message is an injected system context
        // (CLAUDE.md / project conventions), identifiable by a markdown heading prefix.
        if (firstUserText.startsWith('#') || firstUserText.startsWith('<context>')) continue;

        sessions.push({
          id: sessionId,
          source: 'claude-code',
          name: firstUserText || `Session ${sessionId.slice(0, 8)}`,
          preview: firstUserText,
          messageCount,
          createdAt,
          updatedAt: stat.mtime.toISOString(),
          active,
        });
      } catch { /* skip unreadable files */ }
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return []; // directory doesn't exist or not readable
  }
}

function extractBlocks(obj: Record<string, unknown>): ClaudeCodeContentBlock[] {
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return [];
  const rawContent = msg.content;
  const role = obj.type as string;
  const blocks: ClaudeCodeContentBlock[] = [];

  if (typeof rawContent === 'string') {
    if (rawContent.trim()) blocks.push({ type: 'text', text: rawContent });
    return blocks;
  }

  if (!Array.isArray(rawContent)) return blocks;

  for (const b of rawContent as Record<string, unknown>[]) {
    const btype = b.type as string;
    if (btype === 'text') {
      const text = String(b.text ?? '').trim();
      // Skip auto-generated noise: interrupt markers, image path placeholders
      if (!text) continue;
      if (text.startsWith('[Request interrupted')) continue;
      if (text.startsWith('[Image: source:')) continue;
      blocks.push({ type: 'text', text });
    } else if (btype === 'image') {
      // Keep as a special image block so the UI can show a 📷 badge
      blocks.push({ type: 'text', text: '📷 Image attached' });
    } else if (btype === 'thinking') {
      // skip — internal monologue
    } else if (btype === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        toolId: String(b.id ?? ''),
        toolName: String(b.name ?? ''),
        toolInput: (b.input ?? {}) as Record<string, unknown>,
      });
    } else if (btype === 'tool_result') {
      let resultContent = '';
      const c = b.content;
      if (typeof c === 'string') {
        resultContent = c;
      } else if (Array.isArray(c)) {
        resultContent = c
          .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
          .map((x) => String(x.text ?? ''))
          .join('');
      }
      // For user messages, tool_result without user-typed text = skip if also has a real text block
      // but only skip if resultContent is empty
      if (resultContent.trim() || b.is_error) {
        blocks.push({
          type: 'tool_result',
          toolUseId: String(b.tool_use_id ?? ''),
          resultContent: resultContent.slice(0, 4000), // cap long outputs
          isError: Boolean(b.is_error),
        });
      }
    }
  }

  // If this is a user message and all blocks are tool_result, it's a pure tool-response message
  // (no human text) — still include it so tool outputs are visible
  return blocks;
}

export interface CCSessionStats {
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

// Model pricing (per token). Default to Sonnet 4.5/4.6 prices.
function getPricing(model: string | null) {
  const m = (model ?? '').toLowerCase();
  if (m.includes('opus')) return { input: 15/1e6, cacheWrite: 18.75/1e6, cacheRead: 1.5/1e6, output: 75/1e6 };
  if (m.includes('haiku')) return { input: 0.8/1e6, cacheWrite: 1/1e6, cacheRead: 0.08/1e6, output: 4/1e6 };
  // sonnet (default)
  return { input: 3/1e6, cacheWrite: 3.75/1e6, cacheRead: 0.30/1e6, output: 15/1e6 };
}

export async function computeSessionStats(projectPath: string, sessionId: string): Promise<CCSessionStats> {
  const encoded = encodeProjectPath(projectPath);
  const filePath = path.join(os.homedir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`);

  const stats: CCSessionStats = {
    inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
    costUsd: 0, durationMs: 0, messageCount: 0, lastTool: null, firstTs: null, lastTs: null,
    model: null,
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const type = obj.type as string;
        if (type !== 'user' && type !== 'assistant') continue;

        const ts = String(obj.timestamp ?? '');
        if (ts) {
          if (!stats.firstTs) stats.firstTs = ts;
          stats.lastTs = ts;
        }

        const msg = obj.message as Record<string, unknown> | undefined;
        if (!msg) continue;

        // Count usage from assistant messages
        if (type === 'assistant') {
          stats.messageCount++;
          const usage = msg.usage as Record<string, number> | undefined;
          if (usage) {
            stats.inputTokens += usage.input_tokens ?? 0;
            stats.outputTokens += usage.output_tokens ?? 0;
            stats.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
            stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          }
          const model = msg.model as string | undefined;
          if (model && !stats.model) stats.model = model;
          // Track last tool used
          const content = msg.content;
          if (Array.isArray(content)) {
            for (const b of content as Record<string, unknown>[]) {
              if (b.type === 'tool_use') stats.lastTool = String(b.name ?? '');
            }
          }
        }
      } catch { /* skip */ }
    }

    // Compute cost using model-aware pricing
    const p = getPricing(stats.model);
    stats.costUsd =
      stats.inputTokens * p.input +
      stats.cacheWriteTokens * p.cacheWrite +
      stats.cacheReadTokens * p.cacheRead +
      stats.outputTokens * p.output;

    // Duration
    if (stats.firstTs && stats.lastTs) {
      stats.durationMs = new Date(stats.lastTs).getTime() - new Date(stats.firstTs).getTime();
    }
  } catch { /* file not found */ }

  return stats;
}

export async function loadClaudeCodeMessages(projectPath: string, sessionId: string): Promise<ClaudeCodeMessage[]> {
  const encoded = encodeProjectPath(projectPath);
  const filePath = path.join(os.homedir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const messages: ClaudeCodeMessage[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const type = obj.type as string;
        if (type !== 'user' && type !== 'assistant') continue;

        // Filter injected system/context messages that aren't real human turns
        if (type === 'user') {
          const msg = obj.message as Record<string, unknown> | undefined;
          const rawContent = msg?.content;
          if (typeof rawContent === 'string') {
            if (rawContent.startsWith('This session is being continued')) continue;
            if (rawContent.startsWith('#')) continue; // CLAUDE.md system prompt injection
            if (rawContent.startsWith('[Request interrupted')) continue;
            if (rawContent.startsWith('<task-notification>')) continue; // automated task injection
            if (rawContent.startsWith('<context>')) continue; // sub-agent context injection
            if (rawContent.startsWith('Heartbeat check on the')) continue; // pipeline monitoring
            if (rawContent.startsWith('Implement the following plan')) continue; // cloudy task prompt
            if (rawContent.startsWith('Implement the plan')) continue; // cloudy task prompt variant
            if (rawContent.startsWith('You are ')) continue; // sub-agent system prompt
            if (rawContent.startsWith('Please review')) continue; // cloudy review prompt
            if (rawContent.startsWith('Please validate')) continue; // cloudy validation prompt
            if (rawContent.startsWith('<system>')) continue; // system injection
            // Very long string-only user messages are almost always system injections (context, plans, specs)
            if (rawContent.length > 2000) continue;
          }
          // Filter array user messages that are large context injections
          if (Array.isArray(rawContent) && rawContent.length === 1) {
            const b = rawContent[0] as Record<string, unknown>;
            if (b.type === 'text' && typeof b.text === 'string') {
              const t = b.text as string;
              if (t.startsWith('This session is being continued')) continue;
              if (t.startsWith('Implement the following plan')) continue;
              if (t.startsWith('You are ')) continue;
              if (t.length > 2000) continue; // large context injection
            }
          }
        }

        const blocks = extractBlocks(obj);
        if (blocks.length === 0) continue;

        // plain text summary for backward compat
        const text = blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('');

        messages.push({
          role: type as 'user' | 'assistant',
          content: text,
          blocks,
          ts: String(obj.timestamp ?? new Date().toISOString()),
        });
      } catch { /* skip */ }
    }

    // Merge consecutive assistant entries — CC writes each tool call as a separate JSONL line
    // (text block line, then tool_use line, then tool_use line…), but they're one logical turn.
    // Also merge consecutive user tool_result-only entries (batched tool responses).
    const merged: ClaudeCodeMessage[] = [];
    for (const msg of messages) {
      const last = merged[merged.length - 1];
      const bothAssistant = last?.role === 'assistant' && msg.role === 'assistant';
      const bothUserToolOnly =
        last?.role === 'user' && msg.role === 'user' &&
        last.blocks.every((b) => b.type === 'tool_result') &&
        msg.blocks.every((b) => b.type === 'tool_result');

      if (bothAssistant || bothUserToolOnly) {
        last.blocks.push(...msg.blocks);
        if (msg.content) last.content = last.content ? `${last.content}\n${msg.content}` : msg.content;
        last.ts = msg.ts; // use latest timestamp
      } else {
        merged.push(msg);
      }
    }

    return merged;
  } catch {
    return [];
  }
}
