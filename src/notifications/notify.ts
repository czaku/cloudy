import { execa } from 'execa';

export interface NotifyOpts {
  desktop: boolean;
  sound: boolean;
}

export async function notifyRunComplete(
  taskCount: number,
  costUsd: number,
  opts: NotifyOpts,
): Promise<void> {
  const msg = `${taskCount} task${taskCount !== 1 ? 's' : ''} done · ~$${costUsd.toFixed(4)}`;
  await _notify(msg, opts);
}

export async function notifyRunFailed(
  error: string,
  opts: NotifyOpts,
): Promise<void> {
  const msg = `Run failed: ${error.split('\n')[0]}`;
  await _notify(msg, opts);
}

async function _notify(msg: string, opts: NotifyOpts): Promise<void> {
  if (opts.sound) {
    process.stdout.write('\x07');
    if (process.platform === 'darwin') {
      try {
        await execa('afplay', ['/System/Library/Sounds/Blow.aiff']);
      } catch {
        // ignore — sound failure never breaks the run
      }
    }
  }

  if (opts.desktop && process.platform === 'darwin') {
    try {
      const escaped = msg.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await execa('osascript', [
        '-e',
        `display notification "${escaped}" with title "☁️ cloudy" sound name "Glass"`,
      ]);
    } catch {
      // ignore — desktop notification failure never breaks the run
    }
  }
}
