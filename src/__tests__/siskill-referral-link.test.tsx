import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SiSkillLink } from '../web/components/SiSkillLink';
import { isAnalyticsCollectionAllowed, trackEvent } from '../web/lib/analytics';

vi.mock('../web/lib/analytics', () => ({
  isAnalyticsCollectionAllowed: vi.fn(),
  trackEvent: vi.fn()
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each(['zh-CN', 'en-US'] as const)(
  'preserves %s and the destination campaign allowlist',
  (locale) => {
    render(
      <SiSkillLink
        placement="prompt_library"
        locale={locale}
        variant="banner"
      />
    );
    const link = screen.getByRole('link');
    const url = new URL(link.getAttribute('href')!);
    expect(url.origin).toBe('https://siskill.dev');
    expect(url.pathname).toBe(`/${locale}/overview`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'webtomind',
      utm_medium: 'referral',
      utm_campaign: 'siskill-launch',
      utm_content: 'prompt_library'
    });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
);

it('keeps navigation usable without analytics consent', () => {
  vi.mocked(isAnalyticsCollectionAllowed).mockReturnValue(false);
  render(<SiSkillLink placement="home" locale="en-US" />);
  fireEvent.click(screen.getByRole('link'));
  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    expect.stringContaining('https://siskill.dev/')
  );
  expect(trackEvent).not.toHaveBeenCalled();
});

it('records only consented placement metadata without account or page query data', () => {
  vi.mocked(isAnalyticsCollectionAllowed).mockReturnValue(true);
  render(<SiSkillLink placement="footer" locale="zh-CN" />);
  fireEvent.click(screen.getByRole('link'));
  expect(trackEvent).toHaveBeenCalledExactlyOnceWith('siskill_referral_click', {
    placement: 'footer',
    locale: 'zh-CN',
    link_domain: 'siskill.dev',
    campaign_name: 'siskill-launch'
  });
});
