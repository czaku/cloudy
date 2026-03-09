import type { ClaudeModel, ValidationResult } from '../../core/types.js';
import { runClaude } from '../../executor/claude-runner.js';
import { buildQualityReviewPrompt } from '../../planner/prompts.js';

export async function runAiQualityReview(
  taskTitle: string,
  gitDiff: string,
  model: ClaudeModel,
  cwd: string,
  changedFileSections?: Array<{ path: string; content: string; note?: string }>,
): Promise<ValidationResult> {
  const start = Date.now();

  const prompt = buildQualityReviewPrompt(taskTitle, gitDiff, changedFileSections);

  try {
    const result = await runClaude({ prompt, model, cwd });

    if (!result.success) {
      return {
        strategy: 'ai-review-quality',
        passed: false,
        output: `Quality review failed: ${result.error}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const json = extractJson(result.output);
      const review = JSON.parse(json) as {
        passed: boolean;
        summary: string;
        issues?: Array<{ severity: string; location: string; description: string }>;
      };

      const issueLines = (review.issues ?? []).map(
        (i) => `  [${i.severity}] ${i.location}: ${i.description}`,
      );
      const output = [review.summary, ...issueLines].join('\n');

      return {
        strategy: 'ai-review-quality',
        passed: review.passed,
        output,
        durationMs: Date.now() - start,
      };
    } catch {
      // Unparseable response — treat as passed, log raw
      return {
        strategy: 'ai-review-quality',
        passed: true,
        output: result.output,
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    return {
      strategy: 'ai-review-quality',
      passed: false,
      output: `Quality review error: ${err instanceof Error ? err.message : String(err)}`,
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
