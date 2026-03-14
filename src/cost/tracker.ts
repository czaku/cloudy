import type {
  ClaudeRunResult,
  CostSummary,
  Engine,
  TaskCostData,
} from '../core/types.js';
import { estimateCost } from './pricing.js';

export class CostTracker {
  private entries: TaskCostData[] = [];

  record(
    model: string,
    phase: 'planning' | 'execution' | 'validation',
    result: ClaudeRunResult,
    engine: Engine = 'claude-code',
  ): TaskCostData {
    const usd =
      result.costUsd > 0
        ? result.costUsd
        : estimateCost(
            model,
            result.usage.inputTokens,
            result.usage.outputTokens,
            result.usage.cacheReadTokens,
            result.usage.cacheWriteTokens,
          );

    const entry: TaskCostData = {
      model,
      engine,
      phase,
      usage: { ...result.usage },
      estimatedUsd: usd,
    };

    this.entries.push(entry);
    return entry;
  }

  getSummary(): CostSummary {
    const summary: CostSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalEstimatedUsd: 0,
      byPhase: {},
      byModel: {},
    };

    for (const entry of this.entries) {
      summary.totalInputTokens += entry.usage.inputTokens;
      summary.totalOutputTokens += entry.usage.outputTokens;
      summary.totalCacheReadTokens += entry.usage.cacheReadTokens;
      summary.totalCacheWriteTokens += entry.usage.cacheWriteTokens;
      summary.totalEstimatedUsd += entry.estimatedUsd;

      summary.byPhase[entry.phase] =
        (summary.byPhase[entry.phase] ?? 0) + entry.estimatedUsd;
      summary.byModel[entry.model] =
        (summary.byModel[entry.model] ?? 0) + entry.estimatedUsd;
    }

    return summary;
  }

  getEntries(): TaskCostData[] {
    return [...this.entries];
  }
}
