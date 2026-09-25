import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react';
import { Film } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { HistoryGalleryModal } from '../components/image-create/HistoryGalleryModal';
import { VideoHistoryPreviewDialog } from '../components/image-create/VideoHistoryPreviewDialog';
import { ImageSessionConversation } from '../components/image-create/ImageSessionConversation';
import { selectSessionProgressTasks } from '../components/image-create/imageSessionProgress';
import {
  upsertCachedImageCreationSession,
  updateCachedImageCreationSessionCover
} from '../components/image-create/useImageCreationSessions';
import {
  useImageSessionConversation,
  type CreationSessionHistoryItem
} from '../components/image-create/useImageSessionConversation';
import {
  createImageEditorEntryState,
} from '../components/image-editor/editor-entry';
import { localizeCreateHref } from '../data/create-workspace';
import type { GenerationRecordTask } from '../components/image-create/GenerationRecordsRail';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';
import {
  VideoStudioComposer,
  type VideoStudioCreationMode
} from '../components/video-create/VideoStudioComposer';
import {
  getReferenceMediaReadError,
  validateReferenceMedia,
  validateReferenceMediaFileSize
} from '../components/video-create/referenceMediaValidation';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import '../styles/video-studio.css';
import {
  enqueueVisualVideoTask,
  getPublicPromptCase,
  getVisualImageHistoryResult,
  getVisualVideoAvailability,
  optimizeVideoPrompt,
  setVisualVideoFavorite,
  uploadImageReference,
  uploadVideoReferenceMedia,
  waitForVisualVideoTask,
  type VisualImageHistoryItem,
  type VisualVideoGenerationItem
} from '@/services/agent-api';
import { toUserFacingError } from '@/shared/errors/user-facing-error';
import {
  createImageSession,
  createImageSessionTurn,
  listImageSessionTurns
} from '@/services/create-workspace-v2-api';
import type { ImageCreationTurn } from '@/shared/create-workspace-v2';
import { getVideoGenerationCost } from '@/services/credits-api';
import {
  DEFAULT_SEEDANCE_VIDEO_MODEL_ID,
  SEEDANCE_VIDEO_MODELS,
  getSeedanceVideoModelConfig,
  type SeedanceVideoModelId,
  type SeedanceVideoResolution
} from '@/shared/seedance-video-models';
import {
  estimateVideoGenerationCreditCost,
  getVideoGenerationCreditCostPerSecond,
  type VideoGenerationCreditEstimate
} from '@/shared/video-generation-pricing';
import { resolvePromptCaseRouteImport } from './image-create-route-import';

type LocalePrefix = '' | '/zh-CN' | '/en-US';
type VideoFrameSlot = 'first' | 'last';
type VideoGalleryTarget = VideoFrameSlot | 'reference';
type ReferenceMediaType = 'image' | 'video' | 'audio';

const VIDEO_FRAME_GALLERY_PAGE_SIZE = 24;
const SAMPLE_PROMPTS = {
  zh: [
    '透明玻璃香水瓶立在浅水中，微距镜头缓慢推进，晨光掠过瓶身，水波自然扩散，5 秒商业广告质感。',
    '年轻创作者站在城市天台，镜头从背后平稳移动到侧脸，远处夜景灯光流动，真实电影感。',
    '白色无线耳机悬浮旋转，柔和棚拍光扫过产品边缘，镜头轻微环绕，背景干净克制。'
  ],
  en: [
    'A transparent perfume bottle stands in shallow water. A slow macro push-in catches morning light across the glass while ripples spread naturally, premium 5-second commercial.',
    'A young creator stands on a city rooftop. The camera moves steadily from behind to a side profile as distant night lights flow, grounded cinematic realism.',
    'White wireless earbuds float and rotate under soft studio lighting. The camera makes a subtle orbit against a clean restrained background.'
  ]
} as const;

const COPY = {
  zh: {
    seoTitle: 'WebToMind 视频创作 | Seedance AI 视频生成',
    seoDescription:
      '使用 Seedance AI 生成短视频，支持首尾帧、计费预估、任务轮询和历史预览。',
    intro: '把一个镜头想法，变成可直接使用的视频。',
    recent: '最近生成',
    recentHint: '点击视频查看详情、复制提示词或下载原文件。',
    pending: '视频生成中',
    pendingHint: '可以留在当前页面，完成后会自动出现在最近结果中。',
    loginRequired: '视频生成需要登录后使用。',
    noPrompt: '请先描述你想生成的视频。',
    noFirstFrame: '首尾帧模式需要先添加首帧。',
    referenceLimit: (count: number) => `当前模型最多支持 ${count} 张参考图。`,
    referenceVideoLimit: (count: number) =>
      `当前模型最多支持 ${count} 个参考视频。`,
    referenceAudioLimit: (count: number) =>
      `当前模型最多支持 ${count} 个参考音频。`,
    incompatibleReferenceModes: '严格首尾帧与普通参考素材不可同时使用。',
    audioNeedsVisual: '参考音频不能单独使用，请至少添加图片或视频。',
    maintenance: '视频生成通道当前不可用，请稍后再试。',
    queued: (count: number) =>
      count > 1
        ? `已提交 ${count} 个视频任务，完成后会自动显示。`
        : '视频任务已提交，完成后会自动显示。',
    queuedPartial: (queued: number, failed: number) =>
      `已提交 ${queued} 个视频任务，${failed} 个提交失败。`,
    completed: '视频生成完成，已进入最近结果。',
    failed: '视频生成失败，相关积分会自动退回。',
    galleryTitle: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? '选择参考图'
        : target === 'first'
          ? '选择首帧'
          : '选择尾帧',
    galleryEmpty: '图库中没有可用图片。',
    galleryFailed: '图库加载失败。',
    uploaded: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? '参考图已上传。'
        : target === 'first'
          ? '首帧已上传。'
          : '尾帧已上传。',
    uploadFailed: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? '参考图上传失败。'
        : target === 'first'
          ? '首帧上传失败。'
          : '尾帧上传失败。',
    optimizingPrompt: '正在优化视频提示词…',
    optimizedPrompt: '提示词已按当前视频参数优化。',
    optimizeFailed: '提示词优化失败。',
    promptChangedDuringOptimize: '提示词已变化，未覆盖你正在编辑的版本。'
  },
  en: {
    seoTitle: 'WebToMind Video Studio | Seedance AI video generation',
    seoDescription:
      'Generate short videos with Seedance AI, first/last frames, cost estimates, task polling and history preview.',
    intro: 'Turn one shot idea into a video you can use.',
    recent: 'Recent generations',
    recentHint:
      'Open a video to inspect, copy its prompt or download the file.',
    pending: 'Generating video',
    pendingHint:
      'Keep this page open. Finished videos appear here automatically.',
    loginRequired: 'Sign in to generate video.',
    noPrompt: 'Describe the video you want to generate.',
    noFirstFrame: 'First/last frame mode requires a first frame.',
    referenceLimit: (count: number) =>
      `This model supports up to ${count} reference images.`,
    referenceVideoLimit: (count: number) =>
      `This model supports up to ${count} reference videos.`,
    referenceAudioLimit: (count: number) =>
      `This model supports up to ${count} reference audio clips.`,
    incompatibleReferenceModes:
      'Strict first/last frames cannot be mixed with reference media.',
    audioNeedsVisual:
      'Reference audio requires at least one reference image or video.',
    maintenance: 'Video generation is unavailable right now. Try again later.',
    queued: (count: number) =>
      count > 1
        ? `${count} video tasks submitted. Results will appear automatically.`
        : 'Video task submitted. The result will appear automatically.',
    queuedPartial: (queued: number, failed: number) =>
      `${queued} video tasks submitted; ${failed} failed to submit.`,
    completed: 'Video generated and added to recent results.',
    failed:
      'Video generation failed. Related credits will be refunded automatically.',
    galleryTitle: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? 'Choose reference image'
        : target === 'first'
          ? 'Choose first frame'
          : 'Choose last frame',
    galleryEmpty: 'No usable images in your gallery.',
    galleryFailed: 'Could not load the gallery.',
    uploaded: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? 'Reference image uploaded.'
        : target === 'first'
          ? 'First frame uploaded.'
          : 'Last frame uploaded.',
    uploadFailed: (target: VideoGalleryTarget) =>
      target === 'reference'
        ? 'Reference image upload failed.'
        : target === 'first'
          ? 'First frame upload failed.'
          : 'Last frame upload failed.',
    optimizingPrompt: 'Optimizing the video prompt…',
    optimizedPrompt: 'Prompt optimized for the current video settings.',
    optimizeFailed: 'Prompt optimization failed.',
    promptChangedDuringOptimize:
      'The prompt changed, so your current edit was not overwritten.'
  }
} as const;

function getLocalePrefix(pathname: string): LocalePrefix {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function normalizeVideoFrameMentions(prompt: string): string {
  return prompt
    .replace(/@(?:参考图|图片)\s*(\d+)/g, '图片$1')
    .replace(/@(?:Reference|Image)\s*(\d+)/gi, 'image $1')
    .replace(/@视频\s*(\d+)/g, '视频$1')
    .replace(/@Video\s*(\d+)/gi, 'video $1')
    .replace(/@音频\s*(\d+)/g, '音频$1')
    .replace(/@Audio\s*(\d+)/gi, 'audio $1')
    .replace(/@首帧(?:图片)?/g, '首帧参考图')
    .replace(/@尾帧(?:图片)?/g, '尾帧参考图')
    .replace(/@First frame(?: image)?/gi, 'first-frame reference')
    .replace(/@Last frame(?: image)?/gi, 'last-frame reference');
}

function mergeOptimizedVideoPrompt(
  optimizedPrompt: string,
  optimizedNegativePrompt: string,
  fallback: string,
  isEnglish: boolean
): string {
  const positive = optimizedPrompt.trim() || fallback;
  const negative = optimizedNegativePrompt.trim();
  if (!negative) return positive;
  return `${positive}\n\n${
    isEnglish ? 'Negative constraints: ' : '负向约束：'
  }${negative}`;
}

function buildSubmissionPrompt(input: {
  prompt: string;
  mode: VideoStudioCreationMode;
  referenceImageCount: number;
  referenceVideoCount: number;
  referenceAudioCount: number;
  resolution: SeedanceVideoResolution;
  isEnglish: boolean;
}): string {
  const normalizedPrompt = normalizeVideoFrameMentions(input.prompt);
  const lines = [normalizedPrompt.trim()];
  if (input.referenceImageCount > 0) {
    lines.push(
      input.isEnglish
        ? 'Use each referenced image according to its Image N mention. Reference images preserve identity, product, style, scene or composition and are not strict first/last frames.'
        : '按“图片N”的编号使用对应参考图片；参考图片用于继承人物、产品、风格、场景或构图，不是严格首尾帧。'
    );
  }
  if (input.referenceVideoCount > 0) {
    lines.push(
      input.isEnglish
        ? 'Use each Video N reference only for the specifically requested subject, camera movement, action or style.'
        : '按“视频N”的编号引用对应视频，仅继承提示词明确指定的主体、运镜、动作或风格。'
    );
  }
  if (input.referenceAudioCount > 0) {
    lines.push(
      input.isEnglish
        ? 'Use each Audio N reference only for the requested timbre, melody, dialogue or sound design.'
        : '按“音频N”的编号引用对应音频，仅继承提示词明确指定的音色、旋律、对白或声音设计。'
    );
  }
  if (input.mode === 'first-last-frame') {
    lines.push(
      input.isEnglish
        ? 'Use the first reference as the opening frame and the last reference as the ending direction. Keep subject, scene and lighting continuous.'
        : '以首帧参考图作为开场，以尾帧参考图作为收束方向，保持主体、场景和光线连续。'
    );
  }
  lines.push(
    input.isEnglish
      ? `Output a clean publishing-ready ${input.resolution.toUpperCase()} video.`
      : `输出 ${input.resolution.toUpperCase()} 清晰、干净、可直接发布的视频。`
  );
  return lines.join('\n\n');
}

function readMediaMetadata(
  file: File,
  mediaType: 'video' | 'audio'
): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(mediaType);
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(objectUrl);
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const metadata = {
        duration: element.duration,
        ...(mediaType === 'video'
          ? {
              width: (element as HTMLVideoElement).videoWidth,
              height: (element as HTMLVideoElement).videoHeight
            }
          : {})
      };
      cleanup();
      resolve(metadata);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error('无法读取素材文件。'));
    };
    element.src = objectUrl;
  });
}

export function CreateVideoPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const localePrefix = getLocalePrefix(location.pathname);
  const isEnglish = localePrefix === '/en-US';
  const copy = isEnglish ? COPY.en : COPY.zh;

  const [prompt, setPrompt] = useState('');
  const promptUserEditVersionRef = useRef(0);
  const lastOptimizationRef = useRef<{
    prompt: string;
    contextKey: string;
  } | null>(null);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [promptOptimizing, setPromptOptimizing] = useState(false);
  const [modelId, setModelId] = useState<SeedanceVideoModelId>(
    DEFAULT_SEEDANCE_VIDEO_MODEL_ID
  );
  const [modelStatuses, setModelStatuses] = useState<
    Partial<Record<SeedanceVideoModelId, 'beta' | 'available' | 'unavailable'>>
  >({});
  const runtimeModels = useMemo(
    () =>
      SEEDANCE_VIDEO_MODELS.map((item) => ({
        ...item,
        status: modelStatuses[item.id] || item.status
      })),
    [modelStatuses]
  );
  const model = useMemo(
    () =>
      runtimeModels.find((item) => item.id === modelId) ||
      getSeedanceVideoModelConfig(modelId),
    [modelId, runtimeModels]
  );
  const [aspectRatio, setAspectRatio] = useState(model.defaultAspectRatio);
  const [duration, setDuration] = useState(model.defaultDuration);
  const [resolution, setResolution] = useState<SeedanceVideoResolution>(
    model.defaultResolution
  );
  const [generateAudio, setGenerateAudio] = useState(
    model.defaultGenerateAudio
  );
  const [watermark, setWatermark] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([]);
  const [referenceVideoUrls, setReferenceVideoUrls] = useState<string[]>([]);
  const [referenceVideoDurations, setReferenceVideoDurations] = useState<
    number[]
  >([]);
  const [referenceAudioUrls, setReferenceAudioUrls] = useState<string[]>([]);
  const [referenceAudioDurations, setReferenceAudioDurations] = useState<
    number[]
  >([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const referenceVideoInputRef = useRef<HTMLInputElement>(null);
  const referenceAudioInputRef = useRef<HTMLInputElement>(null);
  const referenceImageUploadPendingRef = useRef(false);
  const [referenceUploading, setReferenceUploading] =
    useState<ReferenceMediaType | null>(null);
  const [firstFrameUrl, setFirstFrameUrl] = useState('');
  const [lastFrameUrl, setLastFrameUrl] = useState('');
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const [frameUploadSlot, setFrameUploadSlot] = useState<VideoFrameSlot | null>(
    null
  );
  const creationMode: VideoStudioCreationMode =
    firstFrameUrl.trim() || lastFrameUrl.trim() ? 'first-last-frame' : 'auto';

  const [frameGallerySlot, setFrameGallerySlot] =
    useState<VideoGalleryTarget | null>(null);
  const [frameGalleryItems, setFrameGalleryItems] = useState<
    VisualImageHistoryItem[]
  >([]);
  const [frameGalleryTotal, setFrameGalleryTotal] = useState(0);
  const [frameGalleryLoading, setFrameGalleryLoading] = useState(false);
  const [frameGalleryLoadingMore, setFrameGalleryLoadingMore] = useState(false);
  const [frameGalleryError, setFrameGalleryError] = useState('');

  const [videoAvailable, setVideoAvailable] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progressTasks, setProgressTasks] = useState<GenerationRecordTask[]>(
    []
  );
  const [pendingSessionSubmission, setPendingSessionSubmission] =
    useState<GenerationRecordTask | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [sessionTurns, setSessionTurns] = useState<ImageCreationTurn[]>([]);
  const activeSessionPromiseRef = useRef<Promise<string> | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [previewVideo, setPreviewVideo] =
    useState<VisualVideoGenerationItem | null>(null);
  const [favoriteLoadingIds, setFavoriteLoadingIds] = useState<Set<string>>(
    new Set()
  );

  const frameUrls = useMemo(
    () => [firstFrameUrl.trim(), lastFrameUrl.trim()].filter(Boolean),
    [firstFrameUrl, lastFrameUrl]
  );
  const totalAttachedAssetCount =
    referenceImageUrls.length +
    referenceVideoUrls.length +
    referenceAudioUrls.length +
    frameUrls.length;
  const localEstimate = useMemo(
    () =>
      estimateVideoGenerationCreditCost({
        model: model.id,
        duration,
        resolution,
        // 官方计费只有“输入包含视频”额外计 token：参考图/首尾帧/音频不计费。
        referenceImageCount: referenceImageUrls.length + frameUrls.length,
        referenceVideoCount: referenceVideoUrls.length,
        referenceVideoDurations,
        referenceAudioCount: referenceAudioUrls.length
      }),
    [
      duration,
      frameUrls.length,
      model.id,
      referenceAudioUrls.length,
      referenceImageUrls.length,
      referenceVideoDurations,
      referenceVideoUrls.length,
      resolution
    ]
  );
  const estimateKey = `${model.id}:${duration}:${resolution}:${totalAttachedAssetCount}:${referenceVideoDurations.join(',')}`;
  const [remoteEstimate, setRemoteEstimate] =
    useState<VideoGenerationCreditEstimate | null>(null);
  const [remoteEstimateKey, setRemoteEstimateKey] = useState('');
  const estimate =
    remoteEstimateKey === estimateKey && remoteEstimate
      ? remoteEstimate
      : localEstimate;
  const totalCost = estimate.cost * quantity;
  const estimatedCostPerSecond =
    getVideoGenerationCreditCostPerSecond(estimate);
  const promptOptimizationContextKey = [
    model.id,
    aspectRatio,
    duration,
    resolution,
    generateAudio ? 'audio' : 'silent',
    creationMode,
    referenceImageUrls.length,
    referenceVideoUrls.length,
    referenceAudioUrls.length,
    firstFrameUrl ? 'first' : 'no-first',
    lastFrameUrl ? 'last' : 'no-last'
  ].join(':');
  const sessionConversation = useImageSessionConversation(
    sessionTurns,
    'video'
  );

  const toggleVideoFavorite = useCallback(
    async (item: VisualVideoGenerationItem) => {
      if (favoriteLoadingIds.has(item.generationId)) return;
      setFavoriteLoadingIds((current) =>
        new Set(current).add(item.generationId)
      );
      setError('');
      try {
        const updated = await setVisualVideoFavorite(
          item.generationId,
          !item.isFavorite
        );
        const nextItem = { ...item, isFavorite: updated.isFavorite };
        sessionConversation.updateHistoryItem(nextItem);
        setPreviewVideo((current) =>
          current?.generationId === nextItem.generationId
            ? { ...current, ...nextItem }
            : current
        );
        setStatus(
          updated.isFavorite
            ? isEnglish
              ? 'Added to favorites.'
              : '已加入收藏'
            : isEnglish
              ? 'Removed from favorites.'
              : '已取消收藏'
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : isEnglish
              ? 'Could not update favorite.'
              : '收藏状态更新失败'
        );
      } finally {
        setFavoriteLoadingIds((current) => {
          const next = new Set(current);
          next.delete(item.generationId);
          return next;
        });
      }
    },
    [favoriteLoadingIds, isEnglish, sessionConversation]
  );
  const sessionProgressTasks = useMemo(() => {
    const tasks = selectSessionProgressTasks(
      progressTasks,
      activeSessionId,
      sessionTurns
    );
    return pendingSessionSubmission && tasks.length === 0
      ? [pendingSessionSubmission, ...tasks]
      : tasks;
  }, [activeSessionId, pendingSessionSubmission, progressTasks, sessionTurns]);
  const activeTaskCount = progressTasks.filter(
    (task) => task.status === 'queued' || task.status === 'running'
  ).length;
  const isEmpty =
    sessionTurns.length === 0 && sessionProgressTasks.length === 0;

  // 发送成功后清空输入框，并让页面跟随新的创作内容滚动展示。
  const submissionScrollRef = useRef(false);
  const previousSessionContentCountRef = useRef(-1);

  const scrollToNewestSessionTurn = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      window.requestAnimationFrame(() => {
        const turns = Array.from(
          document.querySelectorAll<HTMLElement>('.image-session-turn')
        );
        const target =
          turns[turns.length - 1] ||
          document.querySelector<HTMLElement>('.creator-session-transcript');
        target?.scrollIntoView({ behavior, block: 'center' });
      });
    },
    []
  );

  useEffect(() => {
    const contentCount = sessionTurns.length + sessionProgressTasks.length;
    const previous = previousSessionContentCountRef.current;
    previousSessionContentCountRef.current = contentCount;
    if (previous < 0 || contentCount <= previous) return;
    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 320;
    if (submissionScrollRef.current || nearBottom) {
      scrollToNewestSessionTurn();
    }
    submissionScrollRef.current = false;
  }, [
    scrollToNewestSessionTurn,
    sessionProgressTasks.length,
    sessionTurns.length
  ]);

  useEffect(
    () =>
      applySeo({
        title: copy.seoTitle,
        description: copy.seoDescription,
        robots: 'noindex,nofollow',
        htmlLang: isEnglish ? 'en' : 'zh-CN'
      }),
    [copy.seoDescription, copy.seoTitle, isEnglish]
  );

  useEffect(() => {
    let cancelled = false;
    setAvailabilityLoading(true);
    getVisualVideoAvailability()
      .then((result) => {
        if (cancelled) return;
        setVideoAvailable(result.enabled);
        setAvailabilityMessage(result.message || '');
        setModelStatuses(
          Object.fromEntries(
            (result.models || [])
              .filter((item) =>
                SEEDANCE_VIDEO_MODELS.some((model) => model.id === item.id)
              )
              .map((item) => [item.id, item.status])
          ) as Partial<
            Record<SeedanceVideoModelId, 'beta' | 'available' | 'unavailable'>
          >
        );
      })
      .catch(() => {
        if (cancelled) return;
        setVideoAvailable(false);
        setAvailabilityMessage(copy.maintenance);
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copy.maintenance]);

  useEffect(() => {
    let cancelled = false;
    getVideoGenerationCost({
      model: model.id,
      duration,
      resolution,
      referenceImageCount: referenceImageUrls.length + frameUrls.length,
      referenceVideoCount: referenceVideoUrls.length,
      referenceVideoDurations,
      referenceAudioCount: referenceAudioUrls.length
    })
      .then((result) => {
        if (cancelled) return;
        setRemoteEstimate({
          ...result,
          model: result.model as SeedanceVideoModelId
        });
        setRemoteEstimateKey(estimateKey);
      })
      .catch(() => {
        if (!cancelled) setRemoteEstimateKey('');
      });
    return () => {
      cancelled = true;
    };
  }, [
    duration,
    estimateKey,
    frameUrls.length,
    model.id,
    referenceAudioUrls.length,
    referenceImageUrls.length,
    referenceVideoDurations,
    referenceVideoUrls.length,
    resolution
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('newSession') === '1') {
      setActiveSessionId(undefined);
      setSessionTurns([]);
      setProgressTasks([]);
      setPendingSessionSubmission(null);
      setPrompt('');
      setReferenceImageUrls([]);
      setReferenceVideoUrls([]);
      setReferenceVideoDurations([]);
      setReferenceAudioUrls([]);
      setReferenceAudioDurations([]);
      setFirstFrameUrl('');
      setLastFrameUrl('');
      return;
    }
    setActiveSessionId(params.get('sessionId') || undefined);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const routeState =
      location.state && typeof location.state === 'object'
        ? (location.state as Record<string, unknown>)
        : null;
    const statePrompt =
      routeState && typeof routeState.promptCasePrompt === 'string'
        ? routeState.promptCasePrompt.trim()
        : routeState && typeof routeState.prompt === 'string'
          ? routeState.prompt.trim()
          : '';
    const stateImageUrl =
      routeState && typeof routeState.imageUrl === 'string'
        ? routeState.imageUrl.trim()
        : '';
    const routeCaseId = params.get('caseId') || params.get('case') || '';
    const routeCaseSlug = params.get('caseSlug') || params.get('slug') || '';

    if (statePrompt || stateImageUrl) {
      if (statePrompt) setPrompt(statePrompt);
      if (stateImageUrl) {
        setFirstFrameUrl(stateImageUrl);
        setLastFrameUrl('');
      }
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!routeCaseId && !routeCaseSlug) return;

    let cancelled = false;
    const editVersionAtImportStart = promptUserEditVersionRef.current;
    const lookup = routeCaseId || routeCaseSlug;
    const lookupMode = routeCaseId ? 'id' : 'slug';
    const source = params.get('source') || 'prompt_case_url';

    resolvePromptCaseRouteImport({
      lookup,
      lookupMode,
      locale: isEnglish ? 'en-US' : 'zh-CN',
      source,
      getCase: getPublicPromptCase
    })
      .then((result) => {
        if (cancelled) return;
        if (
          result.status === 'ready' &&
          promptUserEditVersionRef.current === editVersionAtImportStart
        ) {
          setPrompt(result.payload.prompt);
        }
        navigate(location.pathname, { replace: true, state: null });
      })
      .catch((importError) => {
        if (cancelled) return;
        console.warn('[CreateVideo] prompt case import failed:', importError);
        navigate(location.pathname, { replace: true, state: null });
      });

    return () => {
      cancelled = true;
    };
  }, [isEnglish, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!activeSessionId || !isAuthenticated) {
      setSessionTurns([]);
      return;
    }
    let cancelled = false;
    listImageSessionTurns(activeSessionId)
      .then((turns) => {
        if (!cancelled) setSessionTurns(turns);
      })
      .catch((sessionError) => {
        if (!cancelled) {
          setSessionTurns([]);
          setError(
            sessionError instanceof Error ? sessionError.message : copy.failed
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, copy.failed, isAuthenticated]);

  const selectModel = useCallback(
    (nextModelId: SeedanceVideoModelId) => {
      const nextModel =
        runtimeModels.find((item) => item.id === nextModelId) ||
        getSeedanceVideoModelConfig(nextModelId);
      setModelId(nextModel.id);
      setAspectRatio((current) =>
        nextModel.supportedAspectRatios.includes(current)
          ? current
          : nextModel.defaultAspectRatio
      );
      setDuration((current) =>
        nextModel.supportedDurations.includes(current)
          ? current
          : nextModel.defaultDuration
      );
      setResolution((current) =>
        nextModel.supportedResolutions.includes(current)
          ? current
          : nextModel.defaultResolution
      );
      setGenerateAudio(nextModel.defaultGenerateAudio);
    },
    [runtimeModels]
  );

  const setFrameUrl = useCallback((slot: VideoFrameSlot, value: string) => {
    if (slot === 'first') setFirstFrameUrl(value);
    else setLastFrameUrl(value);
  }, []);

  const openFrameGallery = useCallback(
    async (target: VideoGalleryTarget) => {
      if (authLoading) return;
      if (!isAuthenticated) {
        setError(copy.loginRequired);
        return;
      }
      if (
        target === 'reference' &&
        referenceImageUrls.length >= model.maxReferenceImages
      ) {
        setError(copy.referenceLimit(model.maxReferenceImages));
        return;
      }
      if (target === 'reference' && creationMode === 'first-last-frame') {
        setError(copy.incompatibleReferenceModes);
        return;
      }
      if (
        target !== 'reference' &&
        referenceImageUrls.length +
          referenceVideoUrls.length +
          referenceAudioUrls.length >
          0
      ) {
        setError(copy.incompatibleReferenceModes);
        return;
      }
      setFrameGallerySlot(target);
      setFrameGalleryError('');
      if (frameGalleryItems.length > 0) return;
      setFrameGalleryLoading(true);
      try {
        const result = await getVisualImageHistoryResult(
          VIDEO_FRAME_GALLERY_PAGE_SIZE
        );
        setFrameGalleryItems(result.items);
        setFrameGalleryTotal(result.total);
      } catch (galleryError) {
        setFrameGalleryError(
          galleryError instanceof Error
            ? galleryError.message
            : copy.galleryFailed
        );
      } finally {
        setFrameGalleryLoading(false);
      }
    },
    [
      authLoading,
      copy,
      frameGalleryItems.length,
      isAuthenticated,
      model.maxReferenceImages,
      referenceImageUrls.length,
      referenceVideoUrls.length,
      referenceAudioUrls.length,
      creationMode
    ]
  );

  const loadMoreFrameGallery = useCallback(async () => {
    if (frameGalleryLoadingMore) return;
    setFrameGalleryLoadingMore(true);
    setFrameGalleryError('');
    try {
      const result = await getVisualImageHistoryResult(
        VIDEO_FRAME_GALLERY_PAGE_SIZE,
        frameGalleryItems.length
      );
      setFrameGalleryItems((current) => [...current, ...result.items]);
      setFrameGalleryTotal(result.total);
    } catch (galleryError) {
      setFrameGalleryError(
        galleryError instanceof Error
          ? galleryError.message
          : copy.galleryFailed
      );
    } finally {
      setFrameGalleryLoadingMore(false);
    }
  }, [copy.galleryFailed, frameGalleryItems.length, frameGalleryLoadingMore]);

  const selectFrameFromGallery = useCallback(
    (item: VisualImageHistoryItem) => {
      if (!frameGallerySlot) return;
      const imageUrl =
        item.previewUrl || item.imageUrl || item.thumbnailUrl || '';
      if (!imageUrl) {
        setFrameGalleryError(copy.galleryEmpty);
        return;
      }
      if (frameGallerySlot === 'reference') {
        setReferenceImageUrls((current) =>
          current.includes(imageUrl)
            ? current
            : [...current, imageUrl].slice(0, model.maxReferenceImages)
        );
        setWebSearch(false);
      } else {
        setFrameUrl(frameGallerySlot, imageUrl);
        setWebSearch(false);
      }
      setFrameGallerySlot(null);
      setError('');
    },
    [copy.galleryEmpty, frameGallerySlot, model.maxReferenceImages, setFrameUrl]
  );

  const openReferenceUpload = useCallback(
    (mediaType: ReferenceMediaType) => {
      if (authLoading) return;
      if (!isAuthenticated) {
        setError(copy.loginRequired);
        return;
      }
      if (creationMode === 'first-last-frame') {
        setError(copy.incompatibleReferenceModes);
        return;
      }
      if (
        mediaType === 'image' &&
        referenceImageUrls.length >= model.maxReferenceImages
      ) {
        setError(copy.referenceLimit(model.maxReferenceImages));
        return;
      }
      if (
        mediaType === 'video' &&
        referenceVideoUrls.length >= model.maxReferenceVideos
      ) {
        setError(copy.referenceVideoLimit(model.maxReferenceVideos));
        return;
      }
      if (
        mediaType === 'audio' &&
        referenceAudioUrls.length >= model.maxReferenceAudios
      ) {
        setError(copy.referenceAudioLimit(model.maxReferenceAudios));
        return;
      }
      if (mediaType === 'image') referenceInputRef.current?.click();
      if (mediaType === 'video') referenceVideoInputRef.current?.click();
      if (mediaType === 'audio') referenceAudioInputRef.current?.click();
    },
    [
      authLoading,
      copy,
      creationMode,
      isAuthenticated,
      model.maxReferenceAudios,
      model.maxReferenceImages,
      model.maxReferenceVideos,
      referenceAudioUrls.length,
      referenceImageUrls.length,
      referenceVideoUrls.length
    ]
  );

  const openFrameUpload = useCallback(
    (slot: VideoFrameSlot) => {
      if (authLoading) return;
      if (!isAuthenticated) {
        setError(copy.loginRequired);
        return;
      }
      if (
        referenceImageUrls.length +
          referenceVideoUrls.length +
          referenceAudioUrls.length >
        0
      ) {
        setError(copy.incompatibleReferenceModes);
        return;
      }
      if (slot === 'first') firstFrameInputRef.current?.click();
      else lastFrameInputRef.current?.click();
    },
    [
      authLoading,
      copy.incompatibleReferenceModes,
      copy.loginRequired,
      isAuthenticated,
      referenceAudioUrls.length,
      referenceImageUrls.length,
      referenceVideoUrls.length
    ]
  );

  const handleReferenceImageFiles = useCallback(
    async (files: File[]) => {
      if (
        files.length === 0 ||
        authLoading ||
        referenceImageUploadPendingRef.current
      ) {
        return;
      }
      if (!isAuthenticated) {
        setError(copy.loginRequired);
        return;
      }
      if (creationMode === 'first-last-frame') {
        setError(copy.incompatibleReferenceModes);
        return;
      }
      const remaining = model.maxReferenceImages - referenceImageUrls.length;
      if (remaining <= 0) {
        setError(copy.referenceLimit(model.maxReferenceImages));
        return;
      }
      const selectedFiles = files
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, remaining);
      if (selectedFiles.length === 0) {
        setError(copy.uploadFailed('reference'));
        return;
      }

      referenceImageUploadPendingRef.current = true;
      setReferenceUploading('image');
      setError('');
      try {
        const results = await Promise.all(
          selectedFiles.map(async (file, index) => {
            try {
              const imageBase64 = await fileToDataUrl(file);
              const fileName = file.name || `clipboard-image-${index + 1}`;
              const reference = await uploadImageReference({
                imageBase64,
                mimeType: file.type || 'image/png',
                role: 'style',
                label: fileName.replace(/\.[^.]+$/, '').slice(0, 80),
                sourceApp: 'create_video_page'
              });
              if (!reference.thumbnailUrl) {
                throw new Error(copy.uploadFailed('reference'));
              }
              return {
                status: 'uploaded' as const,
                url: reference.thumbnailUrl
              };
            } catch (uploadError) {
              return {
                status: 'failed' as const,
                error:
                  uploadError instanceof Error
                    ? uploadError.message
                    : copy.uploadFailed('reference')
              };
            }
          })
        );
        const uploadedUrls = results.flatMap((result) =>
          result.status === 'uploaded' ? [result.url] : []
        );
        const failedResult = results.find(
          (result) => result.status === 'failed'
        );

        if (uploadedUrls.length > 0) {
          setReferenceImageUrls((current) =>
            Array.from(new Set([...current, ...uploadedUrls])).slice(
              0,
              model.maxReferenceImages
            )
          );
          setWebSearch(false);
          setStatus(
            uploadedUrls.length === 1
              ? copy.uploaded('reference')
              : isEnglish
                ? `${uploadedUrls.length} reference images uploaded.`
                : `已上传 ${uploadedUrls.length} 张参考图。`
          );
        }
        if (failedResult?.status === 'failed') setError(failedResult.error);
      } finally {
        referenceImageUploadPendingRef.current = false;
        setReferenceUploading(null);
      }
    },
    [
      authLoading,
      copy,
      creationMode,
      isAuthenticated,
      isEnglish,
      model.maxReferenceImages,
      referenceImageUrls.length
    ]
  );

  const handleMediaUpload = useCallback(
    async (
      target: VideoGalleryTarget,
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      if (target === 'reference') {
        await handleReferenceImageFiles(files);
        return;
      }
      const file = files[0] || null;
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setError(copy.uploadFailed(target));
        return;
      }
      setFrameUploadSlot(target);
      setError('');
      try {
        const imageBase64 = await fileToDataUrl(file);
        const reference = await uploadImageReference({
          imageBase64,
          mimeType: file.type,
          role: 'style',
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
          sourceApp: 'create_video_page'
        });
        if (!reference.thumbnailUrl) throw new Error(copy.uploadFailed(target));
        setFrameUrl(target, reference.thumbnailUrl);
        setWebSearch(false);
        setStatus(copy.uploaded(target));
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : copy.uploadFailed(target)
        );
      } finally {
        setFrameUploadSlot(null);
      }
    },
    [copy, handleReferenceImageFiles, setFrameUrl]
  );

  const handleReferenceMediaUpload = useCallback(
    async (
      mediaType: 'video' | 'audio',
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const file = event.currentTarget.files?.[0] || null;
      event.currentTarget.value = '';
      if (!file) return;
      setReferenceUploading(mediaType);
      setError('');
      try {
        const locale = isEnglish ? 'en-US' : 'zh-CN';
        const fileSizeIssue = validateReferenceMediaFileSize({
          mediaType,
          fileSizeBytes: file.size,
          locale
        });
        if (fileSizeIssue) throw new Error(fileSizeIssue.message);
        let metadata: Awaited<ReturnType<typeof readMediaMetadata>>;
        try {
          metadata = await readMediaMetadata(file, mediaType);
        } catch {
          throw new Error(getReferenceMediaReadError(mediaType, locale));
        }
        const issue = validateReferenceMedia({
          mediaType,
          fileSizeBytes: file.size,
          metadata,
          existingDurations:
            mediaType === 'video'
              ? referenceVideoDurations
              : referenceAudioDurations,
          maxDurationSeconds: model.maxReferenceMediaDurationSeconds,
          locale
        });
        if (issue) throw new Error(issue.message);
        const uploaded = await uploadVideoReferenceMedia(file, mediaType);
        if (mediaType === 'video') {
          setReferenceVideoUrls((current) => [...current, uploaded.mediaUrl]);
          setReferenceVideoDurations((current) => [
            ...current,
            metadata.duration
          ]);
        } else {
          setReferenceAudioUrls((current) => [...current, uploaded.mediaUrl]);
          setReferenceAudioDurations((current) => [
            ...current,
            metadata.duration
          ]);
        }
        setWebSearch(false);
        setStatus(
          mediaType === 'video'
            ? isEnglish
              ? 'Reference video uploaded.'
              : '参考视频已上传。'
            : isEnglish
              ? 'Reference audio uploaded.'
              : '参考音频已上传。'
        );
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : getReferenceMediaReadError(
                mediaType,
                isEnglish ? 'en-US' : 'zh-CN'
              )
        );
      } finally {
        setReferenceUploading(null);
      }
    },
    [
      isEnglish,
      model.maxReferenceMediaDurationSeconds,
      referenceAudioDurations,
      referenceVideoDurations
    ]
  );

  const appendPromptMention = useCallback((token: string) => {
    promptUserEditVersionRef.current += 1;
    setPrompt((current) => {
      if (current.includes(token)) return current;
      return current.trim() ? `${current.trimEnd()}\n${token} ` : `${token} `;
    });
    window.requestAnimationFrame(() => {
      const textarea = document.getElementById(
        'video-studio-prompt'
      ) as HTMLTextAreaElement | null;
      textarea?.focus();
      if (textarea) {
        textarea.setSelectionRange(
          textarea.value.length,
          textarea.value.length
        );
      }
    });
  }, []);

  const mentionReference = useCallback(
    (mediaType: ReferenceMediaType, index: number) => {
      const labels = isEnglish
        ? { image: 'Image', video: 'Video', audio: 'Audio' }
        : { image: '图片', video: '视频', audio: '音频' };
      appendPromptMention(`@${labels[mediaType]}${index + 1}`);
    },
    [appendPromptMention, isEnglish]
  );

  const mentionFrame = useCallback(
    (slot: VideoFrameSlot) => {
      const token =
        slot === 'first'
          ? isEnglish
            ? '@First frame'
            : '@首帧'
          : isEnglish
            ? '@Last frame'
            : '@尾帧';
      appendPromptMention(token);
    },
    [appendPromptMention, isEnglish]
  );

  const clearReference = useCallback(
    (mediaType: ReferenceMediaType, index: number) => {
      if (mediaType === 'image') {
        setReferenceImageUrls((current) =>
          current.filter((_, currentIndex) => currentIndex !== index)
        );
      } else if (mediaType === 'video') {
        setReferenceVideoUrls((current) =>
          current.filter((_, currentIndex) => currentIndex !== index)
        );
        setReferenceVideoDurations((current) =>
          current.filter((_, currentIndex) => currentIndex !== index)
        );
      } else {
        setReferenceAudioUrls((current) =>
          current.filter((_, currentIndex) => currentIndex !== index)
        );
        setReferenceAudioDurations((current) =>
          current.filter((_, currentIndex) => currentIndex !== index)
        );
      }
      const zhLabel =
        mediaType === 'image'
          ? '(?:参考图|图片)'
          : mediaType === 'video'
            ? '视频'
            : '音频';
      const enLabel =
        mediaType === 'image'
          ? '(?:Reference|Image)'
          : mediaType === 'video'
            ? 'Video'
            : 'Audio';
      const nextZhLabel =
        mediaType === 'image'
          ? '图片'
          : mediaType === 'video'
            ? '视频'
            : '音频';
      const nextEnLabel =
        mediaType === 'image'
          ? 'Image'
          : mediaType === 'video'
            ? 'Video'
            : 'Audio';
      setPrompt((current) => {
        let next = current
          .replace(
            new RegExp(
              `(?:^|\\n)@(?:${zhLabel}\\s*${index + 1}|${enLabel}\\s*${index + 1})[ \\t]*`,
              'gi'
            ),
            '\n'
          )
          .replace(/^\n+/, '');
        for (
          let currentIndex = index + 1;
          currentIndex < 10;
          currentIndex += 1
        ) {
          next = next
            .replace(
              new RegExp(`@${zhLabel}\\s*${currentIndex + 1}`, 'g'),
              `@${nextZhLabel}${currentIndex}`
            )
            .replace(
              new RegExp(`@${enLabel}\\s*${currentIndex + 1}`, 'gi'),
              `@${nextEnLabel}${currentIndex}`
            );
        }
        if (next === current) return current;
        promptUserEditVersionRef.current += 1;
        return next;
      });
    },
    []
  );

  const clearFrameReference = useCallback(
    (slot: VideoFrameSlot) => {
      setFrameUrl(slot, '');
      const mentionPattern =
        slot === 'first'
          ? /(?:^|\n)@(?:首帧(?:图片)?|First frame(?: image)?)[ \t]*/gi
          : /(?:^|\n)@(?:尾帧(?:图片)?|Last frame(?: image)?)[ \t]*/gi;
      setPrompt((current) => {
        const next = current.replace(mentionPattern, '\n').replace(/^\n+/, '');
        if (next === current) return current;
        promptUserEditVersionRef.current += 1;
        return next;
      });
    },
    [setFrameUrl]
  );

  const requestPromptOptimization = useCallback(
    (value: string) =>
      optimizeVideoPrompt({
        prompt: normalizeVideoFrameMentions(value),
        locale: isEnglish ? 'en-US' : 'zh-CN',
        model: model.label,
        aspectRatio,
        duration,
        resolution,
        generateAudio,
        referenceImageCount: referenceImageUrls.length,
        referenceVideoCount: referenceVideoUrls.length,
        referenceAudioCount: referenceAudioUrls.length,
        hasFirstFrame: Boolean(firstFrameUrl),
        hasLastFrame: Boolean(lastFrameUrl)
      }),
    [
      aspectRatio,
      duration,
      firstFrameUrl,
      generateAudio,
      isEnglish,
      lastFrameUrl,
      model.label,
      referenceImageUrls.length,
      referenceVideoUrls.length,
      referenceAudioUrls.length,
      resolution
    ]
  );

  const optimizeCurrentPrompt = useCallback(async () => {
    const value = prompt.trim();
    if (!value) {
      setError(copy.noPrompt);
      return;
    }
    if (authLoading) return;
    if (!isAuthenticated) {
      setError(copy.loginRequired);
      return;
    }
    const editVersion = promptUserEditVersionRef.current;
    setPromptOptimizing(true);
    setError('');
    setStatus(copy.optimizingPrompt);
    try {
      const optimized = await requestPromptOptimization(value);
      if (promptUserEditVersionRef.current !== editVersion) {
        setStatus(copy.promptChangedDuringOptimize);
        return;
      }
      const nextPrompt = mergeOptimizedVideoPrompt(
        optimized.optimizedPrompt,
        optimized.optimizedNegativePrompt,
        value,
        isEnglish
      );
      lastOptimizationRef.current = {
        prompt: nextPrompt,
        contextKey: promptOptimizationContextKey
      };
      setPrompt(nextPrompt);
      setStatus(optimized.summary || copy.optimizedPrompt);
    } catch (optimizeError) {
      setStatus('');
      setError(
        toUserFacingError(
          optimizeError,
          copy.optimizeFailed,
          isEnglish ? 'en-US' : 'zh-CN'
        )
      );
    } finally {
      setPromptOptimizing(false);
    }
  }, [
    authLoading,
    copy,
    isEnglish,
    isAuthenticated,
    prompt,
    promptOptimizationContextKey,
    requestPromptOptimization
  ]);

  const ensureCreationSession = useCallback(
    async (firstPrompt: string): Promise<string> => {
      if (activeSessionId) return activeSessionId;
      if (activeSessionPromiseRef.current)
        return activeSessionPromiseRef.current;
      const promise = createImageSession(firstPrompt, 'video')
        .then((session) => {
          upsertCachedImageCreationSession(
            user?.id || 'authenticated-user',
            session
          );
          setActiveSessionId(session.id);
          const params = new URLSearchParams(location.search);
          params.delete('newSession');
          params.set('sessionId', session.id);
          navigate(`${location.pathname}?${params}`, { replace: true });
          window.dispatchEvent(
            new CustomEvent('creation-session-changed', {
              detail: { refresh: false }
            })
          );
          return session.id;
        })
        .finally(() => {
          activeSessionPromiseRef.current = null;
        });
      activeSessionPromiseRef.current = promise;
      return promise;
    },
    [activeSessionId, location.pathname, location.search, navigate, user?.id]
  );

  const monitorVideoTask = useCallback(
    (input: {
      taskId: string;
      sessionId: string;
      prompt: string;
      modelLabel: string;
      aspectRatio: string;
      pollAfterMs?: number;
    }) => {
      setProgressTasks((current) =>
        current.map((task) =>
          task.key === input.taskId ? { ...task, status: 'running' } : task
        )
      );
      void waitForVisualVideoTask(input.taskId, input.pollAfterMs)
        .then(async (result) => {
          const generation = result.generation;
          if (!generation?.generationId) {
            throw new Error(copy.failed);
          }
          const optimisticTurn: ImageCreationTurn = {
            id: `video-turn-${input.taskId}`,
            sessionId: input.sessionId,
            prompt: input.prompt,
            status: 'succeeded',
            context: { sessionId: input.sessionId, referenceAssetIds: [] },
            generationIds: [generation.generationId],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          setSessionTurns((current) => [...current, optimisticTurn]);
          setProgressTasks((current) =>
            current.map((task) =>
              task.key === input.taskId
                ? {
                    ...task,
                    status: 'succeeded',
                    generationIds: [generation.generationId],
                    label: copy.completed
                  }
                : task
            )
          );
          try {
            const turn = await createImageSessionTurn(input.sessionId, {
              prompt: input.prompt,
              status: 'succeeded',
              context: { sessionId: input.sessionId, referenceAssetIds: [] },
              generationIds: [generation.generationId]
            });
            setSessionTurns((current) =>
              current.map((item) =>
                item.id === optimisticTurn.id ? turn : item
              )
            );
          } catch (turnError) {
            console.warn(
              '[CreateVideo] persist session turn failed',
              turnError
            );
            setError(
              isEnglish
                ? 'The video is ready, but the session record could not be synchronized.'
                : '视频已生成，但会话记录暂未同步。'
            );
          }
          updateCachedImageCreationSessionCover(
            user?.id || 'authenticated-user',
            input.sessionId,
            {
              coverGenerationId: generation.generationId,
              coverImageUrl: generation.posterUrl
            }
          );
          setStatus(copy.completed);
          window.dispatchEvent(
            new CustomEvent('creation-session-changed', {
              detail: { refresh: false }
            })
          );
        })
        .catch(async (taskError) => {
          const message =
            taskError instanceof Error ? taskError.message : copy.failed;
          setError(message);
          try {
            const turn = await createImageSessionTurn(input.sessionId, {
              prompt: input.prompt,
              status: 'failed',
              context: { sessionId: input.sessionId, referenceAssetIds: [] },
              errorMessage: message
            });
            setSessionTurns((current) => [...current, turn]);
          } catch {
            // The task error remains visible even if session persistence fails.
          }
        })
        .finally(() => {
          setProgressTasks((current) =>
            current.filter((task) => task.key !== input.taskId)
          );
          window.dispatchEvent(new CustomEvent('credits-changed'));
        });
    },
    [copy.completed, copy.failed, isEnglish, user?.id]
  );

  const submit = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError(copy.noPrompt);
      return;
    }
    if (authLoading) return;
    if (!videoAvailable) {
      setError(availabilityMessage || copy.maintenance);
      return;
    }
    if (!isAuthenticated) {
      setError(copy.loginRequired);
      return;
    }
    if (creationMode === 'first-last-frame' && !firstFrameUrl.trim()) {
      setError(copy.noFirstFrame);
      return;
    }
    if (referenceImageUrls.length > model.maxReferenceImages) {
      setError(copy.referenceLimit(model.maxReferenceImages));
      return;
    }
    if (referenceVideoUrls.length > model.maxReferenceVideos) {
      setError(copy.referenceVideoLimit(model.maxReferenceVideos));
      return;
    }
    if (referenceAudioUrls.length > model.maxReferenceAudios) {
      setError(copy.referenceAudioLimit(model.maxReferenceAudios));
      return;
    }
    const referenceMediaCount =
      referenceImageUrls.length +
      referenceVideoUrls.length +
      referenceAudioUrls.length;
    if (creationMode === 'first-last-frame' && referenceMediaCount > 0) {
      setError(copy.incompatibleReferenceModes);
      return;
    }
    if (
      referenceAudioUrls.length > 0 &&
      referenceImageUrls.length + referenceVideoUrls.length === 0
    ) {
      setError(copy.audioNeedsVisual);
      return;
    }
    if (
      webSearch &&
      (referenceMediaCount > 0 || creationMode === 'first-last-frame')
    ) {
      setError(
        isEnglish
          ? 'Web search is available only for text-only generation.'
          : '联网搜索仅支持纯文本生成。'
      );
      return;
    }

    setSubmitting(true);
    setError('');
    setStatus('');
    setPendingSessionSubmission({
      key: `video-submission-${Date.now()}`,
      prompt: trimmedPrompt,
      modelLabel: model.label,
      aspectRatio,
      imageCount: quantity,
      label: copy.pending,
      status: 'queued',
      detail: copy.pendingHint
    });
    let queued = 0;
    let failed = 0;
    let optimizationWarning = '';
    try {
      let promptToSubmit = trimmedPrompt;
      const matchesLastOptimization =
        lastOptimizationRef.current?.prompt === trimmedPrompt &&
        lastOptimizationRef.current.contextKey === promptOptimizationContextKey;
      if (autoOptimize && !matchesLastOptimization) {
        const editVersion = promptUserEditVersionRef.current;
        setPromptOptimizing(true);
        setStatus(copy.optimizingPrompt);
        try {
          const optimized = await requestPromptOptimization(trimmedPrompt);
          promptToSubmit = mergeOptimizedVideoPrompt(
            optimized.optimizedPrompt,
            optimized.optimizedNegativePrompt,
            trimmedPrompt,
            isEnglish
          );
          lastOptimizationRef.current = {
            prompt: promptToSubmit,
            contextKey: promptOptimizationContextKey
          };
          if (promptUserEditVersionRef.current === editVersion) {
            setPrompt(promptToSubmit);
          }
        } catch (optimizeError) {
          const reason = toUserFacingError(
            optimizeError,
            copy.optimizeFailed,
            isEnglish ? 'en-US' : 'zh-CN'
          );
          optimizationWarning = isEnglish
            ? `Prompt optimization was skipped and the original prompt was submitted. Reason: ${reason}`
            : `自动优化失败，已使用原提示词继续提交。原因：${reason}`;
          setStatus(optimizationWarning);
        } finally {
          setPromptOptimizing(false);
        }
      }
      const submissionPrompt = buildSubmissionPrompt({
        prompt: promptToSubmit,
        mode: creationMode,
        referenceImageCount: referenceImageUrls.length,
        referenceVideoCount: referenceVideoUrls.length,
        referenceAudioCount: referenceAudioUrls.length,
        resolution,
        isEnglish
      });
      const sessionId = await ensureCreationSession(trimmedPrompt);
      submissionScrollRef.current = true;
      for (let index = 0; index < quantity; index += 1) {
        try {
          const task = await enqueueVisualVideoTask({
            prompt: submissionPrompt,
            model: model.id,
            aspectRatio,
            duration,
            resolution,
            generateAudio,
            outputFormat: 'mp4',
            referenceMode: 'reference',
            referenceImageUrls,
            referenceVideoUrls,
            referenceVideoDurations,
            referenceAudioUrls,
            firstFrameUrl: firstFrameUrl.trim() || undefined,
            lastFrameUrl: lastFrameUrl.trim() || undefined,
            watermark,
            webSearch
          });
          queued += 1;
          setProgressTasks((current) => [
            ...current,
            {
              key: task.taskId,
              sessionId,
              prompt: trimmedPrompt,
              modelLabel: model.label,
              aspectRatio,
              imageCount: 1,
              label: copy.pending,
              status: 'queued',
              detail: copy.pendingHint
            }
          ]);
          monitorVideoTask({
            taskId: task.taskId,
            sessionId,
            prompt: trimmedPrompt,
            modelLabel: model.label,
            aspectRatio,
            pollAfterMs: task.pollAfterMs
          });
        } catch (submissionError) {
          failed += 1;
          if (failed === quantity) throw submissionError;
        }
      }
      const queuedStatus =
        failed > 0 ? copy.queuedPartial(queued, failed) : copy.queued(queued);
      setStatus(
        optimizationWarning
          ? `${queuedStatus} ${optimizationWarning}`
          : queuedStatus
      );
      window.dispatchEvent(new CustomEvent('credits-changed'));
      setPrompt('');
    } catch (submitError) {
      setPromptOptimizing(false);
      setError(
        toUserFacingError(
          submitError,
          copy.failed,
          isEnglish ? 'en-US' : 'zh-CN'
        )
      );
    } finally {
      setSubmitting(false);
      setPendingSessionSubmission(null);
    }
  }, [
    aspectRatio,
    authLoading,
    autoOptimize,
    availabilityMessage,
    copy,
    creationMode,
    duration,
    firstFrameUrl,
    generateAudio,
    isAuthenticated,
    isEnglish,
    ensureCreationSession,
    lastFrameUrl,
    model.label,
    model.id,
    model.maxReferenceAudios,
    model.maxReferenceImages,
    model.maxReferenceVideos,
    monitorVideoTask,
    prompt,
    promptOptimizationContextKey,
    quantity,
    requestPromptOptimization,
    referenceImageUrls,
    referenceVideoUrls,
    referenceVideoDurations,
    referenceAudioUrls,
    resolution,
    watermark,
    webSearch,
    videoAvailable
  ]);

  const goToLogin = useCallback(() => {
    navigate(
      `/login?redirect=${encodeURIComponent(location.pathname)}&source=create_video`
    );
  }, [location.pathname, navigate]);

  const downloadVideo = useCallback((item: VisualVideoGenerationItem) => {
    window.open(item.videoUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const regenerateVideo = useCallback(
    (item: VisualVideoGenerationItem) => {
      setPrompt(item.prompt || '');
      if (
        item.aspectRatio &&
        model.supportedAspectRatios.includes(item.aspectRatio)
      ) {
        setAspectRatio(item.aspectRatio);
      }
      if (item.duration && model.supportedDurations.includes(item.duration)) {
        setDuration(item.duration);
      }
      const knownModel = SEEDANCE_VIDEO_MODELS.find(
        (candidate) => candidate.id === item.model
      );
      if (knownModel) selectModel(knownModel.id);
      window.requestAnimationFrame(() => {
        document.getElementById('video-studio-prompt')?.focus();
      });
    },
    [model.supportedAspectRatios, model.supportedDurations, selectModel]
  );

  const copySessionPrompt = useCallback(
    async (value: string) => {
      if (!value.trim()) return false;
      try {
        await navigator.clipboard.writeText(value);
        setStatus(isEnglish ? 'Prompt copied.' : '提示词已复制。');
        return true;
      } catch {
        return false;
      }
    },
    [isEnglish]
  );
  const openImageEditorFromSessionItem = useCallback(
    (item: CreationSessionHistoryItem) => {
      const entry = createImageEditorEntryState(item);
      if (!entry) return;
      navigate(
        localizeCreateHref(
          '/tools/image-editor',
          isEnglish ? '/en-US' : '/zh-CN'
        ),
        { state: entry }
      );
    },
    [isEnglish, navigate]
  );

  return (
    <CreateWorkspaceFrame className="create-video-route video-studio-v2">
      <section
        className="video-studio-shell"
        data-empty={isEmpty ? 'true' : 'false'}
      >
        <div className="video-studio-content">
          {isEmpty ? (
            <header className="video-studio-intro">
              <span aria-hidden="true">
                <Film />
              </span>
              <h1>{model.label}</h1>
              <p>{copy.intro}</p>
            </header>
          ) : (
            <ImageSessionConversation
              mediaType="video"
              turns={sessionTurns}
              progressTasks={sessionProgressTasks}
              historyById={sessionConversation.historyById}
              missingIds={sessionConversation.missingIds}
              loading={sessionConversation.loading}
              onPreview={(item) => {
                if ('videoUrl' in item) setPreviewVideo(item);
              }}
              onDownload={(item) => {
                if ('videoUrl' in item) downloadVideo(item);
              }}
              onRegenerate={(item) => {
                if ('videoUrl' in item) regenerateVideo(item);
              }}
              onFavorite={(item) => {
                if ('videoUrl' in item) void toggleVideoFavorite(item);
              }}
              onCopyPrompt={copySessionPrompt}
              isEnglish={isEnglish}
              onEditInEditor={openImageEditorFromSessionItem}
            />
          )}

          <VideoStudioComposer
            isEnglish={isEnglish}
            prompt={prompt}
            onPromptChange={(value) => {
              promptUserEditVersionRef.current += 1;
              setPrompt(value);
            }}
            model={model}
            models={runtimeModels}
            onModelChange={selectModel}
            creationMode={creationMode}
            referenceImageUrls={referenceImageUrls}
            referenceVideoUrls={referenceVideoUrls}
            referenceAudioUrls={referenceAudioUrls}
            referenceUploading={referenceUploading}
            onOpenReferenceGallery={() => void openFrameGallery('reference')}
            onOpenReferenceUpload={openReferenceUpload}
            onPasteReferenceImages={handleReferenceImageFiles}
            onMentionReference={mentionReference}
            onClearReference={clearReference}
            firstFrameUrl={firstFrameUrl}
            lastFrameUrl={lastFrameUrl}
            frameUploadSlot={frameUploadSlot}
            onOpenFrameGallery={(slot) => void openFrameGallery(slot)}
            onOpenFrameUpload={openFrameUpload}
            onMentionFrame={mentionFrame}
            onClearFrame={clearFrameReference}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            duration={duration}
            onDurationChange={setDuration}
            resolution={resolution}
            onResolutionChange={setResolution}
            generateAudio={generateAudio}
            onGenerateAudioChange={setGenerateAudio}
            watermark={watermark}
            onWatermarkChange={setWatermark}
            webSearch={webSearch}
            onWebSearchChange={setWebSearch}
            quantity={quantity}
            onQuantityChange={setQuantity}
            autoOptimize={autoOptimize}
            onAutoOptimizeChange={setAutoOptimize}
            optimizingPrompt={promptOptimizing}
            onOptimizePrompt={() => void optimizeCurrentPrompt()}
            estimatedCost={totalCost}
            estimatedCostPerSecond={estimatedCostPerSecond}
            pendingTaskCount={activeTaskCount}
            submitting={submitting}
            availabilityLoading={availabilityLoading}
            available={videoAvailable}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            error={error}
            status={status}
            onRandomPrompt={() => {
              const samples = isEnglish ? SAMPLE_PROMPTS.en : SAMPLE_PROMPTS.zh;
              setPrompt(samples[Math.floor(Math.random() * samples.length)]);
            }}
            onGenerate={() => void submit()}
            onLogin={goToLogin}
          />
        </div>
      </section>

      <input
        ref={referenceInputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={copy.galleryTitle('reference')}
        onChange={(event) => void handleMediaUpload('reference', event)}
      />
      <input
        ref={referenceVideoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        hidden
        aria-label={isEnglish ? 'Upload reference video' : '上传参考视频'}
        onChange={(event) => void handleReferenceMediaUpload('video', event)}
      />
      <input
        ref={referenceAudioInputRef}
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
        hidden
        aria-label={isEnglish ? 'Upload reference audio' : '上传参考音频'}
        onChange={(event) => void handleReferenceMediaUpload('audio', event)}
      />
      <input
        ref={firstFrameInputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={copy.galleryTitle('first')}
        onChange={(event) => void handleMediaUpload('first', event)}
      />
      <input
        ref={lastFrameInputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={copy.galleryTitle('last')}
        onChange={(event) => void handleMediaUpload('last', event)}
      />

      {previewVideo ? (
        <VideoHistoryPreviewDialog
          item={previewVideo}
          dateLocale={isEnglish ? 'en-US' : 'zh-CN'}
          onClose={() => setPreviewVideo(null)}
          onReuse={() => regenerateVideo(previewVideo)}
          onFavorite={() => void toggleVideoFavorite(previewVideo)}
          favoriteLoading={favoriteLoadingIds.has(previewVideo.generationId)}
        />
      ) : null}

      {frameGallerySlot ? (
        <HistoryGalleryModal
          mode="preview"
          title={copy.galleryTitle(frameGallerySlot)}
          items={frameGalleryItems}
          total={frameGalleryTotal}
          loading={frameGalleryLoading}
          loadingMore={frameGalleryLoadingMore}
          error={frameGalleryError}
          dateLocale={isEnglish ? 'en-US' : 'zh-CN'}
          onClose={() => setFrameGallerySlot(null)}
          onSelect={selectFrameFromGallery}
          onLoadMore={() => void loadMoreFrameGallery()}
        />
      ) : null}
    </CreateWorkspaceFrame>
  );
}

export default CreateVideoPage;
