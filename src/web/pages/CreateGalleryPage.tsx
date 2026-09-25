import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  GalleryHorizontalEnd,
  Heart,
  Loader2,
  Maximize2,
  PencilLine,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Wand2,
  X
} from 'lucide-react';
import { useBlurhashPlaceholder } from '@/web/lib/use-blurhash-placeholder';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import {
  GalleryActionSheet,
  GalleryCardActionControls
} from '../components/image-create/GalleryActionControls';
import { PhotoSwipeViewer } from '../components/image-create/PhotoSwipeViewer';
import { GalleryFilterSheet } from '../components/image-create/GalleryFilterSheet';
import { VideoHistoryPreviewDialog } from '../components/image-create/VideoHistoryPreviewDialog';
import { VisualRecipeSummary } from '../components/image-create/VisualRecipeSummary';
import {
  getLocalPublicImagePromptAssets,
  loadPublicImagePromptAssetLibrary,
  type ResolvedVisualRecipeAsset
} from '../components/image-create/assetLibraryResolver';
import { triggerImageDownload } from '../components/image-create/downloadImage';
import { resolveHistoryVisualRecipeAssets } from '../components/image-create/historyVisualRecipe';
import { createImageEditorEntryState } from '../components/image-editor/editor-entry';
import {
  getVisualImageHistoryResult,
  getVisualVideoHistoryResult,
  importGenerationAsReference,
  loadVisualImageHistoryBlobUrl,
  refreshVisualImageHistoryItem,
  setVisualImageFavorite,
  setVisualVideoFavorite,
  type VisualImageHistoryItem,
  type VisualVideoGenerationItem
} from '@/services/agent-api';
import { getVisualImageAspectRatio } from '@/shared/visual-image-display';
import {
  completeRewardTaskOnce,
  REWARD_TASK_IDENTIFIERS
} from '@/services/reward-task-events';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import '../styles/create-gallery-apple.css';
import {
  Alert,
  AlertDescription,
  ActionSheet,
  Button,
  Card,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  Input,
  IconButton,
  SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SupportErrorNotice,
  useOverlayBehavior
} from '@/shared/ui';
import {
  cssAspectRatioToHeightWeight,
  getResponsiveMasonryColumnCount,
  splitMasonryColumns
} from '../lib/masonry';
import {
  imagePromptSlots,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../data/image-prompt-core';
import {
  addSelectionIds,
  selectionFromDraft
} from '../data/visual-recipe-selection';

type AssetLibraryItem =
  | {
      kind: 'image';
      id: string;
      createdAt?: string;
      item: VisualImageHistoryItem;
    }
  | {
      kind: 'video';
      id: string;
      createdAt?: string;
      item: VisualVideoGenerationItem;
    };

type GalleryMasonryItem = {
  asset: AssetLibraryItem;
  index: number;
  aspectRatio: string;
};

type AssetCategory = 'all' | 'images' | 'videos' | 'favorites';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function getImage(item: VisualImageHistoryItem): string {
  return item.thumbnailUrl || item.previewUrl || item.imageUrl || '';
}

function isExpiredPresignedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const signedAt = url.searchParams.get('X-Amz-Date');
    const expiresIn = Number(url.searchParams.get('X-Amz-Expires'));
    if (!signedAt || !Number.isFinite(expiresIn)) return false;
    const timestamp = Date.parse(
      `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(
        6,
        8
      )}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(
        13,
        15
      )}Z`
    );
    return (
      Number.isFinite(timestamp) && timestamp + expiresIn * 1000 <= Date.now()
    );
  } catch {
    return false;
  }
}

function getImageCandidates(
  item: VisualImageHistoryItem,
  mode: 'thumbnail' | 'preview' = 'thumbnail'
): string[] {
  const candidates =
    mode === 'preview'
      ? [item.previewUrl, item.imageUrl, item.thumbnailUrl]
      : [item.thumbnailUrl, item.previewUrl, item.imageUrl];
  return Array.from(
    new Set(
      candidates.filter(
        (value): value is string =>
          typeof value === 'string' &&
          Boolean(value.trim()) &&
          !isExpiredPresignedImageUrl(value)
      )
    )
  );
}

function parseAspectRatio(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const ratioMatch = normalized.match(
    /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/
  );
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    if (width > 0 && height > 0) return `${width} / ${height}`;
  }
  const sizeMatch = normalized.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    if (width > 0 && height > 0) return `${width} / ${height}`;
  }
  return null;
}

function getGalleryAspectRatio(item: VisualImageHistoryItem): string {
  const fallback =
    parseAspectRatio(item.actualImageSize) ||
    parseAspectRatio(item.imageSize) ||
    parseAspectRatio(item.requestedImageSize) ||
    parseAspectRatio(item.aspectRatio) ||
    '1 / 1';
  return getVisualImageAspectRatio(item, fallback);
}

function inferGalleryTitle(prompt: string, fallback: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const withoutRatio = normalized
    .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
    .trim();
  const segment = withoutRatio
    .replace(/^生成一?张(?:单张)?\s*/u, '')
    .split(/[，,。.;；\n]/u)
    .map((part) => part.trim())
    .find(Boolean);
  return (segment || withoutRatio).slice(0, 28).trim() || fallback;
}

function getModelFilterValue(item: VisualImageHistoryItem): string {
  return item.modelLabel || item.model || '未知模型';
}

function getAssetModelFilterValue(asset: AssetLibraryItem): string {
  return asset.item.modelLabel || asset.item.model || '未知模型';
}

function getAssetAspectRatio(asset: AssetLibraryItem): string {
  return asset.kind === 'image'
    ? getGalleryAspectRatio(asset.item)
    : parseAspectRatio(asset.item.aspectRatio) || '16 / 9';
}

function getAssetSearchText(asset: AssetLibraryItem): string {
  return [
    asset.item.prompt,
    asset.item.modelLabel,
    asset.item.model,
    asset.item.provider,
    asset.kind === 'video' ? '视频 video' : '图片 image'
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getGalleryReeditState(
  item: VisualImageHistoryItem,
  visualRecipeSelection?: ImagePromptSelection | null
) {
  return {
    promptCasePrompt: item.prompt,
    model: item.model || item.modelLabel,
    imageSize:
      item.requestedImageSize || item.imageSize || item.actualImageSize,
    quality: item.quality,
    outputFormat: item.outputFormat,
    aspectRatio: item.aspectRatio,
    ...(visualRecipeSelection ? { visualRecipeSelection } : {})
  };
}

function getGalleryRecipeSlotLabel(
  slot: ImagePromptSlot,
  localePrefix: '' | '/zh-CN' | '/en-US'
): string {
  if (localePrefix !== '/en-US') {
    return imagePromptSlots.find((item) => item.id === slot)?.label || slot;
  }
  return slot
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getGalleryRecipeSelection(
  assets: ResolvedVisualRecipeAsset[]
): ImagePromptSelection | null {
  const draft: Partial<Record<ImagePromptSlot, string[]>> = {};
  assets.forEach(({ slot, asset }) => {
    addSelectionIds(draft, slot, [asset.id]);
  });
  return selectionFromDraft(draft);
}

function formatGalleryDate(value: string | null | undefined): string {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function GalleryImage({
  item,
  alt,
  mode = 'thumbnail',
  className,
  onRefresh
}: {
  item: VisualImageHistoryItem;
  alt: string;
  mode?: 'thumbnail' | 'preview';
  className?: string;
  onRefresh: (item: VisualImageHistoryItem) => void;
}) {
  const candidates = useMemo(
    () => getImageCandidates(item, mode),
    [item, mode]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [blobUrl, setBlobUrl] = useState('');
  const refreshedRef = useRef<string | null>(null);
  const blobAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
    setRefreshing(false);
    setBlobUrl((current) => {
      if (current.startsWith('blob:')) URL.revokeObjectURL(current);
      return '';
    });
    blobAttemptedRef.current = null;
  }, [item.id, item.thumbnailUrl, item.previewUrl, item.imageUrl, mode]);

  useEffect(
    () => () => {
      if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl]
  );

  const handleError = useCallback(() => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((index) => index + 1);
      return;
    }

    if (blobAttemptedRef.current !== item.id) {
      blobAttemptedRef.current = item.id;
      setRefreshing(true);
      void loadVisualImageHistoryBlobUrl(
        item.id,
        mode === 'thumbnail' ? 'thumbnail' : 'preview'
      )
        .then((url) => {
          setBlobUrl(url);
          setFailed(false);
        })
        .catch(() => {
          if (refreshedRef.current === item.id) {
            setFailed(true);
            return;
          }
          refreshedRef.current = item.id;
          void refreshVisualImageHistoryItem({ generationId: item.id })
            .then((refreshed) => {
              if (refreshed) onRefresh(refreshed);
              else setFailed(true);
            })
            .catch(() => setFailed(true));
        })
        .finally(() => setRefreshing(false));
      return;
    }

    if (refreshedRef.current !== item.id) {
      refreshedRef.current = item.id;
      setRefreshing(true);
      void refreshVisualImageHistoryItem({ generationId: item.id })
        .then((refreshed) => {
          if (refreshed) {
            onRefresh(refreshed);
            setCandidateIndex(0);
            setFailed(false);
            return;
          }
          setFailed(true);
        })
        .catch(() => setFailed(true))
        .finally(() => setRefreshing(false));
      return;
    }

    setFailed(true);
  }, [candidateIndex, candidates.length, item.id, mode, onRefresh]);

  useEffect(() => {
    if (candidates.length === 0 && !blobUrl && !failed && !refreshing) {
      handleError();
    }
  }, [blobUrl, candidates.length, failed, handleError, refreshing]);

  const src = blobUrl || candidates[candidateIndex] || '';
  const placeholder = useBlurhashPlaceholder(src);
  if (!src || failed) {
    return (
      <div className={`create-gallery-image-placeholder ${className || ''}`}>
        <GalleryHorizontalEnd size={24} />
        <span>图片资源准备中</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={
          placeholder
            ? {
                backgroundImage: `url("${placeholder}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
        onError={handleError}
      />
      {refreshing && (
        <span className="create-gallery-image-refreshing" aria-hidden>
          <Loader2 size={16} />
        </span>
      )}
    </>
  );
}

export function CreateGalleryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const localePrefix = getLocalePrefix(location.pathname);
  const [items, setItems] = useState<VisualImageHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [videoItems, setVideoItems] = useState<VisualVideoGenerationItem[]>([]);
  const [videoNextBefore, setVideoNextBefore] = useState<string | undefined>();
  const [videoHasMore, setVideoHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [category, setCategory] = useState<AssetCategory>('all');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [actionSheetItem, setActionSheetItem] =
    useState<VisualImageHistoryItem | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [previewItem, setPreviewItem] = useState<VisualImageHistoryItem | null>(
    null
  );
  const [previewVideo, setPreviewVideo] =
    useState<VisualVideoGenerationItem | null>(null);
  const [videoActionSheetItem, setVideoActionSheetItem] =
    useState<VisualVideoGenerationItem | null>(null);
  const [publicRecipeAssets, setPublicRecipeAssets] = useState(
    getLocalPublicImagePromptAssets
  );
  const [previewPromptCopied, setPreviewPromptCopied] = useState(false);
  const [lightboxItem, setLightboxItem] =
    useState<VisualImageHistoryItem | null>(null);
  const previewPromptCopyTimerRef = useRef<number | null>(null);
  const publicRecipeAssetsLoadedRef = useRef(false);
  const galleryGridRef = useRef<HTMLElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLButtonElement | null>(null);
  const loadingMoreOffsetRef = useRef<number | null>(null);
  const [galleryColumnCount, setGalleryColumnCount] = useState(1);
  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...items.map(getModelFilterValue),
          ...videoItems.map(
            (item) => item.modelLabel || item.model || '未知模型'
          )
        ])
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [items, videoItems]
  );
  const assets = useMemo<AssetLibraryItem[]>(
    () =>
      [
        ...items.map((item) => ({
          kind: 'image' as const,
          id: `image:${item.id}`,
          createdAt: item.createdAt,
          item
        })),
        ...videoItems.map((item) => ({
          kind: 'video' as const,
          id: `video:${item.generationId}`,
          createdAt: item.createdAt,
          item
        }))
      ].sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      ),
    [items, videoItems]
  );
  const filteredAssets = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (
        modelFilter !== 'all' &&
        getAssetModelFilterValue(asset) !== modelFilter
      ) {
        return false;
      }
      if (!keyword) return true;
      return getAssetSearchText(asset).includes(keyword);
    });
  }, [assets, modelFilter, query]);
  const filtered = useMemo(
    () =>
      filteredAssets
        .filter((asset) => asset.kind === 'image')
        .map((asset) => asset.item),
    [filteredAssets]
  );
  const galleryColumns = useMemo(() => {
    const masonryItems: GalleryMasonryItem[] = filteredAssets.map(
      (asset, index) => ({
        asset,
        index,
        aspectRatio: getAssetAspectRatio(asset)
      })
    );
    return splitMasonryColumns(
      masonryItems,
      galleryColumnCount,
      ({ aspectRatio }) => cssAspectRatioToHeightWeight(aspectRatio)
    );
  }, [filteredAssets, galleryColumnCount]);
  useEffect(() => {
    const node = galleryGridRef.current;
    if (!node) return undefined;

    const updateColumnCount = () => {
      const width = node.getBoundingClientRect().width;
      setGalleryColumnCount((current) => {
        const next = getResponsiveMasonryColumnCount(width, {
          minColumnWidth: width <= 520 ? 142 : width <= 1024 ? 150 : 156,
          gap: width <= 520 ? 9 : 16,
          minColumns: width <= 360 ? 1 : 2,
          maxColumns: 7
        });
        return current === next ? current : next;
      });
    };

    updateColumnCount();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateColumnCount);
      return () => window.removeEventListener('resize', updateColumnCount);
    }

    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredAssets.length]);
  const previewItemIndex = useMemo(
    () =>
      previewItem
        ? filtered.findIndex((item) => item.id === previewItem.id)
        : -1,
    [filtered, previewItem]
  );
  const canNavigatePreviewItems = previewItemIndex >= 0 && filtered.length > 1;
  const previewRecipeAssets = useMemo(
    () =>
      previewItem
        ? resolveHistoryVisualRecipeAssets(previewItem, publicRecipeAssets)
        : [],
    [previewItem, publicRecipeAssets]
  );
  const previewRecipeSelection = useMemo(
    () => getGalleryRecipeSelection(previewRecipeAssets),
    [previewRecipeAssets]
  );

  useEffect(() => {
    if (!previewItem || publicRecipeAssetsLoadedRef.current) return undefined;
    publicRecipeAssetsLoadedRef.current = true;
    let cancelled = false;
    void loadPublicImagePromptAssetLibrary().then((library) => {
      if (!cancelled) setPublicRecipeAssets(library.assets);
    });
    return () => {
      cancelled = true;
    };
  }, [previewItem]);

  const closePreviewItem = useCallback(() => {
    setPreviewItem(null);
  }, []);
  const previewDialogRef = useOverlayBehavior<HTMLElement>({
    open: Boolean(previewItem),
    closeDisabled: Boolean(lightboxItem),
    onClose: closePreviewItem
  });

  useEffect(() => {
    setPreviewPromptCopied(false);
    if (previewPromptCopyTimerRef.current !== null) {
      window.clearTimeout(previewPromptCopyTimerRef.current);
      previewPromptCopyTimerRef.current = null;
    }
  }, [previewItem?.id]);

  useEffect(() => {
    return () => {
      if (previewPromptCopyTimerRef.current !== null) {
        window.clearTimeout(previewPromptCopyTimerRef.current);
      }
    };
  }, []);

  const goToPreviewItem = useCallback(
    (direction: -1 | 1) => {
      if (!canNavigatePreviewItems) return;
      const nextIndex =
        (previewItemIndex + direction + filtered.length) % filtered.length;
      const nextItem = filtered[nextIndex];
      if (nextItem) setPreviewItem(nextItem);
    },
    [canNavigatePreviewItems, filtered, previewItemIndex]
  );

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 资产库 | 管理图片与视频生成资产',
      description:
        '统一查看 AI 图片与视频历史，预览、下载并回到创作台继续生成。',
      robots: 'noindex,nofollow',
      htmlLang: localePrefix === '/en-US' ? 'en' : 'zh-CN'
    });
  }, [localePrefix]);

  useEffect(() => {
    if (!previewItem) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!canNavigatePreviewItems) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviewItem(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPreviewItem(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canNavigatePreviewItems, goToPreviewItem, previewItem]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const loadImages = category !== 'videos';
    const loadVideos = category !== 'images';
    Promise.all([
      loadImages
        ? getVisualImageHistoryResult(30, 0, {
            favorite: category === 'favorites'
          })
        : Promise.resolve({ items: [], total: 0 }),
      loadVideos
        ? getVisualVideoHistoryResult({
            limit: 30,
            favorite: category === 'favorites'
          }).catch((caught) => {
            if (!cancelled) {
              setError(
                caught instanceof Error
                  ? `视频资产加载失败：${caught.message}`
                  : '视频资产加载失败，图片资产仍可正常使用。'
              );
            }
            return { items: [], hasMore: false, nextBefore: undefined };
          })
        : Promise.resolve({ items: [], hasMore: false, nextBefore: undefined })
    ])
      .then(([imageResult, videoResult]) => {
        if (cancelled) return;
        setItems(imageResult.items);
        setTotal(imageResult.total);
        setVideoItems(videoResult.items);
        setVideoNextBefore(videoResult.nextBefore);
        setVideoHasMore(videoResult.hasMore);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '资产库加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, isAuthenticated, isLoading]);

  const loadMore = useCallback(async () => {
    if (
      !isAuthenticated ||
      loadingMore ||
      loadingMoreOffsetRef.current === items.length ||
      (items.length >= total && !videoHasMore)
    ) {
      return;
    }
    loadingMoreOffsetRef.current = items.length;
    setLoadingMore(true);
    setError('');
    try {
      const [imageResult, videoResult] = await Promise.all([
        category !== 'videos' && items.length < total
          ? getVisualImageHistoryResult(30, items.length, {
              favorite: category === 'favorites'
            })
          : Promise.resolve({ items: [], total }),
        category !== 'images' && videoHasMore
          ? getVisualVideoHistoryResult({
              limit: 30,
              before: videoNextBefore,
              favorite: category === 'favorites'
            }).catch((caught) => {
              setError(
                caught instanceof Error
                  ? `更多视频资产加载失败：${caught.message}`
                  : '更多视频资产加载失败。'
              );
              return { items: [], hasMore: false, nextBefore: undefined };
            })
          : Promise.resolve({
              items: [],
              hasMore: false,
              nextBefore: undefined
            })
      ]);
      setItems((current) => {
        const existing = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...imageResult.items.filter((item) => !existing.has(item.id))
        ];
      });
      setTotal(imageResult.total);
      setVideoItems((current) => {
        const existing = new Set(current.map((item) => item.generationId));
        return [
          ...current,
          ...videoResult.items.filter(
            (item) => !existing.has(item.generationId)
          )
        ];
      });
      if (videoResult.items.length || videoHasMore) {
        setVideoNextBefore(videoResult.nextBefore);
        setVideoHasMore(videoResult.hasMore);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '资产库加载失败');
    } finally {
      loadingMoreOffsetRef.current = null;
      setLoadingMore(false);
    }
  }, [
    category,
    isAuthenticated,
    items,
    loadingMore,
    total,
    videoHasMore,
    videoNextBefore
  ]);

  const handleRefreshGallery = useCallback(async () => {
    if (!isAuthenticated || loading || loadingMore) return;
    const limit = Math.max(30, Math.min(120, items.length || 30));
    setLoading(true);
    setLoadingMore(false);
    setError('');
    setStatus('');
    try {
      const [imageResult, videoResult] = await Promise.all([
        category !== 'videos'
          ? getVisualImageHistoryResult(limit, 0, {
              favorite: category === 'favorites'
            })
          : Promise.resolve({ items: [], total: 0 }),
        category !== 'images'
          ? getVisualVideoHistoryResult({
              limit,
              favorite: category === 'favorites'
            }).catch((caught) => {
              setError(
                caught instanceof Error
                  ? `视频资产刷新失败：${caught.message}`
                  : '视频资产刷新失败，图片资产已刷新。'
              );
              return { items: [], hasMore: false, nextBefore: undefined };
            })
          : Promise.resolve({
              items: [],
              hasMore: false,
              nextBefore: undefined
            })
      ]);
      setItems(imageResult.items);
      setTotal(imageResult.total);
      setVideoItems(videoResult.items);
      setVideoNextBefore(videoResult.nextBefore);
      setVideoHasMore(videoResult.hasMore);
      setStatus('资产库已刷新');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '资产库刷新失败');
    } finally {
      setLoading(false);
    }
  }, [category, isAuthenticated, items.length, loading, loadingMore]);

  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (
      !node ||
      loading ||
      loadingMore ||
      !isAuthenticated ||
      (items.length >= total && !videoHasMore)
    ) {
      return;
    }
    let frameId: number | null = null;
    const maybeLoadMore = () => {
      frameId = null;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const rect = node.getBoundingClientRect();
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      );
      const distanceToDocumentBottom =
        scrollHeight - (scrollTop + viewportHeight);

      if (rect.top <= viewportHeight + 720 || distanceToDocumentBottom <= 900) {
        void loadMore();
      }
    };
    const scheduleLoadCheck = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(maybeLoadMore);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          scheduleLoadCheck();
        }
      },
      { rootMargin: '720px 0px' }
    );
    observer.observe(node);
    const page = node.closest('.image-create-page');
    const workspace = node.closest('.create-workspace-page');
    const scrollOptions: AddEventListenerOptions = {
      passive: true,
      capture: true
    };

    scheduleLoadCheck();
    window.addEventListener('scroll', scheduleLoadCheck, scrollOptions);
    window.addEventListener('wheel', scheduleLoadCheck, { passive: true });
    window.addEventListener('touchmove', scheduleLoadCheck, { passive: true });
    window.addEventListener('resize', scheduleLoadCheck);
    document.addEventListener('scroll', scheduleLoadCheck, scrollOptions);
    page?.addEventListener('scroll', scheduleLoadCheck, scrollOptions);
    workspace?.addEventListener('scroll', scheduleLoadCheck, scrollOptions);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener('scroll', scheduleLoadCheck, scrollOptions);
      window.removeEventListener('wheel', scheduleLoadCheck);
      window.removeEventListener('touchmove', scheduleLoadCheck);
      window.removeEventListener('resize', scheduleLoadCheck);
      document.removeEventListener('scroll', scheduleLoadCheck, scrollOptions);
      page?.removeEventListener('scroll', scheduleLoadCheck, scrollOptions);
      workspace?.removeEventListener(
        'scroll',
        scheduleLoadCheck,
        scrollOptions
      );
    };
  }, [
    isAuthenticated,
    items.length,
    loadMore,
    loading,
    loadingMore,
    total,
    videoHasMore
  ]);

  const updateHistoryItem = useCallback((updated: VisualImageHistoryItem) => {
    setItems((current) =>
      current.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item
      )
    );
    setPreviewItem((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current
    );
    setActionSheetItem((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current
    );
    setLightboxItem((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current
    );
  }, []);

  const toggleFavorite = useCallback(
    async (item: VisualImageHistoryItem) => {
      if (favoriteLoadingIds.has(item.id)) return;
      const nextFavorite = !item.isFavorite;
      setFavoriteLoadingIds((current) => new Set(current).add(item.id));
      setError('');
      setStatus('');
      try {
        const updated = await setVisualImageFavorite(item.id, nextFavorite);
        const nextItem = { ...item, isFavorite: updated.isFavorite };
        if (category === 'favorites' && !updated.isFavorite) {
          setItems((current) =>
            current.filter((entry) => entry.id !== item.id)
          );
          setTotal((current) => Math.max(0, current - 1));
          setPreviewItem((current) =>
            current?.id === item.id ? null : current
          );
          setActionSheetItem(null);
        } else {
          updateHistoryItem(nextItem);
        }
        setStatus(updated.isFavorite ? '已加入收藏' : '已取消收藏');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '收藏状态更新失败');
      } finally {
        setFavoriteLoadingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [category, favoriteLoadingIds, updateHistoryItem]
  );

  const updateVideoHistoryItem = useCallback(
    (updated: VisualVideoGenerationItem) => {
      setVideoItems((current) =>
        current.map((item) =>
          item.generationId === updated.generationId
            ? { ...item, ...updated }
            : item
        )
      );
      setPreviewVideo((current) =>
        current?.generationId === updated.generationId
          ? { ...current, ...updated }
          : current
      );
      setVideoActionSheetItem((current) =>
        current?.generationId === updated.generationId
          ? { ...current, ...updated }
          : current
      );
    },
    []
  );

  const toggleVideoFavorite = useCallback(
    async (item: VisualVideoGenerationItem) => {
      if (favoriteLoadingIds.has(item.generationId)) return;
      const nextFavorite = !item.isFavorite;
      setFavoriteLoadingIds((current) =>
        new Set(current).add(item.generationId)
      );
      setError('');
      setStatus('');
      try {
        const updated = await setVisualVideoFavorite(
          item.generationId,
          nextFavorite
        );
        const nextItem = { ...item, isFavorite: updated.isFavorite };
        if (category === 'favorites' && !updated.isFavorite) {
          setVideoItems((current) =>
            current.filter((entry) => entry.generationId !== item.generationId)
          );
          setPreviewVideo((current) =>
            current?.generationId === item.generationId ? null : current
          );
          setVideoActionSheetItem(null);
        } else {
          updateVideoHistoryItem(nextItem);
        }
        setStatus(updated.isFavorite ? '已加入收藏' : '已取消收藏');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '收藏状态更新失败');
      } finally {
        setFavoriteLoadingIds((current) => {
          const next = new Set(current);
          next.delete(item.generationId);
          return next;
        });
      }
    },
    [category, favoriteLoadingIds, updateVideoHistoryItem]
  );

  const downloadOriginalImage = useCallback((item: VisualImageHistoryItem) => {
    const [url] = getImageCandidates(item, 'preview').sort((a, b) => {
      const score = (value: string) =>
        value === item.imageUrl ? 0 : value === item.previewUrl ? 1 : 2;
      return score(a) - score(b);
    });
    if (!url) return;
    triggerImageDownload(url, `webtomind-${item.id || 'image'}`);
  }, []);

  const openImageEditorFromItem = useCallback(
    (item: VisualImageHistoryItem) => {
      const entry = createImageEditorEntryState(item);
      if (!entry) return;
      navigate(`${localePrefix}/tools/image-editor`, { state: entry });
    },
    [localePrefix, navigate]
  );

  const copyPreviewPrompt = useCallback(async () => {
    if (!previewItem?.prompt?.trim()) return;
    const negativePrompt = previewItem.negativePrompt?.trim() || '';
    const text = negativePrompt
      ? `${previewItem.prompt.trim()}\n\nNegative prompt: ${negativePrompt}`
      : previewItem.prompt.trim();
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      setPreviewPromptCopied(true);
      setStatus('Prompt 已复制');
      if (previewPromptCopyTimerRef.current !== null) {
        window.clearTimeout(previewPromptCopyTimerRef.current);
      }
      previewPromptCopyTimerRef.current = window.setTimeout(() => {
        setPreviewPromptCopied(false);
        previewPromptCopyTimerRef.current = null;
      }, 1400);
    } catch (caught) {
      console.warn('[CreateGalleryPage] clipboard write failed:', caught);
      setError('复制 Prompt 失败');
    }
  }, [previewItem]);

  const handleUseAsReference = async (item: VisualImageHistoryItem) => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setImportingId(item.id);
    setError('');
    setStatus('');
    try {
      const reference = await importGenerationAsReference({
        generationId: item.id,
        role: 'style',
        label: '资产库参考图'
      });
      navigate(`${localePrefix}/image`, {
        state: { referenceImageIds: [reference.id] }
      });
      void completeRewardTaskOnce(
        REWARD_TASK_IDENTIFIERS.reuseGalleryGeneration
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考图导入失败');
    } finally {
      setImportingId(null);
    }
  };

  return (
    <CreateWorkspaceFrame className="create-gallery-route">
      <section className="create-page-title create-gallery-titlebar">
        <div className="create-gallery-title-head">
          <div className="create-gallery-title-copy">
            <span className="create-eyebrow">Assets</span>
            <h1>资产库</h1>
          </div>
          <div className="create-gallery-toolbar">
            <div
              className="create-gallery-category-tabs"
              role="tablist"
              aria-label="资产分类"
            >
              <button
                type="button"
                role="tab"
                aria-selected={category === 'all'}
                onClick={() => setCategory('all')}
              >
                全部
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'images'}
                onClick={() => setCategory('images')}
              >
                图片
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'videos'}
                onClick={() => setCategory('videos')}
              >
                视频
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'favorites'}
                onClick={() => setCategory('favorites')}
              >
                <Heart size={15} /> 收藏
              </button>
            </div>
            <Input
              className="create-gallery-search-input"
              aria-label="搜索 prompt、模型或 provider"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索资产库"
            />
            <div className="create-gallery-model-filter">
              <span>模型</span>
              <SelectRoot value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger
                  className="create-gallery-model-trigger"
                  aria-label="按模型筛选资产库"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部模型</SelectItem>
                    {modelOptions.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </SelectRoot>
            </div>
            <Button
              type="button"
              variant="outline"
              className="create-gallery-mobile-filter-button"
              leadingIcon={<SlidersHorizontal size={16} />}
              aria-label={
                modelFilter === 'all'
                  ? '筛选资产库'
                  : `筛选资产库，当前模型 ${modelFilter}`
              }
              onClick={() => setFilterSheetOpen(true)}
            >
              {modelFilter === 'all' ? '筛选' : '已筛选'}
            </Button>
            <Button
              type="button"
              className="create-gallery-refresh-button"
              onClick={handleRefreshGallery}
              disabled={!isAuthenticated || loading || loadingMore}
              title="刷新资产库"
              aria-label="刷新资产库"
            >
              <RefreshCw
                size={16}
                className={loading ? 'creator-spin-icon' : undefined}
              />
              <span>刷新</span>
            </Button>
          </div>
        </div>
        <p>图片与视频生成结果会自动保存，可随时预览、下载并继续创作。</p>
      </section>

      {loading ? (
        <Empty className="create-empty-state">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Loader2 className="creator-spin-icon" />
            </EmptyMedia>
            <EmptyDescription>正在加载资产库</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !isAuthenticated ? (
        <Empty className="create-empty-state">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GalleryHorizontalEnd />
            </EmptyMedia>
            <EmptyDescription>登录后查看你的生成资产</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => navigate('/login')}>
              登录
            </Button>
          </EmptyContent>
        </Empty>
      ) : filteredAssets.length === 0 ? (
        <Empty className="create-empty-state">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GalleryHorizontalEnd />
            </EmptyMedia>
            <EmptyDescription>暂无匹配资产</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section
          ref={galleryGridRef}
          className="create-gallery-grid"
          style={
            {
              '--create-gallery-active-columns': galleryColumns.length || 1
            } as CSSProperties
          }
        >
          {galleryColumns.map((column, columnIndex) => (
            <div
              key={`create-gallery-column-${columnIndex}`}
              className="create-gallery-column"
            >
              {column.map(({ asset, index, aspectRatio }) => {
                const isVideo = asset.kind === 'video';
                const imageItem = asset.kind === 'image' ? asset.item : null;
                const videoItem = asset.kind === 'video' ? asset.item : null;
                return (
                  <Card
                    as="article"
                    variant="interactive"
                    density="compact"
                    key={asset.id}
                    className={`create-gallery-card${isVideo ? ' is-video' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (videoItem) setPreviewVideo(videoItem);
                      if (imageItem) setPreviewItem(imageItem);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (videoItem) setPreviewVideo(videoItem);
                        if (imageItem) setPreviewItem(imageItem);
                      }
                    }}
                    style={
                      {
                        '--gallery-aspect-ratio': aspectRatio
                      } as CSSProperties
                    }
                  >
                    <div className="create-gallery-image-wrap">
                      {videoItem?.videoUrl ? (
                        <video
                          src={videoItem.videoUrl}
                          poster={videoItem.posterUrl}
                          muted
                          loop
                          playsInline
                          preload={index < 8 ? 'metadata' : 'none'}
                          aria-label={inferGalleryTitle(
                            videoItem.prompt || '',
                            'AI 生成视频'
                          )}
                          onMouseEnter={(event) =>
                            void event.currentTarget
                              .play()
                              .catch(() => undefined)
                          }
                          onMouseLeave={(event) => {
                            event.currentTarget.pause();
                          }}
                        />
                      ) : imageItem && getImage(imageItem) ? (
                        <GalleryImage
                          item={imageItem}
                          alt={inferGalleryTitle(
                            imageItem.prompt || '',
                            'AI 生成图片'
                          )}
                          className={index < 8 ? 'is-priority' : undefined}
                          onRefresh={updateHistoryItem}
                        />
                      ) : (
                        <div className="create-gallery-image-placeholder">
                          <GalleryHorizontalEnd size={24} />
                          <span>
                            {isVideo ? '视频资源准备中' : '图片资源准备中'}
                          </span>
                        </div>
                      )}
                      <div className="create-gallery-hover-panel">
                        {imageItem ? (
                          <GalleryCardActionControls
                            referenceLoading={importingId === imageItem.id}
                            favoriteLoading={favoriteLoadingIds.has(
                              imageItem.id
                            )}
                            favorite={Boolean(imageItem.isFavorite)}
                            onReference={() =>
                              void handleUseAsReference(imageItem)
                            }
                            onEdit={() =>
                              navigate(`${localePrefix}/image`, {
                                state: getGalleryReeditState(imageItem)
                              })
                            }
                            onFavorite={() => void toggleFavorite(imageItem)}
                            onMore={() => setActionSheetItem(imageItem)}
                          />
                        ) : (
                          <>
                            <div className="create-gallery-actions create-gallery-video-actions">
                              <IconButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                label={
                                  videoItem?.isFavorite
                                    ? '取消收藏'
                                    : '加入收藏'
                                }
                                icon={
                                  favoriteLoadingIds.has(
                                    videoItem?.generationId || ''
                                  ) ? (
                                    <Loader2 className="creator-spin-icon" />
                                  ) : (
                                    <Heart
                                      fill={
                                        videoItem?.isFavorite
                                          ? 'currentColor'
                                          : 'none'
                                      }
                                    />
                                  )
                                }
                                disabled={favoriteLoadingIds.has(
                                  videoItem?.generationId || ''
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (videoItem)
                                    void toggleVideoFavorite(videoItem);
                                }}
                              />
                              <IconButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                label="再次创作"
                                icon={<PencilLine />}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(`${localePrefix}/video`, {
                                    state: {
                                      promptCasePrompt: videoItem?.prompt || ''
                                    }
                                  });
                                }}
                              />
                            </div>
                            <IconButton
                              type="button"
                              variant="ghost"
                              size="md"
                              className="create-gallery-more-button"
                              label="更多操作"
                              icon={<SlidersHorizontal />}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (videoItem)
                                  setVideoActionSheetItem(videoItem);
                              }}
                            />
                          </>
                        )}
                        <div className="create-gallery-hover-copy">
                          <strong>
                            {asset.item.modelLabel ||
                              asset.item.model ||
                              (isVideo ? 'AI Video' : 'AI Image')}
                          </strong>
                          {asset.item.aspectRatio ||
                          (imageItem && imageItem.imageSize) ? (
                            <span>
                              {[
                                asset.item.aspectRatio,
                                imageItem?.imageSize,
                                videoItem?.duration
                                  ? `${videoItem.duration}s`
                                  : null
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          ) : null}
                          <p>{asset.item.prompt}</p>
                        </div>
                      </div>
                    </div>
                    <time dateTime={asset.createdAt || undefined}>
                      {formatGalleryDate(asset.createdAt)}
                    </time>
                  </Card>
                );
              })}
            </div>
          ))}
        </section>
      )}
      {isAuthenticated && !loading && filteredAssets.length > 0 && (
        <>
          {items.length < total || videoHasMore ? (
            <Button
              ref={loadMoreSentinelRef}
              type="button"
              className="create-gallery-sentinel"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              aria-live="polite"
            >
              {loadingMore && (
                <Loader2 className="creator-spin-icon" size={15} />
              )}
              <span>
                {loadingMore ? '正在加载更多资产' : '继续下滑加载更多'}
              </span>
            </Button>
          ) : (
            <div className="create-gallery-sentinel" data-state="done">
              <span>已加载全部资产</span>
            </div>
          )}
        </>
      )}
      {error && (
        <SupportErrorNotice
          className="create-inline-error"
          locale={localePrefix === '/en-US' ? 'en-US' : 'zh-CN'}
          message={error}
        />
      )}
      {status && (
        <Alert className="create-inline-status">
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}
      <GalleryActionSheet
        open={Boolean(actionSheetItem)}
        onClose={() => setActionSheetItem(null)}
        referenceLoading={Boolean(
          actionSheetItem && importingId === actionSheetItem.id
        )}
        onReference={() => {
          if (actionSheetItem) void handleUseAsReference(actionSheetItem);
        }}
        onEdit={() => {
          if (!actionSheetItem) return;
          navigate(`${localePrefix}/image`, {
            state: getGalleryReeditState(actionSheetItem)
          });
        }}
        favorite={Boolean(actionSheetItem?.isFavorite)}
        favoriteLoading={Boolean(
          actionSheetItem && favoriteLoadingIds.has(actionSheetItem.id)
        )}
        onFavorite={() => {
          if (actionSheetItem) void toggleFavorite(actionSheetItem);
        }}
      />
      <GalleryFilterSheet
        open={filterSheetOpen}
        modelFilter={modelFilter}
        modelOptions={modelOptions}
        refreshDisabled={!isAuthenticated || loading || loadingMore}
        refreshing={loading}
        onModelFilterChange={setModelFilter}
        onRefresh={handleRefreshGallery}
        onClose={() => setFilterSheetOpen(false)}
      />
      <ActionSheet
        open={Boolean(videoActionSheetItem)}
        title="视频操作"
        ariaLabel="视频资产操作"
        closeLabel="关闭"
        className="create-gallery-action-sheet"
        onClose={() => setVideoActionSheetItem(null)}
      >
        <Button
          type="button"
          variant="ghost"
          leadingIcon={<Play />}
          onClick={() => {
            setPreviewVideo(videoActionSheetItem);
            setVideoActionSheetItem(null);
          }}
        >
          预览视频
        </Button>
        <Button
          type="button"
          variant="ghost"
          leadingIcon={<PencilLine />}
          onClick={() => {
            if (!videoActionSheetItem) return;
            navigate(`${localePrefix}/video`, {
              state: { promptCasePrompt: videoActionSheetItem.prompt || '' }
            });
            setVideoActionSheetItem(null);
          }}
        >
          再次创作
        </Button>
        <Button
          type="button"
          variant="ghost"
          leadingIcon={
            favoriteLoadingIds.has(videoActionSheetItem?.generationId || '') ? (
              <Loader2 className="creator-spin-icon" />
            ) : (
              <Heart
                fill={
                  videoActionSheetItem?.isFavorite ? 'currentColor' : 'none'
                }
              />
            )
          }
          disabled={favoriteLoadingIds.has(
            videoActionSheetItem?.generationId || ''
          )}
          onClick={() => {
            if (videoActionSheetItem)
              void toggleVideoFavorite(videoActionSheetItem);
          }}
        >
          {videoActionSheetItem?.isFavorite ? '取消收藏' : '加入收藏'}
        </Button>
        {videoActionSheetItem?.videoUrl ? (
          <Button
            type="button"
            variant="ghost"
            leadingIcon={<Download />}
            onClick={() => {
              window.open(
                videoActionSheetItem.videoUrl,
                '_blank',
                'noopener,noreferrer'
              );
              setVideoActionSheetItem(null);
            }}
          >
            下载视频
          </Button>
        ) : null}
      </ActionSheet>
      {previewVideo ? (
        <VideoHistoryPreviewDialog
          item={previewVideo}
          dateLocale={localePrefix === '/en-US' ? 'en-US' : 'zh-CN'}
          onReuse={() =>
            navigate(`${localePrefix}/video`, {
              state: { promptCasePrompt: previewVideo.prompt || '' }
            })
          }
          onFavorite={() => void toggleVideoFavorite(previewVideo)}
          favoriteLoading={favoriteLoadingIds.has(previewVideo.generationId)}
          onClose={() => setPreviewVideo(null)}
        />
      ) : null}
      {previewItem && (
        <div
          className="creator-preview-backdrop create-gallery-preview-backdrop"
          role="presentation"
          onMouseDown={closePreviewItem}
        >
          <section
            ref={previewDialogRef}
            className="creator-preview create-gallery-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="图片资产预览"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="creator-preview-head">
              <span>图片资产预览</span>
              <div className="creator-preview-head-actions">
                <div className="creator-preview-actions creator-preview-head-action-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="creator-preview-download"
                    onClick={() => downloadOriginalImage(previewItem)}
                  >
                    <Download data-icon="inline-start" />
                    下载原图
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="creator-preview-add-project"
                    disabled={favoriteLoadingIds.has(previewItem.id)}
                    onClick={() => void toggleFavorite(previewItem)}
                  >
                    {favoriteLoadingIds.has(previewItem.id) ? (
                      <Loader2
                        data-icon="inline-start"
                        className="creator-spin-icon"
                      />
                    ) : (
                      <Heart
                        data-icon="inline-start"
                        fill={previewItem.isFavorite ? 'currentColor' : 'none'}
                      />
                    )}
                    {previewItem.isFavorite ? '取消收藏' : '加入收藏'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="creator-preview-image-edit"
                    onClick={() => openImageEditorFromItem(previewItem)}
                  >
                    <Wand2 data-icon="inline-start" />
                    图片编辑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="creator-preview-reedit"
                    onClick={() =>
                      navigate(`${localePrefix}/image`, {
                        state: getGalleryReeditState(previewItem)
                      })
                    }
                  >
                    <PencilLine data-icon="inline-start" />
                    继续编辑
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="creator-preview-close-button"
                  aria-label="关闭"
                  onClick={closePreviewItem}
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="creator-preview-body">
              <div className="creator-preview-image">
                <button
                  type="button"
                  className="creator-preview-image-zoom create-gallery-preview-image-button"
                  aria-label="全屏查看图片"
                  onClick={() => setLightboxItem(previewItem)}
                >
                  <GalleryImage
                    item={previewItem}
                    mode="preview"
                    alt={inferGalleryTitle(
                      previewItem.prompt || '',
                      'AI 生成图片'
                    )}
                    onRefresh={updateHistoryItem}
                  />
                  <span>
                    <Maximize2 size={16} />
                  </span>
                </button>
                {canNavigatePreviewItems && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="creator-preview-nav prev"
                      aria-label="上一个作品"
                      onClick={() => goToPreviewItem(-1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="creator-preview-nav next"
                      aria-label="下一个作品"
                      onClick={() => goToPreviewItem(1)}
                    >
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
              <div className="creator-preview-side">
                <VisualRecipeSummary
                  assets={previewRecipeAssets}
                  getSlotLabel={(slot) =>
                    getGalleryRecipeSlotLabel(slot, localePrefix)
                  }
                  label={localePrefix === '/en-US' ? 'Elements' : '可视化配方'}
                  createLabel={
                    localePrefix === '/en-US'
                      ? 'Create from recipe'
                      : '按配方创作'
                  }
                  onCreateFromRecipe={() =>
                    navigate(`${localePrefix}/image`, {
                      state: getGalleryReeditState(
                        previewItem,
                        previewRecipeSelection
                      )
                    })
                  }
                />
                <div className="creator-preview-prompt">
                  <div className="creator-preview-prompt-head">
                    <span>Prompt</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyPreviewPrompt()}
                    >
                      {previewPromptCopied ? (
                        <Check data-icon="inline-start" />
                      ) : (
                        <Copy data-icon="inline-start" />
                      )}
                      {previewPromptCopied ? '已复制' : '复制 Prompt'}
                    </Button>
                  </div>
                  <pre>{previewItem.prompt}</pre>
                  {previewItem.negativePrompt && (
                    <>
                      <span className="creator-preview-prompt-sub">
                        Negative Prompt
                      </span>
                      <pre>{previewItem.negativePrompt}</pre>
                    </>
                  )}
                </div>
                <dl className="creator-preview-meta">
                  <div>
                    <dt>模型</dt>
                    <dd>
                      {previewItem.modelLabel || previewItem.model || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>时间</dt>
                    <dd>
                      {previewItem.createdAt
                        ? formatGalleryDate(previewItem.createdAt)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>比例</dt>
                    <dd>{previewItem.aspectRatio || '—'}</dd>
                  </div>
                  <div>
                    <dt>尺寸</dt>
                    <dd>
                      {previewItem.actualImageSize ||
                        previewItem.imageSize ||
                        previewItem.requestedImageSize ||
                        '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        </div>
      )}
      {lightboxItem && (
        <PhotoSwipeViewer
          items={filtered.map((item) => ({
            src: item.imageUrl || getImageCandidates(item, 'preview')[0],
            width: item.width,
            height: item.height,
            alt: item.prompt || ''
          }))}
          index={Math.max(
            0,
            filtered.findIndex((item) => item.id === lightboxItem.id)
          )}
          onClose={() => setLightboxItem(null)}
          onIndexChange={(nextIndex) => {
            const nextItem = filtered[nextIndex];
            if (nextItem) setLightboxItem(nextItem);
          }}
          onDownload={(nextIndex) => {
            const target = filtered[nextIndex];
            if (target) downloadOriginalImage(target);
          }}
          onEdit={(nextIndex) => {
            const target = filtered[nextIndex];
            if (target) openImageEditorFromItem(target);
          }}
        />
      )}
    </CreateWorkspaceFrame>
  );
}
