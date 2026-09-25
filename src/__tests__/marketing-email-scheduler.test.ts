import { describe, expect, it } from 'vitest';
import {
  buildCheckoutRecoveryContent,
  buildSegmentOfferContent,
  getCheckoutRecoveryCampaignKey
} from '../../api/marketing/email-scheduler';

const forbiddenPrimaryCreditCopy = [
  'Start small with a credit package',
  'Add credits',
  '可以先从小积分包开始',
  '补充积分'
];

describe('reengagement email positioning', () => {
  it.each(['initial_30m', 'followup_6h'] as const)(
    'restores the unique unpaid order at the %s stage to Pro monthly',
    (stage) => {
      const content = buildCheckoutRecoveryContent('zh-CN', stage);
      const url = new URL(content.ctaUrl);
      expect(url.pathname).toBe('/zh-CN/pricing');
      expect(url.searchParams.get('plan')).toBe('pro');
      expect(url.searchParams.get('mode')).toBe('monthly');
      expect(url.searchParams.get('utm_campaign')).toBe(
        `checkout_recovery_${stage}`
      );
      expect(getCheckoutRecoveryCampaignKey('order-1', stage, 'zh-CN')).toBe(
        `limited_offer:checkout_recovery:order-1:${stage}:zh-CN`
      );
    }
  );

  it.each([
    ['en-US', 'checkout_started_no_purchase'],
    ['en-US', 'generated_no_purchase'],
    ['zh-CN', 'checkout_started_no_purchase'],
    ['zh-CN', 'generated_no_purchase']
  ] as const)(
    'keeps Pro as the primary recommendation for %s %s',
    (locale, segment) => {
      const content = buildSegmentOfferContent(locale, segment, null);
      const completeCopy = [
        content.subject,
        content.previewText,
        content.title,
        content.intro,
        content.bodyHtml,
        content.textBody,
        content.ctaLabel
      ].join('\n');

      expect(completeCopy).toContain('Pro');
      forbiddenPrimaryCreditCopy.forEach((copy) => {
        expect(completeCopy).not.toContain(copy);
      });
      const ctaUrl = new URL(content.ctaUrl);
      const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
      expect(ctaUrl.pathname).toBe(`${localePrefix}/pricing`);
      expect(ctaUrl.searchParams.has('returnTo')).toBe(false);
      expect(ctaUrl.searchParams.get('utm_campaign')).toBe(
        `reengagement_${segment}`
      );
      expect(ctaUrl.searchParams.get('utm_source')).toBe('email');
    }
  );

  it('positions credit packs only as temporary extra capacity', () => {
    const english = buildSegmentOfferContent(
      'en-US',
      'generated_no_purchase',
      null
    );
    const chinese = buildSegmentOfferContent(
      'zh-CN',
      'generated_no_purchase',
      null
    );

    expect(english.bodyHtml).toContain(
      'credit packs only for temporary extra capacity'
    );
    expect(chinese.bodyHtml).toContain('积分包仅用于临时追加额度');
  });
});
