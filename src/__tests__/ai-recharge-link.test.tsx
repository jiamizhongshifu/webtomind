import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AiRechargeLink } from '../web/components/AiRechargeLink';
import { isAnalyticsCollectionAllowed, trackEvent } from '../web/lib/analytics';
import { recordClientConversionEvent } from '../web/lib/client-conversion-events';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/zh-CN/prompts' })
}));
vi.mock('../web/lib/analytics', () => ({
  isAnalyticsCollectionAllowed: vi.fn(),
  trackEvent: vi.fn()
}));
vi.mock('../web/lib/client-conversion-events', () => ({
  recordClientConversionEvent: vi.fn()
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
it('keeps the native outbound link and records a consented durable click with placement', () => {
  vi.mocked(isAnalyticsCollectionAllowed).mockReturnValue(true);
  render(<AiRechargeLink placement="prompt_library" locale="zh-CN" />);
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('target', '_blank');
  const url = new URL(link.getAttribute('href')!);
  expect(url.origin).toBe('https://aicz.vip');
  expect(url.searchParams.get('utm_content')).toBe('prompt_library');
  fireEvent.click(link);
  expect(trackEvent).toHaveBeenCalledWith(
    'ai_recharge_click',
    expect.objectContaining({ placement: 'prompt_library' })
  );
  expect(recordClientConversionEvent).toHaveBeenCalledWith(
    null,
    expect.objectContaining({
      eventName: 'ai_recharge_click',
      idempotencyKey: expect.any(String),
      metadata: {
        placement: 'prompt_library',
        path: '/zh-CN/prompts',
        locale: 'zh-CN',
        link_domain: 'aicz.vip'
      }
    })
  );
});
it('does not send a durable marketing event when collection is denied or unresolved', () => {
  vi.mocked(isAnalyticsCollectionAllowed).mockReturnValue(false);
  render(<AiRechargeLink placement="home" locale="en-US" />);
  fireEvent.click(screen.getByRole('link'));
  expect(recordClientConversionEvent).not.toHaveBeenCalled();
});
