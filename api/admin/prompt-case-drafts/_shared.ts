import { type SupabaseClient } from '@supabase/supabase-js';
import { refreshSupabaseSignedStorageUrls } from '../../utils/signed-storage-url';

export {
  assertPromptCaseAdmin,
  getSupabaseAdmin,
  parseBearerToken,
  PROMPT_CASE_ADMIN_EMAIL
} from '../prompt-case-auth';

export type PromptCaseDraftStatus =
  | 'draft'
  | 'images_generated'
  | 'approved'
  | 'published'
  | 'rejected';

export const PROMPT_CASE_DRAFT_STATUSES = new Set<PromptCaseDraftStatus>([
  'draft',
  'images_generated',
  'approved',
  'published',
  'rejected'
]);

export function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export function mapPromptCaseDraft(item: Record<string, unknown>) {
  const generationSettings =
    item.generation_settings && typeof item.generation_settings === 'object'
      ? (item.generation_settings as Record<string, unknown>)
      : {};
  return {
    id: item.id,
    packageSlug: item.package_slug,
    sourceSkill: item.source_skill || 'zhong-image-director',
    title: item.title,
    category: item.category,
    tags: normalizeStringArray(item.tags),
    prompt: item.prompt,
    negativePrompt: item.negative_prompt || undefined,
    promptPreview: item.prompt_preview || undefined,
    commercialIntent: item.commercial_intent || undefined,
    generationSettings,
    imageUrls: normalizeStringArray(item.image_urls),
    selectedImageUrl: item.selected_image_url || undefined,
    memberOnly: Boolean(item.member_only),
    status: item.status || 'draft',
    reviewNotes: item.review_notes || undefined,
    createdByEmail: item.created_by_email || undefined,
    publishedCaseId: item.published_case_id || undefined,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

export async function mapPromptCaseDraftWithFreshImages(
  supabase: SupabaseClient,
  item: Record<string, unknown>
) {
  const selectedImageUrl =
    typeof item.selected_image_url === 'string'
      ? item.selected_image_url.trim()
      : '';
  const imageUrls = normalizeStringArray(item.image_urls);
  const refreshedUrls = (
    await refreshSupabaseSignedStorageUrls(
      supabase,
      Array.from(new Set([selectedImageUrl, ...imageUrls]))
    )
  ).filter(Boolean);
  const [refreshedSelectedImageUrl] = refreshedUrls;
  const refreshedImageUrls = Array.from(new Set(refreshedUrls));

  return {
    ...mapPromptCaseDraft(item),
    imageUrls: refreshedImageUrls,
    selectedImageUrl:
      refreshedSelectedImageUrl || refreshedImageUrls[0] || undefined
  };
}

export function normalizeTags(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 12);
}

export function normalizeImageUrls(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 8);
}

export function getMissingPromptDraftsResponse(
  corsHeaders: Record<string, string>
) {
  return jsonResponse(
    {
      error:
        '请先在 Supabase 执行 supabase/migrations/20260611162000_prompt_case_drafts.sql 初始化草稿箱表',
      needsSetup: true,
      drafts: []
    },
    corsHeaders,
    424
  );
}

export function isMissingPromptCaseDraftsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === 'PGRST205' ||
    String(record.message || '').includes('prompt_case_drafts')
  );
}

export function inferLocaleFromDraft(
  draft: Record<string, unknown>
): 'zh-CN' | 'en-US' {
  const tags = normalizeStringArray(draft.tags);
  return tags.includes('en-US') ? 'en-US' : 'zh-CN';
}

export function createPromptCaseSlug(
  title: string,
  id: string,
  packageSlug?: string | null
): string {
  const titleBase = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
    .replace(/^-+|-+$/g, '');
  const packageBase = packageSlug
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
    .replace(/^-+|-+$/g, '');
  const base =
    titleBase && titleBase.length >= 12
      ? titleBase
      : packageBase || titleBase || 'commercial-prompt-case';
  return `${base}-${id.replace(/-/g, '').slice(0, 8)}`;
}
