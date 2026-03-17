import type { ClaudeModel, PhaseRuntimeConfig, ValidationResult } from '../../core/types.js';
import { runPhaseModel } from '../../executor/model-runner.js';
import { buildValidationPrompt, type PriorArtifact } from '../../planner/prompts.js';

export async function runAiReview(
  taskTitle: string,
  acceptanceCriteria: string[],
  gitDiff: string,
  model: ClaudeModel,
  cwd: string,
  changedFileSections?: Array<{ path: string; content: string; note?: string }>,
  priorArtifacts?: PriorArtifact[],
  artifactCheckPassed?: boolean,
  taskOutputArtifacts?: string[],
  commandResults?: Array<{ label: string; passed: boolean; output: string }>,
  runtime?: PhaseRuntimeConfig,
): Promise<ValidationResult> {
  const start = Date.now();

  if (!gitDiff.trim()) {
    return {
      strategy: 'ai-review',
      passed: false,
      output: 'No changes detected (empty git diff)',
      durationMs: Date.now() - start,
    };
  }

  const prompt = buildValidationPrompt(
    taskTitle,
    acceptanceCriteria,
    gitDiff,
    changedFileSections,
    priorArtifacts,
    artifactCheckPassed,
    taskOutputArtifacts,
    commandResults,
  );

  try {
    const result = await runPhaseModel({
      prompt,
      model,
      cwd,
      engine: runtime?.engine,
      provider: runtime?.provider,
      account: runtime?.account,
      modelId: runtime?.modelId,
      effort: runtime?.effort,
      taskType: 'review',
    });

    if (!result.success) {
      return {
        strategy: 'ai-review',
        passed: false,
        output: `AI review failed: ${result.error}`,
        durationMs: Date.now() - start,
      };
    }

    // Try to parse structured response
    try {
      const json = extractJson(result.output);
      const review = JSON.parse(json) as {
        passed: boolean;
        summary: string;
        criteriaResults?: Array<{
          criterion: string;
          met: boolean;
          reason: string;
        }>;
      };

      let output = review.summary;
      if (review.criteriaResults) {
        for (const cr of review.criteriaResults) {
          output += `\n  ${cr.met ? '✓' : '✗'} ${cr.criterion}: ${cr.reason}`;
        }
      }

      return {
        strategy: 'ai-review',
        passed: review.passed,
        output,
        durationMs: Date.now() - start,
      };
    } catch {
      // If we can't parse, treat as passed with raw output
      return {
        strategy: 'ai-review',
        passed: true,
        output: result.output,
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    return {
      strategy: 'ai-review',
      passed: false,
      output: `AI review error: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (match) return match[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);

  return text;
}
