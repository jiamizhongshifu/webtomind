const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

type RateLimitRecord = {
  count: number;
  resetTime: number;
};

const memoryStore = new Map<string, RateLimitRecord>();
let lastMemoryCleanupAt = 0;

function cleanupExpiredMemoryRecords(now: number): void {
  if (now - lastMemoryCleanupAt < RATE_LIMIT_WINDOW_MS) return;
  lastMemoryCleanupAt = now;
  for (const [key, record] of memoryStore.entries()) {
    if (record.resetTime <= now) {
      memoryStore.delete(key);
    }
  }
}

function checkMemoryRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  cleanupExpiredMemoryRecords(now);
  const record = memoryStore.get(identifier);

  if (!record || now > record.resetTime) {
    memoryStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

async function checkUpstashRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
} | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const key = `ratelimit:${identifier}`;
  try {
    const incrementResp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([['INCR', key], ['PEXPIRE', key, RATE_LIMIT_WINDOW_MS]])
    });

    if (!incrementResp.ok) return null;

    const incrementData = (await incrementResp.json()) as Array<{
      result: number;
    }>;

    const currentCount = Number(incrementData?.[0]?.result || 0);
    if (!Number.isFinite(currentCount) || currentCount <= 0) return null;

    if (currentCount > RATE_LIMIT_MAX_REQUESTS) {
      return { allowed: false, remaining: 0 };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - currentCount
    };
  } catch {
    return null;
  }
}

export async function checkRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const distributedResult = await checkUpstashRateLimit(identifier);
  if (distributedResult) {
    return distributedResult;
  }

  return checkMemoryRateLimit(identifier);
}
