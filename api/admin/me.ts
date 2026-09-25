/**
 * GET /api/admin/me
 * 后台路由守卫用：返回当前管理员信息（或 403）。
 */

import { getCorsHeadersForRequest, requireAdmin } from '../utils/auth';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  const [admin, denied] = await requireAdmin(request);
  if (denied) return denied;
  return new Response(JSON.stringify({ success: true, admin }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
