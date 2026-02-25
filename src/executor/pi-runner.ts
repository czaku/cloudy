import { execa } from 'execa';
import path from 'node:path';
import os from 'node:os';
import type { ClaudeRunResult, TokenUsage } from '../core/types.js';

export interface PiRunOptions {
  prompt: string;
  provider: string;
  model: string;
  piPath?: string;
  baseUrl?: string;
  cwd: string;
  onOutput?: (text: string) => void;
  abortSignal?: AbortSignal;
}

interface PiStreamEvent {
  type: string;
  content?: string;
  text?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  total_cost_usd?: number;
  duration_ms?: number;
}

async function findPiBinary(piPath?: string): Promise<string> {
  if (piPath && piPath !== 'pi') return piPath;

  // Try PATH first
  try {
    const { stdout } = await execa('which', ['pi'], { reject: false });
    if (stdout.trim()) return stdout.trim();
  } catch {
    // not found in PATH
  }

  // Fallback to ~/dev/pi-mono
  return path.join(os.homedir(), 'dev', 'pi-mono', 'pi');
}

function parseEvents(raw: string): PiStreamEvent[] {
  const events: PiStreamEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as PiStreamEvent);
    } catch {
      // not JSON — raw text line, treat as output
      if (trimmed) events.push({ type: 'text', content: trimmed });
    }
  }
  return events;
}

export async function runPi(options: PiRunOptions): Promise<ClaudeRunResult> {
  const { prompt, provider, model, piPath, baseUrl, cwd, onOutput, abortSignal } = options;

  const piBin = await findPiBinary(piPath);

  const args: string[] = [
    '--provider', provider,
    '--model', model,
    '--output-format', 'json',
  ];

  if (baseUrl) {
    args.push('--base-url', baseUrl);
  }

  const startTime = Date.now();
  let rawOutput = '';

  const proc = execa(piBin, args, {
    cwd,
    reject: false,
    cancelSignal: abortSignal,
    input: prompt,
  });

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      onOutput?.(text);
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      onOutput?.(text);
    });
  }

  const result = await proc;

  const events = parseEvents(rawOutput);
  const { usage, output, costUsd } = extractFromEvents(events);

  return {
    success: result.exitCode === 0,
    output: output || rawOutput.trim(),
    error: result.exitCode !== 0 ? result.stderr || 'pi process failed' : undefined,
    usage,
    durationMs: Date.now() - startTime,
    costUsd,
  };
}

function extractFromEvents(events: PiStreamEvent[]): {
  usage: TokenUsage;
  output: string;
  costUsd: number;
} {
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  let output = '';
  let costUsd = 0;

  for (const ev of events) {
    // Text/assistant chunks
    if ((ev.type === 'text' || ev.type === 'assistant') && (ev.content || ev.text)) {
      output += ev.content ?? ev.text ?? '';
    }

    // Result event — canonical final output
    if (ev.type === 'result' && (ev.content || ev.text)) {
      output = ev.content ?? ev.text ?? output;
      if (ev.total_cost_usd) costUsd = ev.total_cost_usd;
    }

    // Usage info
    if (ev.usage) {
      if (ev.usage.input_tokens) usage.inputTokens += ev.usage.input_tokens;
      if (ev.usage.output_tokens) usage.outputTokens += ev.usage.output_tokens;
    }

    // Cost from any event
    if (ev.total_cost_usd) costUsd = ev.total_cost_usd;
  }

  return { usage, output, costUsd };
}
