/**
 * Pre-planning brainstorming gate.
 *
 * Before createPlan() runs, generates 2-3 candidate approaches to the goal
 * so the user can select one. The chosen approach is appended to the goal
 * string passed into buildPlanningPrompt(), steering the planner.
 *
 * Only runs when:
 *   - --brainstorm flag is set
 *   - Interactive mode (TTY)
 *   - Goal is >= 20 words (simple goals don't need it)
 *
 * Never runs in non-interactive / --non-interactive mode.
 */

import { runPhaseModel } from '../executor/model-runner.js';
import type { ClaudeModel, PhaseRuntimeConfig } from '../core/types.js';

export interface BrainstormApproach {
  name: string;
  pros: string[];
  cons: string[];
}

export interface BrainstormResult {
  approaches: BrainstormApproach[];
  recommended: string;
  rationale: string;
}

/**
 * Generate 2-3 candidate approaches to the goal using a Haiku call.
 * Returns null on failure so callers can fall back to direct planning.
 */
export async function brainstorm(
  goal: string,
  model: ClaudeModel,
  cwd: string,
  runtime?: PhaseRuntimeConfig,
): Promise<BrainstormResult | null> {
  const prompt = `You are a software architect doing a quick pre-planning brainstorm.

# Goal
${goal}

# Task
Generate 2-3 distinct candidate approaches to implementing this goal.
For each approach, provide:
- A short name (3-6 words)
- 2-3 pros (concrete technical benefits)
- 2-3 cons (concrete technical drawbacks or risks)

Then recommend one approach with a one-sentence rationale.

Respond with ONLY valid JSON:
{
  "approaches": [
    {
      "name": "Approach name",
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1", "Con 2"]
    }
  ],
  "recommended": "Name of recommended approach",
  "rationale": "One sentence explaining why this approach is best for this goal."
}`;

  try {
  const result = await runPhaseModel({
      prompt,
      model: 'haiku',
      cwd,
      engine: runtime?.engine,
      provider: runtime?.provider,
      account: runtime?.account,
      modelId: runtime?.modelId,
      abortSignal: AbortSignal.timeout(30_000),
      taskType: 'planning',
    });
    if (!result.success) return null;

    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as BrainstormResult;
    if (!Array.isArray(parsed.approaches) || parsed.approaches.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Returns true if the goal is complex enough to warrant brainstorming. */
export function isGoalComplexEnoughForBrainstorm(goal: string): boolean {
  return goal.trim().split(/\s+/).length >= 20;
}
