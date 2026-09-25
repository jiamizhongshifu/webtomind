import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DailyLoginRewardModal,
  DailyLoginRewardNotice
} from '../DailyLoginRewardModal';

const baseProps = {
  open: true,
  reward: 120,
  localePrefix: '/zh-CN' as const,
  onClose: vi.fn()
};

describe('DailyLoginRewardModal', () => {
  it('shows only the awarded credits without task or upgrade guidance', () => {
    const onClose = vi.fn();

    render(<DailyLoginRewardModal {...baseProps} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', {
      name: '今天的积分已经到账'
    });

    expect(dialog).toHaveClass('daily-login-reward-modal');
    expect(screen.getByText('+120 积分')).toBeInTheDocument();
    expect(screen.queryByText('本月已领')).not.toBeInTheDocument();
    expect(screen.queryByText('连续登录')).not.toBeInTheDocument();
    expect(screen.queryByText('当前余额')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '升级获取更多积分' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses localized English copy when requested', () => {
    render(<DailyLoginRewardModal {...baseProps} localePrefix="/en-US" />);

    expect(
      screen.getByRole('dialog', { name: 'Today’s credits are ready' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close daily login reward' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('does not render without a visible reward', () => {
    render(<DailyLoginRewardModal {...baseProps} reward={0} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks document scrolling while the reward dialog is visible', () => {
    const { unmount } = render(<DailyLoginRewardModal {...baseProps} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.scrollbarGutter).toBe('auto');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });

  it('offers a non-blocking notice for the primary creation journey', () => {
    const onClose = vi.fn();
    render(<DailyLoginRewardNotice {...baseProps} onClose={onClose} />);

    expect(
      screen.getByRole('status', { name: '每日登录奖励' })
    ).toHaveTextContent('+120 积分');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    fireEvent.click(
      screen.getByRole('button', { name: '关闭每日登录奖励' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
