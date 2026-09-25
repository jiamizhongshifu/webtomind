import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SupportErrorNotice } from '../SupportErrorNotice';

describe('SupportErrorNotice', () => {
  it('shows a concrete reason and both administrator contact channels', () => {
    render(<SupportErrorNotice message="供应商请求超时" />);

    expect(screen.getByRole('alert')).toHaveTextContent('原因：供应商请求超时');
    expect(screen.getByText(/微信 your-support-id/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'X @your-support-id' })).toHaveAttribute(
      'href',
      'https://x.com/your-support-id'
    );
  });

  it('turns Failed to fetch into a concrete connection explanation', () => {
    render(<SupportErrorNotice message="Failed to fetch" />);

    expect(screen.getByRole('alert')).toHaveTextContent('无法连接服务器');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '原始错误：Failed to fetch'
    );
  });
});
