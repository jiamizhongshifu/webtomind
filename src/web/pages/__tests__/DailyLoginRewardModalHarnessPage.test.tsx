import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyLoginRewardModalHarnessPage } from '../DailyLoginRewardModalHarnessPage';

describe('DailyLoginRewardModalHarnessPage', () => {
  it('renders the isolated reward-only modal and tracks dismissal', () => {
    render(<DailyLoginRewardModalHarnessPage />);

    expect(screen.getByText('ISOLATED PREVIEW HARNESS')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '今天的积分已经到账' })
    ).toBeInTheDocument();

    expect(screen.getByText('+120 积分')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '升级获取更多积分' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    expect(screen.getByTestId('harness-status')).toHaveTextContent('closed');
  });
});
