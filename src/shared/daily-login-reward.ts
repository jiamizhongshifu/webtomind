export const DAILY_LOGIN_REWARD_AMOUNT = 10;
export const DAILY_LOGIN_REWARD_MONTHLY_CAP = 100;
export const DAILY_LOGIN_REWARD_SOURCE = 'daily_login_reward';

export interface DailyLoginRewardCalculationInput {
  today: string;
  yesterday: string;
  monthClaimedBefore: number;
  lastCheckinDate?: string | null;
  consecutiveCheckinDays?: number | null;
  rewardAmount?: number;
  monthlyCap?: number;
}

export interface DailyLoginRewardCalculation {
  alreadyClaimed: boolean;
  capReached: boolean;
  reward: number;
  monthlyCap: number;
  monthlyClaimed: number;
  consecutiveDays: number;
}

export function getUTCDateString(date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function getUTCMonthStartString(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .split('T')[0];
}

export function getPreviousUTCDateString(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
}

export function calculateDailyLoginReward({
  today,
  yesterday,
  monthClaimedBefore,
  lastCheckinDate,
  consecutiveCheckinDays,
  rewardAmount = DAILY_LOGIN_REWARD_AMOUNT,
  monthlyCap = DAILY_LOGIN_REWARD_MONTHLY_CAP
}: DailyLoginRewardCalculationInput): DailyLoginRewardCalculation {
  const claimedBefore = Math.max(0, Math.floor(monthClaimedBefore || 0));
  const alreadyClaimed = lastCheckinDate === today;
  const remainingMonthly = Math.max(0, monthlyCap - claimedBefore);
  const reward = alreadyClaimed ? 0 : Math.min(rewardAmount, remainingMonthly);
  const capReached = !alreadyClaimed && reward <= 0;
  const consecutiveDays =
    reward > 0
      ? lastCheckinDate === yesterday
        ? Math.max(0, Math.floor(consecutiveCheckinDays || 0)) + 1
        : 1
      : Math.max(0, Math.floor(consecutiveCheckinDays || 0));

  return {
    alreadyClaimed,
    capReached,
    reward,
    monthlyCap,
    monthlyClaimed: Math.min(monthlyCap, claimedBefore + reward),
    consecutiveDays
  };
}
