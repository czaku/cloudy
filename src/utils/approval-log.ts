import fs from 'node:fs/promises';
import path from 'node:path';
import { CLAWDASH_DIR, LOGS_DIR } from '../config/defaults.js';

export interface ApprovalLogRecord {
  timestamp: string;
  taskId: string;
  stage: 'pre_task' | 'failure_escalation';
  action: string;
  autoTriggered: boolean;
  hint?: string;
}

/**
 * Append an approval decision as a JSON line to .cloudy/logs/approvals.jsonl
 */
export async function logApproval(cwd: string, record: ApprovalLogRecord): Promise<void> {
  const logsDir = path.join(cwd, CLAWDASH_DIR, LOGS_DIR);
  await fs.mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'approvals.jsonl');
  await fs.appendFile(logPath, JSON.stringify(record) + '\n', 'utf-8');
}
