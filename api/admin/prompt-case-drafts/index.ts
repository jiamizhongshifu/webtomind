import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  assertPromptCaseAdmin,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  mapPromptCaseDraftWithFreshImages
} from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed', drafts: [] }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured', drafts: [] },
      corsHeaders,
      500
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status')?.trim();
  const packageSlug = url.searchParams.get('packageSlug')?.trim();

  let query = sb
    .from('prompt_case_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (status) {
    query = query.eq('status', status);
  } else {
    query = query.not('status', 'in', '(published,rejected)');
  }
  if (packageSlug) query = query.eq('package_slug', packageSlug);

  const { data, error } = await query;
  if (error) {
    if (isMissingPromptCaseDraftsTable(error)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    console.error('[AdminPromptCaseDrafts] list failed:', error);
    return jsonResponse(
      { error: 'Failed to load prompt case drafts', drafts: [] },
      corsHeaders,
      500
    );
  }

  const drafts = await Promise.all(
    (data || []).map((item) => mapPromptCaseDraftWithFreshImages(sb, item))
  );

  return jsonResponse({ drafts }, corsHeaders);
}
