import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  ExternalLink,
  GalleryHorizontalEnd,
  Image,
  ImagePlus,
  Maximize2,
  Shuffle,
  Sparkles,
  Wand2,
  X
} from 'lucide-react';
import {
  Button,
  ButtonLink,
  Dialog,
  imageFetchPriority,
  SelectRoot,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Textarea,
  useOverlayBehavior
} from '@/shared/ui';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { useAuthModal } from '../components/AuthModal';
import { BeamCta } from '../components/BeamCta';
import promoBannerImage from '../assets/pricing/promo-banner-wide.webp';
import {
  DeepFeaturePaywallModal,
  type DeepFeaturePaywallKind
} from '../components/image-create/DeepFeaturePaywallModal';
import { useMembershipStatus } from '../components/image-create/useMembershipStatus';
import type { PromptCase } from '@/services/agent-api';
import { estimateImageGenerationCreditCost } from '@/shared/image-generation-pricing';
import { useRuntimeImageModels } from '../hooks/useRuntimeImageModels';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/analytics';
import { applySeo } from '../lib/seo';
import { isCreateWorkspaceFeatureEnabled } from '../lib/create-workspace-flags';
import { useActivationStatus } from '../lib/use-activation-status';
import { CREATE_WORKSPACE_FEATURE_FLAGS } from '@/shared/create-workspace-v2';
import { uploadImageReference } from '@/services/agent-api';
import type { ImageReferenceAsset } from '@/shared/image-reference-types';
import { MAX_IMAGE_REFERENCE_IDS } from '@/shared/image-reference-types';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';
import {
  getPromptCaseCreateSettings,
  getOptimizedPromptCaseImageUrl
} from '@/utils/prompt-case';
import { PhotoSwipeViewer } from '../components/image-create/PhotoSwipeViewer';
import { AssetThumb } from '../components/image-create/AssetThumb';
import { usePromptLibraryCases } from './prompt-library/usePromptLibraryCases';
import {
  PromptLibrarySortTabs,
  type PromptLibrarySortNavItem
} from './prompt-library/PromptLibraryNavigation';
import {
  PromptLibraryMasonry,
  type PromptCaseLoadState,
  type PromptLibraryMasonryItem
} from './prompt-library/PromptLibraryMasonry';
import { ContinueLastCreationCard } from '../components/create-home/ContinueLastCreationCard';
import {
  HomeReferenceStrip,
  type PendingHomeReferenceUpload
} from '../components/create-home/HomeReferenceStrip';
import { getPromptCaseCardAspectRatio } from './prompt-library/promptLibraryDisplay';
import {
  RANDOM_IMAGE_PROMPTS_EN,
  RANDOM_IMAGE_PROMPTS_ZH
} from '../data/image-random-prompts';
import {
  cssAspectRatioToHeightWeight,
  getResponsiveMasonryColumnCount,
  splitMasonryColumns
} from '../lib/masonry';
import { usePromptCaseFavorites } from '../lib/prompt-case-favorites';
import {
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../data/image-prompt-core';
import { useImagePromptAssetCatalog } from '../hooks/useImagePromptAssetCatalog';
import {
  resolveVisualRecipeAssets,
  type ResolvedVisualRecipeAsset
} from '../components/image-create/assetLibraryResolver';
import { normalizeVisualRecipeSelection } from '../data/visual-recipe-selection';
import { findPromptCasesSharingRecipeAssets } from '../components/image-create/promptCaseRecipeExposure';

const PROMPT_CASE_HOME_LIBRARY_PAGE_SIZE = 24;
type HomePromptCaseSort = 'featured' | 'latest' | 'hot';
const HOME_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9'
] as const;
const HOME_RESOLUTIONS = ['1K', '2K', '4K'] as const;
const visuallyHiddenHeadingStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
};

const HOME_MODEL_GROUP_LABELS = {
  zh: {
    recommended: '推荐',
    realistic: '写实',
    anime: '动漫',
    commercial: '商业',
    experimental: '实验'
  },
  en: {
    recommended: 'Recommended',
    realistic: 'Realistic',
    anime: 'Anime',
    commercial: 'Commercial',
    experimental: 'Experimental'
  }
} as const;
const HOME_MODEL_GROUP_ORDER = [
  'recommended',
  'realistic',
  'anime',
  'commercial',
  'experimental'
] as const;
const HOME_IMAGE_SIZE_MAP: Record<
  (typeof HOME_ASPECT_RATIOS)[number],
  Record<(typeof HOME_RESOLUTIONS)[number], string>
> = {
  '1:1': {
    '1K': '1024x1024',
    '2K': '2048x2048',
    '4K': '2880x2880'
  },
  '2:3': {
    '1K': '1024x1536',
    '2K': '1344x2016',
    '4K': '2304x3456'
  },
  '3:2': {
    '1K': '1536x1024',
    '2K': '2016x1344',
    '4K': '3456x2304'
  },
  '3:4': {
    '1K': '1152x1536',
    '2K': '1536x2048',
    '4K': '2304x3072'
  },
  '4:3': {
    '1K': '1536x1152',
    '2K': '2048x1536',
    '4K': '3072x2304'
  },
  '9:16': {
    '1K': '864x1536',
    '2K': '1152x2048',
    '4K': '2160x3840'
  },
  '16:9': {
    '1K': '1536x864',
    '2K': '2048x1152',
    '4K': '3840x2160'
  },
  '21:9': {
    '1K': '1792x768',
    '2K': '2688x1152',
    '4K': '3808x1632'
  }
};

function findHomeImageSizeSelection(imageSize: string) {
  for (const aspectRatio of HOME_ASPECT_RATIOS) {
    for (const resolution of HOME_RESOLUTIONS) {
      if (HOME_IMAGE_SIZE_MAP[aspectRatio][resolution] === imageSize) {
        return { aspectRatio, resolution };
      }
    }
  }
  return null;
}
type CreateHomeBannerCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

type CreateHomeBannerBase = {
  id: string;
  zh: CreateHomeBannerCopy;
  en: CreateHomeBannerCopy;
  media: string;
  mediaType: 'image' | 'video';
  objectPosition: string;
};

type CreateHomeBannerConfig =
  | (CreateHomeBannerBase & {
      kind: 'promo';
      href?: never;
    })
  | (CreateHomeBannerBase & {
      kind: 'link';
      href: string;
    });

const CREATE_HOME_BANNERS: readonly CreateHomeBannerConfig[] = [
  {
    id: 'summer-promo',
    kind: 'promo',
    zh: {
      eyebrow: '限时活动',
      title: '创始用户积分包与年度升级优惠',
      description: '点击查看当前活动权益，适合提前囤积分和解锁高频创作额度。'
    },
    en: {
      eyebrow: 'Limited offer',
      title: 'Founder credits and annual plan offer',
      description:
        'Open the current campaign details for credits, annual plans and higher creation volume.'
    },
    media: promoBannerImage,
    mediaType: 'image',
    objectPosition: 'center center'
  },
  {
    id: 'image-generation',
    kind: 'link',
    zh: {
      eyebrow: '图像生成',
      title: '从一句目标进入 Prompt 编译器和 GPT Image 2',
      description: '适合封面、电商主图、海报和角色资产，生成后直接沉淀到图库。'
    },
    en: {
      eyebrow: 'Image generation',
      title: 'Start from one goal and refine it with GPT Image 2',
      description:
        'Create covers, product visuals, posters and character assets, then save them to your gallery.'
    },
    href: '/image',
    media: '/create-apps/xiaohongshu-cover.webp',
    mediaType: 'image',
    objectPosition: 'center center'
  },
  {
    id: 'workspace',
    kind: 'link',
    zh: {
      eyebrow: '工作台',
      title: '把灵感、网页素材和生成记录整理成 Boards',
      description: '适合做选题收集、案例归档、提示词复用和长期创作资产管理。'
    },
    en: {
      eyebrow: 'Workspace',
      title: 'Organize inspiration, pages and generations into Boards',
      description:
        'Collect ideas, archive cases, reuse prompts and keep long-lived creation assets structured.'
    },
    href: '/boards',
    media: '/create-apps/prompt-case-library.webp',
    mediaType: 'image',
    objectPosition: 'center center'
  },
  {
    id: 'video-generation',
    kind: 'link',
    zh: {
      eyebrow: '视频生成',
      title: '文字到视频链路调试中，先进入视频创作页',
      description: '视频入口会保留在主路径上，当前点击生成会提示敬请期待。'
    },
    en: {
      eyebrow: 'Video generation',
      title: 'Text-to-video is being tuned, entry remains available',
      description:
        'The video route stays visible while generation is temporarily gated with a coming-soon state.'
    },
    href: '/video',
    media: '/create-apps/model-walk.webp',
    mediaType: 'image',
    objectPosition: 'center center'
  }
] as const;

const CREATE_HOME_COPY = {
  zh: {
    seoTitle: 'WebToMind 创作灵感台 | Prompt、图库与商业案例',
    seoDescription:
      '从灵感、Prompt 案例、图库参考、角色一致性和商业应用进入 WebToMind 图像创作流程。',
    bannerLabel: '创作活动',
    promoModalTitle: 'WebToMind 创作权益活动',
    promoModalSubtitle:
      '用更低成本测试高频图像生成、图库复用和工作台整理流程。',
    promoModalPrimary: '查看升级方案',
    promoModalSecondary: '稍后再说',
    promoModalBullets: [
      '适合提前囤积生成积分',
      '年度套餐可解锁更高创作频率',
      '生成资产可沉淀到图库和 Boards'
    ],
    composerTitle: '今天想创作点什么？',
    composerSubtitle: '图片、视频、音乐、角色、短剧，一站式轻松生成。',
    referenceUploadTitle: '上传参考图',
    referenceUploadSubtitle: '@ 引用角色、姿态或风格',
    referenceUploading: '上传中...',
    referenceAddMore: '继续添加',
    referenceUploaded: (count: number) => `已上传 ${count} 张参考图`,
    referenceStripLabel: '已选择的参考图',
    referenceLabel: (index: number) => `图片 ${index + 1}`,
    referenceRemoveLabel: (index: number) => `移除图片 ${index + 1}`,
    referenceMaxHint: (count: number) => `最多带入 ${count} 张`,
    referenceUploadFailed: '参考图上传失败',
    promptPlaceholder:
      '例如：为 AI 工具教程生成一张高点击率小红书封面，标题要醒目，画面干净。',
    aspectLabel: '选择画面比例',
    resolutionLabel: '选择生成尺寸',
    creditsLabelSuffix: '积分',
    creditsTrailingLabel: '充值',
    randomize: '随机灵感',
    startWithCost: (cost: number) => `进入创作 · ${cost}积分`,
    quickLabel: '快速入口',
    imageCreate: '图像创作',
    imageCreateDesc: '提示词编译器与 GPT Image 2 生成链路',
    gallery: '图库参考',
    galleryDesc: '复用最近生成图作为新图参考',
    promptLibrary: 'Prompt 案例',
    promptLibraryDesc: '从商业案例直接复刻结构',
    promptCasesTitle: '可复现案例推荐',
    viewAllCases: '查看全部案例',
    loadFailed: '案例加载失败，请稍后重试。',
    caseCount: (count: number, hasMore: boolean) =>
      `已显示 ${count}${hasMore ? '+' : ''} 个案例`,
    loadingMore: '正在加载更多案例...',
    scrollForMore: '继续向下滚动加载',
    allLoaded: '已加载全部案例'
  },
  en: {
    seoTitle: 'WebToMind Creation Studio | Prompts, References and Cases',
    seoDescription:
      'Start from AI image prompts, reference images, reusable prompt cases and commercial visual workflows in WebToMind.',
    bannerLabel: 'Creation highlights',
    promoModalTitle: 'WebToMind creation offer',
    promoModalSubtitle:
      'Test high-volume image generation, gallery reuse and workspace organization at a lower cost.',
    promoModalPrimary: 'View plans',
    promoModalSecondary: 'Not now',
    promoModalBullets: [
      'Useful for stocking generation credits',
      'Annual plans unlock higher creation volume',
      'Generated assets can flow into Gallery and Boards'
    ],
    composerTitle: 'What do you want to create today?',
    composerSubtitle:
      'Images, videos, music, characters and shorts in one creation flow.',
    referenceUploadTitle: 'Upload reference',
    referenceUploadSubtitle: 'Mention characters, poses or styles with @',
    referenceUploading: 'Uploading...',
    referenceAddMore: 'Add more',
    referenceUploaded: (count: number) =>
      `${count} reference${count > 1 ? 's' : ''} uploaded`,
    referenceStripLabel: 'Selected reference images',
    referenceLabel: (index: number) => `Image ${index + 1}`,
    referenceRemoveLabel: (index: number) => `Remove image ${index + 1}`,
    referenceMaxHint: (count: number) => `Up to ${count} references`,
    referenceUploadFailed: 'Reference upload failed',
    promptPlaceholder:
      'Example: create a high-click social cover for an AI tool tutorial, with a clear headline and clean composition.',
    aspectLabel: 'Choose aspect ratio',
    resolutionLabel: 'Choose generation size',
    creditsLabelSuffix: 'credits',
    creditsTrailingLabel: 'Top up',
    randomize: 'Random idea',
    startWithCost: (cost: number) => `Start creating · ${cost} credits`,
    quickLabel: 'Quick actions',
    imageCreate: 'Image creation',
    imageCreateDesc: 'Prompt compiler and GPT Image 2 generation flow',
    gallery: 'Reference gallery',
    galleryDesc: 'Reuse recent outputs as new image references',
    promptLibrary: 'AI Image Prompts',
    promptLibraryDesc: 'Browse reusable image prompt examples',
    promptCasesTitle: 'Reproducible prompt cases',
    viewAllCases: 'AI Image Prompts',
    loadFailed: 'Prompt cases failed to load. Please try again later.',
    caseCount: (count: number, hasMore: boolean) =>
      `Showing ${count}${hasMore ? '+' : ''} cases`,
    loadingMore: 'Loading more cases...',
    scrollForMore: 'Scroll down to load more',
    allLoaded: 'All cases loaded'
  }
} as const;

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function caseImage(caseItem: PromptCase): string {
  return caseItem.imageUrls?.[0] || caseItem.imageUrl || '';
}

function caseImages(caseItem: PromptCase | null): string[] {
  if (!caseItem) return [];
  return Array.from(
    new Set(
      [...(caseItem.imageUrls || []), caseItem.imageUrl || '']
        .map((url) => url.trim())
        .filter(Boolean)
    )
  );
}

function getPromptCaseVisualRecipeSelection(
  caseItem?: PromptCase | null
): ImagePromptSelection | null {
  return normalizeVisualRecipeSelection(
    (caseItem as (PromptCase & { visualRecipe?: unknown }) | undefined)
      ?.visualRecipe
  );
}

function getPromptCaseAssetThumbUrl(caseItem: PromptCase): string {
  return caseImages(caseItem)[0] || caseImage(caseItem);
}

export function CreateHomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const journeyEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1
  );
  const activation = useActivationStatus(user?.id || null);
  const hideFutureCreationEntries =
    journeyEnabled &&
    !activation.loading &&
    !activation.unavailable &&
    !activation.activated;
  const { openAuthModal } = useAuthModal();
  const membership = useMembershipStatus();
  const {
    models: modelOptions,
    selectableModels: selectableModelOptions,
    loaded: runtimeModelsLoaded
  } = useRuntimeImageModels();
  const localePrefix = getLocalePrefix(location.pathname);
  const isEnglishCreate = localePrefix === '/en-US';
  const createCopy = isEnglishCreate
    ? CREATE_HOME_COPY.en
    : CREATE_HOME_COPY.zh;
  const randomHomePrompts = isEnglishCreate
    ? RANDOM_IMAGE_PROMPTS_EN
    : RANDOM_IMAGE_PROMPTS_ZH;
  const bannerItems = useMemo(
    () =>
      CREATE_HOME_BANNERS.filter(
        (banner) =>
          !hideFutureCreationEntries ||
          (banner.id !== 'video-generation' && banner.id !== 'workspace')
      ).map((banner) => ({
        ...banner,
        ...(isEnglishCreate ? banner.en : banner.zh)
      })),
    [hideFutureCreationEntries, isEnglishCreate]
  );
  const promptLibraryHref = isEnglishCreate
    ? '/en-US/prompts'
    : `${localePrefix}/prompts`;
  const [prompt, setPrompt] = useState('');
  const [homeAspectRatio, setHomeAspectRatio] =
    useState<(typeof HOME_ASPECT_RATIOS)[number]>('16:9');
  const [homeResolution, setHomeResolution] =
    useState<(typeof HOME_RESOLUTIONS)[number]>('2K');
  const [homeModel, setHomeModel] = useState('gpt-image-2');
  const [caseSort, setCaseSort] = useState<HomePromptCaseSort>('featured');
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [selectedCasePreview, setSelectedCasePreview] =
    useState<PromptCase | null>(null);
  const imagePromptAssets = useImagePromptAssetCatalog(
    Boolean(selectedCasePreview)
  );
  const [caseActiveImageIndex, setCaseActiveImageIndex] = useState(0);
  const [caseLightboxOpen, setCaseLightboxOpen] = useState(false);
  const [casePromptCopied, setCasePromptCopied] = useState(false);
  const [activeRecipeAssetId, setActiveRecipeAssetId] = useState<string | null>(
    null
  );
  const [homeReferences, setHomeReferences] = useState<ImageReferenceAsset[]>(
    []
  );
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [pendingReferenceUploads, setPendingReferenceUploads] = useState<
    PendingHomeReferenceUpload[]
  >([]);
  const [referenceUploadError, setReferenceUploadError] = useState('');
  const referenceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const caseStripRef = useRef<HTMLDivElement | null>(null);
  const caseLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const casesLoadingRef = useRef(false);
  const casesHasMoreRef = useRef(false);
  const [caseColumnCount, setCaseColumnCount] = useState(1);
  const [caseAspectRatios, setCaseAspectRatios] = useState<
    Record<string, string>
  >({});
  const [deepPaywall, setDeepPaywall] = useState<{
    kind: DeepFeaturePaywallKind;
    source: string;
    continueHref: string;
  } | null>(null);
  const selectedHomeModel =
    modelOptions.find((model) => model.value === homeModel) || modelOptions[0];
  const homeGenerationDisabled =
    !runtimeModelsLoaded || selectableModelOptions.length === 0;
  const homeGenerationDisabledReason = !runtimeModelsLoaded
    ? isEnglishCreate
      ? 'Checking model availability…'
      : '正在检查模型可用性…'
    : selectableModelOptions.length === 0
      ? isEnglishCreate
        ? 'No image model is currently available'
        : '当前没有可用的图片模型'
      : undefined;
  const recommendedHomeSelections = useMemo(
    () =>
      (selectedHomeModel?.recommendedImageSizes || [])
        .map(findHomeImageSizeSelection)
        .filter(
          (
            selection
          ): selection is NonNullable<
            ReturnType<typeof findHomeImageSizeSelection>
          > => Boolean(selection)
        ),
    [selectedHomeModel]
  );
  const availableHomeAspectRatios = HOME_ASPECT_RATIOS.filter((ratio) =>
    recommendedHomeSelections.some(
      (selection) => selection.aspectRatio === ratio
    )
  );
  const availableHomeResolutions = HOME_RESOLUTIONS.filter((resolution) =>
    recommendedHomeSelections.some(
      (selection) =>
        selection.aspectRatio === homeAspectRatio &&
        selection.resolution === resolution
    )
  );
  const selectedImageSize =
    HOME_IMAGE_SIZE_MAP[homeAspectRatio][homeResolution];
  useEffect(() => {
    if (!runtimeModelsLoaded) return;
    if (selectedHomeModel?.status !== 'unavailable') return;
    const fallbackModel = selectableModelOptions[0];
    if (fallbackModel) setHomeModel(fallbackModel.value);
  }, [runtimeModelsLoaded, selectableModelOptions, selectedHomeModel?.status]);
  useEffect(() => {
    if (
      recommendedHomeSelections.length === 0 ||
      selectedHomeModel?.recommendedImageSizes.includes(selectedImageSize)
    ) {
      return;
    }
    const fallback = recommendedHomeSelections[0];
    setHomeAspectRatio(fallback.aspectRatio);
    setHomeResolution(fallback.resolution);
  }, [
    recommendedHomeSelections,
    selectedHomeModel?.recommendedImageSizes,
    selectedImageSize
  ]);
  const homeModelGroupLabels = isEnglishCreate
    ? HOME_MODEL_GROUP_LABELS.en
    : HOME_MODEL_GROUP_LABELS.zh;
  const creditEstimate = useMemo(
    () =>
      estimateImageGenerationCreditCost({
        imageSize: selectedImageSize,
        model: selectedHomeModel?.value || homeModel
      }),
    [homeModel, selectedHomeModel?.value, selectedImageSize]
  );
  const homePromptLibraryLocale = isEnglishCreate ? 'en-US' : 'zh-CN';
  const homePromptLibraryQuery = useMemo(
    () => ({
      locale: homePromptLibraryLocale,
      sort: caseSort,
      limit: PROMPT_CASE_HOME_LIBRARY_PAGE_SIZE
    }),
    [caseSort, homePromptLibraryLocale]
  );
  const promptLibraryCasesState = usePromptLibraryCases(
    homePromptLibraryQuery,
    { requireImage: true }
  );
  const { isFavorited, toggleFavorite } = usePromptCaseFavorites();
  const loadMorePromptCases = promptLibraryCasesState.loadMore;
  const cases = useMemo(
    () => promptLibraryCasesState.data?.items || [],
    [promptLibraryCasesState.data?.items]
  );
  const casesLoading =
    promptLibraryCasesState.loadState === 'loading' ||
    promptLibraryCasesState.isLoadingMore;
  const casesHasMore = promptLibraryCasesState.hasMore;
  const casesError =
    promptLibraryCasesState.loadState === 'error' ? createCopy.loadFailed : '';

  useEffect(() => {
    return applySeo({
      title: createCopy.seoTitle,
      description: createCopy.seoDescription,
      robots: 'noindex,nofollow',
      htmlLang: localePrefix === '/en-US' ? 'en' : 'zh-CN'
    });
  }, [createCopy, localePrefix]);

  useEffect(() => {
    casesLoadingRef.current = casesLoading;
  }, [casesLoading]);

  useEffect(() => {
    casesHasMoreRef.current = casesHasMore;
  }, [casesHasMore]);

  useEffect(() => {
    const node = caseStripRef.current;
    if (!node) return undefined;

    const updateColumnCount = () => {
      const width = node.getBoundingClientRect().width;
      setCaseColumnCount((current) => {
        const next = getResponsiveMasonryColumnCount(width, {
          minColumnWidth: width <= 520 ? 144 : width <= 840 ? 176 : 190,
          gap: width <= 520 ? 8 : width <= 840 ? 10 : 12,
          minColumns: width <= 360 ? 1 : 2,
          maxColumns: 6
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
  }, []);

  const requestNextCasePage = useCallback(() => {
    if (casesLoadingRef.current || !casesHasMoreRef.current) return;
    casesLoadingRef.current = true;
    loadMorePromptCases();
  }, [loadMorePromptCases]);

  useEffect(() => {
    const sentinel = caseLoadSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestNextCasePage();
        }
      },
      {
        root: null,
        rootMargin: '360px 0px',
        threshold: 0
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [requestNextCasePage]);

  const caseMasonryItems = useMemo<PromptLibraryMasonryItem[]>(
    () => cases.map((caseItem, index) => ({ caseItem, index })),
    [cases]
  );
  const caseTileColumns = useMemo(
    () =>
      splitMasonryColumns(
        caseMasonryItems,
        caseColumnCount,
        ({ caseItem, index }) =>
          cssAspectRatioToHeightWeight(
            caseAspectRatios[caseItem.id] ||
              getPromptCaseCardAspectRatio(caseItem, index)
          )
      ),
    [caseAspectRatios, caseColumnCount, caseMasonryItems]
  );
  const promptCaseSortItems = useMemo<PromptLibrarySortNavItem[]>(
    () =>
      (
        [
          {
            key: 'featured',
            label: isEnglishCreate ? 'Featured' : '精选'
          },
          {
            key: 'latest',
            label: isEnglishCreate ? 'Latest' : '最新'
          },
          {
            key: 'hot',
            label: isEnglishCreate ? 'Hot' : '最热'
          }
        ] as Array<{ key: HomePromptCaseSort; label: string }>
      ).map((item) => ({
        ...item,
        href: `${location.pathname}#prompt-cases`,
        active: item.key === caseSort
      })),
    [caseSort, isEnglishCreate, location.pathname]
  );
  const handlePromptCaseSortClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, item: PromptLibrarySortNavItem) => {
      event.preventDefault();
      const nextSort =
        item.key === 'latest' || item.key === 'hot' ? item.key : 'featured';
      setCaseSort(nextSort);
    },
    []
  );
  const caseLoadState: PromptCaseLoadState =
    promptLibraryCasesState.loadState === 'error'
      ? 'error'
      : promptLibraryCasesState.loadState === 'loading'
        ? 'loading'
        : 'ready';

  useEffect(() => {
    if (location.hash !== '#prompt-cases' || caseLoadState === 'loading')
      return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById('prompt-cases')
        ?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [caseLoadState, location.hash]);
  const handleCaseAspectRatioChange = useCallback(
    (caseId: string, aspectRatio: string) => {
      setCaseAspectRatios((current) =>
        current[caseId] === aspectRatio
          ? current
          : {
              ...current,
              [caseId]: aspectRatio
            }
      );
    },
    []
  );
  const openPromptCaseFromMasonry = useCallback(
    (event: MouseEvent<HTMLElement>, caseItem: PromptCase) => {
      event.preventDefault();
      setSelectedCasePreview(caseItem);
      setCaseActiveImageIndex(0);
    },
    []
  );
  const selectedCaseImages = useMemo(
    () => caseImages(selectedCasePreview),
    [selectedCasePreview]
  );
  const selectedCaseImage =
    selectedCaseImages[
      Math.min(caseActiveImageIndex, Math.max(0, selectedCaseImages.length - 1))
    ] || '';
  const selectedCaseDetailHref = selectedCasePreview?.slug
    ? `${localePrefix}/prompts/${selectedCasePreview.slug}`
    : selectedCasePreview
      ? `${localePrefix}/create/prompts/share/${selectedCasePreview.id}`
      : '';
  const selectedCaseVisualRecipeSelection = useMemo(
    () => getPromptCaseVisualRecipeSelection(selectedCasePreview),
    [selectedCasePreview]
  );
  const selectedCaseRecipeAssets = useMemo<ResolvedVisualRecipeAsset[]>(
    () =>
      selectedCaseVisualRecipeSelection
        ? resolveVisualRecipeAssets(
            selectedCaseVisualRecipeSelection,
            imagePromptAssets
          )
        : [],
    [imagePromptAssets, selectedCaseVisualRecipeSelection]
  );
  const activeRecipeAsset =
    selectedCaseRecipeAssets.find(
      ({ asset }) => asset.id === activeRecipeAssetId
    ) || selectedCaseRecipeAssets[0];
  const selectedRecipeRelatedCases = useMemo(
    () =>
      activeRecipeAsset
        ? findPromptCasesSharingRecipeAssets(
            cases,
            [activeRecipeAsset.asset.id],
            {
              currentCaseId: selectedCasePreview?.id,
              limit: 4
            }
          )
        : [],
    [activeRecipeAsset, cases, selectedCasePreview?.id]
  );
  const selectedRecipeRelatedCaseIds = useMemo(
    () =>
      new Set(
        selectedRecipeRelatedCases
          .map(({ caseItem }) => caseItem.id)
          .filter(Boolean)
      ),
    [selectedRecipeRelatedCases]
  );
  const selectedRecipeFallbackCases = useMemo(
    () =>
      cases
        .filter(
          (caseItem) =>
            caseItem.id !== selectedCasePreview?.id &&
            !selectedRecipeRelatedCaseIds.has(caseItem.id)
        )
        .slice(0, 4),
    [cases, selectedCasePreview?.id, selectedRecipeRelatedCaseIds]
  );
  const previewMoreCases = useMemo(
    () =>
      cases
        .filter((caseItem) => caseItem.id !== selectedCasePreview?.id)
        .slice(0, 6),
    [cases, selectedCasePreview?.id]
  );
  useEffect(() => {
    setCaseActiveImageIndex(0);
    setCaseLightboxOpen(false);
    setActiveRecipeAssetId(null);
  }, [selectedCasePreview?.id]);

  useEffect(() => {
    if (selectedCaseRecipeAssets.length === 0) {
      if (activeRecipeAssetId) setActiveRecipeAssetId(null);
      return;
    }
    if (
      !activeRecipeAssetId ||
      !selectedCaseRecipeAssets.some(
        ({ asset }) => asset.id === activeRecipeAssetId
      )
    ) {
      setActiveRecipeAssetId(selectedCaseRecipeAssets[0].asset.id);
    }
  }, [activeRecipeAssetId, selectedCaseRecipeAssets]);

  const closeCasePreview = useCallback(() => {
    setSelectedCasePreview(null);
    setCaseLightboxOpen(false);
  }, []);

  const casePreviewModalRef = useOverlayBehavior<HTMLElement>({
    open: Boolean(selectedCasePreview),
    closeDisabled: caseLightboxOpen,
    onClose: closeCasePreview
  });

  const buildCreateParams = (extra?: Record<string, string>) => {
    const referenceIds = homeReferences.map((reference) => reference.id);
    const params = new URLSearchParams({
      model: selectedHomeModel?.value || homeModel,
      ratio: homeAspectRatio,
      resolution: homeResolution,
      imageSize: selectedImageSize
    });
    Object.entries(extra || {}).forEach(([key, value]) => {
      params.set(key, value);
    });
    // Prompt 内容只通过同源 navigation state 传递，避免进入 URL、访问日志和分享链路。
    if (referenceIds.length > 0) {
      params.set('referenceImageIds', referenceIds.join(','));
    }
    return params;
  };

  const startCreate = () => {
    if (homeGenerationDisabled) return;
    const trimmed = prompt.trim();
    const params = buildCreateParams();
    const referenceImageIds = homeReferences.map((reference) => reference.id);
    trackEvent('create_home_primary_cta_click', {
      has_prompt: Boolean(trimmed),
      reference_count: referenceImageIds.length,
      aspect_ratio: homeAspectRatio,
      resolution: homeResolution,
      model: selectedHomeModel?.value || homeModel,
      model_label: selectedHomeModel?.label,
      image_size: selectedImageSize,
      estimated_credits: creditEstimate.cost,
      authenticated: isAuthenticated
    });
    navigate(`${localePrefix}/image?${params.toString()}`, {
      state: {
        ...(trimmed ? { promptCasePrompt: trimmed } : {}),
        model: selectedHomeModel?.value || homeModel,
        imageSize: selectedImageSize,
        aspectRatio: homeAspectRatio,
        resolution: homeResolution,
        ...(referenceImageIds.length > 0 ? { referenceImageIds } : {})
      }
    });
  };

  const openReferenceUploadEntry = () => {
    if (!isAuthenticated) {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source: 'create_home_reference_upload'
      });
      return;
    }
    referenceUploadInputRef.current?.click();
  };

  const handleReferenceUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    if (referenceUploadInputRef.current) {
      referenceUploadInputRef.current.value = '';
    }
    if (files.length === 0) return;
    if (!isAuthenticated) {
      openAuthModal({
        redirectTo: `${location.pathname}${location.search}`,
        source: 'create_home_reference_upload'
      });
      return;
    }
    const availableSlots = Math.max(
      0,
      MAX_IMAGE_REFERENCE_IDS - homeReferences.length
    );
    const imageFiles = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, availableSlots);
    if (imageFiles.length === 0) {
      setReferenceUploadError(
        availableSlots <= 0
          ? createCopy.referenceMaxHint(MAX_IMAGE_REFERENCE_IDS)
          : createCopy.referenceUploadFailed
      );
      return;
    }
    setReferenceUploading(true);
    setReferenceUploadError('');
    trackEvent('create_home_reference_upload_click', {
      file_count: imageFiles.length,
      current_reference_count: homeReferences.length,
      aspect_ratio: homeAspectRatio,
      resolution: homeResolution,
      model: selectedHomeModel?.value || homeModel,
      image_size: selectedImageSize,
      authenticated: isAuthenticated
    });
    try {
      const uploadPayloads = await Promise.all(
        imageFiles.map(async (file, index) => {
          const imageBase64 = await fileToDataUrl(file);
          return {
            id: `${file.name}-${file.lastModified}-${index}`,
            file,
            imageBase64
          };
        })
      );
      setPendingReferenceUploads(
        uploadPayloads.map(({ id, file, imageBase64 }) => ({
          id,
          fileName: file.name,
          previewUrl: imageBase64
        }))
      );
      for (const { id, file, imageBase64 } of uploadPayloads) {
        const reference = await uploadImageReference({
          imageBase64,
          mimeType: file.type || 'image/png',
          role: 'style',
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 80)
        });
        setHomeReferences((current) => {
          if (current.some((item) => item.id === reference.id)) return current;
          return [...current, reference].slice(0, MAX_IMAGE_REFERENCE_IDS);
        });
        setPendingReferenceUploads((current) =>
          current.filter((item) => item.id !== id)
        );
      }
    } catch (error) {
      setReferenceUploadError(
        error instanceof Error
          ? error.message
          : createCopy.referenceUploadFailed
      );
    } finally {
      setPendingReferenceUploads([]);
      setReferenceUploading(false);
    }
  };

  const removeHomeReference = (referenceId: string) => {
    setHomeReferences((current) =>
      current.filter((reference) => reference.id !== referenceId)
    );
  };

  const handleUsePreviewPrompt = (caseItem: PromptCase) => {
    navigate(`${localePrefix}/image`, {
      state: {
        promptCasePrompt: caseItem.prompt,
        sourceCaseId: caseItem.id,
        ...getPromptCaseCreateSettings(caseItem)
      }
    });
  };

  const handleUsePreviewRecipe = (
    caseItem: PromptCase,
    openAssetSlot?: ImagePromptSlot
  ) => {
    const visualRecipeSelection = getPromptCaseVisualRecipeSelection(caseItem);
    navigate(
      `${localePrefix}/image?source=prompt_case_recipe&caseId=${encodeURIComponent(
        caseItem.id
      )}`,
      {
        state: {
          promptCasePrompt: caseItem.prompt,
          sourceCaseId: caseItem.id,
          ...getPromptCaseCreateSettings(caseItem),
          ...(visualRecipeSelection ? { visualRecipeSelection } : {}),
          ...(openAssetSlot ? { openAssetSlot } : {}),
          remixSource: {
            id: caseItem.id,
            title: caseItem.title,
            slug: caseItem.slug,
            source: 'create_home_prompt_case_recipe'
          }
        }
      }
    );
  };

  const copyPreviewPrompt = async () => {
    if (!selectedCasePreview?.prompt) return;
    try {
      await navigator.clipboard.writeText(selectedCasePreview.prompt);
      setCasePromptCopied(true);
      window.setTimeout(() => setCasePromptCopied(false), 1400);
    } catch {
      setCasePromptCopied(false);
    }
  };

  const randomizePrompt = () => {
    const currentIndex = randomHomePrompts.findIndex(
      (item) => item === prompt.trim()
    );
    const nextIndex =
      currentIndex >= 0
        ? (currentIndex + 1) % randomHomePrompts.length
        : Math.floor(Math.random() * randomHomePrompts.length);
    setPrompt(randomHomePrompts[nextIndex]);
  };

  const maybeOpenDeepPaywall = (
    event: MouseEvent<HTMLElement>,
    kind: DeepFeaturePaywallKind,
    source: string,
    continueHref: string
  ) => {
    if (membership.loading || membership.isMember) return;
    event.preventDefault();
    setDeepPaywall({ kind, source, continueHref });
  };

  useEffect(() => {
    trackEvent('create_home_credit_estimate_view', {
      aspect_ratio: homeAspectRatio,
      resolution: homeResolution,
      model: selectedHomeModel?.value || homeModel,
      model_label: selectedHomeModel?.label,
      image_size: selectedImageSize,
      estimated_credits: creditEstimate.cost
    });
  }, [
    creditEstimate.cost,
    homeAspectRatio,
    homeResolution,
    selectedHomeModel?.label,
    selectedHomeModel?.value,
    selectedImageSize,
    homeModel
  ]);

  return (
    <CreateWorkspaceFrame className="create-home-route">
      <h1 style={visuallyHiddenHeadingStyle}>{createCopy.seoTitle}</h1>
      <DeepFeaturePaywallModal
        open={Boolean(deepPaywall)}
        kind={deepPaywall?.kind || 'workflow'}
        source={deepPaywall?.source}
        localePrefix={localePrefix}
        isAuthenticated={isAuthenticated}
        onClose={() => setDeepPaywall(null)}
        onContinue={() => {
          if (deepPaywall?.continueHref) {
            navigate(deepPaywall.continueHref);
          }
        }}
      />
      <Dialog
        open={promoModalOpen}
        title={createCopy.promoModalTitle}
        description={createCopy.promoModalSubtitle}
        closeLabel={createCopy.promoModalSecondary}
        className="create-home-promo-dialog"
        footer={
          <div className="create-home-promo-modal-actions">
            <Link
              to={`${localePrefix}/pricing?source=create_home_promo_banner`}
              onClick={() => {
                trackEvent('create_home_promo_modal_primary_click', {
                  source: 'create_home_promo_banner'
                });
                setPromoModalOpen(false);
              }}
            >
              {createCopy.promoModalPrimary}
            </Link>
            <button type="button" onClick={() => setPromoModalOpen(false)}>
              {createCopy.promoModalSecondary}
            </button>
          </div>
        }
        onClose={() => setPromoModalOpen(false)}
      >
        <img
          className="create-home-promo-dialog-image"
          src={promoBannerImage}
          alt=""
        />
        <ul className="create-home-promo-modal-list">
          {createCopy.promoModalBullets.map((item) => (
            <li key={item}>
              <Check size={14} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Dialog>
      <section className="create-home-hero">
        <div className="create-home-composer">
          <div className="create-home-promptbox">
            <div className="create-home-promptbox-head">
              <div>
                <strong>{createCopy.composerTitle}</strong>
                <small>{createCopy.composerSubtitle}</small>
              </div>
            </div>
            <div className="create-home-promptbox-body">
              <div className="create-home-reference-upload-panel">
                <input
                  ref={referenceUploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => void handleReferenceUpload(event)}
                />
                <button
                  type="button"
                  className={`create-home-reference-upload${
                    homeReferences.length > 0 ||
                    pendingReferenceUploads.length > 0
                      ? ' has-references'
                      : ''
                  }`}
                  onClick={openReferenceUploadEntry}
                  disabled={referenceUploading}
                >
                  <span className="create-home-reference-upload-icon">
                    <ImagePlus size={21} />
                  </span>
                  <span>
                    {referenceUploading
                      ? createCopy.referenceUploading
                      : homeReferences.length > 0
                        ? createCopy.referenceAddMore
                        : createCopy.referenceUploadTitle}
                  </span>
                  <small>
                    {homeReferences.length > 0
                      ? `${homeReferences.length}/${MAX_IMAGE_REFERENCE_IDS}`
                      : createCopy.referenceUploadSubtitle}
                  </small>
                </button>
                <span className="sr-only" aria-live="polite">
                  {referenceUploading
                    ? createCopy.referenceUploading
                    : homeReferences.length > 0
                      ? createCopy.referenceUploaded(homeReferences.length)
                      : ''}
                </span>
                {referenceUploadError && (
                  <p className="create-home-reference-upload-error">
                    {referenceUploadError}
                  </p>
                )}
              </div>
              <div
                className={`create-home-prompt-editor${
                  homeReferences.length > 0 ||
                  pendingReferenceUploads.length > 0
                    ? ' has-references'
                    : ''
                }`}
              >
                <HomeReferenceStrip
                  references={homeReferences}
                  pendingUploads={pendingReferenceUploads}
                  uploadingLabel={createCopy.referenceUploading}
                  stripLabel={createCopy.referenceStripLabel}
                  getReferenceLabel={createCopy.referenceLabel}
                  getRemoveLabel={createCopy.referenceRemoveLabel}
                  onRemove={removeHomeReference}
                />
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={createCopy.promptPlaceholder}
                  aria-label={createCopy.promptPlaceholder}
                />
              </div>
            </div>
            <div className="create-home-promptbox-foot">
              <div className="create-home-creator-presets">
                <label className="model-chip model-chip-select">
                  <span className="create-home-model-chip-label">
                    {isEnglishCreate ? 'Model' : '模型'}
                  </span>
                  <SelectRoot
                    value={selectedHomeModel?.value || homeModel}
                    onValueChange={setHomeModel}
                  >
                    <SelectTrigger
                      className="create-home-preset-select-trigger create-home-model-select-trigger"
                      aria-label="AI 模型"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOME_MODEL_GROUP_ORDER.map((group) => {
                        const groupedModels = modelOptions.filter(
                          (model) => model.group === group
                        );
                        if (groupedModels.length === 0) return null;
                        return (
                          <SelectGroup key={group}>
                            <SelectLabel>
                              {homeModelGroupLabels[group]}
                            </SelectLabel>
                            {groupedModels.map((model) => (
                              <SelectItem
                                key={model.value}
                                value={model.value}
                                disabled={model.status === 'unavailable'}
                              >
                                {model.label} · x{model.creditMultiplier}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </SelectRoot>
                </label>
                <label>
                  <span className="sr-only">{createCopy.aspectLabel}</span>
                  <SelectRoot
                    value={homeAspectRatio}
                    onValueChange={(value) =>
                      setHomeAspectRatio(
                        value as (typeof HOME_ASPECT_RATIOS)[number]
                      )
                    }
                  >
                    <SelectTrigger
                      className="create-home-preset-select-trigger"
                      aria-label={createCopy.aspectLabel}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(availableHomeAspectRatios.length > 0
                          ? availableHomeAspectRatios
                          : HOME_ASPECT_RATIOS
                        ).map((ratio) => (
                          <SelectItem key={ratio} value={ratio}>
                            {ratio}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </SelectRoot>
                </label>
                <label>
                  <span className="sr-only">{createCopy.resolutionLabel}</span>
                  <SelectRoot
                    value={homeResolution}
                    onValueChange={(value) =>
                      setHomeResolution(
                        value as (typeof HOME_RESOLUTIONS)[number]
                      )
                    }
                  >
                    <SelectTrigger
                      className="create-home-preset-select-trigger"
                      aria-label={createCopy.resolutionLabel}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(availableHomeResolutions.length > 0
                          ? availableHomeResolutions
                          : HOME_RESOLUTIONS
                        ).map((resolution) => (
                          <SelectItem key={resolution} value={resolution}>
                            {resolution}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </SelectRoot>
                </label>
              </div>
              <Button
                type="button"
                variant="outline"
                className="secondary"
                leadingIcon={<Shuffle />}
                onClick={randomizePrompt}
              >
                {createCopy.randomize}
              </Button>
              {isAuthenticated ? (
                <BeamCta tone="warm">
                  <Button
                    type="button"
                    className="create-home-primary-cta"
                    leadingIcon={<Sparkles />}
                    onClick={startCreate}
                    disabled={homeGenerationDisabled}
                    title={homeGenerationDisabledReason}
                  >
                    {createCopy.startWithCost(creditEstimate.cost)}
                  </Button>
                </BeamCta>
              ) : (
                <Button
                  type="button"
                  className="create-home-primary-cta"
                  leadingIcon={<Sparkles />}
                  onClick={startCreate}
                  disabled={homeGenerationDisabled}
                  title={homeGenerationDisabledReason}
                >
                  {createCopy.startWithCost(creditEstimate.cost)}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {isAuthenticated && (
        <ContinueLastCreationCard
          localePrefix={localePrefix}
          isEnglish={isEnglishCreate}
        />
      )}

      <section
        className="create-home-banner"
        aria-label={createCopy.bannerLabel}
      >
        <div className="create-home-banner-track">
          {bannerItems.map((banner, index) => {
            const bannerStyle = {
              '--create-home-banner-position': banner.objectPosition
            } as CSSProperties;
            const media =
              banner.mediaType === 'video' ? (
                <video
                  src={banner.media}
                  aria-hidden="true"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload={index === 0 ? 'auto' : 'metadata'}
                />
              ) : (
                <img
                  src={banner.media}
                  alt=""
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  {...imageFetchPriority(index === 0 ? 'high' : 'auto')}
                />
              );

            const inner = (
              <>
                {media}
                <div>
                  <span>{banner.eyebrow}</span>
                  <strong>{banner.title}</strong>
                  <small>{banner.description}</small>
                </div>
              </>
            );

            if (banner.kind === 'promo') {
              return (
                <button
                  key={banner.id}
                  type="button"
                  className="create-home-banner-slide is-promo"
                  style={bannerStyle}
                  onClick={() => {
                    trackEvent('create_home_promo_banner_click', {
                      banner_id: banner.id
                    });
                    setPromoModalOpen(true);
                  }}
                >
                  {inner}
                </button>
              );
            }

            return (
              <Link
                key={banner.id}
                to={`${localePrefix}${banner.href}`}
                className="create-home-banner-slide"
                style={bannerStyle}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <section
        className="create-home-quick-grid"
        aria-label={createCopy.quickLabel}
      >
        <Link to={`${localePrefix}/image`}>
          <Image size={19} />
          <span>{createCopy.imageCreate}</span>
          <small>{createCopy.imageCreateDesc}</small>
        </Link>
        <Link
          to={`${localePrefix}/gallery`}
          onClick={(event) =>
            maybeOpenDeepPaywall(
              event,
              'gallery',
              'create_home_gallery_quick_action',
              `${localePrefix}/gallery`
            )
          }
        >
          <GalleryHorizontalEnd size={19} />
          <span>{createCopy.gallery}</span>
          <small>{createCopy.galleryDesc}</small>
        </Link>
        <Link to={promptLibraryHref}>
          <Sparkles size={19} />
          <span>{createCopy.promptLibrary}</span>
          <small>{createCopy.promptLibraryDesc}</small>
        </Link>
      </section>

      <section className="create-section" id="prompt-cases">
        <div className="create-section-head">
          <div>
            <span className="create-eyebrow">Prompt Cases</span>
            <h2>{createCopy.promptCasesTitle}</h2>
          </div>
          <div className="create-section-head-actions">
            <PromptLibrarySortTabs
              isZh={!isEnglishCreate}
              items={promptCaseSortItems}
              ariaLabel={
                isEnglishCreate
                  ? 'Recommended prompt case sort'
                  : '推荐案例排序'
              }
              onItemClick={handlePromptCaseSortClick}
            />
            <Link to={promptLibraryHref}>{createCopy.viewAllCases}</Link>
          </div>
        </div>
        <div ref={caseStripRef} className="create-case-library-masonry">
          <PromptLibraryMasonry
            isZh={!isEnglishCreate}
            locale={homePromptLibraryLocale}
            columns={caseTileColumns}
            activeColumnCount={caseColumnCount}
            loadState={caseLoadState}
            statusState={
              casesError
                ? 'error'
                : caseLoadState === 'ready' && cases.length === 0
                  ? 'empty'
                  : null
            }
            allCasesHref={promptLibraryHref}
            getCaseHref={(caseItem) =>
              caseItem.slug
                ? `${localePrefix}/prompts/${caseItem.slug}`
                : `${localePrefix}/create/prompts/share/${caseItem.id}`
            }
            getCreateHref={(caseItem) =>
              `${localePrefix}/image?source=create_home_prompt_case&caseId=${encodeURIComponent(
                caseItem.id
              )}`
            }
            aspectRatios={caseAspectRatios}
            onAspectRatioChange={handleCaseAspectRatioChange}
            isFavorited={isFavorited}
            onOpenCase={openPromptCaseFromMasonry}
            onToggleFavorite={toggleFavorite}
            hasMore={casesHasMore}
            isLoadingMore={promptLibraryCasesState.isLoadingMore}
            onLoadMore={requestNextCasePage}
            onRetry={promptLibraryCasesState.retry}
            loadMoreRef={caseLoadSentinelRef}
            visibleCount={cases.length}
            totalCount={promptLibraryCasesState.data?.total || cases.length}
            hasAnyCases={cases.length > 0}
          />
        </div>
      </section>
      {selectedCasePreview && (
        <div
          className="creator-preview-backdrop create-gallery-preview-backdrop"
          role="presentation"
          onMouseDown={closeCasePreview}
        >
          <section
            ref={casePreviewModalRef}
            className="creator-preview create-gallery-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Prompt Case 预览"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="creator-preview-head">
              <span>Prompt Case 预览</span>
              <div className="creator-preview-head-actions">
                <div className="creator-preview-actions creator-preview-head-action-row">
                  {selectedCaseDetailHref ? (
                    <ButtonLink
                      to={selectedCaseDetailHref}
                      className="creator-preview-detail-link"
                      variant="outline"
                      size="sm"
                    >
                      <ExternalLink data-icon="inline-start" />
                      查看详情页
                    </ButtonLink>
                  ) : null}
                  <Button
                    type="button"
                    className="creator-preview-reedit"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUsePreviewPrompt(selectedCasePreview)}
                  >
                    <Wand2 data-icon="inline-start" />
                    用这个 Prompt 生成
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="creator-preview-close-button"
                  aria-label="关闭"
                  onClick={closeCasePreview}
                >
                  <X />
                </Button>
              </div>
            </div>
            <div className="creator-preview-body">
              <div className="creator-preview-image">
                {selectedCaseImage ? (
                  <button
                    type="button"
                    className="creator-preview-image-zoom create-gallery-preview-image-button"
                    aria-label="全屏查看图片"
                    onClick={() => setCaseLightboxOpen(true)}
                  >
                    <img
                      src={getOptimizedPromptCaseImageUrl(selectedCaseImage, {
                        width: 1280,
                        quality: 82
                      })}
                      alt=""
                      decoding="async"
                    />
                    <span>
                      <Maximize2 size={16} />
                    </span>
                  </button>
                ) : (
                  <div className="create-gallery-image-placeholder">
                    <GalleryHorizontalEnd size={24} />
                    <span>图片资源准备中</span>
                  </div>
                )}
                {selectedCaseImages.length > 1 && (
                  <div
                    className="creator-preview-image-switcher"
                    aria-label="切换案例图片"
                  >
                    {selectedCaseImages.map((imageUrl, index) => (
                      <button
                        key={`${imageUrl}-${index}`}
                        type="button"
                        className={
                          index === caseActiveImageIndex ? 'active' : ''
                        }
                        aria-label={`切换到第 ${index + 1} 张图片`}
                        onClick={() => setCaseActiveImageIndex(index)}
                      >
                        <img
                          src={getOptimizedPromptCaseImageUrl(imageUrl, {
                            width: 120,
                            quality: 70
                          })}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="creator-preview-side">
                {selectedCaseRecipeAssets.length > 0 && (
                  <section
                    className="creator-preview-recipe-strip create-home-preview-recipe"
                    aria-label={
                      isEnglishCreate ? 'Visual recipe' : '可视化配方'
                    }
                  >
                    <div className="creator-preview-recipe-head">
                      <span>
                        {isEnglishCreate ? 'Visual recipe' : '可视化配方'}
                      </span>
                      <Button
                        type="button"
                        className="creator-preview-recipe-cta"
                        size="sm"
                        onClick={() =>
                          handleUsePreviewRecipe(selectedCasePreview)
                        }
                      >
                        <Wand2 data-icon="inline-start" />
                        {isEnglishCreate ? 'Create' : '按配方创作'}
                      </Button>
                    </div>
                    <div className="creator-preview-recipe-row">
                      {selectedCaseRecipeAssets.map(({ slot, asset }) => (
                        <button
                          key={`${slot}:${asset.id}`}
                          type="button"
                          className={`creator-preview-recipe-chip${
                            activeRecipeAsset?.asset.id === asset.id
                              ? ' active'
                              : ''
                          }`}
                          aria-pressed={
                            activeRecipeAsset?.asset.id === asset.id
                          }
                          onClick={() => setActiveRecipeAssetId(asset.id)}
                        >
                          <AssetThumb asset={asset} />
                          <span>
                            <small>{slot}</small>
                            <strong>{asset.title}</strong>
                          </span>
                        </button>
                      ))}
                    </div>
                    {activeRecipeAsset && (
                      <div className="creator-prompt-case-related-block">
                        <div className="creator-prompt-case-related-head">
                          <span>
                            {selectedRecipeRelatedCases.length > 0
                              ? isEnglishCreate
                                ? 'Cases using this element'
                                : '使用同款素材的热门案例'
                              : isEnglishCreate
                                ? 'Related popular cases'
                                : '相关热门案例'}
                          </span>
                          <small>{activeRecipeAsset.asset.title}</small>
                        </div>
                        {selectedRecipeRelatedCases.length > 0 ||
                        selectedRecipeFallbackCases.length > 0 ? (
                          <div className="creator-prompt-case-related-list">
                            {(selectedRecipeRelatedCases.length > 0
                              ? selectedRecipeRelatedCases.map(
                                  ({ caseItem }) => caseItem
                                )
                              : selectedRecipeFallbackCases
                            ).map((caseItem) => (
                              <Link
                                key={caseItem.id}
                                to={
                                  caseItem.slug
                                    ? `${localePrefix}/prompts/${caseItem.slug}`
                                    : `${localePrefix}/create/prompts/share/${caseItem.id}`
                                }
                                className="creator-prompt-case-related-card"
                                onClick={closeCasePreview}
                              >
                                <span>
                                  {getPromptCaseAssetThumbUrl(caseItem) ? (
                                    <img
                                      src={getOptimizedPromptCaseImageUrl(
                                        getPromptCaseAssetThumbUrl(caseItem),
                                        { width: 120, quality: 72 }
                                      )}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : null}
                                </span>
                                <strong>
                                  {caseItem.title || 'Visual Prompt Case'}
                                </strong>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <p className="creator-prompt-case-related-empty">
                            {isEnglishCreate
                              ? 'No other public cases use this element yet.'
                              : '暂时没有匹配到更多公开案例。'}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}
                <div className="creator-preview-prompt">
                  <div className="creator-preview-prompt-head">
                    <span>Prompt</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyPreviewPrompt}
                    >
                      {casePromptCopied ? (
                        <Check data-icon="inline-start" />
                      ) : (
                        <Copy data-icon="inline-start" />
                      )}
                      {casePromptCopied ? '已复制' : '复制 Prompt'}
                    </Button>
                  </div>
                  <pre>
                    {selectedCasePreview.prompt ||
                      selectedCasePreview.promptPreview ||
                      ''}
                  </pre>
                </div>
                <dl className="creator-preview-meta">
                  <div className="creator-preview-meta-wide">
                    <dt>案例</dt>
                    <dd>{selectedCasePreview.title || 'Visual Prompt Case'}</dd>
                  </div>
                  <div>
                    <dt>来源</dt>
                    <dd>精选案例</dd>
                  </div>
                  <div>
                    <dt>模型</dt>
                    <dd>{selectedCasePreview.model || 'GPT Image 2'}</dd>
                  </div>
                  <div>
                    <dt>分类</dt>
                    <dd>{selectedCasePreview.category || 'featured'}</dd>
                  </div>
                  {selectedCasePreview.commercialIntent && (
                    <div className="creator-preview-meta-wide">
                      <dt>商业意图</dt>
                      <dd>{selectedCasePreview.commercialIntent}</dd>
                    </div>
                  )}
                  {selectedCasePreview.tags?.length ? (
                    <div className="creator-preview-meta-wide">
                      <dt>标签</dt>
                      <dd>{selectedCasePreview.tags.join(' / ')}</dd>
                    </div>
                  ) : null}
                </dl>
                {previewMoreCases.length > 0 && (
                  <section className="creator-prompt-case-more-block">
                    <div className="creator-prompt-case-related-head">
                      <span>
                        {isEnglishCreate
                          ? 'More popular cases'
                          : '更多热门案例'}
                      </span>
                      <small>
                        {isEnglishCreate
                          ? 'Keep exploring'
                          : '继续发现可复用案例'}
                      </small>
                    </div>
                    <div className="creator-prompt-case-related-list creator-prompt-case-more-list">
                      {previewMoreCases.map((caseItem) => (
                        <Link
                          key={caseItem.id}
                          to={
                            caseItem.slug
                              ? `${localePrefix}/prompts/${caseItem.slug}`
                              : `${localePrefix}/create/prompts/share/${caseItem.id}`
                          }
                          className="creator-prompt-case-related-card"
                          onClick={closeCasePreview}
                        >
                          <span>
                            {getPromptCaseAssetThumbUrl(caseItem) ? (
                              <img
                                src={getOptimizedPromptCaseImageUrl(
                                  getPromptCaseAssetThumbUrl(caseItem),
                                  { width: 120, quality: 72 }
                                )}
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                            ) : null}
                          </span>
                          <strong>
                            {caseItem.title || 'Visual Prompt Case'}
                          </strong>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {selectedCasePreview && caseLightboxOpen && selectedCaseImage && (
        <PhotoSwipeViewer
          items={selectedCaseImages.map((imageUrl) => ({ src: imageUrl }))}
          index={caseActiveImageIndex}
          onClose={() => setCaseLightboxOpen(false)}
          onIndexChange={(nextIndex) =>
            setCaseActiveImageIndex(nextIndex)
          }
        />
      )}
    </CreateWorkspaceFrame>
  );
}
