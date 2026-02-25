import { execaCommand } from 'execa';

let cachedPath: string | null = null;

export async function findClaudeBinary(): Promise<string> {
  if (cachedPath) return cachedPath;

  try {
    const { stdout } = await execaCommand('which claude');
    cachedPath = stdout.trim();
    return cachedPath;
  } catch {
    throw new Error(
      'Claude CLI not found. Install it from: https://docs.anthropic.com/en/docs/claude-code',
    );
  }
}
