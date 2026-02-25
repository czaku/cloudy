/**
 * In-process MCP server that exposes task graph tools to executing agents.
 *
 * Mounted via the SDK's mcpServers option, these tools let executing Claude
 * agents pull information lazily (rather than front-loading everything into
 * the prompt) and report discoveries back to the orchestrator at runtime.
 *
 * Available tools (all prefixed `mcp__cloudy-tasks__`):
 *   get_completed_tasks        — list completed task IDs + titles + summaries
 *   get_handoff_summary        — dependency handoffs for a specific task
 *   report_new_file            — agent reports a file it created (beyond outputArtifacts)
 *   report_subtask             — agent surfaces a subtask it discovered
 *   get_spec                   — returns the full goal / spec text
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Task, Plan } from '../core/types.js';

export interface TaskMcpCallbacks {
  /** Called when the agent reports a new file it created. */
  onFileReported?: (path: string) => void;
  /** Called when the agent surfaces a new subtask. */
  onSubtaskReported?: (title: string, description: string, dependsOn: string[]) => void;
}

/**
 * Build an in-process MCP server scoped to a single task execution.
 *
 * @param plan     The full plan (for goal text + all tasks)
 * @param taskId   The ID of the task currently executing
 * @param getHandoffs  Async function that returns formatted handoff text for a task's deps
 * @param callbacks    Optional callbacks for agent-reported discoveries
 */
export function buildTaskMcpServer(
  plan: Plan,
  taskId: string,
  getHandoffs: (taskId: string) => Promise<string | undefined>,
  callbacks: TaskMcpCallbacks = {},
) {
  const { onFileReported, onSubtaskReported } = callbacks;

  return createSdkMcpServer({
    name: 'cloudy-tasks',
    version: '1.0.0',
    tools: [
      // ── get_completed_tasks ───────────────────────────────────────────────
      tool(
        'get_completed_tasks',
        'Returns the list of tasks that have already been completed in this run, with their titles and summaries. Use this to understand what has been built before starting your task.',
        {},
        async () => {
          const completed = plan.tasks.filter(
            (t) => t.status === 'completed' && t.id !== taskId,
          );
          if (completed.length === 0) {
            return { content: [{ type: 'text', text: 'No tasks completed yet.' }] };
          }
          const lines = completed.map((t: Task) => {
            const summary = t.resultSummary ? ` — ${t.resultSummary}` : '';
            const files = t.outputArtifacts?.length
              ? ` [files: ${t.outputArtifacts.slice(0, 5).join(', ')}]`
              : '';
            return `• ${t.id}: ${t.title}${summary}${files}`;
          });
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        },
      ),

      // ── get_handoff_summary ───────────────────────────────────────────────
      tool(
        'get_handoff_summary',
        'Returns the handoff summary written by a dependency task — what it built, what APIs/types it exposed, and key decisions made. Call this for each task in your dependency list before starting implementation.',
        { task_id: z.string().describe('The dependency task ID to get the handoff for') },
        async ({ task_id }) => {
          const text = await getHandoffs(task_id).catch(() => undefined);
          if (!text) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No handoff summary found for task ${task_id}. It may not have written one yet.`,
                },
              ],
            };
          }
          return { content: [{ type: 'text', text }] };
        },
      ),

      // ── get_spec ─────────────────────────────────────────────────────────
      tool(
        'get_spec',
        'Returns the overall project goal / spec for this run. Use this to understand the full context of what is being built.',
        {},
        async () => ({
          content: [{ type: 'text', text: plan.goal }],
        }),
      ),

      // ── report_new_file ───────────────────────────────────────────────────
      tool(
        'report_new_file',
        'Report a file you created that is not listed in your outputArtifacts. This helps the orchestrator track what was actually built. Call once per extra file.',
        { file_path: z.string().describe('Relative path of the file you created') },
        async ({ file_path }) => {
          onFileReported?.(file_path);
          return {
            content: [{ type: 'text', text: `Noted: ${file_path} recorded as a created file.` }],
          };
        },
      ),

      // ── report_subtask ───────────────────────────────────────────────────
      tool(
        'report_subtask',
        'Surface a follow-up task you discovered while implementing your task. The orchestrator will add it to the plan for future execution. Use sparingly — only for genuine required work.',
        {
          title: z.string().describe('Short title for the subtask'),
          description: z
            .string()
            .describe('What needs to be done, with enough context for another agent'),
          depends_on: z
            .array(z.string())
            .optional()
            .describe('Task IDs this subtask must wait for (usually includes the current task)'),
        },
        async ({ title, description, depends_on }) => {
          onSubtaskReported?.(title, description, depends_on ?? [taskId]);
          return {
            content: [
              {
                type: 'text',
                text: `Subtask "${title}" recorded — it will be added to the plan after this task completes.`,
              },
            ],
          };
        },
      ),
    ],
  });
}
