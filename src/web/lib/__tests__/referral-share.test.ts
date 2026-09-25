import { beforeEach, describe, expect, it } from 'vitest';
import {
  getReferralShareCode,
  primeReferralShareCode,
  setReferralShareCode,
  withReferralParam
} from '../referral-share';

describe('referral share code cache', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores and reads the cached referral code', () => {
    setReferralShareCode('PH20');
    expect(getReferralShareCode()).toBe('PH20');
  });

  it('does not overwrite an existing code', () => {
    setReferralShareCode('FIRST');
    primeReferralShareCode(async () => 'SECOND');
    expect(getReferralShareCode()).toBe('FIRST');
  });

  it('primes the code from the async loader when empty', async () => {
    primeReferralShareCode(async () => 'PH20');
    await Promise.resolve();
    await Promise.resolve();
    expect(getReferralShareCode()).toBe('PH20');
  });

  it('appends ref to a share URL and keeps an existing ref', () => {
    setReferralShareCode('PH20');
    expect(withReferralParam('https://webtomind.com/zh-CN/create/prompts/share/case-1')).toBe(
      'https://webtomind.com/zh-CN/create/prompts/share/case-1?ref=PH20'
    );
    expect(
      withReferralParam('https://webtomind.com/zh-CN/prompts/case?ref=OTHER')
    ).toBe('https://webtomind.com/zh-CN/prompts/case?ref=OTHER');
  });

  it('returns the URL unchanged without a cached code', () => {
    expect(
      withReferralParam('https://webtomind.com/zh-CN/prompts/case')
    ).toBe('https://webtomind.com/zh-CN/prompts/case');
  });

  it('leaves relative URLs untouched instead of absolutizing them', () => {
    setReferralShareCode('PH20');
    expect(withReferralParam('/zh-CN/create/prompts/share/case-1')).toBe(
      '/zh-CN/create/prompts/share/case-1'
    );
  });
});
