/**
 * Revoke Share Link API
 * POST /api/share/revoke
 *
 * Revokes (deactivates) a public share link.
 * Requires authentication and ownership verification.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserIdFromRequest,
  getCorsHeadersForRequest,
  getSupabaseAdmin
} from '../utils/auth';

export const config = {
  runtime: 'edge'
};

// 使用共享的 Supabase Admin 客户端
function getSupabase(): SupabaseClient | null {
  return getSupabaseAdmin();
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const body = (await request.json()) as { summary_id?: string };
    const { summary_id } = body;

    if (!summary_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'MISSING_SUMMARY_ID',
            message: 'summary_id is required'
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 安全修复：只通过 Authorization header 获取用户身份，移除 _auth_token 支持
    const userId = await getUserIdFromRequest(request);

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const sb = getSupabase();
    if (!sb) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'DB_ERROR', message: 'Database not configured' }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify summary exists and user owns it
    const { data: summary, error: summaryError } = await sb
      .from('summaries')
      .select('id, user_id')
      .eq('id', summary_id)
      .single();

    if (summaryError || !summary) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'SUMMARY_NOT_FOUND', message: 'Summary not found' }
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (summary.user_id !== userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not own this summary' }
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Revoke all active share links for this summary
    const { error: updateError, count } = await sb
      .from('share_links')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString()
      })
      .eq('summary_id', summary_id)
      .eq('is_active', true);

    if (updateError) {
      console.error('[Share] Revoke error:', updateError);
      throw updateError;
    }

    console.log(
      '[Share] Revoked share links for summary:',
      summary_id,
      'count:',
      count
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    console.error('[Share] Revoke error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message:
            error instanceof Error ? error.message : 'Internal server error'
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
