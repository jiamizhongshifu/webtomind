import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from '../ShareButton';

const clipboardWriteText = vi.fn();
const fetchMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key
  })
}));

describe('ShareButton', () => {
  beforeEach(() => {
    clipboardWriteText.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    clipboardWriteText.mockReset();
  });

  it('opens the shadcn share dialog for an existing share URL', async () => {
    const onShareChange = vi.fn();

    render(
      <ShareButton
        summaryId="summary-1"
        isShared
        shareUrl="https://webtomind.com/s/summary-1"
        onShareChange={onShareChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '分享' }));

    expect(
      await screen.findByRole('dialog', { name: '分享到互联网' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://webtomind.com/s/summary-1')
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '复制链接' }));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        'https://webtomind.com/s/summary-1'
      );
    });

    fireEvent.click(screen.getByRole('button', { name: '停止分享' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/share/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_id: 'summary-1' })
      });
      expect(onShareChange).toHaveBeenCalledWith(false);
    });
  });
});
