import { getCorsHeadersForRequest } from '../../utils/auth';
import {
  assertPromptCaseAdmin,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  mapPromptCaseDraftWithFreshImages,
  normalizeImageUrls,
  normalizeTags,
  PROMPT_CASE_DRAFT_STATUSES
} from './_shared';

export const config = { runtime: 'edge' };

function getDraftId(request: Request): string {
  const url = new URL(request.url);
  return decodeURIComponent(
    url.pathname.split('/').filter(Boolean).pop() || ''
  );
}

function derivePromptPreview(prompt: string): string | null {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length > 140
    ? `${normalized.slice(0, 140)}...`
    : normalized;
}

function buildDraftPatch(
  input: Record<string, unknown>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof input.packageSlug === 'string') {
    const packageSlug = input.packageSlug.trim();
    patch.package_slug = packageSlug || null;
  }
  if (typeof input.title === 'string') patch.title = input.title.trim();
  if (typeof input.category === 'string')
    patch.category = input.category.trim();
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (typeof input.prompt === 'string') {
    patch.prompt = input.prompt.trim();
    patch.prompt_preview = derivePromptPreview(input.prompt);
  }
  if (input.negativePrompt !== undefined) {
    patch.negative_prompt =
      typeof input.negativePrompt === 'string' && input.negativePrompt.trim()
        ? input.negativePrompt.trim()
        : null;
  }
  if (input.commercialIntent !== undefined) {
    patch.commercial_intent =
      typeof input.commercialIntent === 'string' &&
      input.commercialIntent.trim()
        ? input.commercialIntent.trim()
        : null;
  }
  if (
    input.generationSettings &&
    typeof input.generationSettings === 'object'
  ) {
    patch.generation_settings = input.generationSettings;
  }
  if (input.imageUrls !== undefined) {
    patch.image_urls = normalizeImageUrls(input.imageUrls);
  }
  if (input.selectedImageUrl !== undefined) {
    patch.selected_image_url =
      typeof input.selectedImageUrl === 'string' &&
      input.selectedImageUrl.trim()
        ? input.selectedImageUrl.trim()
        : null;
  }
  if (typeof input.memberOnly === 'boolean') {
    patch.member_only = input.memberOnly;
  }
  if (typeof input.status === 'string') {
    patch.status = input.status.trim();
  }
  if (input.reviewNotes !== undefined) {
    patch.review_notes =
      typeof input.reviewNotes === 'string' && input.reviewNotes.trim()
        ? input.reviewNotes.trim()
        : null;
  }
  return patch;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function hasVideoDraftMedia(patch: Record<string, unknown>): boolean {
  const settings =
    patch.generation_settings &&
    typeof patch.generation_settings === 'object' &&
    !Array.isArray(patch.generation_settings)
      ? (patch.generation_settings as Record<string, unknown>)
      : {};
  const videoUrls = [
    ...normalizeStringArray(settings.videoUrls),
    ...normalizeStringArray(settings.sourceVideoUrls),
    ...(typeof settings.videoUrl === 'string'
      ? [settings.videoUrl.trim()]
      : []),
    ...(typeof settings.sourceVideoUrl === 'string'
      ? [settings.sourceVideoUrl.trim()]
      : [])
  ].filter(Boolean);
  return settings.mediaType === 'video' || videoUrls.length > 0;
}

function validateDraftPatch(patch: Record<string, unknown>): string | null {
  if (patch.status !== undefined) {
    const status = String(patch.status);
    if (!PROMPT_CASE_DRAFT_STATUSES.has(status as never)) {
      return 'Invalid draft status';
    }
  }
  if (patch.title !== undefined && !String(patch.title).trim()) {
    return 'title is required';
  }
  if (
    patch.prompt !== undefined &&
    !String(patch.prompt).trim() &&
    !hasVideoDraftMedia(patch)
  ) {
    return 'prompt is required';
  }
  if (patch.category !== undefined && !String(patch.category).trim()) {
    return 'category is required';
  }
  return null;
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'PATCH' && request.method !== 'DELETE') {
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

  const id = getDraftId(request);
  if (!id) {
    return jsonResponse({ error: 'id is required' }, corsHeaders, 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  if (request.method === 'DELETE') {
    const { data, error } = await sb
      .from('prompt_case_drafts')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      if (isMissingPromptCaseDraftsTable(error)) {
        return getMissingPromptDraftsResponse(corsHeaders);
      }
      console.error('[AdminPromptCaseDrafts] delete failed:', error);
      return jsonResponse(
        { error: 'Failed to delete prompt case draft' },
        corsHeaders,
        500
      );
    }

    return jsonResponse(
      {
        deletedDraftId: data && typeof data.id === 'string' ? data.id : id
      },
      corsHeaders
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const patch = buildDraftPatch(input);
  const validationError = validateDraftPatch(patch);
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }
  if (Object.keys(patch).length === 0) {
    return jsonResponse(
      { error: 'No editable fields provided' },
      corsHeaders,
      400
    );
  }

  const { data, error } = await sb
    .from('prompt_case_drafts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptCaseDraftsTable(error)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    console.error('[AdminPromptCaseDrafts] patch failed:', error);
    return jsonResponse(
      { error: 'Failed to update prompt case draft' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { draft: await mapPromptCaseDraftWithFreshImages(sb, data) },
    corsHeaders
  );
}
