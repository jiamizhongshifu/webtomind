import { createClient } from '@supabase/supabase-js';

export const PROMPT_OG_WIDTH = 1200;
export const PROMPT_OG_HEIGHT = 630;
export const PROMPT_OG_SITE_URL = 'https://webtomind.com';
export const PROMPT_OG_IMAGE_VERSION = '20260609-image-only-card';
export const PROMPT_OG_CTA =
  'Try This Prompt in AI Image Generator - Watermark Free';

export type PromptCaseOg = {
  title: string;
  prompt: string;
  imageUrl: string;
  locale: 'zh-CN' | 'en-US';
};

export function getQueryParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getRuntimeEnvValue(key: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[key] : undefined;
}

function normalizeImageUrls(item: Record<string, unknown>): string[] {
  const imageUrls = Array.isArray(item.image_urls)
    ? item.image_urls.filter((url): url is string => typeof url === 'string')
    : [];
  const imageUrl = typeof item.image_url === 'string' ? item.image_url : '';
  return Array.from(new Set([...imageUrls, imageUrl].filter(Boolean)));
}

function inferPromptCaseTitle(prompt: unknown, fallback: string): string {
  if (typeof prompt !== 'string') return fallback;
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return (
    normalized
      .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
      .replace(/^生成一?张(?:单张)?\s*/u, '')
      .split(/[，,。.;；\n]/u)[0]
      .trim()
      .slice(0, 28) || fallback
  );
}

export async function loadPromptCaseOg(params: {
  slug?: string;
  id?: string;
}): Promise<PromptCaseOg | null> {
  const supabaseUrl = getRuntimeEnvValue('SUPABASE_URL');
  const supabaseKey = getRuntimeEnvValue('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  let query = supabase
    .from('prompt_cases')
    .select(
      'title,prompt,slug,locale,image_url,image_urls,is_published,deleted_at'
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .limit(1);

  if (params.slug) {
    query = query.eq('slug', params.slug);
  } else if (params.id) {
    query = query.eq('id', params.id);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    if (error) console.warn('[PromptOg] prompt case load failed:', error);
    return null;
  }

  const record = data as Record<string, unknown>;
  const prompt = typeof record.prompt === 'string' ? record.prompt : '';
  const locale = record.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const fallbackTitle =
    locale === 'en-US' ? 'Visual prompt case' : '视觉 Prompt 案例';
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : inferPromptCaseTitle(prompt, fallbackTitle);
  const imageUrl = normalizeImageUrls(record)[0] || '';

  return { title, prompt, imageUrl, locale };
}
