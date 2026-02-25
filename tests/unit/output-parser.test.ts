import { describe, it, expect } from 'vitest';
import {
  parseStreamMessages,
  extractResultText,
  extractCost,
} from '../../src/executor/output-parser.js';

describe('parseStreamMessages', () => {
  it('parses valid JSON lines', () => {
    const raw = [
      '{"type": "assistant", "content": "hello"}',
      '{"type": "result", "result": "done", "total_cost_usd": 0.01}',
    ].join('\n');

    const messages = parseStreamMessages(raw);
    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('assistant');
    expect(messages[1].type).toBe('result');
  });

  it('skips invalid JSON lines', () => {
    const raw = [
      'not json',
      '{"type": "assistant", "content": "hello"}',
      '',
      'also not json',
    ].join('\n');

    const messages = parseStreamMessages(raw);
    expect(messages).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(parseStreamMessages('')).toEqual([]);
    expect(parseStreamMessages('\n\n')).toEqual([]);
  });

  it('skips objects without type field', () => {
    const raw = '{"data": "something"}\n{"type": "assistant", "content": "hi"}';
    const messages = parseStreamMessages(raw);
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('assistant');
  });
});

describe('extractResultText', () => {
  it('prefers result message', () => {
    const messages = [
      { type: 'assistant', content: 'partial' },
      { type: 'result', result: 'final answer' },
    ];
    expect(extractResultText(messages)).toBe('final answer');
  });

  it('falls back to concatenated assistant content', () => {
    const messages = [
      { type: 'assistant', content: 'hello ' },
      { type: 'assistant', content: 'world' },
    ];
    expect(extractResultText(messages)).toBe('hello world');
  });

  it('handles empty messages', () => {
    expect(extractResultText([])).toBe('');
  });
});

describe('extractCost', () => {
  it('extracts cost from result message', () => {
    const messages = [
      { type: 'result', total_cost_usd: 0.042 },
    ];
    expect(extractCost(messages)).toBe(0.042);
  });

  it('returns 0 when no cost info', () => {
    const messages = [{ type: 'assistant', content: 'hi' }];
    expect(extractCost(messages)).toBe(0);
  });
});
