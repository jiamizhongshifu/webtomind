/**
 * 简单的健康检查端点 - 不使用 Hono
 */

import { getCorsHeadersForRequest } from './utils/auth';

export const config = {
  runtime: 'edge',
};

export default function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  return new Response(
    JSON.stringify({
      status: 'ok',
      version: '1.2.3',
      timestamp: new Date().toISOString(),
      runtime: 'edge',
      path: new URL(request.url).pathname,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}
