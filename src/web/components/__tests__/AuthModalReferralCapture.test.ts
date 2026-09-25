import { describe, expect, it } from 'vitest';
import type { Location } from 'react-router-dom';
import {
  parseLoginUrl,
  resolveAuthModalOptionsFromLocation
} from '../AuthModal';
import {
  setReferralShareCode,
  withReferralParam
} from '../../lib/referral-share';

describe('referral capture loop (share URL → auth modal)', () => {
  it('parses a share URL with a ref code into auth options', () => {
    const url = new URL(
      'https://webtomind.com/zh-CN/create/prompts/share/case-1?ref=ph20&source=login_modal'
    );
    expect(parseLoginUrl(url)).toMatchObject({
      referralCode: 'PH20',
      source: 'login_modal'
    });
  });

  it('keeps the ref code through a share URL built with withReferralParam', () => {
    window.sessionStorage.clear();
    setReferralShareCode('PH20');
    const shareUrl = withReferralParam(
      'https://webtomind.com/zh-CN/create/prompts/share/case-1'
    );
    const parsed = parseLoginUrl(new URL(shareUrl));
    expect(parsed.referralCode).toBe('PH20');
  });

  it('reads ref from the current location as the auth modal options source', () => {
    const location = {
      pathname: '/zh-CN/create/prompts/share/case-1',
      search: '?ref=abcd12&source=login_route_modal'
      // react-router Location requires state/key for typing; only search is read.
    } as unknown as Location;
    expect(resolveAuthModalOptionsFromLocation(location)).toMatchObject({
      referralCode: 'ABCD12',
      source: 'login_route_modal'
    });
  });

  it('returns no referral code when the share URL has none', () => {
    const url = new URL(
      'https://webtomind.com/zh-CN/create/prompts/share/case-2'
    );
    expect(parseLoginUrl(url).referralCode).toBeNull();
  });
});
