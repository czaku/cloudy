/** Minimal ANSI color helpers — no runtime dependencies. */

const R = '\x1b[0m';

export const bold = '\x1b[1m';
export const dim = '\x1b[2m';

export const red = '\x1b[31m';
export const green = '\x1b[32m';
export const yellow = '\x1b[33m';
export const blue = '\x1b[34m';
export const cyan = '\x1b[36m';
export const white = '\x1b[37m';

export const greenBright = '\x1b[92m';
export const yellowBright = '\x1b[93m';
export const cyanBright = '\x1b[96m';
export const whiteBright = '\x1b[97m';

/** Wrap text in an ANSI style, then reset. Styles can be combined: c(bold+cyan, 'hi'). */
export function c(style: string, text: string): string {
  return `${style}${text}${R}`;
}
