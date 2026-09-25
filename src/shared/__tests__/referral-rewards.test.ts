import { describe, expect, it } from 'vitest';
import { FREE_DAILY_CREDITS } from '../credit-policy';
import { IMAGE_GENERATION_LARGE_2K_CREDIT_COST } from '../image-generation-pricing';
import {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_SUBSCRIPTION_REWARD_CREDITS,
  REFERRAL_TOTAL_INVITER_REWARD_CREDITS
} from '../referral-rewards';

describe('referral reward economy', () => {
  it('keeps activation reward aligned with one free-day or 2K generation', () => {
    expect(REFERRAL_REWARD_CREDITS).toBe(FREE_DAILY_CREDITS);
    expect(REFERRAL_REWARD_CREDITS).toBe(IMAGE_GENERATION_LARGE_2K_CREDIT_COST);
  });

  it('caps the paid conversion reward at 10% of Pro monthly credits', () => {
    const proMonthlyCredits = 10_000;

    expect(REFERRAL_SUBSCRIPTION_REWARD_CREDITS).toBe(proMonthlyCredits * 0.1);
    expect(REFERRAL_TOTAL_INVITER_REWARD_CREDITS).toBe(1_100);
  });
});
