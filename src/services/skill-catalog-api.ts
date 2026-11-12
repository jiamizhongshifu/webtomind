import { getApiBaseUrl } from '@/utils/env';

const API_BASE = getApiBaseUrl();

export type SkillOutputType = 'image' | 'slides' | 'video' | 'web';
export type SkillTier = 'free' | 'premium';
export type SkillCatalogSort = 'featured' | 'trending' | 'top_rated' | 'newest';

export type LocalizedText = Record<string, string>;

export interface SkillCatalogItem {
  slug: string;
  name: LocalizedText;
  summary: LocalizedText;
  outputTypes: string[];
  sceneTags: string[];
  languages: string[];
  tier: SkillTier;
  isFeatured: boolean;
  installCount: number;
  installs7d: number;
  ratingAvg: number | null;
  ratingCount: number;
  latestVersion: string | null;
  compatibleAgents: string[];
  publishedAt: string | null;
  coverUrl: string | null;
  previewVideoUrl?: string | null;
}

export interface SkillExample {
  mediaType: string;
  mediaUrl: string;
  posterUrl: string | null;
  title: LocalizedText;
  description: LocalizedText;
}

export interface SkillDetail {
  slug: string;
  name: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText;
  outputTypes: string[];
  sceneTags: string[];
  languages: string[];
  tier: SkillTier;
  installCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  publishedAt: string | null;
  latestVersion: string | null;
  compatibleAgents: string[];
  installCommand: string;
  versions: Array<{
    version: string;
    sha256: string;
    sizeBytes: number;
    compatibleAgents: string[];
    changelog: LocalizedText;
    publishedAt: string | null;
  }>;
  examples: SkillExample[];
}

export interface SkillCatalogQuery {
  q?: string;
  outputType?: SkillOutputType | null;
  tier?: SkillTier | null;
  sort?: SkillCatalogSort;
  limit?: number;
}

export interface DeviceAuthorizationInfo {
  userCode: string;
  clientName: string | null;
  clientVersion: string | null;
  expiresAt: string;
  scope: string;
}

export class SkillCatalogRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'SkillCatalogRequestError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  } & T;
  if (!response.ok) {
    throw new SkillCatalogRequestError(
      body.error || `Request failed (${response.status})`,
      body.code || 'REQUEST_FAILED',
      response.status
    );
  }
  return body;
}

export function pickLocalized(value: LocalizedText | undefined, locale: string): string {
  if (!value) return '';
  const fallbackLocale = locale === 'zh-CN' ? 'en-US' : 'zh-CN';
  return value[locale] || value[fallbackLocale] || Object.values(value)[0] || '';
}

export async function listSkillCatalog(
  query: SkillCatalogQuery = {},
  signal?: AbortSignal
): Promise<{ items: SkillCatalogItem[]; total: number }> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.outputType) params.set('output_type', query.outputType);
  if (query.tier) params.set('tier', query.tier);
  params.set('sort', query.sort || 'featured');
  params.set('limit', String(query.limit || 24));
  return request(`/api/skill-catalog?${params.toString()}`, { signal });
}

export async function getSkillCatalogDetail(
  slug: string,
  signal?: AbortSignal
): Promise<SkillDetail> {
  return request(`/api/skill-catalog/skills/${encodeURIComponent(slug)}`, { signal });
}

export async function describeDeviceAuthorization(
  userCode: string,
  accessToken: string
): Promise<DeviceAuthorizationInfo> {
  return request(
    `/api/skill-catalog/device/verify?user_code=${encodeURIComponent(userCode)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

export async function decideDeviceAuthorization(
  userCode: string,
  action: 'approve' | 'deny',
  accessToken: string
): Promise<{ status: string }> {
  return request('/api/skill-catalog/device/verify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_code: userCode, action })
  });
}
