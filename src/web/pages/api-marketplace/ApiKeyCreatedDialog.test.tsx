import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyCreatedDialog } from './ApiKeyCreatedDialog';

vi.mock('@/shared/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    title,
    children,
    footer
  }: {
    open: boolean;
    title: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={String(title)}>
        <h2>{title}</h2>
        {children}
        {footer}
      </div>
    ) : null
}));

describe('ApiKeyCreatedDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('copies the one-time secret and closes shortly after success', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    render(
      <ApiKeyCreatedDialog
        open
        secret="sk-wtm_secret-only-once"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '复制 Key' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('sk-wtm_secret-only-once');
    expect(screen.getByText('已复制，弹窗即将关闭。')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(849);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
