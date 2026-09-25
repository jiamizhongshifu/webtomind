import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookImage, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import { Button, FeedbackMessage, SearchField } from '@/shared/ui';
import {
  addMoodboardItems,
  describeDiscoveryImage,
  listMoodboards,
  materializeMoodboardForUse,
  searchVisualDiscovery,
  type DiscoveryImage,
  type DiscoverySearchPagination,
  type DiscoverySearchResult
} from '@/services/create-workspace-v2-api';
import { getPublicPromptCase } from '@/services/agent-api';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import {
  WorkspaceHeroCarousel,
  type WorkspaceHeroSlide
} from '../components/create-workspace/WorkspaceHeroCarousel';
import visualRecipeAtlas from '../assets/discovery/visual-recipe-atlas.webp';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';
import { isCreateWorkspaceFeatureEnabled } from '../lib/create-workspace-flags';
import { CREATE_WORKSPACE_FEATURE_FLAGS } from '@/shared/create-workspace-v2';
import { withCreateWorkspaceDiscoveryFallback } from '../data/create-workspace-demo';
import { ReactivationBanner } from '../components/ReactivationBanner';
import {
  composeDiscoverySearchQuery,
  createDiscoverySearchFailure
} from '../lib/discovery-search-state';
import { shuffleDiscoveryImages } from '../lib/discovery-image-presentation';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../components/AuthModal';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  DiscoveryGallerySkeleton,
  DiscoveryImageMasonry,
  DiscoveryImagePreview,
  DiscoveryLoadMore,
  DiscoveryMoodboardGrid,
  DiscoveryMoodboardPreview
} from '../components/create-workspace/DiscoveryGallery';

const DISCOVERY_DEFAULT_MOODBOARD_KEY = 'webtomind:discovery-default-moodboard';
// 每次加载一屏左右的量：初始与分页都按 24 张拉取，
// 避免一次返回几百张导致追加时大量图片同时激活。
const DISCOVERY_PAGE_SIZE = 24;

const EMPTY_DISCOVERY_PAGINATION: DiscoverySearchPagination = {
  images: { nextOffset: 0, hasMore: false },
  moodboards: { nextOffset: 0, hasMore: false }
};

function normalizeDiscoveryPagination(
  result: DiscoverySearchResult
): DiscoverySearchPagination {
  return (
    result.pagination || {
      images: { nextOffset: result.images.length, hasMore: false },
      moodboards: { nextOffset: result.moodboards.length, hasMore: false }
    }
  );
}

function appendUniqueById<T extends { id: string }>(
  current: T[],
  incoming: T[]
): T[] {
  const knownIds = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !knownIds.has(item.id))];
}

function localePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  if (pathname.startsWith('/en-US')) return '/en-US';
  return '';
}

export function CreateDiscoveryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const prefix = localePrefix(location.pathname);
  const isEnglish = prefix === '/en-US';
  const isCompactSearch = useMediaQuery('(max-width: 640px)');
  const uploadRef = useRef<HTMLInputElement>(null);
  const imageAnalysisAbortRef = useRef<AbortController | null>(null);
  const uploadedImageUrlRef = useRef('');
  const searchRequestSequenceRef = useRef(0);
  const visualSearchEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.visualSearchV1
  );
  const [query, setQuery] = useState('');
  const [visualSearchQuery, setVisualSearchQuery] = useState('');
  const [result, setResult] = useState<DiscoverySearchResult | null>(null);
  const [pagination, setPagination] = useState<DiscoverySearchPagination>(
    EMPTY_DISCOVERY_PAGINATION
  );
  const [resolvedPreviewImage, setResolvedPreviewImage] =
    useState<DiscoveryImage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [relatedImages, setRelatedImages] = useState<DiscoveryImage[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [savingMoodboardId, setSavingMoodboardId] = useState('');
  const [usingMoodboardId, setUsingMoodboardId] = useState('');
  const [userMoodboards, setUserMoodboards] = useState<VisualMoodboard[]>([]);
  const [selectedMoodboardId, setSelectedMoodboardId] = useState('');
  const [savingImageId, setSavingImageId] = useState('');
  const [savedMoodboardIds, setSavedMoodboardIds] = useState<Set<string>>(
    () => new Set()
  );
  const [uploadedImage, setUploadedImage] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [imageAnalysisStatus, setImageAnalysisStatus] = useState<
    'idle' | 'analyzing' | 'ready' | 'error'
  >('idle');
  const imageAnalyzing = imageAnalysisStatus === 'analyzing';
  const effectiveSearchQuery = useMemo(
    () => composeDiscoverySearchQuery(visualSearchQuery, query),
    [query, visualSearchQuery]
  );

  const slides = useMemo<WorkspaceHeroSlide[]>(
    () => [
      {
        id: 'image-studio',
        eyebrow: isEnglish ? 'Image Studio' : '图像创作工作室',
        title: isEnglish
          ? 'Turn a visual direction into a repeatable recipe.'
          : '把灵感，变成可以反复使用的视觉配方。',
        description: isEnglish
          ? 'Start from a recipe, a reference, or a moodboard. Keep professional controls one step away.'
          : '从配方、参考图或情绪板开始，专业参数随时可达，但不会挡住第一次生成。',
        imageUrl: visualRecipeAtlas,
        href: `${prefix}/image`,
        cta: isEnglish ? 'Open Image Studio' : '开始图像创作',
        tone: 'ink'
      }
    ],
    [isEnglish, prefix]
  );

  const displayResult = useMemo(
    () => withCreateWorkspaceDiscoveryFallback(result, effectiveSearchQuery),
    [effectiveSearchQuery, result]
  );
  const activeGallery =
    searchParams.get('gallery') === 'moodboards' ? 'moodboards' : 'images';
  const previewId = searchParams.get('preview') || '';
  const navigationState = location.state as {
    discoveryImage?: DiscoveryImage;
    discoveryMoodboard?: VisualMoodboard;
  } | null;
  const previewImage =
    activeGallery === 'images' && previewId
      ? navigationState?.discoveryImage?.id === previewId
        ? navigationState.discoveryImage
        : displayResult.images.find((item) => item.id === previewId)
      : undefined;
  const displayedPreviewImage =
    previewImage && resolvedPreviewImage?.id === previewImage.id
      ? resolvedPreviewImage
      : previewImage;
  const previewMoodboard =
    activeGallery === 'moodboards' && previewId
      ? navigationState?.discoveryMoodboard?.id === previewId
        ? navigationState.discoveryMoodboard
        : displayResult.moodboards.find((item) => item.id === previewId)
      : undefined;

  const setGallery = (gallery: 'images' | 'moodboards') => {
    const next = new URLSearchParams(searchParams);
    next.set('gallery', gallery);
    next.delete('preview');
    setSearchParams(next);
  };

  const selectDefaultMoodboard = (boardId: string) => {
    setSelectedMoodboardId(boardId);
    if (!user?.id) return;
    try {
      window.localStorage.setItem(
        `${DISCOVERY_DEFAULT_MOODBOARD_KEY}:${user.id}`,
        boardId
      );
    } catch {
      // Keep the in-memory selection when browser storage is unavailable.
    }
  };

  const selectedMoodboard = userMoodboards.find(
    (board) => board.id === selectedMoodboardId
  );

  const isImageSavedToSelectedMoodboard = (image: DiscoveryImage) =>
    Boolean(
      selectedMoodboard?.items?.some((item) => {
        if (image.kind === 'prompt_case') {
          return (
            item.promptCaseId === image.id || item.imageUrl === image.imageUrl
          );
        }
        return (
          item.imageGenerationId === image.id ||
          item.imageUrl === image.imageUrl
        );
      })
    );

  const saveImageToMoodboard = async (image: DiscoveryImage) => {
    if (!user) {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source: 'discovery_moodboard_save'
      });
      return;
    }
    if (!selectedMoodboard) {
      navigate(`${prefix}/moodboards/new`, {
        state: { pendingImage: image }
      });
      return;
    }
    if (isImageSavedToSelectedMoodboard(image) || savingImageId) return;

    const imageKey = `${image.kind}:${image.id}`;
    setSavingImageId(imageKey);
    setError('');
    try {
      const updated = await addMoodboardItems(selectedMoodboard.id, [
        {
          source: image.kind,
          imageUrl: image.imageUrl,
          title: image.title,
          prompt: image.prompt,
          promptCaseId: image.kind === 'prompt_case' ? image.id : undefined,
          imageGenerationId: image.kind === 'gallery' ? image.id : undefined
        }
      ]);
      setUserMoodboards((current) =>
        current.map((board) => (board.id === updated.id ? updated : board))
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isEnglish
            ? 'Unable to save this image to the moodboard.'
            : '暂时无法把图片保存到情绪板。'
      );
    } finally {
      setSavingImageId('');
    }
  };

  const handleSaveMoodboard = async (board: VisualMoodboard) => {
    if (!user) {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source: 'discovery_moodboard_copy'
      });
      return;
    }
    if (savedMoodboardIds.has(board.id) || savingMoodboardId) return;
    setSavingMoodboardId(board.id);
    setError('');
    try {
      const copy = await materializeMoodboardForUse(board, userMoodboards);
      setUserMoodboards((current) =>
        current.some((item) => item.id === copy.id)
          ? current
          : [copy, ...current]
      );
      if (!selectedMoodboardId) selectDefaultMoodboard(copy.id);
      setSavedMoodboardIds((current) => new Set(current).add(board.id));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : isEnglish
            ? 'Unable to save this Moodboard.'
            : '暂时无法保存这个情绪板。'
      );
    } finally {
      setSavingMoodboardId('');
    }
  };

  const handleUseMoodboard = async (board: VisualMoodboard) => {
    if (!user) {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source: 'discovery_moodboard_generate'
      });
      return;
    }
    if (usingMoodboardId) return;
    setUsingMoodboardId(board.id);
    setError('');
    try {
      const usableBoard = await materializeMoodboardForUse(
        board,
        userMoodboards
      );
      setUserMoodboards((current) =>
        current.some((item) => item.id === usableBoard.id)
          ? current
          : [usableBoard, ...current]
      );
      setSavedMoodboardIds((current) => new Set(current).add(board.id));
      navigate(
        `${prefix}/image?moodboardId=${encodeURIComponent(usableBoard.id)}`
      );
    } catch (useError) {
      setError(
        useError instanceof Error
          ? useError.message
          : isEnglish
            ? 'Unable to prepare this Moodboard for creation.'
            : '暂时无法使用这个情绪板进行创作。'
      );
    } finally {
      setUsingMoodboardId('');
    }
  };

  const runSearch = async (nextQuery: string) => {
    const requestSequence = ++searchRequestSequenceRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError('');
    try {
      const nextResult = await searchVisualDiscovery(
        nextQuery,
        isEnglish ? 'en-US' : 'zh-CN',
        { limit: DISCOVERY_PAGE_SIZE }
      );
      if (requestSequence !== searchRequestSequenceRef.current) return;
      setResult({
        ...nextResult,
        images: shuffleDiscoveryImages(nextResult.images)
      });
      setPagination(normalizeDiscoveryPagination(nextResult));
    } catch (searchError) {
      if (requestSequence !== searchRequestSequenceRef.current) return;
      const failure = createDiscoverySearchFailure(
        nextQuery,
        searchError,
        isEnglish
      );
      setResult({
        ...failure.result,
        images: shuffleDiscoveryImages(failure.result.images)
      });
      setPagination(normalizeDiscoveryPagination(failure.result));
      setError(failure.message);
    } finally {
      if (requestSequence === searchRequestSequenceRef.current) {
        setLoading(false);
      }
    }
  };

  const loadMore = async () => {
    const page = pagination[activeGallery];
    if (!page.hasMore || loading || loadingMore) return;
    const requestSequence = searchRequestSequenceRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const nextResult = await searchVisualDiscovery(
        effectiveSearchQuery,
        isEnglish ? 'en-US' : 'zh-CN',
        {
          kind: activeGallery,
          offset: page.nextOffset,
          limit: DISCOVERY_PAGE_SIZE
        }
      );
      if (requestSequence !== searchRequestSequenceRef.current) return;
      setResult((current) => {
        if (!current) return nextResult;
        return activeGallery === 'images'
          ? {
              ...current,
              images: appendUniqueById(current.images, nextResult.images)
            }
          : {
              ...current,
              moodboards: appendUniqueById(
                current.moodboards,
                nextResult.moodboards
              )
            };
      });
      setPagination((current) => ({
        ...current,
        [activeGallery]: normalizeDiscoveryPagination(nextResult)[activeGallery]
      }));
    } catch (loadError) {
      if (requestSequence !== searchRequestSequenceRef.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : isEnglish
            ? 'Unable to load more inspiration.'
            : '加载更多灵感失败，请稍后重试。'
      );
    } finally {
      if (requestSequence === searchRequestSequenceRef.current) {
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    // Invalidate a slower response as soon as the user changes the condition,
    // rather than waiting for the debounce timer to start the next request.
    searchRequestSequenceRef.current += 1;
    const delay = effectiveSearchQuery ? 280 : 0;
    const timer = window.setTimeout(() => {
      void runSearch(effectiveSearchQuery);
    }, delay);

    return () => window.clearTimeout(timer);
    // Request sequencing inside runSearch discards stale live-search responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSearchQuery, isEnglish]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setUserMoodboards([]);
      setSelectedMoodboardId('');
      return;
    }

    let cancelled = false;
    void listMoodboards()
      .then((boards) => {
        if (cancelled) return;
        const ownedBoards = boards.filter(
          (board) => board.isOwner && !board.isOfficial
        );
        setUserMoodboards(ownedBoards);
        let storedId = '';
        try {
          storedId =
            window.localStorage.getItem(
              `${DISCOVERY_DEFAULT_MOODBOARD_KEY}:${user.id}`
            ) || '';
        } catch {
          storedId = '';
        }
        setSelectedMoodboardId(
          ownedBoards.some((board) => board.id === storedId)
            ? storedId
            : ownedBoards[0]?.id || ''
        );
      })
      .catch(() => {
        if (!cancelled) {
          setUserMoodboards([]);
          setSelectedMoodboardId('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!previewImage || previewImage.kind !== 'prompt_case') {
      setResolvedPreviewImage(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setError('');
    void getPublicPromptCase(previewImage.id, {
      locale: isEnglish ? 'en-US' : 'zh-CN',
      includePrompt: true,
      force: true
    })
      .then((caseItem) => {
        if (cancelled || !caseItem) return;
        setResolvedPreviewImage({
          ...previewImage,
          title: caseItem.title || previewImage.title,
          prompt: caseItem.prompt || '',
          promptPreview:
            caseItem.promptPreview || previewImage.promptPreview || '',
          promptLocked: caseItem.promptLocked !== false,
          memberOnly: Boolean(caseItem.memberOnly),
          imageUrl: caseItem.imageUrl || previewImage.imageUrl,
          model: caseItem.model || previewImage.model
        });
      })
      .catch((previewError) => {
        if (cancelled) return;
        setError(
          previewError instanceof Error
            ? previewError.message
            : isEnglish
              ? 'Unable to load this prompt.'
              : '提示词详情加载失败'
        );
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isEnglish, previewImage]);

  useEffect(() => {
    if (!previewId) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeGallery, previewId]);

  useEffect(() => {
    if (!displayedPreviewImage) {
      setRelatedImages([]);
      setRelatedLoading(false);
      return;
    }

    let cancelled = false;
    const currentImage = displayedPreviewImage;
    const relatedQuery = (
      (currentImage.promptLocked
        ? currentImage.promptPreview
        : currentImage.prompt) || currentImage.title
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);

    setRelatedImages([]);
    setRelatedLoading(true);
    void searchVisualDiscovery(relatedQuery, isEnglish ? 'en-US' : 'zh-CN', {
      kind: 'images',
      limit: 24
    })
      .then((nextResult) => {
        if (cancelled) return;
        setRelatedImages(
          shuffleDiscoveryImages(
            nextResult.images.filter((item) => item.id !== currentImage.id)
          )
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRelatedImages(
          shuffleDiscoveryImages(
            displayResult.images.filter((item) => item.id !== currentImage.id)
          )
        );
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [displayResult.images, displayedPreviewImage, isEnglish]);

  useEffect(() => {
    return () => {
      imageAnalysisAbortRef.current?.abort();
      if (uploadedImageUrlRef.current) {
        URL.revokeObjectURL(uploadedImageUrlRef.current);
      }
    };
  }, []);

  const cancelImageSearch = () => {
    imageAnalysisAbortRef.current?.abort();
    imageAnalysisAbortRef.current = null;
    setImageAnalysisStatus('idle');
    if (uploadedImageUrlRef.current) {
      URL.revokeObjectURL(uploadedImageUrlRef.current);
      uploadedImageUrlRef.current = '';
    }
    setUploadedImage(null);
    setVisualSearchQuery('');
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const handleImageSearch = async (file?: File) => {
    if (!file || !visualSearchEnabled) return;
    imageAnalysisAbortRef.current?.abort();
    if (uploadedImageUrlRef.current) {
      URL.revokeObjectURL(uploadedImageUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    uploadedImageUrlRef.current = previewUrl;
    const preview = {
      name: file.name,
      url: previewUrl
    };
    const controller = new AbortController();
    imageAnalysisAbortRef.current = controller;
    setUploadedImage(preview);
    setVisualSearchQuery('');
    setImageAnalysisStatus('analyzing');
    setLoading(true);
    setError('');
    try {
      const descriptor = await describeDiscoveryImage(
        {
          imageBase64: await fileToDataUrl(file),
          mimeType: file.type || 'image/png',
          locale: isEnglish ? 'en-US' : 'zh-CN'
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setImageAnalysisStatus('ready');
      setVisualSearchQuery(descriptor.searchQuery);
    } catch (describeError) {
      if (controller.signal.aborted) return;
      setLoading(false);
      setImageAnalysisStatus('error');
      setError(
        describeError instanceof Error
          ? describeError.message
          : '图片识别暂时不可用'
      );
    } finally {
      if (imageAnalysisAbortRef.current === controller) {
        imageAnalysisAbortRef.current = null;
      }
    }
  };

  if (displayedPreviewImage) {
    return (
      <CreateWorkspaceShell className="create-discovery-page">
        <div className="create-v2-page-container is-discovery-preview">
          <DiscoveryImagePreview
            image={displayedPreviewImage}
            related={relatedImages}
            prefix={prefix}
            isEnglish={isEnglish}
            loadingPrompt={previewLoading}
            loadingRelated={relatedLoading}
          />
          {error ? (
            <FeedbackMessage tone="warning">{error}</FeedbackMessage>
          ) : null}
        </div>
      </CreateWorkspaceShell>
    );
  }

  if (previewMoodboard) {
    return (
      <CreateWorkspaceShell className="create-discovery-page">
        <div className="create-v2-page-container is-discovery-preview">
          <DiscoveryMoodboardPreview
            board={previewMoodboard}
            prefix={prefix}
            isEnglish={isEnglish}
            saving={savingMoodboardId === previewMoodboard.id}
            using={usingMoodboardId === previewMoodboard.id}
            saved={savedMoodboardIds.has(previewMoodboard.id)}
            onSave={(board) => void handleSaveMoodboard(board)}
            onUse={(board) => void handleUseMoodboard(board)}
          />
          {error ? (
            <FeedbackMessage tone="warning">{error}</FeedbackMessage>
          ) : null}
        </div>
      </CreateWorkspaceShell>
    );
  }

  return (
    <CreateWorkspaceShell className="create-discovery-page">
      <ReactivationBanner />
      <div className="create-v2-page-container">
        <WorkspaceHeroCarousel slides={slides} />

        <section
          className="create-v2-search"
          aria-label={
            isEnglish ? 'Discover visual inspiration' : '发现视觉灵感'
          }
        >
          <form onSubmit={(event) => event.preventDefault()} role="search">
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery('')}
              clearLabel={isEnglish ? 'Clear search' : '清除搜索词'}
              placeholder={
                isEnglish
                  ? isCompactSearch
                    ? 'Search inspiration'
                    : 'Search visual styles, scenes, and use cases'
                  : isCompactSearch
                    ? '搜索视觉灵感'
                    : '搜索视觉风格、场景和商业用途'
              }
              aria-label={
                isEnglish ? 'Search creation inspiration' : '搜索创作灵感'
              }
            />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              leadingIcon={<Upload />}
              aria-label={isEnglish ? 'Search with an image' : '上传图片搜索'}
              disabled={!visualSearchEnabled || imageAnalyzing}
              title={
                !visualSearchEnabled
                  ? isEnglish
                    ? 'Visual search is not enabled for this rollout'
                    : '当前灰度暂未开放图片搜索'
                  : undefined
              }
              onClick={() => uploadRef.current?.click()}
            >
              {isEnglish ? 'Search by image' : '上传图片搜索'}
            </Button>
          </form>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleImageSearch(file);
            }}
          />
          {uploadedImage ? (
            <div
              className="create-v2-image-query"
              aria-live="polite"
              aria-busy={imageAnalyzing}
            >
              <img src={uploadedImage.url} alt="" />
              <div className="create-v2-image-query-copy">
                <strong>{uploadedImage.name}</strong>
                <small>
                  {imageAnalysisStatus === 'analyzing'
                    ? isEnglish
                      ? 'Preparing visual search…'
                      : '正在准备图片搜索…'
                    : imageAnalysisStatus === 'error'
                      ? isEnglish
                        ? 'Visual search unavailable'
                        : '图片搜索暂时不可用'
                      : isEnglish
                        ? 'Image search enabled'
                        : '已启用图片搜索'}
                </small>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={imageAnalyzing}
                onClick={() => uploadRef.current?.click()}
              >
                {isEnglish ? 'Replace' : '更换'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leadingIcon={
                  imageAnalyzing ? (
                    <LoaderCircle className="creator-spin-icon" />
                  ) : (
                    <X />
                  )
                }
                aria-label={isEnglish ? 'Cancel image search' : '取消图片搜索'}
                onClick={() => cancelImageSearch()}
              >
                {isEnglish ? 'Cancel' : '取消'}
              </Button>
            </div>
          ) : null}
          {error ? (
            <FeedbackMessage tone="warning">{error}</FeedbackMessage>
          ) : null}
        </section>

        <section className="create-v2-results" aria-busy={loading}>
          <div className="discovery-gallery-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeGallery === 'images'}
              onClick={() => setGallery('images')}
            >
              <ImagePlus aria-hidden="true" />
              {isEnglish ? 'Images' : '图像'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeGallery === 'moodboards'}
              onClick={() => setGallery('moodboards')}
            >
              <BookImage aria-hidden="true" />
              {isEnglish ? 'Moodboards' : '情绪板'}
            </button>
          </div>
          {loading ? (
            <DiscoveryGallerySkeleton
              kind={activeGallery}
              isEnglish={isEnglish}
            />
          ) : activeGallery === 'images' ? (
            <>
              <DiscoveryImageMasonry
                images={displayResult.images}
                prefix={prefix}
                isEnglish={isEnglish}
                moodboards={userMoodboards}
                selectedMoodboardId={selectedMoodboardId}
                savingImageId={savingImageId}
                isSavedToSelectedMoodboard={isImageSavedToSelectedMoodboard}
                onSelectMoodboard={selectDefaultMoodboard}
                onSaveToMoodboard={(image) => void saveImageToMoodboard(image)}
              />
              <DiscoveryLoadMore
                hasMore={pagination.images.hasMore}
                loading={loadingMore}
                isEnglish={isEnglish}
                onLoadMore={() => void loadMore()}
              />
            </>
          ) : (
            <>
              <DiscoveryMoodboardGrid
                boards={displayResult.moodboards}
                prefix={prefix}
                isEnglish={isEnglish}
                savingId={savingMoodboardId}
                usingId={usingMoodboardId}
                savedIds={savedMoodboardIds}
                onSave={(board) => void handleSaveMoodboard(board)}
                onUse={(board) => void handleUseMoodboard(board)}
              />
              <DiscoveryLoadMore
                hasMore={pagination.moodboards.hasMore}
                loading={loadingMore}
                isEnglish={isEnglish}
                onLoadMore={() => void loadMore()}
              />
            </>
          )}
        </section>
      </div>
    </CreateWorkspaceShell>
  );
}

export default CreateDiscoveryPage;
