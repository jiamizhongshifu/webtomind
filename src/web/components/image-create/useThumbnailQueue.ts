/**
 * 个人素材"AI 缩略图"批量生成队列。
 *
 * 单点重生 + 批量重生统一进 batchQueue,由单例 worker 串行驱动:
 * - batchStatusRef 是真相源(ref),供 long-running worker 在闭包外读最新状态
 * - 每次 mutate 同步 setBatchQueue 用于 UI 渲染
 * - batchCancelRef 让"停止"在当前张完成后退出 loop
 *
 * 从 ImageCreatePage 抽出。页面只负责:提供 userAssets 视图 + setUserAssets +
 * promptLocale + setError/setStatusText,并消费 batchStats / pendingThumbAssets /
 * currentProcessingAsset 拼装进度面板。缩略图风格表(THUMBNAIL_STYLE_BY_SLOT)
 * 与 isAiGeneratedThumbnail 判定也随队列一起内聚到本文件。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateVisualImage,
  regenerateUserPromptAssetThumbnail,
  type UserPromptAsset
} from '@/services/agent-api';
import type {
  ImagePromptAsset,
  ImagePromptSlot,
  PromptLocale
} from '../../data/image-prompt-core';

interface ThumbnailStyle {
  en: string;
  zh: string;
  negativeEn: string;
  negativeZh: string;
}

const SKETCH_NEGATIVE_EN =
  'no photo, no color, no shading, no facial features, no background clutter, no text, no watermark';
const SKETCH_NEGATIVE_ZH =
  '禁止真实照片，禁止颜色，禁止阴影，禁止面部细节，禁止背景杂物，禁止文字水印';
const PHOTO_NEGATIVE_EN =
  'no line art, no sketch, no drawing, no cartoon, no anime, no watermark, no text';
const PHOTO_NEGATIVE_ZH =
  '禁止线稿，禁止素描，禁止绘画，禁止卡通，禁止动漫，禁止文字水印';

// 缩略图风格按 slot 分流:
//   1. pose → 白底黑色细线条 fashion croquis 速写
//   2. 服装/鞋履/配饰/道具/场景/角色/妆容 → 写实产品图 / 实景照片
// 每个 slot 必须自带匹配的 negative，避免风格漂移。
const THUMBNAIL_STYLE_BY_SLOT: Record<ImagePromptSlot, ThumbnailStyle> = {
  character: {
    en: 'Single Chinese woman head-and-shoulders studio portrait photo, plain white background, soft natural light, e-commerce catalog style.',
    zh: '单人东方女性头肩影棚肖像照，白底，柔和自然光，电商目录风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  expression: {
    en: 'Close-up portrait photo of a single Chinese woman clearly demonstrating the described facial expression, plain warm background, soft studio light, no text.',
    zh: '单人东方女性面部特写照，清晰呈现该表情，暖白纯色背景，柔和影棚光，无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  hairstyle: {
    en: 'Head-and-shoulders studio hairstyle reference photo of one adult Chinese woman, complete hair silhouette visible, plain warm background, no ornaments or text.',
    zh: '成年东方女性头肩发型参考照，完整发型轮廓可见，暖白纯色背景，无发饰无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  pose: {
    en: 'Fashion croquis full body figure, plain white background, thin black line art only, no face details.',
    zh: '时装速写全身人体线稿，白底，仅黑色细线，无面部细节。',
    negativeEn: SKETCH_NEGATIVE_EN,
    negativeZh: SKETCH_NEGATIVE_ZH
  },
  top: {
    en: 'Studio product photo of a single top garment, plain white background, no body, no model, e-commerce catalog style.',
    zh: '单件上装影棚产品图，白底，无人体，无模特，电商目录风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  bottom: {
    en: 'Studio product photo of a single bottom garment, plain white background, no body, no model, e-commerce catalog style.',
    zh: '单件下装影棚产品图，白底，无人体，无模特，电商目录风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  outfit: {
    en: 'Full-body studio catalog photo of one adult woman wearing the described coordinated upper-and-lower outfit, plain neutral background, both garments clearly visible.',
    zh: '单位成年女性穿着所述成套上下装的全身影棚目录照，中性纯色背景，上装与下装均清晰可见。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  onePiece: {
    en: 'Full-body studio catalog photo of one adult woman wearing the described single one-piece garment, plain neutral background, continuous silhouette clearly visible.',
    zh: '单位成年女性穿着所述单件一体式服装的全身影棚目录照，中性纯色背景，连续服装廓形清晰可见。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  shoes: {
    en: 'Studio product photo of a single shoe, side profile, plain white background, no foot inside, e-commerce style.',
    zh: '单只鞋款影棚产品图，侧视图，白底，无脚部，电商风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  background: {
    en: 'Empty scene photograph, no people, soft natural light, clean composition.',
    zh: '空旷场景实景照片，无人物，柔和自然光，干净构图。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  productSubject: {
    en: 'Studio product photo of the described commercial subject, plain neutral background, crisp silhouette, no people, e-commerce catalog quality.',
    zh: '描述对象的影棚商业产品图，中性纯净背景，轮廓清晰，无人物，电商目录质感。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  productSurface: {
    en: 'Clean commercial tabletop or display surface scene, no people, no readable text, soft product photography lighting.',
    zh: '干净商业台面或展示环境，无人物，无可读文字，柔和产品摄影光。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  composition: {
    en: 'Minimal commercial composition thumbnail showing subject placement, clear visual hierarchy, no readable text, no people unless required.',
    zh: '极简商业构图缩略图，展示主体位置和视觉层级，无可读文字，非必要不出现人物。',
    negativeEn:
      'no line art, no sketch, no drawing, no cartoon, no anime, no watermark, no readable text, no clutter',
    negativeZh:
      '禁止线稿,禁止素描,禁止绘画,禁止卡通,禁止动漫,禁止水印,禁止可读文字,禁止杂乱'
  },
  titleArea: {
    en: 'Commercial cover thumbnail with a clear blank title safe area, clean hierarchy, no readable text, no logo, no watermark.',
    zh: '商业封面缩略图，明确留出标题安全区，层级干净，无可读文字，无logo，无水印。',
    negativeEn:
      'no line art, no sketch, no drawing, no cartoon, no anime, no watermark, no readable text, no logo',
    negativeZh:
      '禁止线稿,禁止素描,禁止绘画,禁止卡通,禁止动漫,禁止水印,禁止可读文字,禁止logo'
  },
  // style/lighting/lens/shot 全部走"东方女性人像样张"模板,直观表达该 slot 含义,
  // 而不是抽象示意图(用户反馈抽象色块跟实际素材出入大)
  style: {
    en: 'Half-body magazine portrait photo of a young Chinese woman in the described photo style, clean studio background, soft natural light, editorial catalog quality, no text.',
    zh: '年轻东方女性半身写真照,体现该写真风格的气质与视觉,简洁影棚背景,柔和自然光,杂志大片质感,无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  lighting: {
    en: 'Half-body portrait photo of a young Chinese woman illuminated by the described lighting setup, clean studio background, editorial catalog quality, no text.',
    zh: '年轻东方女性半身肖像照,呈现该光影方向与质感,简洁影棚背景,杂志大片质感,无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  visualEffect: {
    en: 'Half-body portrait photo of a young Chinese woman demonstrating the described visual post-processing effect, clean editorial sample, no text.',
    zh: '年轻东方女性半身肖像照,呈现该画面后期效果,干净编辑样张,无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  layoutDesign: {
    en: 'Premium poster thumbnail demonstrating the described layout design system with a young Chinese woman as subject, clean readable hierarchy, no actual readable text.',
    zh: '高级海报缩略图,以年轻东方女性为主体展示该版式设计系统,层级清晰,不要生成真实可读文字。',
    negativeEn:
      'no line art, no sketch, no drawing, no cartoon, no anime, no watermark, no readable text, no typo-heavy text',
    negativeZh:
      '禁止线稿,禁止素描,禁止绘画,禁止卡通,禁止动漫,禁止水印,禁止真实可读文字,禁止错别字文字'
  },
  accessory: {
    en: 'Studio product photo of a single accessory item, plain white background, no body, no person, e-commerce style.',
    zh: '单件配饰影棚产品图，白底，无人体，无人物，电商风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  prop: {
    en: 'Studio product photo of a single prop item, plain white background, no people, no other objects, e-commerce style.',
    zh: '单件道具影棚产品图，白底，无人物，无其他物体，电商风格。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  lens: {
    en: 'Half-body portrait photo of a young Chinese woman demonstrating the described lens character (focal length, depth of field, perspective), clean background, editorial catalog quality, no text, no camera equipment in frame.',
    zh: '年轻东方女性半身肖像照,呈现该镜头的视觉质感(焦段、景深、透视感),简洁背景,杂志大片质感,画面中不要出现相机设备,无文字。',
    negativeEn:
      'no line art, no sketch, no drawing, no cartoon, no anime, no watermark, no text, no camera equipment, no lens hardware',
    negativeZh:
      '禁止线稿,禁止素描,禁止绘画,禁止卡通,禁止动漫,禁止文字水印,禁止出现相机或镜头器材'
  },
  shot: {
    en: 'Portrait photo of a young Chinese woman framed in the described shot type (close-up / half-body / full-body), clean studio background, editorial catalog quality, no text.',
    zh: '年轻东方女性肖像照,按该景别取景(特写/半身/全身等),简洁影棚背景,杂志大片质感,无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  viewpoint: {
    en: 'Waist-up portrait photo of an adult Chinese woman demonstrating the described camera viewpoint or angle, fixed neutral studio, no text.',
    zh: '成年东方女性腰上人像照，仅呈现指定机位或视角，固定中性影棚，无文字。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  },
  makeup: {
    en: 'Close-up photo of a single Chinese woman face showing makeup, plain background, soft natural light.',
    zh: '单人东方女性面部妆容特写照，简洁背景，柔和自然光。',
    negativeEn: PHOTO_NEGATIVE_EN,
    negativeZh: PHOTO_NEGATIVE_ZH
  }
};

/**
 * 判断一张素材的缩略图是不是 AI 重生过的。
 *
 * 上传原图路径:   `prompt-asset-uploads/{userId}/{month}/{ts}-{rand}.{ext}`
 * AI 重生缩略图: `prompt-asset-uploads/{userId}/{month}/thumb-{ts}-{rand}.{ext}`
 *
 * 文件名前缀 `thumb-` 是唯一可靠信号(命名约定见 api/prompt-assets/user/thumbnail.ts)。
 */
export function isAiGeneratedThumbnail(url: string | undefined): boolean {
  if (!url) return false;
  // 同一段 URL 中查找 `/thumb-` 即可,匹配 file basename 前缀
  return /\/thumb-[A-Za-z0-9_-]/.test(url);
}

type QueueStatus = 'queued' | 'processing' | 'done' | 'failed';
type QueueMap = Record<string, { status: QueueStatus; error?: string }>;

export interface ThumbnailQueueStats {
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
}

export interface UseThumbnailQueueParams {
  /** 用户素材(已转成 ImagePromptAsset 视图)— 派生 pending + worker 内查素材用 */
  userAssetsAsPromptAssets: ImagePromptAsset[];
  /** 写回缩略图更新后的素材 */
  setUserAssets: Dispatch<SetStateAction<UserPromptAsset[]>>;
  promptLocale: PromptLocale;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
}

export interface UseThumbnailQueueResult {
  batchQueue: QueueMap;
  batchRunning: boolean;
  batchStats: ThumbnailQueueStats;
  pendingThumbAssets: ImagePromptAsset[];
  currentProcessingAsset: ImagePromptAsset | null;
  handleBatchRegenerate: () => void;
  handleRetryFailed: () => void;
  handleCancelBatch: () => void;
  handleRegenerateThumbnail: (asset: ImagePromptAsset) => void;
}

export function useThumbnailQueue({
  userAssetsAsPromptAssets,
  setUserAssets,
  promptLocale,
  setError,
  setStatusText
}: UseThumbnailQueueParams): UseThumbnailQueueResult {
  const { t } = useTranslation('imageCreate');

  const [batchQueue, setBatchQueue] = useState<QueueMap>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const batchCancelRef = useRef(false);
  /**
   * 队列真相源(ref)— React useState 异步 setter 在 worker loop 内拿不到最新,
   * 必须用 ref 镜像状态供 worker 读取。每次 mutate 同步 setBatchQueue 用于 UI 渲染。
   */
  const batchStatusRef = useRef<QueueMap>({});
  /** worker 单例守卫,确保同时只有一个 worker loop 在跑(可重入即并发) */
  const workerRunningRef = useRef(false);

  /**
   * 队列 worker 在 long-running loop 内拿不到 userAssetsAsPromptAssets 的最新闭包,
   * 用 ref 镜像供 worker 读取最新素材列表。
   */
  const userAssetsRef = useRef(userAssetsAsPromptAssets);
  useEffect(() => {
    userAssetsRef.current = userAssetsAsPromptAssets;
  }, [userAssetsAsPromptAssets]);

  /**
   * 单张缩略图生成的核心逻辑(纯执行,无 confirm/无 setError)。
   * 成功 → 写回 userAssets;失败 → 抛错,由调用方决定如何展示。
   * 供单点重生 + 批量队列共用。
   */
  const regenerateThumbnailCore = useCallback(
    async (asset: ImagePromptAsset): Promise<void> => {
      // 缩略图 prompt = slot 专属风格指令(强约束) + 素材内容指令(弱约束,简短)
      // 不同 slot 风格各异:pose 线稿、其他多数 slot 写实产品/实景照片
      // negative 也按 slot 切换:避免 pose 出现写实人,也避免服装出现线稿
      const styleConfig =
        THUMBNAIL_STYLE_BY_SLOT[asset.slot] || THUMBNAIL_STYLE_BY_SLOT.style;
      const styleSuffix =
        promptLocale === 'zh-CN' ? styleConfig.zh : styleConfig.en;
      const rawSubject =
        promptLocale === 'zh-CN' && asset.promptZh
          ? asset.promptZh
          : asset.prompt;
      const subject = (rawSubject || '').trim().slice(0, 70);
      const subjectLabel = promptLocale === 'zh-CN' ? '描绘对象' : 'Subject';
      const compositePrompt = subject
        ? `${styleSuffix} ${subjectLabel}: ${subject}.`
        : styleSuffix;
      const negative =
        promptLocale === 'zh-CN'
          ? styleConfig.negativeZh
          : styleConfig.negativeEn;

      const generation = await generateVisualImage({
        prompt: compositePrompt,
        negativePrompt: negative,
        // 保留 GPT Image 2(用户指定)。quality=low 让 Tuzi 中转尽可能快返回,
        // 缩略图对画质要求不高,避免 170s 超时拖到 180s 雪崩 fallback。
        model: 'gpt-image',
        aspectRatio: '1:1',
        imageSize: '1024x1024',
        quality: 'low',
        outputFormat: 'webp',
        assetIds: [asset.id]
      });
      window.dispatchEvent(new CustomEvent('credits-changed'));
      if (!generation.generationId) {
        throw new Error(t('mine.regenerateFailed') as string);
      }
      const updated = await regenerateUserPromptAssetThumbnail({
        assetId: asset.id,
        generationId: generation.generationId
      });
      setUserAssets((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    },
    [promptLocale, setUserAssets, t]
  );

  /**
   * 未 AI 生成缩略图的素材列表。基于 userAssets + isAiGeneratedThumbnail 实时派生。
   */
  const pendingThumbAssets = useMemo<ImagePromptAsset[]>(() => {
    return userAssetsAsPromptAssets.filter(
      (asset) => !isAiGeneratedThumbnail(asset.thumbnailUrl)
    );
  }, [userAssetsAsPromptAssets]);

  /**
   * 队列统计 — 用于工具条标签 / 进度条。
   */
  const batchStats = useMemo<ThumbnailQueueStats>(() => {
    const ids = Object.keys(batchQueue);
    let queued = 0;
    let processing = 0;
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      const status = batchQueue[id]?.status;
      if (status === 'queued') queued += 1;
      else if (status === 'processing') processing += 1;
      else if (status === 'done') done += 1;
      else if (status === 'failed') failed += 1;
    }
    return { total: ids.length, queued, processing, done, failed };
  }, [batchQueue]);

  /**
   * 当前正在处理的素材(用于在进度面板展示标题)。
   * 单点和批量统一进 batchQueue,这里查 processing 状态的第一项。
   */
  const currentProcessingAsset = useMemo<ImagePromptAsset | null>(() => {
    for (const [id, v] of Object.entries(batchQueue)) {
      if (v.status === 'processing') {
        return userAssetsAsPromptAssets.find((a) => a.id === id) || null;
      }
    }
    return null;
  }, [batchQueue, userAssetsAsPromptAssets]);

  /**
   * 提交单状态变更:同步 ref + setState。
   */
  const commitQueueStatus = useCallback(
    (id: string, status: QueueStatus, error?: string) => {
      batchStatusRef.current = {
        ...batchStatusRef.current,
        [id]: { status, error }
      };
      setBatchQueue({ ...batchStatusRef.current });
    },
    []
  );

  /**
   * 持久 worker — 持续扫描 statusRef 找下一个 queued,跑完即查下一个。
   * 入队后调用 startWorker(),已在跑则 noop(单例)。
   * 用户点"停止"设置 batchCancelRef=true,worker 完成当前张后退出。
   *
   * 队列顺序由 JS object key 插入顺序保证(string key, 标准行为)。
   */
  const startWorker = useCallback(async () => {
    if (workerRunningRef.current) return;
    workerRunningRef.current = true;
    setBatchRunning(true);
    batchCancelRef.current = false;
    try {
      while (!batchCancelRef.current) {
        // 找下一个 queued
        let nextId: string | null = null;
        for (const [id, v] of Object.entries(batchStatusRef.current)) {
          if (v.status === 'queued') {
            nextId = id;
            break;
          }
        }
        if (!nextId) break; // 队列空

        const asset = userAssetsRef.current.find((a) => a.id === nextId);
        if (!asset) {
          commitQueueStatus(nextId, 'failed', 'asset not found');
          continue;
        }
        commitQueueStatus(nextId, 'processing');
        try {
          await regenerateThumbnailCore(asset);
          commitQueueStatus(nextId, 'done');
        } catch (caught) {
          const message =
            caught instanceof Error
              ? caught.message
              : (t('mine.regenerateFailed') as string);
          commitQueueStatus(nextId, 'failed', message);
        }
      }
    } finally {
      workerRunningRef.current = false;
      setBatchRunning(false);
      batchCancelRef.current = false;
    }
  }, [commitQueueStatus, regenerateThumbnailCore, t]);

  /**
   * 入队接口 — 单点 / 批量 / 重试全部走这里。
   * 同 id 已在跑或排队中 → 跳过(去重);done 状态 → 重新跑(用户主动再点);
   * failed → 重新跑(重试)。入队后启动 worker(若已跑则 noop)。
   */
  const enqueueRegenerate = useCallback(
    (ids: string[]) => {
      let added = 0;
      const nextMap = { ...batchStatusRef.current };
      for (const id of ids) {
        const cur = nextMap[id]?.status;
        if (cur === 'queued' || cur === 'processing') continue; // 去重
        nextMap[id] = { status: 'queued' };
        added += 1;
      }
      if (added === 0) return;
      batchStatusRef.current = nextMap;
      setBatchQueue({ ...nextMap });
      void startWorker();
    },
    [startWorker]
  );

  const handleBatchRegenerate = useCallback(() => {
    if (pendingThumbAssets.length === 0) return;
    if (
      !window.confirm(
        t('mine.batchRegenerateConfirm', {
          count: pendingThumbAssets.length
        }) as string
      )
    ) {
      return;
    }
    enqueueRegenerate(pendingThumbAssets.map((a) => a.id));
  }, [enqueueRegenerate, pendingThumbAssets, t]);

  const handleRetryFailed = useCallback(() => {
    const failedIds = Object.entries(batchStatusRef.current)
      .filter(([, v]) => v.status === 'failed')
      .map(([id]) => id);
    if (failedIds.length === 0) return;
    enqueueRegenerate(failedIds);
  }, [enqueueRegenerate]);

  const handleCancelBatch = useCallback(() => {
    batchCancelRef.current = true;
  }, []);

  /**
   * 单点重生缩略图 — 不再阻塞,直接入队。已在排队 / 进行中的素材会被去重。
   * 用户可以连续点多张,worker 会按点击顺序串行处理。
   */
  const handleRegenerateThumbnail = useCallback(
    (asset: ImagePromptAsset) => {
      const existing = batchStatusRef.current[asset.id]?.status;
      if (existing === 'queued' || existing === 'processing') {
        // 已在队列里,不重复加;也不弹 confirm
        return;
      }
      if (!window.confirm(t('mine.regenerateConfirm') as string)) return;
      setError('');
      setStatusText('');
      enqueueRegenerate([asset.id]);
    },
    [enqueueRegenerate, setError, setStatusText, t]
  );

  /**
   * 批量缩略图队列运行中,关闭/刷新页面前二次确认。
   * 正在处理的那张已扣积分,若此时强行断开,后端可能已生成成功但前端
   * 收不到结果(钱花了图没回写)。queued 的项尚未扣费,关了无损失。
   * 浏览器原生 beforeunload 提示能拦住误操作,把损失窗口降到最低。
   */
  useEffect(() => {
    if (!batchRunning) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [batchRunning]);

  return {
    batchQueue,
    batchRunning,
    batchStats,
    pendingThumbAssets,
    currentProcessingAsset,
    handleBatchRegenerate,
    handleRetryFailed,
    handleCancelBatch,
    handleRegenerateThumbnail
  };
}
