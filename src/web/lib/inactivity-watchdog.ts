export interface InactivityWatchdog {
  beat: () => void;
  clear: () => void;
}

export function createInactivityWatchdog(
  onTimeout: () => void,
  timeoutMs: number
): InactivityWatchdog {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number');
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const beat = () => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      onTimeout();
    }, timeoutMs);
  };

  beat();
  return { beat, clear };
}
