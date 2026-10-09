import { getCorsHeadersForRequest } from './auth';

export function isRetiredApiMarketplacePath(pathname: string): boolean {
  return /^\/(?:v1|api\/api-marketplace)(?:\/|$)/.test(pathname);
}

/** Kept separate from the legacy gateway so retired requests cannot reach billing or providers. */
export function apiMarketplaceRetiredResponse(request: Request): Response {
  const headers = {
    ...getCorsHeadersForRequest(request),
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  return new Response(
    JSON.stringify({
      error: 'API_MARKETPLACE_RETIRED',
      errorCode: 'API_MARKETPLACE_RETIRED',
      message:
        '模型广场与开发者 API 服务已下线，不再提供 API 调用、令牌管理或充值。'
    }),
    { status: 410, headers }
  );
}
