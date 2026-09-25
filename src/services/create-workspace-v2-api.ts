import { getAuthToken } from './agent-api';
import { getApiBaseUrl } from '@/utils/env';
import type {
  ImageCreationContext,
  ImageCreationSession,
  CreationSessionMediaType,
  ImageCreationTurn,
  MoodboardVisibility,
  VisualMoodboard
} from '@/shared/create-workspace-v2';

const API_BASE = getApiBaseUrl();

function headers(): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) }
  });
  const result = (await response.json().catch(() => ({}))) as T & {
    error?: unknown;
  };
  if (!response.ok) {
    const message =
      typeof result.error === 'string' ? result.error : '请求失败，请稍后重试';
    throw new Error(message);
  }
  return result;
}

export interface DiscoveryImage {
  id: string;
  kind: 'prompt_case' | 'gallery' | 'krea';
  title: string;
  prompt: string;
  promptPreview?: string;
  promptLocked?: boolean;
  memberOnly?: boolean;
  imageUrl: string;
  originalImageUrl?: string;
  sourceUrl?: string;
  dominantColor?: string;
  width?: number;
  height?: number;
  model: string;
  href: string;
}

export interface DiscoverySearchResult {
  query: string;
  images: DiscoveryImage[];
  moodboards: VisualMoodboard[];
  pagination?: DiscoverySearchPagination;
}

export type DiscoverySearchKind = 'all' | 'images' | 'moodboards';

export interface DiscoveryPaginationState {
  nextOffset: number;
  hasMore: boolean;
}

export interface DiscoverySearchPagination {
  images: DiscoveryPaginationState;
  moodboards: DiscoveryPaginationState;
}

export function searchVisualDiscovery(
  query = '',
  locale: 'zh-CN' | 'en-US' = 'zh-CN',
  options: {
    kind?: DiscoverySearchKind;
    offset?: number;
    limit?: number;
  } = {}
): Promise<DiscoverySearchResult> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('locale', locale);
  if (options.kind && options.kind !== 'all') {
    params.set('kind', options.kind);
  }
  if (options.offset && options.offset > 0) {
    params.set('offset', String(Math.floor(options.offset)));
  }
  if (options.limit && options.limit > 0) {
    params.set('limit', String(Math.floor(options.limit)));
  }
  return requestJson(`/api/discovery/search?${params.toString()}`);
}

export interface DiscoveryImageDescription {
  description: string;
  keywords: string[];
  searchQuery: string;
}

export async function describeDiscoveryImage(
  input: {
    imageBase64: string;
    mimeType: string;
    locale: 'zh-CN' | 'en-US';
  },
  options: { signal?: AbortSignal } = {}
): Promise<DiscoveryImageDescription> {
  const result = await requestJson<DiscoveryImageDescription>(
    '/api/discovery/describe-image',
    { method: 'POST', body: JSON.stringify(input), signal: options.signal }
  );
  if (!result.description) throw new Error('图片识别失败');
  return {
    description: result.description,
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
    searchQuery: result.searchQuery || result.description.slice(0, 320)
  };
}

export async function listMoodboards(): Promise<VisualMoodboard[]> {
  const result = await requestJson<{ moodboards: VisualMoodboard[] }>(
    '/api/moodboards'
  );
  return result.moodboards;
}

export async function getMoodboard(id: string): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}`
  );
  return result.moodboard;
}

export async function getSharedMoodboard(
  token: string
): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/public/moodboards/${encodeURIComponent(token)}`
  );
  return result.moodboard;
}

export async function createMoodboard(input: {
  name: string;
  description?: string;
  sourceMoodboardId?: string;
  sourceShareToken?: string;
  presetSnapshot?: {
    presetKey: string;
    tasteProfile: string;
    keywords: string[];
    avoids: string[];
    items: Array<{
      imageUrl: string;
      title?: string;
      prompt?: string;
    }>;
  };
}): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    '/api/moodboards',
    {
      method: 'POST',
      body: JSON.stringify(input)
    }
  );
  return result.moodboard;
}

export async function updateMoodboard(
  id: string,
  input: {
    name?: string;
    description?: string;
    visibility?: MoodboardVisibility;
    coverItemId?: string;
    guidelines?: string[];
  }
): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
  return result.moodboard;
}

export async function deleteMoodboard(id: string): Promise<void> {
  await requestJson(`/api/moodboards/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export async function addMoodboardItems(
  id: string,
  items: Array<{
    source: string;
    imageUrl: string;
    title?: string;
    prompt?: string;
    imageReferenceId?: string;
    mediaObjectId?: string;
    imageGenerationId?: string;
    promptCaseId?: string;
  }>
): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}/items`,
    { method: 'POST', body: JSON.stringify({ items }) }
  );
  return result.moodboard;
}

export async function copyMoodboardToLibrary(
  source: VisualMoodboard
): Promise<VisualMoodboard> {
  if (!source.id.startsWith('demo-')) {
    const created = await createMoodboard({
      name: source.name,
      description: source.description,
      sourceMoodboardId: source.id,
      sourceShareToken: source.shareToken
    });
    return syncMoodboardPresetItems(created, source);
  }

  return createMoodboard({
    name: source.name,
    description: source.description,
    presetSnapshot: {
      presetKey: source.id,
      tasteProfile: source.tasteProfile,
      keywords: source.keywords,
      avoids: source.avoids,
      items: (source.items || []).map((item) => ({
        imageUrl: item.imageUrl,
        title: item.title,
        prompt: item.prompt
      }))
    }
  });
}

const PERSISTED_MOODBOARD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedMoodboardId(id: string): boolean {
  return PERSISTED_MOODBOARD_ID.test(id.trim());
}

/**
 * Generation APIs only accept database moodboard UUIDs. Curated discovery
 * presets use stable frontend keys, so they must first be materialized as an
 * owned, editable copy.
 */
export async function materializeMoodboardForUse(
  source: VisualMoodboard,
  existingBoards: VisualMoodboard[] = []
): Promise<VisualMoodboard> {
  if (
    source.isOwner &&
    !source.isOfficial &&
    isPersistedMoodboardId(source.id)
  ) {
    return source;
  }
  const existingCopy = existingBoards.find(
    (board) =>
      board.isOwner &&
      !board.isOfficial &&
      isPersistedMoodboardId(board.id) &&
      (source.id.startsWith('demo-')
        ? board.sourcePresetKey === source.id
        : board.sourceMoodboardId === source.id)
  );
  if (existingCopy) return existingCopy;
  return copyMoodboardToLibrary(source);
}

export function buildMissingMoodboardPresetItems(
  target: VisualMoodboard,
  source: VisualMoodboard
) {
  const itemSignature = (item: { title?: string; prompt?: string }): string =>
    `${item.title?.trim() || ''}\u0000${item.prompt?.trim() || ''}`;
  const existingUrls = new Set(
    (target.items || []).map((item) => item.imageUrl).filter(Boolean)
  );
  const existingPromptCaseIds = new Set(
    (target.items || []).map((item) => item.promptCaseId).filter(Boolean)
  );
  const existingGenerationIds = new Set(
    (target.items || []).map((item) => item.imageGenerationId).filter(Boolean)
  );
  const existingSignatures = new Set(
    (target.items || [])
      .map(itemSignature)
      .filter((signature) => signature !== '\u0000')
  );
  return (source.items || [])
    .filter(
      (item) =>
        item.imageUrl &&
        !existingUrls.has(item.imageUrl) &&
        (!item.promptCaseId || !existingPromptCaseIds.has(item.promptCaseId)) &&
        (!item.imageGenerationId ||
          !existingGenerationIds.has(item.imageGenerationId)) &&
        (itemSignature(item) === '\u0000' ||
          !existingSignatures.has(itemSignature(item)))
    )
    .map((item) => ({
      source: 'preset',
      imageUrl: item.imageUrl,
      title: item.title,
      prompt: item.prompt,
      ...(item.promptCaseId ? { promptCaseId: item.promptCaseId } : {}),
      ...(item.imageGenerationId
        ? { imageGenerationId: item.imageGenerationId }
        : {})
    }));
}

export async function syncMoodboardPresetItems(
  target: VisualMoodboard,
  source: VisualMoodboard
): Promise<VisualMoodboard> {
  const sourceMatches = source.id.startsWith('demo-')
    ? target.name.trim() === source.name.trim()
    : target.sourceMoodboardId === source.id;
  if (!sourceMatches) {
    throw new Error('情绪板副本来源不匹配，已停止同步以避免污染其他情绪板');
  }
  const missingItems = buildMissingMoodboardPresetItems(target, source);
  return missingItems.length
    ? addMoodboardItems(target.id, missingItems)
    : target;
}

export async function removeMoodboardItem(
  id: string,
  itemId: string
): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}/items`,
    { method: 'DELETE', body: JSON.stringify({ itemId }) }
  );
  return result.moodboard;
}

export async function reorderMoodboardItems(
  id: string,
  itemIds: string[]
): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}/items`,
    { method: 'PATCH', body: JSON.stringify({ itemIds }) }
  );
  return result.moodboard;
}

export async function analyzeMoodboard(id: string): Promise<VisualMoodboard> {
  const result = await requestJson<{ moodboard: VisualMoodboard }>(
    `/api/moodboards/${encodeURIComponent(id)}/analyze`,
    { method: 'POST' }
  );
  return result.moodboard;
}

export async function shareMoodboard(id: string): Promise<string> {
  const result = await requestJson<{ token: string }>(
    `/api/moodboards/${encodeURIComponent(id)}/share`,
    { method: 'POST' }
  );
  return result.token;
}

export async function revokeMoodboardShare(id: string): Promise<void> {
  await requestJson(`/api/moodboards/${encodeURIComponent(id)}/share`, {
    method: 'DELETE'
  });
}

export async function listImageSessions(
  limit = 20,
  mediaType: CreationSessionMediaType = 'image'
): Promise<ImageCreationSession[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    mediaType
  });
  const result = await requestJson<{ sessions: ImageCreationSession[] }>(
    `/api/image-sessions?${params.toString()}`
  );
  return result.sessions;
}

export async function createImageSession(
  firstPrompt?: string,
  mediaType: CreationSessionMediaType = 'image'
): Promise<ImageCreationSession> {
  const result = await requestJson<{ session: ImageCreationSession }>(
    '/api/image-sessions',
    {
      method: 'POST',
      body: JSON.stringify({ firstPrompt, mediaType })
    }
  );
  return result.session;
}

export async function deleteImageSession(sessionId: string): Promise<void> {
  await requestJson(`/api/image-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE'
  });
}

export async function listImageSessionTurns(
  sessionId: string
): Promise<ImageCreationTurn[]> {
  const result = await requestJson<{ turns: ImageCreationTurn[] }>(
    `/api/image-sessions/${encodeURIComponent(sessionId)}/turns`
  );
  return result.turns;
}

export async function createImageSessionTurn(
  sessionId: string,
  input: {
    taskId?: string;
    prompt: string;
    negativePrompt?: string;
    status: 'partial' | 'succeeded' | 'failed';
    context?: ImageCreationContext;
    generationIds?: string[];
    errorMessage?: string;
  }
): Promise<ImageCreationTurn> {
  const result = await requestJson<{ turn: ImageCreationTurn }>(
    `/api/image-sessions/${encodeURIComponent(sessionId)}/turns`,
    { method: 'POST', body: JSON.stringify(input) }
  );
  return result.turn;
}
