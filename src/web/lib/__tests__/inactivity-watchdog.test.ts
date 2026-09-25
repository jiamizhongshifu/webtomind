import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInactivityWatchdog } from '../inactivity-watchdog';

describe('createInactivityWatchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after a full interval without progress', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    createInactivityWatchdog(onTimeout, 1_000);

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('resets the interval on every progress beat', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createInactivityWatchdog(onTimeout, 1_000);

    vi.advanceTimersByTime(800);
    watchdog.beat();
    vi.advanceTimersByTime(800);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('does not fire after it is cleared', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createInactivityWatchdog(onTimeout, 1_000);

    watchdog.clear();
    vi.advanceTimersByTime(1_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
