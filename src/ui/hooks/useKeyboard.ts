import { useInput } from 'ink';

interface KeyboardOptions {
  onQuit?: () => void;
  onAbort?: () => void;
  onSelectUp?: () => void;
  onSelectDown?: () => void;
  onPause?: () => void;
  onSkip?: () => void;
  onApprove?: () => void;
  onDeny?: () => void;
}

export function useKeyboard(options: KeyboardOptions) {
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      options.onQuit?.();
    }
    if (key.escape) {
      options.onAbort?.();
    }
    if (key.upArrow) {
      options.onSelectUp?.();
    }
    if (key.downArrow) {
      options.onSelectDown?.();
    }
    if (input === 'p') {
      options.onPause?.();
    }
    if (input === 's') {
      options.onSkip?.();
    }
    if (input === 'a') {
      options.onApprove?.();
    }
    if (input === 'n') {
      options.onDeny?.();
    }
  });
}
