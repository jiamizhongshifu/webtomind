/**
 * Get Shared Content API
 * GET /api/share/[token]
 * 
 * Public endpoint - no authentication required.
 * Returns the shared summary content if the link is active.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isValidShareToken } from '../utils/share-token';
import { getCorsHeadersForRequest } from '../utils/auth';

export const config = {
  runtime: 'edge'
};

// Supabase client singleton
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    // 安全修复：公开端点只使用 ANON_KEY，不使用 SERVICE_ROLE_KEY
    // SERVICE_ROLE_KEY 会绕过所有 RLS 策略，不应在公开端点使用
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    supabase = createClient(url, key);
  }
  return supabase;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderSimpleMarkdown = (markdown: string): string => {
  const lines = markdown.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      result.push(`<h1 class="text-2xl font-bold mb-4">${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      result.push(`<h2 class="text-xl font-semibold mt-6 mb-3">${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      result.push(`<h3 class="text-lg font-medium mt-4 mb-2">${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith('> ')) {
      result.push(`<blockquote class="border-l-4 border-slate-300 pl-4 italic text-slate-600">${escapeHtml(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      result.push(`<p class="mb-1">• ${escapeHtml(line.slice(2))}</p>`);
    } else if (line.trim() === '') {
      result.push('<br />');
    } else {
      result.push(`<p class="mb-2">${escapeHtml(line)}</p>`);
    }
  }

  return result.join('');
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Extract token from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    if (!token || !isValidShareToken(token)) {
      return new Response(JSON.stringify({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid share link' } }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sb = getSupabase();
    if (!sb) {
      return new Response(JSON.stringify({ success: false, error: { code: 'DB_ERROR', message: 'Database not configured' } }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the share link
    const { data: shareLink, error: shareLinkError } = await sb
      .from('share_links')
      .select('summary_id, is_active')
      .eq('token', token)
      .single();

    if (shareLinkError || !shareLink) {
      return new Response(JSON.stringify({ success: false, error: { code: 'SHARE_NOT_FOUND', message: 'Share link not found' } }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if share link is active
    if (!shareLink.is_active) {
      return new Response(JSON.stringify({ success: false, error: { code: 'SHARE_REVOKED', message: 'This share link has been revoked' } }), {
        status: 410, // Gone
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get the summary content
    const { data: summary, error: summaryError } = await sb
      .from('summaries')
      .select('title, markdown, created_at')
      .eq('id', shareLink.summary_id)
      .is('deleted_at', null) // Exclude soft-deleted summaries
      .single();

    if (summaryError || !summary) {
      return new Response(JSON.stringify({ success: false, error: { code: 'SUMMARY_NOT_FOUND', message: 'The shared content no longer exists' } }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[Share] Accessed share link');

    const safeHtml = renderSimpleMarkdown(summary.markdown || '');

    return new Response(JSON.stringify({
      success: true,
      data: {
        title: summary.title,
        content: summary.markdown,
        content_html: safeHtml,
        created_at: summary.created_at
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[Share] Get error:', error);
    return new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
