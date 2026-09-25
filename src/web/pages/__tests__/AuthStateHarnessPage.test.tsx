import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthStateHarnessPage } from '../AuthStateHarnessPage';

describe('AuthStateHarnessPage', () => {
  it('preserves the draft and reference state after session restoration', () => {
    render(<AuthStateHarnessPage />);

    const prompt = screen.getByRole('textbox', { name: '创作提示词' });
    fireEvent.change(prompt, {
      target: { value: '保留这段长提示词和全部参数' }
    });
    fireEvent.click(screen.getByRole('button', { name: '参考图 1' }));
    fireEvent.click(screen.getByRole('button', { name: '会话过期' }));

    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-auth-scenario',
      'expired'
    );
    expect(
      screen.getByRole('button', { name: '登录后生成' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新登录' }));

    expect(prompt).toHaveValue('保留这段长提示词和全部参数');
    expect(
      screen.getByRole('button', { name: '参考图 2' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '生成图片 · 10积分' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('auth-harness-action')).toHaveTextContent(
      'session-restored-with-draft'
    );
  });

  it('exposes a retry path for refresh failures', () => {
    render(<AuthStateHarnessPage />);

    fireEvent.click(screen.getByRole('button', { name: '刷新失败' }));
    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-auth-scenario',
      'refresh-failed'
    );

    fireEvent.click(screen.getByRole('button', { name: '重试恢复' }));

    expect(screen.getByRole('status')).toHaveAttribute(
      'data-auth-scenario',
      'refreshing'
    );
    expect(
      screen.getByRole('progressbar', { name: '恢复进度' })
    ).toBeInTheDocument();
  });
});
