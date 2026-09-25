/**
 * Create Share Link API
 * POST /api/share/create
 *
 * Creates a public share link for a summary.
 * Requires authentication and ownership verification.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { generateShareToken, buildShareUrl } from '../utils/share-token';
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

    // Check if an active share link already exists (idempotence)
    const { data: existingShare } = await sb
      .from('share_links')
      .select('token')
      .eq('summary_id', summary_id)
      .eq('is_active', true)
      .single();

    if (existingShare) {
      // Return existing share link
      const shareUrl = buildShareUrl(existingShare.token);
      return new Response(
        JSON.stringify({
          success: true,
          share_url: shareUrl,
          token: existingShare.token,
          is_existing: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Generate new token and create share link
    const token = generateShareToken();

    const { error: insertError } = await sb.from('share_links').insert({
      summary_id,
      token,
      user_id: userId,
      is_active: true
    });

    if (insertError) {
      console.error('[Share] Insert error:', insertError);
      // Handle unique constraint violation (token collision - extremely rare)
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: 'TOKEN_COLLISION', message: 'Please try again' }
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      throw insertError;
    }

    const shareUrl = buildShareUrl(token);
    console.log('[Share] Created share link for summary:', summary_id);

    return new Response(
      JSON.stringify({
        success: true,
        share_url: shareUrl,
        token,
        is_existing: false
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    console.error('[Share] Create error:', error);
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
