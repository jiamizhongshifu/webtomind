// 技能运行时功能暂缓：本端点已下线。
// 原实现为未鉴权的全局运行态清理（可被任意人触发清库 / DoS，见安全审计 P1），已整体移除。

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'https://webtomind.com,https://www.webtomind.com'
)
  .split(',')
  .map((s) => s.trim());

function getCorsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (
    process.env.NODE_ENV !== 'production' &&
    (origin.includes('localhost') || origin.includes('127.0.0.1'))
  ) {
    return origin;
  }
  return ALLOWED_ORIGINS[0] || 'https://webtomind.com';
}

function getCorsHeaders(origin: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  };
}

export default async function handler(
  req: {
    method?: string;
    headers: { origin?: string };
    body?: { maxAgeMs?: number };
  },
  res: {
    setHeader: (name: string, value: string) => void;
    status: (code: number) => {
      json: (data: unknown) => void;
      end: () => void;
    };
  }
) {
  const corsHeaders = getCorsHeaders(req.headers.origin);
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res
    .status(404)
    .json({ error: 'SKILL_RUNTIME_DISABLED', message: 'This endpoint has been disabled.' });
}
