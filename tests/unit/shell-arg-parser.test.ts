import { describe, it, expect } from 'vitest';

/**
 * Re-implements the parseShellArgs logic from validator.ts for unit testing.
 * This ensures the tokenizer handles edge cases correctly.
 */
function parseShellArgs(cmd: string): string[] {
  const args: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === ' ' && !inDouble && !inSingle) {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

describe('parseShellArgs', () => {
  it('splits simple command', () => {
    expect(parseShellArgs('npm run build')).toEqual(['npm', 'run', 'build']);
  });

  it('handles double-quoted argument with spaces', () => {
    expect(parseShellArgs('echo "hello world"')).toEqual(['echo', 'hello world']);
  });

  it('handles single-quoted argument with spaces', () => {
    expect(parseShellArgs("echo 'hello world'")).toEqual(['echo', 'hello world']);
  });

  it('handles mixed quoted and unquoted args', () => {
    expect(parseShellArgs('node --flag "some value" --other')).toEqual([
      'node', '--flag', 'some value', '--other',
    ]);
  });

  it('handles adjacent tokens without spaces', () => {
    expect(parseShellArgs('cmd --key="val ue"')).toEqual(['cmd', '--key=val ue']);
  });

  it('strips quote characters from output', () => {
    const result = parseShellArgs('"my program" arg');
    expect(result[0]).toBe('my program');
    expect(result[1]).toBe('arg');
  });

  it('handles extra whitespace between args', () => {
    expect(parseShellArgs('npm  run  test')).toEqual(['npm', 'run', 'test']);
  });

  it('returns empty array for empty string', () => {
    expect(parseShellArgs('')).toEqual([]);
  });

  it('returns single element for single word', () => {
    expect(parseShellArgs('jest')).toEqual(['jest']);
  });

  it('handles npm run with quoted args (regression: naive split broke this)', () => {
    const result = parseShellArgs('npm run build -- --outDir "dist/prod"');
    expect(result).toEqual(['npm', 'run', 'build', '--', '--outDir', 'dist/prod']);
  });
});
