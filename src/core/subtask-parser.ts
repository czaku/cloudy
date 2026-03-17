import type { Task } from './types.js';

/**
 * Parse a `## SUBTASKS` block from Claude's output and return new Task objects.
 *
 * Expected format:
 * ## SUBTASKS
 * - [task-2-a] Title here (depends: task-2)
 * - [task-2-b] Other title (depends: task-2-a)
 */
export function parseSubtasks(output: string, parent: Task): Task[] {
  // Note: no `m` flag so `$` anchors to true end-of-string (not line-end)
  const subtasksMatch = output.match(/##\s+SUBTASKS\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!subtasksMatch) return [];

  const block = subtasksMatch[1];
  const lineRegex = /^-\s+\[([^\]]+)\]\s+(.+?)(?:\s+\(depends:\s*([^)]+)\))?\s*$/;

  const tasks: Task[] = [];

  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;

    const match = trimmed.match(lineRegex);
    if (!match) continue;

    const [, id, title, depsRaw] = match;
    const dependencies = depsRaw
      ? depsRaw.split(',').map((d) => d.trim()).filter(Boolean)
      : [];

    tasks.push({
      id: id.trim(),
      title: title.trim(),
      description: title.trim(),
      acceptanceCriteria: [],
      dependencies,
      contextPatterns: parent.contextPatterns ?? [],
      outputArtifacts: [],
      allowedWritePaths: parent.allowedWritePaths ?? [],
      validationOverrides: parent.validationOverrides,
      status: 'pending',
      retries: 0,
      maxRetries: parent.maxRetries,
      ifFailed: parent.ifFailed,
      timeout: parent.timeout,
      parentTaskId: parent.id,
    });
  }

  return tasks;
}
