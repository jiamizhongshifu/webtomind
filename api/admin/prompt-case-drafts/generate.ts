import { getCorsHeadersForRequest } from '../../utils/auth';
import { generateCommercialCaseDrafts } from '../../utils/commercial-case-director';
import {
  assertPromptCaseAdmin,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  mapPromptCaseDraft,
  PROMPT_CASE_ADMIN_EMAIL
} from './_shared';

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
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
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  let generated;
  try {
    generated = generateCommercialCaseDrafts({
      packageSlug: String(input.packageSlug || ''),
      businessScene:
        typeof input.businessScene === 'string' ? input.businessScene : '',
      targetAudience:
        typeof input.targetAudience === 'string' ? input.targetAudience : '',
      deliverable:
        typeof input.deliverable === 'string' ? input.deliverable : '',
      count:
        typeof input.count === 'number' ? input.count : Number(input.count),
      locale: typeof input.locale === 'string' ? input.locale : 'zh-CN',
      imageSize: typeof input.imageSize === 'string' ? input.imageSize : '',
      memberOnlyDefault: input.memberOnlyDefault === true
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Invalid draft input' },
      corsHeaders,
      400
    );
  }

  const insertRows = generated.map((draft) => ({
    package_slug: null,
    source_skill: draft.sourceSkill,
    title: draft.title,
    category: draft.category,
    tags: draft.tags,
    prompt: draft.prompt,
    negative_prompt: draft.negativePrompt,
    prompt_preview: draft.promptPreview,
    commercial_intent: draft.commercialIntent,
    generation_settings: draft.generationSettings,
    member_only: draft.memberOnly,
    status: 'draft',
    created_by_email: admin.email || PROMPT_CASE_ADMIN_EMAIL
  }));

  const { data, error } = await sb
    .from('prompt_case_drafts')
    .insert(insertRows)
    .select('*');

  if (error) {
    if (isMissingPromptCaseDraftsTable(error)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    console.error('[AdminPromptCaseDrafts] generate failed:', error);
    return jsonResponse(
      { error: 'Failed to create prompt case drafts' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { drafts: (data || []).map((item) => mapPromptCaseDraft(item)) },
    corsHeaders
  );
}
