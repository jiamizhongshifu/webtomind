/**
 * Referral rewards are deliberately anchored to the product's real credit
 * economy instead of an arbitrary marketing number:
 *
 * - 100 activation credits replace the referred creator's qualifying spend
 *   and cover one 2K generation (or one base generation with change).
 * - 1,000 subscription credits equal 10% of Pro's 10,000 monthly credits,
 *   keeping the paid conversion reward meaningful without eclipsing a plan.
 */
export const REFERRAL_REWARD_CREDITS = 100;
export const REFERRAL_SUBSCRIPTION_REWARD_CREDITS = 1000;
export const REFERRAL_TOTAL_INVITER_REWARD_CREDITS =
  REFERRAL_REWARD_CREDITS + REFERRAL_SUBSCRIPTION_REWARD_CREDITS;
