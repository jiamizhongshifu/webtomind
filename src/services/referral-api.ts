import { getAuthToken } from './agent-api';
import { getApiBaseUrl } from '@/utils/env';
import {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_SUBSCRIPTION_REWARD_CREDITS
} from '@/shared/referral-rewards';

export interface ReferralInviteInfo {
  referralCode: string;
  activationRewardCredits: number;
  subscriptionRewardCredits: number;
}

export async function getReferralInviteInfo(): Promise<ReferralInviteInfo> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const response = await fetch(`${getApiBaseUrl()}/api/membership/referral`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok)
    throw new Error(`Referral request failed (${response.status})`);

  const data = (await response.json()) as {
    referral_code?: unknown;
    reward_amount?: unknown;
    subscription_reward_amount?: unknown;
  };
  const referralCode =
    typeof data.referral_code === 'string' ? data.referral_code.trim() : '';
  if (!referralCode) throw new Error('Referral code unavailable');

  return {
    referralCode,
    activationRewardCredits:
      Number(data.reward_amount) || REFERRAL_REWARD_CREDITS,
    subscriptionRewardCredits:
      Number(data.subscription_reward_amount) ||
      REFERRAL_SUBSCRIPTION_REWARD_CREDITS
  };
}
