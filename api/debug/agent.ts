/**
 * Debug Agent Endpoint
 * 诊断 Agent 配置和连接状态
 */

export const config = {
  runtime: 'edge'
};

// CORS - 动态获取允许的域名
function getAllowedOrigins(): string[] {
  return (
    process.env.ALLOWED_ORIGINS ||
    'https://webtomind.com,https://www.webtomind.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getCorsOrigin(origin: string | undefined): string {
  const allowedOrigins = getAllowedOrigins();
  if (!origin) return allowedOrigins[0] || 'https://webtomind.com';
  if (allowedOrigins.includes(origin)) return origin;
  if (
    process.env.NODE_ENV !== 'production' &&
    (origin.includes('localhost') || origin.includes('127.0.0.1'))
  ) {
    return origin;
  }
  return allowedOrigins[0] || 'https://webtomind.com';
}

function jsonResponse(
  data: unknown,
  status: number,
  headers: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  });
}

export default async function handler(request: Request): Promise<Response> {
  // CORS - 动态获取
  const origin = request.headers.get('origin') || undefined;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Debug-Secret',
    'Access-Control-Allow-Credentials': 'true'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const isDev =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const debugSecret = process.env.DEBUG_SECRET;
  const providedSecret = request.headers.get('x-debug-secret') || undefined;

  if (!isDev) {
    if (!debugSecret) {
      return jsonResponse(
        {
          error: 'Debug endpoint disabled in production',
          hint: 'Set DEBUG_SECRET to enable controlled access'
        },
        403,
        corsHeaders
      );
    }
    if (providedSecret !== debugSecret) {
      return jsonResponse(
        {
          error: 'Unauthorized',
          hint: 'Provide X-Debug-Secret header'
        },
        401,
        corsHeaders
      );
    }
  }

  const checks: Array<{
    name: string;
    status: string;
    message: string;
    details?: Record<string, unknown>;
  }> = [];
  const recommendations: string[] = [];

  // 1. 检查 Claude API 配置
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const anthropicToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicModel =
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  if (anthropicToken && anthropicBaseUrl) {
    checks.push({
      name: 'Claude API (第三方代理)',
      status: 'ok',
      message: `使用第三方代理: ${anthropicBaseUrl}`,
      details: {
        baseUrl: anthropicBaseUrl,
        model: anthropicModel
      }
    });
  } else if (anthropicKey?.startsWith('sk-ant-')) {
    checks.push({
      name: 'Claude API (原生)',
      status: 'ok',
      message: '使用 Anthropic 原生 API'
    });
  } else {
    checks.push({
      name: 'Claude API',
      status: 'error',
      message: '未配置有效的 Claude API 凭证'
    });
    recommendations.push('设置 ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL');
  }

  // 2. 检查 Gemini 备选
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (googleKey) {
    checks.push({
      name: 'Gemini API (备选)',
      status: 'ok',
      message: 'Gemini API 已配置'
    });
  } else {
    checks.push({
      name: 'Gemini API (备选)',
      status: 'warning',
      message: '未配置 Gemini API'
    });
  }

  // 3. 检查 NotebookLM Worker
  const workerUrl = process.env.NLM_WORKER_URL;
  if (workerUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const healthRes = await fetch(`${workerUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const health = (await healthRes.json()) as {
        status: string;
        accounts_available?: number;
      };

      if (health.status === 'ok' && (health.accounts_available ?? 0) > 0) {
        checks.push({
          name: 'Python Worker',
          status: 'ok',
          message: `服务正常，${health.accounts_available} 个账号可用`,
          details: { workerUrl, ...health }
        });
      } else {
        checks.push({
          name: 'Python Worker',
          status: 'warning',
          message:
            health.status === 'ok'
              ? '服务运行中，但没有可用账号'
              : `服务状态: ${health.status}`,
          details: { workerUrl, ...health }
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      checks.push({
        name: 'Python Worker',
        status: 'error',
        message: `无法连接: ${errorMessage}`,
        details: { workerUrl }
      });
      recommendations.push('请确认 Python Worker 已启动');
    }
  } else {
    checks.push({
      name: 'Python Worker',
      status: 'error',
      message: '未配置 NLM_WORKER_URL'
    });
    recommendations.push('设置 NLM_WORKER_URL 环境变量');
  }

  // 4. 检查 Supabase
  const hasSupabase = !!(
    process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  );
  checks.push({
    name: 'Supabase',
    status: hasSupabase ? 'ok' : 'error',
    message: hasSupabase ? '已配置' : '未配置'
  });

  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  return jsonResponse(
    {
      timestamp: new Date().toISOString(),
      runtime: 'cloudflare-worker',
      checks,
      recommendations,
      overallStatus: hasError ? 'error' : hasWarning ? 'warning' : 'ok'
    },
    200,
    corsHeaders
  );
}
