/**
 * Vercel Serverless Function - /api/auth/me
 * 获取当前用户信息（共享实现）
 */

import { getCorsHeadersForRequest } from '../utils/auth';
import { getAuthMeResult } from '../utils/auth-me';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const result = await getAuthMeResult(request.headers.get('Authorization'));
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}
