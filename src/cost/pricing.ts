interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  opus: {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  sonnet: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  haiku: {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (inputTokens / 1_000_000) * p.inputPerMillion +
    (outputTokens / 1_000_000) * p.outputPerMillion +
    (cacheReadTokens / 1_000_000) * p.cacheReadPerMillion +
    (cacheWriteTokens / 1_000_000) * p.cacheWritePerMillion
  );
}

export function getPricing(model: string): ModelPricing | undefined {
  return PRICING[model];
}
