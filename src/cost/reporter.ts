import type { CostSummary } from '../core/types.js';

export function formatCostSummary(summary: CostSummary): string {
  const lines: string[] = [];

  lines.push('=== Cost Summary ===');
  lines.push(`Total: $${summary.totalEstimatedUsd.toFixed(4)}`);
  lines.push('');

  lines.push('Tokens:');
  lines.push(`  Input:       ${formatNumber(summary.totalInputTokens)}`);
  lines.push(`  Output:      ${formatNumber(summary.totalOutputTokens)}`);
  lines.push(`  Cache Read:  ${formatNumber(summary.totalCacheReadTokens)}`);
  lines.push(`  Cache Write: ${formatNumber(summary.totalCacheWriteTokens)}`);
  lines.push('');

  if (Object.keys(summary.byPhase).length > 0) {
    lines.push('By Phase:');
    for (const [phase, usd] of Object.entries(summary.byPhase)) {
      lines.push(`  ${phase}: $${usd.toFixed(4)}`);
    }
    lines.push('');
  }

  if (Object.keys(summary.byModel).length > 0) {
    lines.push('By Model:');
    for (const [model, usd] of Object.entries(summary.byModel)) {
      lines.push(`  ${model}: $${usd.toFixed(4)}`);
    }
  }

  return lines.join('\n');
}

export function formatCostInline(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
