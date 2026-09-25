export const FREE_DAILY_CREDITS = 100;
export const FREE_DAILY_IMAGE_GENERATION_LIMIT = 1;
export const REFERRAL_DAILY_IMAGE_CREDIT_SPEND_LIMIT = 100;

export function getCreditProgressPercent(
  current: number,
  limit: number
): number {
  if (!Number.isFinite(current) || !Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (current / limit) * 100));
}

export type PlanLimitsPolicy = {
  maxMaterials?: number;
  maxConversations?: number;
  dailyCredits?: number;
  dailyImageGeneration?: number;
  maxFileSizeMb?: number;
  [key: string]: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function isFreePlanName(planName?: string | null): boolean {
  return String(planName || '').toLowerCase() === 'free';
}

export function normalizePlanLimits(
  limits: unknown,
  planName?: string | null
): PlanLimitsPolicy {
  const normalized: PlanLimitsPolicy = isPlainObject(limits)
    ? { ...limits }
    : {};
  const legacyDailyImageGeneration = toFiniteNumber(normalized.dailyImageGen);
  const canonicalDailyImageGeneration = toFiniteNumber(
    normalized.dailyImageGeneration
  );

  delete normalized.dailyImageGen;

  if (isFreePlanName(planName)) {
    return {
      ...normalized,
      dailyCredits: FREE_DAILY_CREDITS,
      dailyImageGeneration: FREE_DAILY_IMAGE_GENERATION_LIMIT
    };
  }

  if (
    canonicalDailyImageGeneration === undefined &&
    legacyDailyImageGeneration !== undefined
  ) {
    normalized.dailyImageGeneration = legacyDailyImageGeneration;
  } else if (canonicalDailyImageGeneration !== undefined) {
    normalized.dailyImageGeneration = canonicalDailyImageGeneration;
  }

  return normalized;
}
