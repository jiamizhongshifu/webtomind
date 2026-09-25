import type {
  ImagePromptAsset,
  ImagePromptSlot
} from '@/web/data/image-prompt-assets';
import { getApiBaseUrl } from '@/utils/env';
import type { PublicBlogPost } from '@/shared/seo-blog-public-post';

export type { PublicBlogPost } from '@/shared/seo-blog-public-post';

export interface PublicUpdate {
  id: string;
  version: string;
  locale: 'zh-CN' | 'en-US';
  title: string;
  highlights: string[];
  published_at: string;
}

export interface PublicSkillCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  source: 'skills' | 'templates';
}

export interface PublicImagePromptAsset {
  id: string;
  slot: ImagePromptSlot;
  title: string;
  subtitle: string;
  prompt: string;
  negativePrompt?: string;
  tags: string[];
  thumbnailUrl: string;
  sourceBatchId?: string;
  visual?: {
    tone?: string;
    accent?: string;
    shape?: ImagePromptAsset['visual']['shape'];
  };
  metadata?: Record<string, unknown>;
  sortOrder?: number;
}

const API_BASE = getApiBaseUrl();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getPublicBlogPosts(
  locale: 'zh-CN' | 'en-US',
  limit = 20
): Promise<PublicBlogPost[]> {
  const result = await fetchJson<{ posts: PublicBlogPost[] }>(
    `${API_BASE}/api/content/blog?locale=${encodeURIComponent(locale)}&limit=${limit}`
  );
  return result.posts || [];
}

export async function getPublicBlogPostBySlug(
  locale: 'zh-CN' | 'en-US',
  slug: string
): Promise<PublicBlogPost | null> {
  const result = await fetchJson<{ post: PublicBlogPost | null }>(
    `${API_BASE}/api/content/blog?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(slug)}`
  );
  return result.post || null;
}

export async function getPublicUpdates(
  locale: 'zh-CN' | 'en-US',
  limit = 20
): Promise<PublicUpdate[]> {
  const result = await fetchJson<{ updates: PublicUpdate[] }>(
    `${API_BASE}/api/content/updates?locale=${encodeURIComponent(locale)}&limit=${limit}`
  );
  return result.updates || [];
}

export async function getPublicSkills(limit = 24): Promise<PublicSkillCard[]> {
  const result = await fetchJson<{ skills: PublicSkillCard[] }>(
    `${API_BASE}/api/content/skills?limit=${limit}`
  );
  return result.skills || [];
}

export async function getPublicImagePromptAssets(
  limit = 1000,
  slot?: ImagePromptSlot
): Promise<PublicImagePromptAsset[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (slot) params.set('slot', slot);
  const result = await fetchJson<{ assets: PublicImagePromptAsset[] }>(
    `${API_BASE}/api/content/prompt-assets?${params.toString()}`
  );
  return result.assets || [];
}
