import { describe, expect, it } from 'vitest';
import {
  calculateDailyLoginReward,
  getPreviousUTCDateString,
  getUTCMonthStartString
} from '../daily-login-reward';

describe('daily login reward calculation', () => {
  it('grants once per UTC day and advances a consecutive streak', () => {
    const result = calculateDailyLoginReward({
      today: '2026-06-14',
      yesterday: '2026-06-13',
      monthClaimedBefore: 40,
      lastCheckinDate: '2026-06-13',
      consecutiveCheckinDays: 2
    });

    expect(result).toEqual({
      alreadyClaimed: false,
      capReached: false,
      reward: 10,
      monthlyCap: 100,
      monthlyClaimed: 50,
      consecutiveDays: 3
    });
  });

  it('does not grant again on the same UTC date', () => {
    const result = calculateDailyLoginReward({
      today: '2026-06-14',
      yesterday: '2026-06-13',
      monthClaimedBefore: 60,
      lastCheckinDate: '2026-06-14',
      consecutiveCheckinDays: 3
    });

    expect(result.alreadyClaimed).toBe(true);
    expect(result.capReached).toBe(false);
    expect(result.reward).toBe(0);
    expect(result.monthlyClaimed).toBe(60);
    expect(result.consecutiveDays).toBe(3);
  });

  it('caps rewards at the monthly limit without marking the day as claimed', () => {
    const result = calculateDailyLoginReward({
      today: '2026-06-14',
      yesterday: '2026-06-13',
      monthClaimedBefore: 95,
      lastCheckinDate: '2026-06-12',
      consecutiveCheckinDays: 8
    });

    expect(result.alreadyClaimed).toBe(false);
    expect(result.capReached).toBe(false);
    expect(result.reward).toBe(5);
    expect(result.monthlyClaimed).toBe(100);
    expect(result.consecutiveDays).toBe(1);
  });

  it('returns capReached when the monthly limit is already exhausted', () => {
    const result = calculateDailyLoginReward({
      today: '2026-06-14',
      yesterday: '2026-06-13',
      monthClaimedBefore: 100,
      lastCheckinDate: '2026-06-13',
      consecutiveCheckinDays: 4
    });

    expect(result.alreadyClaimed).toBe(false);
    expect(result.capReached).toBe(true);
    expect(result.reward).toBe(0);
    expect(result.monthlyClaimed).toBe(100);
    expect(result.consecutiveDays).toBe(4);
  });

  it('handles month boundary UTC helpers', () => {
    expect(getPreviousUTCDateString('2026-06-01')).toBe('2026-05-31');
    expect(getUTCMonthStartString(new Date('2026-06-30T23:59:59.000Z'))).toBe(
      '2026-06-01'
    );
  });
});
