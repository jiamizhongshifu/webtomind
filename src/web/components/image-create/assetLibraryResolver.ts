import {
  getPublicImagePromptAssets,
  type PublicImagePromptAsset
} from '@/services/marketing-api';
import {
  getSelectedAssetIds,
  imagePromptAssets,
  imagePromptSlots,
  isMultiSelectImagePromptSlot,
  normalizeImagePromptSelection,
  slotVisualDefaults,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSelectionValue,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import { loadImagePromptAssetCatalog } from '../../data/image-prompt-asset-catalog-loader';
import {
  addSelectionIds,
  selectionFromDraft
} from '../../data/visual-recipe-selection';
export {
  normalizeVisualRecipeSelection,
  readImagePromptSlot
} from '../../data/visual-recipe-selection';

const LOCAL_PROMPT_LIBRARY_PREFIX = '/assets/prompt-library/';
const PUBLIC_SLOT_LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;

interface PublicSlotLibraryCacheEntry {
  expiresAt: number;
  library: PublicImagePromptAssetLibrary;
}

const publicSlotLibraryCache = new Map<
  ImagePromptSlot,
  PublicSlotLibraryCacheEntry
>();
const publicSlotLibraryRequests = new Map<
  ImagePromptSlot,
  Promise<PublicImagePromptAssetLibrary>
>();

export interface PublicImagePromptAssetLibrary {
  assets: ImagePromptAsset[];
  source: 'remote' | 'hybrid' | 'local';
  error: string;
}

export interface ResolvedVisualRecipeAsset {
  slot: ImagePromptSlot;
  asset: ImagePromptAsset;
}

export interface VisualRecipePromptTextSource {
  title?: string;
  prompt?: string;
  promptZh?: string;
  promptEn?: string;
  promptPreview?: string;
  promptPreviewZh?: string;
  promptPreviewEn?: string;
  commercialIntent?: string;
  tags?: string[];
}

function resolveRemoteThumbnailUrl(
  asset: PublicImagePromptAsset,
  localMatch?: ImagePromptAsset
): string | undefined {
  // Expression and pose artwork is versioned with the frontend so a stale
  // operations/CDN URL cannot override a newly curated visual set.
  if (
    localMatch?.thumbnailUrl &&
    (asset.slot === 'expression' || asset.slot === 'pose')
  ) {
    return localMatch.thumbnailUrl;
  }
  if (
    asset.thumbnailUrl &&
    !asset.thumbnailUrl.startsWith(LOCAL_PROMPT_LIBRARY_PREFIX)
  ) {
    if (!asset.sourceBatchId) return asset.thumbnailUrl;

    try {
      const versionedUrl = new URL(asset.thumbnailUrl);
      if (!versionedUrl.searchParams.has('v')) {
        versionedUrl.searchParams.set('v', asset.sourceBatchId);
      }
      return versionedUrl.toString();
    } catch {
      return asset.thumbnailUrl;
    }
  }
  return localMatch?.thumbnailUrl || asset.thumbnailUrl;
}

export function toImagePromptAsset(
  asset: PublicImagePromptAsset,
  localAssets: ImagePromptAsset[] = imagePromptAssets
): ImagePromptAsset {
  const visual = slotVisualDefaults[asset.slot];
  const metadata = (asset.metadata || {}) as {
    promptZh?: unknown;
    negativePromptZh?: unknown;
    thumbnailEmoji?: unknown;
  };
  const localMatch = localAssets.find((item) => item.id === asset.id);
  const promptZh =
    (typeof metadata.promptZh === 'string' ? metadata.promptZh : undefined) ||
    localMatch?.promptZh;
  const negativePromptZh =
    (typeof metadata.negativePromptZh === 'string'
      ? metadata.negativePromptZh
      : undefined) || localMatch?.negativePromptZh;

  return {
    id: asset.id,
    slot: asset.slot,
    title: asset.title,
    subtitle: asset.subtitle,
    prompt: asset.prompt,
    promptZh,
    negativePrompt: asset.negativePrompt,
    negativePromptZh,
    tags: asset.tags || [],
    thumbnailUrl: resolveRemoteThumbnailUrl(asset, localMatch),
    thumbnailEmoji:
      (typeof metadata.thumbnailEmoji === 'string'
        ? metadata.thumbnailEmoji
        : undefined) || localMatch?.thumbnailEmoji,
    visual: {
      tone: asset.visual?.tone || visual.tone,
      accent: asset.visual?.accent || visual.accent,
      shape: asset.visual?.shape || visual.shape
    }
  };
}

export function normalizeSelectionForAssets(
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[]
): ImagePromptSelection {
  const normalizedSelection = normalizeImagePromptSelection(selection);
  return imagePromptSlots.reduce((nextSelection, slot) => {
    const selectedIds = getSelectedAssetIds(normalizedSelection, slot.id);
    if (selectedIds.length === 0) {
      nextSelection[slot.id] = isMultiSelectImagePromptSlot(slot.id)
        ? []
        : null;
      return nextSelection;
    }
    const validIds = selectedIds.filter((selectedId) =>
      assets.some((asset) => asset.id === selectedId)
    );
    nextSelection[slot.id] = isMultiSelectImagePromptSlot(slot.id)
      ? validIds
      : validIds[0] || null;
    return nextSelection;
  }, {} as ImagePromptSelection);
}

export function mergeRemoteAndLocalAssets(
  remoteAssets: ImagePromptAsset[],
  localAssets: ImagePromptAsset[] = imagePromptAssets
): ImagePromptAsset[] {
  const localIds = new Set(localAssets.map((asset) => asset.id));
  const contractCompatibleRemoteAssets = remoteAssets.filter((asset) =>
    localIds.has(asset.id)
  );
  const remoteIds = new Set(
    contractCompatibleRemoteAssets.map((asset) => asset.id)
  );
  const localOnlyAssets = localAssets.filter(
    (asset) => !remoteIds.has(asset.id)
  );
  return [...contractCompatibleRemoteAssets, ...localOnlyAssets];
}

/**
 * Slot hydration trusts the published API contract and only uses the tiny
 * synchronous core to fill an unavailable or incomplete response. It must not
 * import the complete local catalog, otherwise opening one recipe category
 * pays the cost of every category.
 */
export function mergeRemoteAndCoreSlotAssets(
  remoteAssets: ImagePromptAsset[],
  slot: ImagePromptSlot,
  coreAssets: ImagePromptAsset[] = imagePromptAssets
): ImagePromptAsset[] {
  const remoteSlotAssets = remoteAssets.filter((asset) => asset.slot === slot);
  const remoteIds = new Set(remoteSlotAssets.map((asset) => asset.id));
  const missingCoreAssets = coreAssets.filter(
    (asset) => asset.slot === slot && !remoteIds.has(asset.id)
  );
  return [...remoteSlotAssets, ...missingCoreAssets];
}

export function mergeHydratedPromptAssetSlot(
  currentAssets: ImagePromptAsset[],
  slot: ImagePromptSlot,
  slotAssets: ImagePromptAsset[]
): ImagePromptAsset[] {
  return [
    ...currentAssets.filter((asset) => asset.slot !== slot),
    ...slotAssets.filter((asset) => asset.slot === slot)
  ];
}

export function resolvePublicLibrarySource(
  remoteAssets: ImagePromptAsset[],
  mergedAssets: ImagePromptAsset[]
): 'remote' | 'hybrid' {
  const remoteIds = new Set(remoteAssets.map((asset) => asset.id));
  return mergedAssets.some((asset) => !remoteIds.has(asset.id))
    ? 'hybrid'
    : 'remote';
}

export function getLocalPublicImagePromptAssets(): ImagePromptAsset[] {
  return imagePromptAssets;
}

export function loadLocalPublicImagePromptAssets(): Promise<
  ImagePromptAsset[]
> {
  return loadImagePromptAssetCatalog();
}

export function resolveBrowsablePromptAssets(
  librarySource: 'public' | 'mine',
  publicAssets: ImagePromptAsset[],
  userAssets: ImagePromptAsset[]
): ImagePromptAsset[] {
  return librarySource === 'mine' ? userAssets : publicAssets;
}

async function fetchPublicImagePromptAssetSlotLibrary(
  slot: ImagePromptSlot
): Promise<PublicImagePromptAssetLibrary> {
  const coreAssets = getLocalPublicImagePromptAssets().filter(
    (asset) => asset.slot === slot
  );
  const loadLocalFallback = async () => {
    try {
      const localAssets = await loadLocalPublicImagePromptAssets();
      return localAssets.filter((asset) => asset.slot === slot);
    } catch (loadError) {
      console.warn(
        '[ImageCreate] local prompt slot fallback unavailable; using core:',
        loadError
      );
      return coreAssets;
    }
  };
  try {
    const remoteAssets = await getPublicImagePromptAssets(200, slot);
    if (remoteAssets.length === 0) {
      return { assets: await loadLocalFallback(), source: 'local', error: '' };
    }
    const convertedRemoteAssets = remoteAssets.map((asset) =>
      toImagePromptAsset(asset, coreAssets)
    );
    const mergedAssets = mergeRemoteAndCoreSlotAssets(
      convertedRemoteAssets,
      slot,
      coreAssets
    );
    return {
      assets: mergedAssets,
      source: resolvePublicLibrarySource(convertedRemoteAssets, mergedAssets),
      error: ''
    };
  } catch (loadError) {
    return {
      assets: await loadLocalFallback(),
      source: 'local',
      error:
        loadError instanceof Error
          ? loadError.message
          : 'remote prompt slot unavailable'
    };
  }
}

/**
 * Reuses successful slot responses for the active SPA session and coalesces
 * hover + click requests. Failed remote loads remain retryable.
 */
export async function loadPublicImagePromptAssetSlotLibrary(
  slot: ImagePromptSlot
): Promise<PublicImagePromptAssetLibrary> {
  const cached = publicSlotLibraryCache.get(slot);
  if (cached && cached.expiresAt > Date.now()) return cached.library;
  if (cached) publicSlotLibraryCache.delete(slot);

  const pending = publicSlotLibraryRequests.get(slot);
  if (pending) return pending;

  const request = fetchPublicImagePromptAssetSlotLibrary(slot);
  publicSlotLibraryRequests.set(slot, request);
  try {
    const library = await request;
    if (!library.error) {
      publicSlotLibraryCache.set(slot, {
        expiresAt: Date.now() + PUBLIC_SLOT_LIBRARY_CACHE_TTL_MS,
        library
      });
    }
    return library;
  } finally {
    if (publicSlotLibraryRequests.get(slot) === request) {
      publicSlotLibraryRequests.delete(slot);
    }
  }
}

export function clearPublicImagePromptAssetSlotLibraryCache(): void {
  publicSlotLibraryCache.clear();
  publicSlotLibraryRequests.clear();
}

export async function loadPublicImagePromptAssetLibrary(): Promise<PublicImagePromptAssetLibrary> {
  const localAssetsPromise = loadLocalPublicImagePromptAssets().catch(
    (loadError) => {
      console.warn(
        '[ImageCreate] local prompt catalog unavailable; using core fallback:',
        loadError
      );
      return getLocalPublicImagePromptAssets();
    }
  );
  try {
    const [remoteAssets, localAssets] = await Promise.all([
      getPublicImagePromptAssets(),
      localAssetsPromise
    ]);
    if (remoteAssets.length === 0) {
      return {
        assets: localAssets,
        source: 'local',
        error: ''
      };
    }
    const convertedRemoteAssets = remoteAssets.map((asset) =>
      toImagePromptAsset(asset, localAssets)
    );
    const mergedAssets = mergeRemoteAndLocalAssets(
      convertedRemoteAssets,
      localAssets
    );
    return {
      assets: mergedAssets,
      source: resolvePublicLibrarySource(convertedRemoteAssets, mergedAssets),
      error: ''
    };
  } catch (loadError) {
    const message =
      loadError instanceof Error
        ? loadError.message
        : 'remote prompt library unavailable';
    return {
      assets: await localAssetsPromise,
      source: 'local',
      error: message
    };
  }
}

function hasAnyPromptKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

export function buildPromptTextForVisualRecipe(
  source?: VisualRecipePromptTextSource | null
): string {
  if (!source) return '';
  return [
    source.title,
    source.promptZh,
    source.promptEn,
    source.prompt,
    source.promptPreviewZh,
    source.promptPreviewEn,
    source.promptPreview,
    source.commercialIntent,
    ...(Array.isArray(source.tags) ? source.tags : [])
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
}

export function inferVisualRecipeSelectionFromPromptText(
  promptText: string
): ImagePromptSelection | null {
  const normalizedText = promptText.replace(/\s+/g, ' ').toLowerCase();
  if (!normalizedText) return null;

  const draft: Partial<Record<ImagePromptSlot, string[]>> = {};
  const hasHumanSubject = hasAnyPromptKeyword(normalizedText, [
    '美女',
    '女性',
    '女生',
    '女孩',
    '少女',
    '女人',
    '人像',
    '写真',
    'portrait',
    'woman',
    'women',
    'girl',
    'female',
    'model'
  ]);
  const hasKoreanPortraitSignal = hasHumanSubject
    ? hasAnyPromptKeyword(normalizedText, [
        '韩国',
        'korean',
        '瓜子脸',
        'oval face',
        'delicate oval'
      ])
    : false;

  if (hasKoreanPortraitSignal) {
    addSelectionIds(draft, 'character', ['character-public-expansion-01']);
  } else if (hasHumanSubject) {
    addSelectionIds(draft, 'character', ['character-refined-model']);
  }

  if (
    hasAnyPromptKeyword(normalizedText, ['微笑', '笑容', 'soft smile', 'smile'])
  ) {
    addSelectionIds(draft, 'expression', ['expression-natural-soft-smile']);
  }

  if (
    hasAnyPromptKeyword(normalizedText, [
      '比基尼',
      '泳装',
      '泳衣',
      'bikini',
      'swimwear',
      'swimsuit'
    ])
  ) {
    addSelectionIds(draft, 'top', ['top-youthful-bikini-top']);
    addSelectionIds(draft, 'bottom', ['bottom-youthful-bikini-briefs']);
  }

  return selectionFromDraft(draft);
}

export function mergeVisualRecipeSelections(
  primary: ImagePromptSelection | null,
  fallback: ImagePromptSelection | null
): ImagePromptSelection | null {
  if (!primary && !fallback) return null;
  const rawSelection = imagePromptSlots.reduce(
    (selection, slot) => {
      const primaryIds = primary ? getSelectedAssetIds(primary, slot.id) : [];
      const fallbackIds = fallback
        ? getSelectedAssetIds(fallback, slot.id)
        : [];
      const ids = primaryIds.length > 0 ? primaryIds : fallbackIds;
      selection[slot.id] = isMultiSelectImagePromptSlot(slot.id)
        ? ids
        : ids[0] || null;
      return selection;
    },
    {} as Partial<Record<ImagePromptSlot, ImagePromptSelectionValue>>
  );
  return normalizeImagePromptSelection(rawSelection);
}

export function resolveVisualRecipeAssets(
  selection: ImagePromptSelection,
  assets: ImagePromptAsset[]
): ResolvedVisualRecipeAsset[] {
  return imagePromptSlots.flatMap((slot) =>
    getSelectedAssetIds(selection, slot.id)
      .map((assetId) => {
        const asset =
          assets.find(
            (candidate) =>
              candidate.id === assetId && candidate.slot === slot.id
          ) || assets.find((candidate) => candidate.id === assetId);
        return asset ? { slot: slot.id, asset } : null;
      })
      .filter((item): item is ResolvedVisualRecipeAsset => Boolean(item))
  );
}
