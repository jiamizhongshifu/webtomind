import healthHandler from '../api/health';
import contentBlogHandler from '../api/content/blog';
import contentPromptAssetsHandler from '../api/content/prompt-assets';
import contentPromptCasesHandler from '../api/content/prompt-cases';
import contentPromptCaseEventHandler from '../api/content/prompt-cases/event';
import contentSkillsHandler from '../api/content/skills';
import contentUpdatesHandler from '../api/content/updates';
import adminAiUsageSummaryHandler from '../api/admin/ai-usage/summary';
import { API_MARKETPLACE_ADMIN_EMAIL } from '../src/shared/api-marketplace';
import { BOOT_WATCHDOG_SOURCE } from '../src/shared/boot-watchdog';
import adminImageProviderProbeHandler from '../api/admin/image-provider-probe';
import adminMediaCreditsHandler from '../api/admin/media-credits';
import adminPromptAssetsHandler from '../api/admin/prompt-assets';
import adminPromptAssetProductionBatchDetailHandler from '../api/admin/prompt-asset-production-batches/[id]';
import adminPromptAssetProductionBatchRunHandler from '../api/admin/prompt-asset-production-batches/[id]/run';
import adminPromptAssetProductionBatchesHandler from '../api/admin/prompt-asset-production-batches/index';
import adminPromptCaseAssetCoverageAnalyzeHandler from '../api/admin/prompt-case-asset-coverage/analyze';
import adminPromptCaseDraftsHandler from '../api/admin/prompt-case-drafts/index';
import adminPromptCaseDraftDetailHandler from '../api/admin/prompt-case-drafts/[id]';
import adminPromptCaseDraftGenerateHandler from '../api/admin/prompt-case-drafts/generate';
import adminPromptCaseDraftGenerateImagesHandler from '../api/admin/prompt-case-drafts/generate-images';
import adminPromptCaseDraftImportHandler from '../api/admin/prompt-case-drafts/import';
import adminPromptCaseDraftPublishHandler from '../api/admin/prompt-case-drafts/[id]/publish';
import adminPromptCasesHandler from '../api/admin/prompt-cases';
import adminPromptCasesUploadHandler from '../api/admin/prompt-cases/upload';
import authMeHandler from '../api/auth/me';
import analyticsConversionEventHandler from '../api/analytics/conversion-event';
import analyticsConversionReportHandler from '../api/analytics/conversion-report';
import creditBalanceHandler from '../api/credits/balance';
import creditConsumeHandler from '../api/credits/consume';
import creditDailyLoginRewardHandler from '../api/credits/daily-login-reward';
import creditDailyUsageHandler from '../api/credits/daily-usage';
import creditImageCostHandler from '../api/credits/image-cost';
import creditPackagesHandler from '../api/credits/packages';
import creditQuickReplyQuotaHandler from '../api/credits/quick-reply-quota';
import creditTransactionsHandler from '../api/credits/transactions';
import creditVideoCostHandler from '../api/credits/video-cost';
import creditWeavingQuotaHandler from '../api/credits/weaving-quota';
import imageHistoryHandler from '../api/image/history';
import imageModelsHandler from '../api/image/models';
import imageRecipesHandler from '../api/image/recipes/index';
import imageCharactersHandler from '../api/image/characters/index';
import imageConsistencyCheckHandler from '../api/image/consistency/check';
import imageVisualQualityScoreHandler from '../api/image/quality/score';
import { runImageVisualQualitySweep } from '../api/image/quality/service';
import imagePromptOptimizeHandler from '../api/image/prompt-optimize';
import imageReferencesHandler from '../api/image/references/index';
import imageReferencesBytesHandler from '../api/image/references/bytes';
import imageReferencesFromGenerationHandler from '../api/image/references/from-generation';
import imageReferencesUploadHandler from '../api/image/references/upload';
import imageDrainHandler from '../api/image/drain';
import imageGenerateHandler, {
  handleGptImage2DenoiseRequest
} from '../api/image/generate';
import imageTaskHandler from '../api/image/task';
import imageTaskStatusHandler from '../api/image/task-status';
import { handleCloudflareImageTaskAction } from '../api/image/cloudflare-task-actions';
import imageUserLibraryHandler from '../api/image/user-library/index';
import discoverySearchHandler from '../api/discovery/search';
import discoveryDescribeImageHandler from '../api/discovery/describe-image';
import imageSessionsHandler from '../api/image-sessions/index';
import imageSessionDetailHandler from '../api/image-sessions/[id]/index';
import imageSessionTurnsHandler from '../api/image-sessions/[id]/turns';
import moodboardsHandler from '../api/moodboards/index';
import moodboardDetailHandler from '../api/moodboards/[id]';
import moodboardItemsHandler from '../api/moodboards/[id]/items';
import moodboardAnalyzeHandler from '../api/moodboards/[id]/analyze';
import moodboardShareHandler from '../api/moodboards/[id]/share';
import publicMoodboardHandler from '../api/public/moodboards/[token]';
import agentBatchImageExecuteHandler from '../api/agent/batch-image-execute';
import agentSmartChatHandler from '../api/agent/smart-chat';
import skillImageChatHandler from '../api/agent/skill-image-chat';
import geminiThinkingHandler from '../api/ai/gemini/thinking';
import promptAssetsUserHandler from '../api/prompt-assets/user/index';
import { handlePromptImportRequest } from '../api/prompt-assets/user/import-prompt';
import { handleThumbnailRequest } from '../api/prompt-assets/user/thumbnail';
import { handleUserUploadRequest } from '../api/prompt-assets/user/upload';
import videoHistoryHandler from '../api/video/history';
import videoDrainHandler from '../api/video/drain';
import videoGenerateHandler from '../api/video/generate';
import videoModelsHandler from '../api/video/models';
import videoPromptOptimizeHandler from '../api/video/prompt-optimize';
import videoReferencesUploadHandler from '../api/video/references/upload';
import videoStatusHandler from '../api/video/status';
import videoTaskHandler from '../api/video/task';
import membershipCheckoutHandler from '../api/membership/checkout';
import membershipGrantMonthlyHandler from '../api/membership/grant-monthly';
import membershipOrderStatusHandler from '../api/membership/order-status';
import membershipPlansHandler from '../api/membership/plans';
import membershipPortalHandler from '../api/membership/portal';
import membershipReferralHandler from '../api/membership/referral';
import membershipSubscriptionHandler from '../api/membership/subscription';
import membershipTasksHandler from '../api/membership/tasks';
import membershipWebhookHandler from '../api/membership/webhook';
import membershipZpayNotifyHandler from '../api/membership/zpay-notify';
import membershipZpayReturnHandler from '../api/membership/zpay-return';
import apiMarketplaceCatalogHandler from '../api/api-marketplace/catalog';
import apiMarketplaceKeysHandler from '../api/api-marketplace/keys';
import apiMarketplaceKeyFundHandler from '../api/api-marketplace/key-fund';
import apiMarketplaceWalletHandler from '../api/api-marketplace/wallet';
import apiMarketplacePackagesHandler from '../api/api-marketplace/packages';
import apiMarketplaceUsageHandler from '../api/api-marketplace/usage';
import apiMarketplaceGatewayHandler from '../api/api-marketplace/gateway';
import marketingEmailDrainHandler from '../api/marketing/email-drain';
import { handleMarketingEmailSchedulerRequest } from '../api/marketing/email-scheduler';
import marketingResendWebhookHandler from '../api/marketing/resend-webhook';
import { sendViaResend } from '../api/marketing/email-worker-utils';
import {
  buildRefundFailureAlert,
  findRecentRefundFailures
} from '../api/credits/refund-failure-monitor';
import marketingSubscribeHandler from '../api/marketing/subscribe';
import marketingUnsubscribeHandler from '../api/marketing/unsubscribe';
import shareCreateHandler from '../api/share/create';
import shareTokenHandler from '../api/share/[token]';
import shareRevokeHandler from '../api/share/revoke';
import workspaceProjectsHandler from '../api/workspace/projects/index';
import workspaceProjectDetailHandler from '../api/workspace/projects/[id]';
import workspaceCardsWeaveHandler from '../api/workspace/cards/weave';
import workspaceCardsHandler from '../api/workspace/cards/index';
import workspaceCardDetailHandler from '../api/workspace/cards/[id]';
import workspaceCardsReorderHandler from '../api/workspace/cards/reorder';
import workspaceSummariesHandler from '../api/workspace/summaries/index';
import workspaceSummaryDetailHandler from '../api/workspace/summaries/[id]';
import workspaceSummaryConfirmHandler from '../api/workspace/summary-confirm';
import workspaceConversationsHandler from '../api/workspace/conversations/index';
import workspaceConversationDetailHandler from '../api/workspace/conversations/[id]';
import workspaceShortcutsHandler from '../api/workspace/shortcuts/index';
import workspaceShortcutDetailHandler from '../api/workspace/shortcuts/[id]';
import workspaceSkillsHandler from '../api/workspace/skills/index';
import workspaceSkillDetailHandler from '../api/workspace/skills/[id]';
import workspaceSkillReferencesHandler from '../api/workspace/skills/references';
import workspaceSkillReferenceDetailHandler from '../api/workspace/skills/references/[name]';
import workspaceSkillScriptsHandler from '../api/workspace/skills/scripts';
import workspaceSkillScriptDetailHandler from '../api/workspace/skills/scripts/[name]';
import workspaceSkillTemplatesHandler from '../api/workspace/skills/templates';
import workspaceSourceExtractHandler from '../api/workspace/source-extract';
import workspaceSourceSearchHandler from '../api/workspace/source-search';
import workspaceStudioAiHandler from '../api/workspace/studio-ai';
import workspaceStudioChartImageHandler from '../api/workspace/studio-chart-image';
import workspaceStudioDocumentsHandler from '../api/workspace/studio-documents/index';
import workspaceStudioDocumentDetailHandler from '../api/workspace/studio-documents/[id]';
import workspaceStudioReadinessHandler from '../api/workspace/studio-readiness';
import { handleWorkspaceTasksRequest } from '../api/workspace/tasks/index';
import workspaceTaskDetailHandler from '../api/workspace/tasks/[id]';
import workspaceTaskResultHandler from '../api/workspace/tasks/[id]/result';
import workspaceTaskCancelHandler from '../api/workspace/tasks/[id]/cancel';
import workspaceTaskRetryHandler from '../api/workspace/tasks/[id]/retry';
import workspaceTrashHandler from '../api/workspace/trash/index';
import workspaceTrashDetailHandler from '../api/workspace/trash/[id]';
import debugAgentHandler from '../api/debug/agent';
import { renderCreateAppPageHtml } from '../api/create-app-page-render';
import {
  IMAGE_TOOL_MODELS,
  isPublishedImageToolModel
} from '../src/shared/image-tool-models';
import { renderPromptPageHtml } from '../api/prompt-page-render';
import {
  injectPromptLibraryBootstrap,
  renderNoindexAppShellHtml,
  renderSeoPageHtmlWithStatus
} from '../api/seo-page-render';
import { renderSitemapResponse } from '../api/sitemap-render';
import { assertPromptCaseAdmin } from '../api/admin/prompt-case-auth';
import { getCorsHeadersForRequest, getSupabaseAdmin } from '../api/utils/auth';
import { isExactSeoPath } from '../src/shared/seo-route-paths';
import { getSeedanceVideoModels } from '../src/shared/seedance-video-models';
import {
  canonicalizePromptLibraryLabel,
  canonicalizePromptLibraryModel
} from '../src/shared/prompt-library';
import { getPromptSeoStaticLibraryCases } from '../src/shared/prompt-seo-match';
import {
  detectLocaleFromAcceptLanguage,
  detectLocaleFromCookie
} from '../src/shared/locale-detect';
import { Client } from 'pg';

type AssetBinding = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

type R2ObjectBody = {
  body?: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
  size?: number;
  range?: { offset?: number; length?: number };
  httpMetadata?: { contentType?: string };
};

type R2BucketBinding = {
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } }
  ): Promise<R2ObjectBody | null>;
};

type QueueBinding = {
  send(message: unknown, options?: { delaySeconds?: number }): Promise<void>;
  metrics?: () => Promise<{
    backlogCount?: number;
    backlog_count?: number;
    backlogBytes?: number;
    backlog_bytes?: number;
    oldestMessageTimestamp?: number;
    oldest_message_timestamp_ms?: number;
  }>;
};

type KVNamespaceBinding = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
};

type HyperdriveBinding = {
  connectionString: string;
};

type CloudflareImagesBinding = {
  input(source: ArrayBuffer | Uint8Array | Blob | ReadableStream): {
    transform(options: Record<string, unknown>): {
      transform(options: Record<string, unknown>): unknown;
      output(
        options: Record<string, unknown>
      ): Promise<{ response(): Response }>;
    };
    output(options: Record<string, unknown>): Promise<{ response(): Response }>;
  };
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type BrowserRunBinding = {
  quickAction(
    action: string,
    params?: Record<string, unknown>
  ): Promise<Response>;
};

type ImageQueueBatch = {
  queue?: string;
  messages: Array<{
    body: unknown;
    id?: string;
  }>;
};

type RequestObservability = {
  requestId: string;
  route: string;
};

type QueueDiagnosticConfig = (typeof QUEUE_DIAGNOSTIC_BINDINGS)[number];
type QueueDiagnosticResult = QueueDiagnosticConfig & {
  configured: boolean;
  metricsAvailable: boolean;
  backlogCount?: number | null;
  backlogBytes?: number | null;
  oldestMessageTimestampMs?: number | null;
  oldestMessageAt?: string | null;
  error?: string;
  errorName?: string;
};

type ImageTaskQueueAttemptRecord = {
  id?: string;
  user_id?: string;
  status?: string;
};

export type Env = {
  ASSETS: AssetBinding;
  IMAGES?: CloudflareImagesBinding;
  BROWSER?: BrowserRunBinding;
  MEDIA_BUCKET?: R2BucketBinding;
  /** 仅本地开发设置：R2 模拟器缺少模型对象时，回源到该地址拉取。 */
  LOCAL_MODEL_ORIGIN?: string;
  IMAGE_JOBS?: QueueBinding;
  VIDEO_JOBS?: QueueBinding;
  EMAIL_CAMPAIGN_JOBS?: QueueBinding;
  IMAGE_JOBS_DLQ?: QueueBinding;
  VIDEO_JOBS_DLQ?: QueueBinding;
  EMAIL_CAMPAIGN_JOBS_DLQ?: QueueBinding;
  WEBTOMIND_PUBLIC_CACHE?: KVNamespaceBinding;
  HYPERDRIVE?: HyperdriveBinding;
  HYPERDRIVE_DIAGNOSTIC_ENABLED?: string;
  HYPERDRIVE_PUBLIC_STATS_ENABLED?: string;
  CANONICAL_HOST?: string;
  ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CRON_SECRET?: string;
  KITESURF_SMOKE_TOKEN?: string;
  KITESURF_SMOKE_BASE_URL?: string;
  KITESURF_SMOKE_MIN_INTERVAL_MS?: string;
  IMAGE_DRAIN_SECRET?: string;
  VIDEO_DRAIN_SECRET?: string;
  IMAGE_QUEUE_DRAIN_BATCH_SIZE?: string;
  IMAGE_TASK_MAX_ATTEMPTS?: string;
  VIDEO_QUEUE_DRAIN_BATCH_SIZE?: string;
  VIDEO_QUEUE_PROVIDER?: string;
  MEDIA_STORAGE_PROVIDER?: string;
  MEDIA_PUBLIC_BASE_URL?: string;
  R2_S3_ENDPOINT?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  MEDIA_R2_BUCKET?: string;
  APP_URL?: string;
  PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  VITE_PUBLIC_SITE_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  MARKETING_EMAIL_FROM?: string;
  MARKETING_EMAIL_DRAIN_LIMIT?: string;
  MARKETING_EMAIL_DRAIN_CONCURRENCY?: string;
  MARKETING_EMAIL_MAX_ATTEMPTS?: string;
  MARKETING_EMAIL_LEASE_SECONDS?: string;
  MARKETING_EMAIL_RETRY_BASE_SECONDS?: string;
  MARKETING_EMAIL_RETRY_MAX_SECONDS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_SECRET_KEY_TEST?: string;
  STRIPE_MODE?: string;
  STRIPE_CHECKOUT_ENABLED?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET_TEST?: string;
  ZPAY_CHECKOUT_ENABLED?: string;
  ZPAY_PID?: string;
  ZPAY_KEY?: string;
  ZPAY_USD_TO_CNY_RATE?: string;
  ZPAY_SUBMIT_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_OFFICIAL_ENABLED?: string;
  ENABLE_LEGACY_GEMINI_PROXY?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_GEMINI_API_KEY?: string;
  STUDIO_AI_MODEL?: string;
  STUDIO_READINESS_MODEL?: string;
  IMAGE_VISUAL_QUALITY_AUTO_ENABLED?: string;
  IMAGE_VISUAL_QUALITY_MODEL?: string;
  IMAGE_VISUAL_QUALITY_FALLBACK_MODELS?: string;
  IMAGE_VISUAL_QUALITY_SWEEP_LIMIT?: string;
  IMAGE_VISUAL_QUALITY_LOOKBACK_HOURS?: string;
  TUZI_TEXT_API_KEY?: string;
  TUZI_API_KEY?: string;
  API_MARKETPLACE_TUZI_PRICING_URL?: string;
  API_MARKETPLACE_RELAY_BASE_URL?: string;
  API_MARKETPLACE_RELAY_API_KEY?: string;
  API_MARKETPLACE_RELAY_REQUIRED?: string;
  API_MARKETPLACE_ACCESS_EMAILS?: string;
  API_MARKETPLACE_UPSTREAM_BASE_URL?: string;
  API_MARKETPLACE_TUZI_API_KEY?: string;
  TUZI_TEXT_BASE_URL?: string;
  TUZI_API_BASE_URL?: string;
  TUZI_IMAGE_API_BASE_URL?: string;
  TUZI_ENABLE_OPENAI_COMPAT_FALLBACK?: string;
  CLOUDFLARE_AI_GATEWAY_RUN_TOKEN?: string;
  ARK_API_KEY?: string;
  ARK_VIDEO_API_BASE_URL?: string;
  ARK_VIDEO_CREATE_PATH?: string;
  ARK_VIDEO_GENERATION_ENABLED?: string;
  ARK_VIDEO_LAUNCH_ENABLED?: string;
  ARK_VIDEO_API_MODEL_SEEDANCE_2_5?: string;
  ARK_VIDEO_STATUS_PATH_TEMPLATE?: string;
  TUZI_OFFICIAL_API_KEY?: string;
  TUZI_OFFICIAL_API_BASE_URL?: string;
  TUZI_OFFICIAL_DISCOUNT_API_KEY?: string;
  TUZI_OFFICIAL_DISCOUNT_API_BASE_URL?: string;
  TUZI_ENABLE_OFFICIAL_DISCOUNT_FALLBACK?: string;
  TUZI_IMAGE_CHANNEL_ORDER?: string;
  TUZI_PROMPT_OPTIMIZE_MODEL?: string;
  TUZI_TEXT_MODEL?: string;
  TUZI_GEMINI_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_IMAGE_API_KEY?: string;
  DISCOVERY_IMAGE_ANALYSIS_PROVIDER?: string;
  DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_API_KEY?: string;
  DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_BASE_URL?: string;
  DISCOVERY_IMAGE_ANALYSIS_CHAOJITUDOU_MODEL?: string;
  CHAOJITUDOU_API_KEY?: string;
  CHAOJITUDOU_API_BASE_URL?: string;
  CHAOJITUDOU_VLM_MODEL?: string;
  OPENAI_COMPAT_IMAGE_API_KEY?: string;
  OPENAI_COMPAT_IMAGE_BASE_URL?: string;
  OPENAI_COMPAT_IMAGE_DISABLE_CODEX_FALLBACK?: string;
  OPENAI_COMPAT_IMAGE_DISABLE_TUZI_FALLBACK?: string;
  OPENAI_COMPAT_IMAGE_ENABLED?: string;
  OPENAI_COMPAT_IMAGE_FALLBACK_MODEL?: string;
  OPENAI_COMPAT_IMAGE_MODEL?: string;
  OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS?: string;
  OPENAI_COMPAT_IMAGE_SUPPORTS_MULTI?: string;
  OPENAI_COMPAT_IMAGE_TIMEOUT_MS?: string;
  IMAGE_PROVIDER_PROBE_SECRET?: string;
  DASHSCOPE_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_IMAGE_API_BASE_URL?: string;
  DEBUG_SECRET?: string;
  ANTHROPIC_MODEL?: string;
  DEEPSEEK_PROMPT_OPTIMIZE_MODEL?: string;
  DEEPSEEK_MODEL?: string;
  SMARTCHAT_TEXT_MODEL?: string;
  OPENAI_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
  GPT_IMAGE_2_ENABLE_SLOW_FALLBACKS?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
};

// 目标路径中的 {locale} 会被替换为解析出的语言
// 优先级：显式语言 Cookie > Accept-Language（中文浏览器进入 zh-CN，
// 其余含缺失/未知进入 en-US，英文优先）
const EXACT_REDIRECTS = new Map<string, string>([
  ['/', '/{locale}/prompts'],
  ['/overview', '/{locale}/overview'],
  ['/zh-CN', '/zh-CN/overview'],
  ['/en-US', '/en-US/overview'],
  ['/use-cases', '/{locale}/blog'],
  ['/nsfw-prompts-guide', '/{locale}/blog/nsfw-prompts-guide'],
  ['/blog', '/{locale}/blog'],
  ['/tools/comfyui-workflow-checker', '/zh-CN/tools/comfyui-workflow-checker'],
  ['/updates', '/{locale}/updates'],
  ['/links', '/{locale}/links'],
  ['/ai-image-prompts', '/en-US/prompts'],
  ['/prompts', '/{locale}/prompts'],
  ['/image/create', '/{locale}/image'],
  ['/zh-CN/image/create', '/zh-CN/image'],
  ['/en-US/image/create', '/en-US/image'],
  ['/create/image', '/{locale}/image'],
  ['/create/video', '/{locale}/video'],
  ['/create/gallery', '/{locale}/gallery'],
  ['/create/characters', '/{locale}/characters'],
  ['/create/apps', '/{locale}/apps'],
  ['/create/prompts', '/{locale}/prompts'],
  ['/zh-CN/create/image', '/zh-CN/image'],
  ['/zh-CN/create/video', '/zh-CN/video'],
  ['/zh-CN/create/gallery', '/zh-CN/gallery'],
  ['/zh-CN/create/characters', '/zh-CN/characters'],
  ['/zh-CN/create/apps', '/zh-CN/apps'],
  ['/zh-CN/create/prompts', '/zh-CN/prompts'],
  ['/en-US/create/image', '/en-US/image'],
  ['/en-US/create/video', '/en-US/video'],
  ['/en-US/create/gallery', '/en-US/gallery'],
  ['/en-US/create/characters', '/en-US/characters'],
  ['/en-US/create/apps', '/en-US/apps'],
  ['/en-US/create/prompts', '/en-US/prompts'],
  ['/workspace', '/{locale}/pricing'],
  ['/workspace/pricing', '/{locale}/pricing'],
  ['/privacy', '/{locale}/privacy'],
  ['/terms', '/{locale}/terms']
]);

// 非 locale 的公开 prompt 案例详情页：SSR 一律收敛到带语言前缀的规范 URL，
// 避免 Google 把 /prompts/:slug 当作独立的 noindex 页面计入索引覆盖报告。
// admin 是应用内后台路由，不参与公开详情重定向；UUID 段是历史 id 型 URL，
// 先落到 share 路由，由既有的 id→slug 308 链收敛到最终 slug URL。
function getPromptDetailRedirect(pathname: string): string | null {
  const match = /^\/prompts\/([^/]+)$/.exec(pathname);
  if (!match || match[1] === 'admin') return null;
  const segment = match[1];
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment
    )
  ) {
    return `/{locale}/create/prompts/share/${segment}`;
  }
  return `/{locale}/prompts/${segment}`;
}

// 带语言前缀的历史 id 型 prompt URL（slug 上线前的旧 canonical）：
// /zh-CN/prompts/<uuid> 直接 404，改为落到 share 路由再收敛到 slug。
function getLocalePromptIdRedirect(pathname: string): string | null {
  const match =
    /^\/(zh-CN|en-US)\/prompts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      pathname
    );
  if (!match) return null;
  return `/${match[1]}/create/prompts/share/${match[2]}`;
}

const LEGACY_CREATE_APP_REDIRECTS = new Map<string, string>([
  ['image-upscaler', '/tools/image-upscaler'],
  ['image-splitter', '/tools/image-splitter'],
  ['watermark-remover', '/tools/watermark-remover'],
  ['gpt-image-2-denoiser', '/tools/gpt-image-2-denoiser'],
  ['image-compressor', '/tools/image-compressor'],
  ['pindou-pattern-maker', '/tools/pindou-pattern-maker'],
  ['object-remover', '/tools/watermark-remover'],
  ['xiaohongshu-cover', '/image'],
  ['ecommerce-product-photo', '/image'],
  ['wechat-cover-poster', '/image'],
  ['product-model-vibes', '/image'],
  ['image-inpaint', '/image'],
  ['background-cleanup', '/image'],
  ['product-rotation', '/video'],
  ['orbit-shot', '/video'],
  ['model-walk', '/video'],
  ['prompt-case-library', '/prompts'],
  ['commercial-skill-pack', '/prompts'],
  ['history-recreate', '/gallery'],
  ['character-creator', '/characters'],
  ['character-consistency', '/characters'],
  ['ai-image-style-grid', '/ai-image-style-grid'],
  ['comfyui-workflow-checker', '/tools/comfyui-workflow-checker'],
  [
    'mac-unpack',
    'https://github.com/jiamizhongshifu/MacUnpack/releases/tag/v0.1.4'
  ],
  ['ppt-deck-lab', '/create']
]);

// Search Console 中仍被抓取的旧英文 Prompt slug。只维护已经人工核对过、
// 且与当前案例一一对应的精确映射，避免把未知旧 URL 泛化重定向到错误内容。
const LEGACY_PROMPT_SLUG_REDIRECTS = new Map<string, string>([
  [
    'botanical-medic-character-design-prompt',
    'zh-botanical-medic-character-design-prompt'
  ],
  [
    'reading-nook-reference-image-to-prompt-workflow',
    'zh-reading-nook-reference-image-to-prompt-workflow'
  ],
  [
    'nano-banana-editorial-portrait-prompt-gallery',
    'zh-nano-banana-editorial-portrait-gpt-image-2-prompt'
  ],
  [
    'free-gpt-image-2-skincare-product-photo-prompt',
    'zh-sref-skincare-product-style-reference-gpt-image-2-prompt'
  ],
  [
    'creative-director-gallery-portrait-prompt',
    'zh-creative-director-gallery-portrait-prompt'
  ],
  [
    'modular-desk-lamp-product-photography-prompt',
    'zh-modular-desk-lamp-product-photography-prompt'
  ],
  [
    'boutique-hotel-lobby-ai-image-prompt-example',
    'zh-boutique-hotel-lobby-ai-image-prompt-example'
  ],
  [
    'brand-identity-poster-design-ai-prompt',
    'brand-identity-poster-design-prompt'
  ],
  [
    'toy-robot-reference-image-to-prompt-workflow',
    'zh-toy-robot-reference-image-to-prompt-workflow'
  ],
  [
    'saffron-citrus-tart-food-photography-prompt-example',
    'zh-saffron-citrus-tart-food-photography-prompt-example'
  ],
  [
    'wireless-headphones-product-photography-prompt',
    'zh-wireless-headphones-product-photography-prompt'
  ],
  [
    'iced-matcha-ai-image-prompt-example',
    'zh-iced-matcha-ai-image-prompt-example'
  ],
  [
    'retro-futurist-courier-mechanic-character-prompt',
    'zh-retro-futurist-courier-mechanic-character-prompt'
  ],
  [
    'reference-image-to-prompt-vase-workflow-example',
    'zh-reference-image-to-prompt-vase-workflow-example'
  ],
  [
    'mechanical-keyboard-kit-product-photography-prompt',
    'zh-mechanical-keyboard-kit-product-photography-prompt'
  ],
  [
    'botanical-sci-fi-character-design-prompt',
    'zh-botanical-sci-fi-character-design-prompt'
  ],
  [
    'saas-founder-linkedin-portrait-prompt',
    'zh-saas-founder-linkedin-portrait-prompt'
  ],
  [
    'product-photography-smart-speaker-prompt',
    'zh-product-photography-smart-speaker-prompt'
  ],
  [
    '3d-clay-figurine-character-design-prompt',
    'zh-3d-clay-figurine-character-design-prompt'
  ],
  [
    'en-white-vase-reference-image-to-prompt-workflow',
    'zh-reference-image-to-prompt-vase-workflow-example'
  ],
  [
    'en-creative-director-moodboard-portrait',
    'zh-creative-director-gallery-portrait-prompt'
  ],
  [
    'desert-signal-ranger-character-design-prompt',
    'zh-desert-signal-ranger-character-design-prompt'
  ],
  [
    'modular-travel-backpack-product-photography-prompt',
    'zh-modular-travel-backpack-product-photography-prompt'
  ],
  [
    'product-strategist-studio-portrait-prompt',
    'zh-product-strategist-studio-portrait-prompt'
  ],
  [
    'insulated-sports-bottle-product-photography-prompt',
    'zh-insulated-sports-bottle-product-photography-prompt'
  ],
  [
    'mountain-train-travel-poster-ai-image-prompt-example',
    'zh-mountain-train-travel-poster-ai-image-prompt-example'
  ],
  [
    'botanical-candle-set-product-photography-prompt',
    'zh-botanical-candle-set-product-photography-prompt'
  ]
]);

const RETIRED_SEO_PATHS = new Set(['/zh-CN/blog/ai-workflow-sop']);

const STATIC_PREFIXES = [
  '/assets/',
  '/icons/',
  '/contact/',
  '/create-apps/',
  '/discovery/',
  '/moodboards/',
  '/prompt-cases/',
  '/referral/'
];
const STATIC_FILES = new Set([
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/gtm-init.js',
  '/clarity-init.js',
  '/ads.txt',
  '/release-manifest.json',
  '/robots.txt',
  '/BingSiteAuth.xml',
  '/6796cb3e5ebfec970163618c59bf9f2c.txt',
  '/llms.txt'
]);
const REQUEST_ID_HEADER = 'x-webtomind-request-id';
const RUNTIME_HEADER = 'x-webtomind-runtime';
const ORIGIN_RUNTIME_HEADER = 'x-webtomind-origin-runtime';
const ROUTE_HEADER = 'x-webtomind-route';
const FRONTDOOR_RUNTIME_HEADER = 'x-webtomind-frontdoor-runtime';
const WORKER_RUNTIME = 'cloudflare-worker';
const PUBLIC_CONTENT_CACHE_VERSION = 'v1';
const PUBLIC_SEO_HTML_CACHE_VERSION = 'v2';
const PUBLIC_SEO_HTML_CACHE_TTL_SECONDS = 300;
// Bump both the snapshot namespace and request cache-buster whenever the SEO
// eligibility rules change, otherwise an old bootstrap can keep thin cases on
// indexable collection pages after their detail pages leave the sitemap.
const PROMPT_LIBRARY_BOOTSTRAP_CACHE_VERSION = 'v3';
const PROMPT_LIBRARY_BOOTSTRAP_QUERY_VERSION = 'prompt-library-v3';
const PUBLIC_CONTENT_CACHE_ROUTE_VERSIONS = new Map<string, string>([
  ['/api/content/prompt-assets', 'v2']
]);
const PUBLIC_CONTENT_CACHE_MAX_BODY_BYTES = 1_500_000;
const PUBLIC_CONTENT_CACHE_ROUTES = new Map<string, number>([
  ['/api/content/blog', 300],
  ['/api/content/prompt-assets', 60],
  ['/api/content/prompt-cases', 300],
  ['/api/content/skills', 300],
  ['/api/content/updates', 300],
  ['/api/credits/packages', 600],
  ['/api/membership/plans', 600],
  ['/api/image/models', 600],
  ['/api/video/models', 600]
]);
const PUBLIC_CONTENT_CACHE_QUERY_PARAMS = new Map<string, Set<string>>([
  ['/api/content/blog', new Set(['locale', 'limit', 'slug'])],
  ['/api/content/prompt-assets', new Set(['slot', 'limit'])],
  [
    '/api/content/prompt-cases',
    new Set([
      'id',
      'slug',
      'library',
      'category',
      'label',
      'model',
      'tag',
      'packageSlug',
      'locale',
      'q',
      'search',
      'sort',
      'cursor',
      'featured',
      'requireImage',
      'mediaType',
      'seoOnly',
      'limit',
      'v'
    ])
  ],
  ['/api/content/skills', new Set(['limit'])],
  ['/api/content/updates', new Set(['locale', 'limit'])],
  ['/api/credits/packages', new Set()],
  ['/api/membership/plans', new Set()],
  ['/api/image/models', new Set()],
  ['/api/video/models', new Set()]
]);
const PUBLIC_CONTENT_CACHE_VARY =
  'Authorization, Cookie, Origin, x-cron-secret';
const HYPERDRIVE_DIAGNOSTIC_CONNECTION_TIMEOUT_MS = 5_000;
const HYPERDRIVE_DIAGNOSTIC_QUERY_TIMEOUT_MS = 10_000;
const QUEUE_DIAGNOSTIC_BINDINGS = [
  {
    binding: 'IMAGE_JOBS',
    queue: 'webtomind-image-jobs',
    kind: 'primary',
    workload: 'image'
  },
  {
    binding: 'IMAGE_JOBS_DLQ',
    queue: 'webtomind-image-jobs-dlq',
    kind: 'dead_letter',
    workload: 'image'
  },
  {
    binding: 'VIDEO_JOBS',
    queue: 'webtomind-video-jobs',
    kind: 'primary',
    workload: 'video'
  },
  {
    binding: 'VIDEO_JOBS_DLQ',
    queue: 'webtomind-video-jobs-dlq',
    kind: 'dead_letter',
    workload: 'video'
  },
  {
    binding: 'EMAIL_CAMPAIGN_JOBS',
    queue: 'webtomind-email-campaign-jobs',
    kind: 'primary',
    workload: 'email'
  },
  {
    binding: 'EMAIL_CAMPAIGN_JOBS_DLQ',
    queue: 'webtomind-email-campaign-jobs-dlq',
    kind: 'dead_letter',
    workload: 'email'
  }
] as const;
const PROMPT_OG_CACHE_BUCKET = 'generated-images';
const PROMPT_OG_CACHE_PREFIX = 'prompt-og';
const PROMPT_OG_IMAGE_VERSION = '20260609-image-only-card';
const PROMPT_OG_RESPONSE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PROMPT_OG_WIDTH = 1200;
const PROMPT_OG_HEIGHT = 630;
const TRACKING_SEARCH_PARAMS = new Set([
  'source',
  'cta_source',
  'returnTo',
  'card',
  'payment',
  'checkoutType',
  'productId',
  'styleGrid',
  'template',
  'items',
  'openCharacters',
  'openGalleryReferences',
  'moodboardId',
  'shareToken',
  'sessionId',
  'newSession',
  'legacyHistory'
]);
const ACQUISITION_SEARCH_PARAMS = new Set([
  'source',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'fbclid'
]);

function createRequestId(): string {
  return crypto.randomUUID();
}

function getRequestId(request: Request): string {
  const existing = request.headers.get(REQUEST_ID_HEADER)?.trim();
  return existing || createRequestId();
}

function withObservabilityRequestHeaders(
  request: Request,
  observability: RequestObservability
): Request {
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, observability.requestId);
  headers.set(ROUTE_HEADER, observability.route);
  headers.set(FRONTDOOR_RUNTIME_HEADER, WORKER_RUNTIME);
  return new Request(request, { headers });
}

function appendServerTiming(
  headers: Headers,
  metric: string,
  durationMs: number
): void {
  const value = `${metric};dur=${Math.max(0, Math.round(durationMs))}`;
  const existing = headers.get('Server-Timing');
  headers.set('Server-Timing', existing ? `${existing}, ${value}` : value);
}

const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://www.clarity.ms https://scripts.clarity.ms https://ep2.adtrafficquality.google https://static.cloudflareinsights.com https://vibeloft.ai https://analytics.ahrefs.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://www.google.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://pagead2.googlesyndication.com https://*.googleadservices.com https://googleads.g.doubleclick.net https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google https://www.clarity.ms https://*.clarity.ms https://cloudflareinsights.com https://*.cloudflareinsights.com https://api.vibeloft.ai https://analytics.ahrefs.com",
  'frame-src https://accounts.google.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://*.googleadservices.com https://ep2.adtrafficquality.google https://www.google.com',
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'"
].join('; ');

const BOOT_WATCHDOG_PATH = '/boot-watchdog.js';

function serveBootWatchdog(): Response {
  return new Response(BOOT_WATCHDOG_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function applySecurityResponseHeaders(
  request: Request,
  response: Response,
  headers: Headers
): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self)'
  );
  if (new URL(request.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (contentType.includes('text/html')) {
    headers.set('Content-Security-Policy', HTML_CONTENT_SECURITY_POLICY);
  }
}

function withObservabilityResponseHeaders(
  request: Request,
  response: Response,
  observability: RequestObservability,
  durationMs: number
): Response {
  const headers = new Headers(response.headers);
  headers.set(REQUEST_ID_HEADER, observability.requestId);
  headers.set(RUNTIME_HEADER, WORKER_RUNTIME);
  headers.set(ROUTE_HEADER, observability.route);
  if (!headers.has(ORIGIN_RUNTIME_HEADER)) {
    headers.set(ORIGIN_RUNTIME_HEADER, WORKER_RUNTIME);
  }
  if (
    shouldNoindexTrackingUrl(request) &&
    !headers.get('x-robots-tag')?.toLowerCase().includes('noindex')
  ) {
    headers.set('X-Robots-Tag', 'noindex, follow');
  }
  applySecurityResponseHeaders(request, response, headers);
  appendServerTiming(headers, 'app', durationMs);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function shouldNoindexTrackingUrl(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);
  if (
    pathname.startsWith('/api/') ||
    isStaticAssetPath(pathname) ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt'
  ) {
    return false;
  }

  for (const key of url.searchParams.keys()) {
    if (TRACKING_SEARCH_PARAMS.has(key) || key.startsWith('utm_')) {
      return true;
    }
  }
  return false;
}

export function shouldNoindexTrackingUrlForTest(path: string): boolean {
  return shouldNoindexTrackingUrl(
    new Request(new URL(path, 'https://webtomind.com').toString())
  );
}

async function sitemapHandler(request: Request): Promise<Response> {
  const response = await renderSitemapResponse(request);
  const headers = new Headers(response.headers);
  headers.set('x-webtomind-sitemap-runtime', 'cloudflare-worker');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function readJsonObject(
  request: Request
): Promise<Record<string, unknown>> {
  try {
    const value = await request.clone().json();
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function buildSmartChatCompatRequest(
  request: Request,
  body: Record<string, unknown>
): Request {
  const prompt =
    typeof body.prompt === 'string'
      ? body.prompt
      : typeof body.message === 'string'
        ? body.message
        : '';
  const mode = body.mode === 'ask' ? 'ask' : 'agent';
  const context =
    body.context && typeof body.context === 'object' ? body.context : undefined;
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');

  return new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      context,
      thinkingMode: body.thinkingMode === true,
      mode,
      feature:
        context && 'feature' in context
          ? (context as Record<string, unknown>).feature
          : undefined
    })
  });
}

async function handleAgentChatCompatRequest(
  request: Request
): Promise<Response> {
  if (request.method === 'OPTIONS') return agentSmartChatHandler(request);
  const body = await readJsonObject(request);
  return agentSmartChatHandler(buildSmartChatCompatRequest(request, body));
}

async function handleAgentChatSyncCompatRequest(
  request: Request
): Promise<Response> {
  if (request.method === 'OPTIONS') return agentSmartChatHandler(request);
  const body = await readJsonObject(request);
  const response = await agentSmartChatHandler(
    buildSmartChatCompatRequest(request, body)
  );
  if (!response.ok) return response;

  const reader = response.body?.getReader();
  if (!reader) {
    return workerJsonResponse(
      { success: false, error: 'No response body' },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = 'text';
  let content = '';
  const toolCalls: unknown[] = [];
  const toolResults: unknown[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;
      const dataText = line.slice(6);
      if (dataText === '[DONE]') {
        return workerJsonResponse(
          { success: true, data: { content, toolCalls, toolResults } },
          200,
          { 'Cache-Control': 'no-store' }
        );
      }
      try {
        const data = JSON.parse(dataText) as Record<string, unknown>;
        if (
          (currentEventType === 'text' || currentEventType === 'thinking') &&
          typeof data.content === 'string'
        ) {
          content += data.content;
        } else if (currentEventType === 'tool_call') {
          toolCalls.push(data);
        } else if (currentEventType === 'tool_result') {
          toolResults.push(data);
        }
      } catch {
        console.warn('[Worker] Failed to parse smart-chat compat SSE chunk');
      } finally {
        currentEventType = 'text';
      }
    }
  }

  return workerJsonResponse(
    { success: true, data: { content, toolCalls, toolResults } },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

function handleAgentSkillRunsCompatRequest(): Response {
  return workerJsonResponse(
    {
      runs: [],
      disabled: true,
      message:
        'Skill run history is not available on the Cloudflare Worker runtime.'
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

function handleAgentSkillRunCompatRequest(request: Request): Response {
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId') || 'worker-disabled';
  const now = Date.now();
  return workerJsonResponse(
    {
      run: {
        id: runId,
        userId: '',
        mode: 'sync',
        status: 'unavailable',
        traceId: 'worker-skill-run-history-disabled',
        startedAt: now,
        endedAt: now,
        errorMessage:
          'Skill run history is not available on the Cloudflare Worker runtime.'
      },
      steps: [],
      artifacts: []
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

function handleAgentSkillRunsCleanupCompatRequest(): Response {
  return workerJsonResponse(
    {
      removed: 0,
      disabled: true,
      message:
        'Skill run cleanup is not available on the Cloudflare Worker runtime.'
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

const WORKER_API_ROUTES = new Map<
  string,
  (request: Request) => Promise<Response> | Response
>([
  ['/api/health', healthHandler],
  ['/api/sitemap', sitemapHandler],
  ['/api/debug/agent', debugAgentHandler],
  ['/api/auth/me', authMeHandler],
  ['/api/analytics/conversion-event', analyticsConversionEventHandler],
  ['/api/analytics/conversion-report', analyticsConversionReportHandler],
  ['/api/content/blog', contentBlogHandler],
  ['/api/content/prompt-assets', contentPromptAssetsHandler],
  ['/api/content/prompt-cases', contentPromptCasesHandler],
  ['/api/content/prompt-cases/event', contentPromptCaseEventHandler],
  ['/api/content/skills', contentSkillsHandler],
  ['/api/content/updates', contentUpdatesHandler],
  ['/api/admin/ai-usage/summary', adminAiUsageSummaryHandler],
  ['/api/admin/image-provider-probe', adminImageProviderProbeHandler],
  ['/api/admin/media-credits', adminMediaCreditsHandler],
  ['/api/admin/prompt-assets', adminPromptAssetsHandler],
  [
    '/api/admin/prompt-asset-production-batches',
    adminPromptAssetProductionBatchesHandler
  ],
  [
    '/api/admin/prompt-case-asset-coverage/analyze',
    adminPromptCaseAssetCoverageAnalyzeHandler
  ],
  ['/api/admin/prompt-cases', adminPromptCasesHandler],
  ['/api/admin/prompt-cases/upload', adminPromptCasesUploadHandler],
  ['/api/admin/prompt-case-drafts', adminPromptCaseDraftsHandler],
  [
    '/api/admin/prompt-case-drafts/generate',
    adminPromptCaseDraftGenerateHandler
  ],
  [
    '/api/admin/prompt-case-drafts/generate-images',
    adminPromptCaseDraftGenerateImagesHandler
  ],
  ['/api/admin/prompt-case-drafts/import', adminPromptCaseDraftImportHandler],
  ['/api/credits/balance', creditBalanceHandler],
  ['/api/credits/consume', creditConsumeHandler],
  ['/api/credits/daily-login-reward', creditDailyLoginRewardHandler],
  ['/api/credits/daily-usage', creditDailyUsageHandler],
  ['/api/credits/image-cost', creditImageCostHandler],
  ['/api/credits/packages', creditPackagesHandler],
  ['/api/credits/quick-reply-quota', creditQuickReplyQuotaHandler],
  ['/api/credits/transactions', creditTransactionsHandler],
  ['/api/credits/video-cost', creditVideoCostHandler],
  ['/api/credits/weaving-quota', creditWeavingQuotaHandler],
  ['/api/image/history', imageHistoryHandler],
  ['/api/image/models', imageModelsHandler],
  ['/api/image/recipes', imageRecipesHandler],
  ['/api/image/characters', imageCharactersHandler],
  ['/api/image/consistency/check', imageConsistencyCheckHandler],
  ['/api/image/quality/score', imageVisualQualityScoreHandler],
  ['/api/image/references', imageReferencesHandler],
  ['/api/image/references/bytes', imageReferencesBytesHandler],
  [
    '/api/image/references/from-generation',
    imageReferencesFromGenerationHandler
  ],
  ['/api/image/references/upload', imageReferencesUploadHandler],
  ['/api/image/prompt-optimize', imagePromptOptimizeHandler],
  ['/api/image/user-library', imageUserLibraryHandler],
  ['/api/discovery/search', discoverySearchHandler],
  ['/api/discovery/describe-image', discoveryDescribeImageHandler],
  ['/api/image-sessions', imageSessionsHandler],
  ['/api/moodboards', moodboardsHandler],
  ['/api/image/drain', imageDrainHandler],
  ['/api/agent/batch-image-execute', agentBatchImageExecuteHandler],
  ['/api/agent/chat', handleAgentChatCompatRequest],
  ['/api/agent/chat/sync', handleAgentChatSyncCompatRequest],
  ['/api/agent/skill-run', handleAgentSkillRunCompatRequest],
  ['/api/agent/skill-runs', handleAgentSkillRunsCompatRequest],
  ['/api/agent/skill-runs-cleanup', handleAgentSkillRunsCleanupCompatRequest],
  ['/api/agent/smart-chat', agentSmartChatHandler],
  ['/api/agent/skill-image-chat', skillImageChatHandler],
  ['/api/ai/gemini/thinking', geminiThinkingHandler],
  ['/api/prompt-assets/user', promptAssetsUserHandler],
  ['/api/prompt-assets/user/import-prompt', handlePromptImportRequest],
  ['/api/prompt-assets/user/upload', handleUserUploadRequest],
  ['/api/prompt-assets/user/thumbnail', handleThumbnailRequest],
  ['/api/video/history', videoHistoryHandler],
  ['/api/video/drain', videoDrainHandler],
  ['/api/video/models', videoModelsHandler],
  ['/api/video/prompt-optimize', videoPromptOptimizeHandler],
  ['/api/video/references/upload', videoReferencesUploadHandler],
  ['/api/video/status', videoStatusHandler],
  ['/api/video/task', videoTaskHandler],
  ['/api/membership/checkout', membershipCheckoutHandler],
  ['/api/membership/grant-monthly', membershipGrantMonthlyHandler],
  ['/api/membership/order-status', membershipOrderStatusHandler],
  ['/api/membership/plans', membershipPlansHandler],
  ['/api/membership/portal', membershipPortalHandler],
  ['/api/membership/referral', membershipReferralHandler],
  ['/api/membership/subscription', membershipSubscriptionHandler],
  ['/api/membership/tasks', membershipTasksHandler],
  ['/api/membership/webhook', membershipWebhookHandler],
  ['/api/membership/zpay-notify', membershipZpayNotifyHandler],
  ['/api/membership/zpay-return', membershipZpayReturnHandler],
  ['/api/api-marketplace/catalog', apiMarketplaceCatalogHandler],
  ['/api/api-marketplace/keys', apiMarketplaceKeysHandler],
  ['/api/api-marketplace/keys/fund', apiMarketplaceKeyFundHandler],
  ['/api/api-marketplace/wallet', apiMarketplaceWalletHandler],
  ['/api/api-marketplace/packages', apiMarketplacePackagesHandler],
  ['/api/api-marketplace/usage', apiMarketplaceUsageHandler],
  ['/api/marketing/email-drain', marketingEmailDrainHandler],
  ['/api/marketing/email-scheduler', handleMarketingEmailSchedulerRequest],
  ['/api/marketing/resend-webhook', marketingResendWebhookHandler],
  ['/api/marketing/subscribe', marketingSubscribeHandler],
  ['/api/marketing/unsubscribe', marketingUnsubscribeHandler],
  ['/api/share/create', shareCreateHandler],
  ['/api/share/revoke', shareRevokeHandler],
  ['/api/workspace/projects', workspaceProjectsHandler],
  ['/api/workspace/cards', workspaceCardsHandler],
  ['/api/workspace/cards/reorder', workspaceCardsReorderHandler],
  ['/api/workspace/cards/weave', workspaceCardsWeaveHandler],
  ['/api/workspace/summaries', workspaceSummariesHandler],
  ['/api/workspace/summary-confirm', workspaceSummaryConfirmHandler],
  ['/api/workspace/conversations', workspaceConversationsHandler],
  ['/api/workspace/shortcuts', workspaceShortcutsHandler],
  ['/api/workspace/skills', workspaceSkillsHandler],
  ['/api/workspace/skills/references', workspaceSkillReferencesHandler],
  ['/api/workspace/skills/scripts', workspaceSkillScriptsHandler],
  ['/api/workspace/skills/templates', workspaceSkillTemplatesHandler],
  ['/api/workspace/source-extract', workspaceSourceExtractHandler],
  ['/api/workspace/source-search', workspaceSourceSearchHandler],
  ['/api/workspace/studio-ai', workspaceStudioAiHandler],
  ['/api/workspace/studio-chart-image', workspaceStudioChartImageHandler],
  ['/api/workspace/studio-documents', workspaceStudioDocumentsHandler],
  ['/api/workspace/studio-readiness', workspaceStudioReadinessHandler],
  ['/api/workspace/tasks', handleWorkspaceTasksRequest],
  ['/api/workspace/trash', workspaceTrashHandler]
]);

function getWorkerApiHandler(
  pathname: string
): ((request: Request) => Promise<Response> | Response) | null {
  const exactHandler = WORKER_API_ROUTES.get(pathname);
  if (exactHandler) return exactHandler;
  if (/^\/v1(?:\/|$)/.test(pathname)) return apiMarketplaceGatewayHandler;
  if (
    /^\/api\/admin\/prompt-asset-production-batches\/[^/]+\/run$/.test(pathname)
  )
    return adminPromptAssetProductionBatchRunHandler;
  if (/^\/api\/admin\/prompt-asset-production-batches\/[^/]+$/.test(pathname))
    return adminPromptAssetProductionBatchDetailHandler;
  if (/^\/api\/admin\/prompt-case-drafts\/[^/]+\/publish$/.test(pathname))
    return adminPromptCaseDraftPublishHandler;
  if (/^\/api\/admin\/prompt-case-drafts\/[^/]+$/.test(pathname))
    return adminPromptCaseDraftDetailHandler;
  if (/^\/api\/share\/[^/]+$/.test(pathname)) return shareTokenHandler;
  if (/^\/api\/moodboards\/[^/]+\/items$/.test(pathname))
    return moodboardItemsHandler;
  if (/^\/api\/moodboards\/[^/]+\/analyze$/.test(pathname))
    return moodboardAnalyzeHandler;
  if (/^\/api\/moodboards\/[^/]+\/share$/.test(pathname))
    return moodboardShareHandler;
  if (/^\/api\/moodboards\/[^/]+$/.test(pathname))
    return moodboardDetailHandler;
  if (/^\/api\/public\/moodboards\/[^/]+$/.test(pathname))
    return publicMoodboardHandler;
  if (/^\/api\/image-sessions\/[^/]+\/turns$/.test(pathname))
    return imageSessionTurnsHandler;
  if (/^\/api\/image-sessions\/[^/]+$/.test(pathname))
    return imageSessionDetailHandler;
  if (/^\/api\/workspace\/projects\/[^/]+$/.test(pathname))
    return workspaceProjectDetailHandler;
  if (/^\/api\/workspace\/cards\/[^/]+$/.test(pathname))
    return workspaceCardDetailHandler;
  if (/^\/api\/workspace\/summaries\/[^/]+$/.test(pathname))
    return workspaceSummaryDetailHandler;
  if (/^\/api\/workspace\/conversations\/[^/]+$/.test(pathname))
    return workspaceConversationDetailHandler;
  if (/^\/api\/workspace\/shortcuts\/[^/]+$/.test(pathname))
    return workspaceShortcutDetailHandler;
  if (/^\/api\/workspace\/skills\/references\/[^/]+$/.test(pathname))
    return workspaceSkillReferenceDetailHandler;
  if (/^\/api\/workspace\/skills\/scripts\/[^/]+$/.test(pathname))
    return workspaceSkillScriptDetailHandler;
  if (/^\/api\/workspace\/skills\/[^/]+$/.test(pathname))
    return workspaceSkillDetailHandler;
  if (/^\/api\/workspace\/studio-documents\/[^/]+$/.test(pathname))
    return workspaceStudioDocumentDetailHandler;
  if (/^\/api\/workspace\/tasks\/[^/]+\/result$/.test(pathname))
    return workspaceTaskResultHandler;
  if (/^\/api\/workspace\/tasks\/[^/]+\/cancel$/.test(pathname))
    return workspaceTaskCancelHandler;
  if (/^\/api\/workspace\/tasks\/[^/]+\/retry$/.test(pathname))
    return workspaceTaskRetryHandler;
  if (/^\/api\/workspace\/tasks\/[^/]+$/.test(pathname))
    return workspaceTaskDetailHandler;
  if (/^\/api\/workspace\/trash\/[^/]+$/.test(pathname))
    return workspaceTrashDetailHandler;
  return null;
}

function getWorkerApiRouteLabel(pathname: string): string | null {
  if (WORKER_API_ROUTES.has(pathname)) return pathname;
  if (/^\/v1(?:\/|$)/.test(pathname)) return '/v1/:path';
  if (
    /^\/api\/admin\/prompt-asset-production-batches\/[^/]+\/run$/.test(pathname)
  )
    return '/api/admin/prompt-asset-production-batches/:id/run';
  if (/^\/api\/admin\/prompt-asset-production-batches\/[^/]+$/.test(pathname))
    return '/api/admin/prompt-asset-production-batches/:id';
  if (/^\/api\/admin\/prompt-case-drafts\/[^/]+\/publish$/.test(pathname))
    return '/api/admin/prompt-case-drafts/:id/publish';
  if (/^\/api\/admin\/prompt-case-drafts\/[^/]+$/.test(pathname))
    return '/api/admin/prompt-case-drafts/:id';
  if (/^\/api\/share\/[^/]+$/.test(pathname)) return '/api/share/:token';
  if (/^\/api\/moodboards\/[^/]+\/items$/.test(pathname))
    return '/api/moodboards/:id/items';
  if (/^\/api\/moodboards\/[^/]+\/analyze$/.test(pathname))
    return '/api/moodboards/:id/analyze';
  if (/^\/api\/moodboards\/[^/]+\/share$/.test(pathname))
    return '/api/moodboards/:id/share';
  if (/^\/api\/moodboards\/[^/]+$/.test(pathname)) return '/api/moodboards/:id';
  if (/^\/api\/public\/moodboards\/[^/]+$/.test(pathname))
    return '/api/public/moodboards/:token';
  if (/^\/api\/image-sessions\/[^/]+\/turns$/.test(pathname))
    return '/api/image-sessions/:id/turns';
  if (/^\/api\/image-sessions\/[^/]+$/.test(pathname))
    return '/api/image-sessions/:id';
  if (/^\/api\/workspace\/projects\/[^/]+$/.test(pathname))
    return '/api/workspace/projects/:id';
  if (/^\/api\/workspace\/cards\/[^/]+$/.test(pathname))
    return '/api/workspace/cards/:id';
  if (/^\/api\/workspace\/summaries\/[^/]+$/.test(pathname))
    return '/api/workspace/summaries/:id';
  if (/^\/api\/workspace\/conversations\/[^/]+$/.test(pathname))
    return '/api/workspace/conversations/:id';
  if (/^\/api\/workspace\/shortcuts\/[^/]+$/.test(pathname))
    return '/api/workspace/shortcuts/:id';
  if (/^\/api\/workspace\/skills\/references\/[^/]+$/.test(pathname))
    return '/api/workspace/skills/references/:name';
  if (/^\/api\/workspace\/skills\/scripts\/[^/]+$/.test(pathname))
    return '/api/workspace/skills/scripts/:name';
  if (/^\/api\/workspace\/skills\/[^/]+$/.test(pathname))
    return '/api/workspace/skills/:id';
  if (/^\/api\/workspace\/studio-documents\/[^/]+$/.test(pathname))
    return '/api/workspace/studio-documents/:id';
  if (/^\/api\/workspace\/tasks\/[^/]+\/result$/.test(pathname))
    return '/api/workspace/tasks/:id/result';
  if (/^\/api\/workspace\/tasks\/[^/]+\/cancel$/.test(pathname))
    return '/api/workspace/tasks/:id/cancel';
  if (/^\/api\/workspace\/tasks\/[^/]+\/retry$/.test(pathname))
    return '/api/workspace/tasks/:id/retry';
  if (/^\/api\/workspace\/tasks\/[^/]+$/.test(pathname))
    return '/api/workspace/tasks/:id';
  if (/^\/api\/workspace\/trash\/[^/]+$/.test(pathname))
    return '/api/workspace/trash/:id';
  return null;
}

type ProcessLikeGlobal = {
  process?: { env?: Record<string, string | undefined> };
  __WEBTOMIND_CLOUDFLARE_IMAGES?: CloudflareImagesBinding;
  __WEBTOMIND_MEDIA_BUCKET?: R2BucketBinding;
};

function getRuntimeGlobal(): ProcessLikeGlobal {
  return globalThis as unknown as ProcessLikeGlobal;
}

function getProcessLikeGlobal(): { env?: Record<string, string | undefined> } {
  const target = getRuntimeGlobal();
  if (!target.process) {
    target.process = { env: {} };
  }
  if (!target.process.env) {
    target.process.env = {};
  }
  return target.process;
}

async function withRuntimeEnv<T>(
  env: Env,
  callback: () => Promise<T> | T
): Promise<T> {
  const processLike = getProcessLikeGlobal();
  const runtimeGlobal = getRuntimeGlobal();
  const previous = processLike.env || {};
  const previousImagesBinding = runtimeGlobal.__WEBTOMIND_CLOUDFLARE_IMAGES;
  const previousMediaBucketBinding = runtimeGlobal.__WEBTOMIND_MEDIA_BUCKET;
  const next: Record<string, string | undefined> = { ...previous };

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      next[key] = value;
    }
  }
  next.WEBTOMIND_RUNTIME = WORKER_RUNTIME;
  next.WEBTOMIND_IMAGE_RUNTIME = WORKER_RUNTIME;
  if (typeof env.API_MARKETPLACE_ACCESS_EMAILS === 'string') {
    next.VITE_API_MARKETPLACE_ACCESS_EMAILS = env.API_MARKETPLACE_ACCESS_EMAILS;
  }
  if (env.HYPERDRIVE?.connectionString) {
    next.HYPERDRIVE_CONNECTION_STRING = env.HYPERDRIVE.connectionString;
  }

  processLike.env = next;
  runtimeGlobal.__WEBTOMIND_CLOUDFLARE_IMAGES = env.IMAGES;
  runtimeGlobal.__WEBTOMIND_MEDIA_BUCKET = env.MEDIA_BUCKET;
  try {
    return await callback();
  } finally {
    processLike.env = previous;
    runtimeGlobal.__WEBTOMIND_CLOUDFLARE_IMAGES = previousImagesBinding;
    runtimeGlobal.__WEBTOMIND_MEDIA_BUCKET = previousMediaBucketBinding;
  }
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

function withQuery(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function withAcquisitionQuery(
  pathname: string,
  searchParams: URLSearchParams
): string {
  const acquisitionParams = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key.startsWith('utm_') || ACQUISITION_SEARCH_PARAMS.has(key)) {
      acquisitionParams.append(key, value);
    }
  });
  return withQuery(pathname, acquisitionParams);
}

function isNlmApiPath(pathname: string): boolean {
  return pathname === '/api/nlm' || pathname.startsWith('/api/nlm/');
}

function redirectTo(
  request: Request,
  targetPath: string,
  status = 308
): Response {
  const url = new URL(request.url);
  const targetUrl = new URL(targetPath, url);
  url.pathname = targetUrl.pathname;
  url.search = targetUrl.search;
  return Response.redirect(url.toString(), status);
}

function getLegacyCreateAppRedirect(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(
    /^\/(?:(zh-CN|en-US)\/)?create\/apps\/([^/]+)(?:\/use)?$/
  );
  if (!match) return null;
  const [, locale = '', slug] = match;
  const target = LEGACY_CREATE_APP_REDIRECTS.get(slug);
  if (!target) return null;
  if (/^https?:\/\//.test(target)) return target;
  const localized =
    locale && !target.startsWith(`/${locale}/`)
      ? `/${locale}${target}`
      : target;
  return withAcquisitionQuery(localized, requestUrl.searchParams);
}

function getLegacyUseCaseDetailRedirectTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(/^\/(zh-CN|en-US)\/use-cases\/([^/]+)$/);
  if (!match) return null;
  const [, locale, slug] = match;
  return withAcquisitionQuery(
    `/${locale}/blog/${slug}`,
    requestUrl.searchParams
  );
}

function getLegacyPromptSlugRedirectTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(/^\/(zh-CN|en-US)\/prompts\/([^/]+)$/);
  if (!match) return null;
  const targetSlug = LEGACY_PROMPT_SLUG_REDIRECTS.get(match[2]);
  if (!targetSlug) return null;
  return withAcquisitionQuery(
    `/${match[1]}/prompts/${targetSlug}`,
    requestUrl.searchParams
  );
}

function getLegacyPromptPreviewRedirectTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(/^\/(zh-CN|en-US)\/prompts$/);
  if (!match) return null;
  const sourceSlug =
    requestUrl.searchParams.get('caseSlug')?.trim() ||
    requestUrl.searchParams.get('case')?.trim() ||
    '';
  const targetSlug = LEGACY_PROMPT_SLUG_REDIRECTS.get(sourceSlug);
  if (!targetSlug) return null;
  return withAcquisitionQuery(
    `/${match[1]}/prompts/${targetSlug}`,
    requestUrl.searchParams
  );
}

function isStaticAssetPath(pathname: string): boolean {
  return (
    STATIC_FILES.has(pathname) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isPromptSlugPath(pathname: string): boolean {
  return (
    (/^\/(?:zh-CN|en-US)\/prompts\/[^/]+$/.test(pathname) &&
      !/^\/(?:zh-CN|en-US)\/prompts\/admin$/.test(pathname)) ||
    /^\/(?:(?:zh-CN|en-US)\/)?create\/prompts\/share\/[^/]+$/.test(pathname)
  );
}

function isCreateAppPath(pathname: string): boolean {
  return (
    /^\/(?:zh-CN\/|en-US\/)?(?:create\/)?apps$/.test(pathname) ||
    /^\/(?:zh-CN\/|en-US\/)?tools\/(?:image-upscaler|image-splitter|watermark-remover|background-remover|gpt-image-2-denoiser|image-compressor|image-editor)$/.test(
      pathname
    )
  );
}

function isPatternSeoPath(pathname: string): boolean {
  return (
    /^\/(?:zh-CN|en-US)\/skills\/[^/]+$/.test(pathname) ||
    /^\/(?:zh-CN|en-US)\/prompts\/(?:category|model|package)\/[^/]+$/.test(
      pathname
    ) ||
    /^\/(?:zh-CN|en-US)\/use-cases\/[^/]+$/.test(pathname) ||
    /^\/(?:zh-CN|en-US)\/blog\/[^/]+$/.test(pathname) ||
    /^\/s\/[^/]+$/.test(pathname)
  );
}

const NOINDEX_APP_SHELL_EXACT_PATHS = new Set([
  '/create',
  '/create/image',
  '/create/video',
  '/create/gallery',
  '/create/characters',
  '/create/tasks',
  '/create/pricing',
  '/image',
  '/video',
  '/gallery',
  '/moodboards',
  '/characters',
  '/apps',
  '/settings',
  '/account',
  '/models',
  '/api-console',
  '/recharge',
  '/boards',
  '/skills'
]);

function isNoindexAppShellPath(pathname: string): boolean {
  const pathWithoutLocale =
    pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
  return (
    NOINDEX_APP_SHELL_EXACT_PATHS.has(pathWithoutLocale) ||
    /^\/boards\/[^/]+$/.test(pathWithoutLocale) ||
    /^\/create\/boards(?:\/[^/]+)?$/.test(pathWithoutLocale) ||
    /^\/moodboards(?:\/[^/]+)?$/.test(pathWithoutLocale) ||
    /^\/create\/moodboards(?:\/[^/]+)?$/.test(pathWithoutLocale) ||
    /^\/create\/assets$/.test(pathWithoutLocale) ||
    /^\/create\/apps\/[^/]+\/use$/.test(pathWithoutLocale) ||
    /^\/prompts\/admin(?:\/[^/]+)?$/.test(pathWithoutLocale) ||
    /^\/prompts\/[^/]+$/.test(pathWithoutLocale)
  );
}

/**
 * 顶层 moodboard 应用路由。必须在静态资源前缀（/moodboards/curated/ 等）
 * 之前匹配，否则 /moodboards/new、/moodboards/:id、/moodboards/s/:token
 * 会被当作静态资源请求。
 */
function isMoodboardAppShellPath(pathname: string): boolean {
  const pathWithoutLocale =
    pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
  return (
    pathWithoutLocale === '/moodboards' ||
    /^\/moodboards\/[^/]+$/.test(pathWithoutLocale) ||
    /^\/moodboards\/s\/[^/]+$/.test(pathWithoutLocale)
  );
}

function getCreateBoardsRedirectTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(
    /^\/(?:(zh-CN|en-US)\/)?create\/boards(?=\/|$)(.*)$/
  );
  if (!match) return null;

  const suffix = match[2] || '';
  return withQuery(`/boards${suffix}`, requestUrl.searchParams);
}

const LEGACY_CREATOR_TOP_LEVEL_PAGES = new Map([
  ['moodboards', '/moodboards'],
  ['characters', '/characters'],
  ['gallery', '/gallery'],
  ['image', '/image'],
  ['video', '/video'],
  ['prompts', '/prompts'],
  ['apps', '/apps']
]);

/**
 * 旧 /create/{moodboards|characters|gallery|image|video|prompts|apps}
 * 路由 -> 新顶层路由的 308 重定向。保留语言前缀与查询参数，
 * /create/prompts/share/:caseId 保持独立分享流程，交给 SEO 页面处理。
 */
function getLegacyCreatorRouteRedirectTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(
    /^\/(?:(zh-CN|en-US)\/)?create\/(moodboards|characters|gallery|image|video|prompts|apps)(?:\/(.*))?$/
  );
  if (!match) return null;

  const [, locale = '', page, rawSuffix = ''] = match;
  if (page === 'prompts' && rawSuffix.startsWith('share/')) return null;

  const canonical = LEGACY_CREATOR_TOP_LEVEL_PAGES.get(page)!;
  // /create/apps/* 没有独立子页面，统一收敛回应用目录
  const suffix = page === 'apps' && rawSuffix ? '' : rawSuffix;
  const target = `${locale ? `/${locale}` : ''}${canonical}${
    suffix ? `/${suffix}` : ''
  }`;
  return withQuery(target, requestUrl.searchParams);
}

function getPromptPageTarget(pathname: string): string | null {
  const shareMatch = pathname.match(
    /^\/(?:(zh-CN|en-US)\/)?create\/prompts\/share\/([^/]+)$/
  );
  if (shareMatch) {
    const locale = shareMatch[1] || 'zh-CN';
    return `/api/prompt-page?locale=${encodeURIComponent(locale)}&id=${encodeURIComponent(shareMatch[2])}&redirect=id-to-slug`;
  }

  const slugMatch = pathname.match(/^\/(zh-CN|en-US)\/prompts\/([^/]+)$/);
  if (slugMatch && slugMatch[2] !== 'admin') {
    return `/api/prompt-page?locale=${encodeURIComponent(slugMatch[1])}&slug=${encodeURIComponent(slugMatch[2])}`;
  }

  return null;
}

function getPromptPreviewPageTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);
  const match = pathname.match(/^\/(zh-CN|en-US)\/prompts$/);
  if (!match) return null;

  const locale = match[1];
  const caseSlug = requestUrl.searchParams.get('caseSlug')?.trim() || '';
  const caseId =
    requestUrl.searchParams.get('caseId')?.trim() ||
    requestUrl.searchParams.get('case')?.trim() ||
    '';

  if (caseSlug) {
    return `/api/prompt-page?locale=${encodeURIComponent(locale)}&slug=${encodeURIComponent(caseSlug)}`;
  }

  if (caseId) {
    return `/api/prompt-page?locale=${encodeURIComponent(locale)}&id=${encodeURIComponent(caseId)}`;
  }

  return null;
}

function getCreateAppPageTarget(pathname: string): string | null {
  const directoryMatch = pathname.match(
    /^\/(?:(zh-CN|en-US)\/)?(?:create\/)?apps(?:\/([^/]+))?$/
  );
  const toolMatch = pathname.match(/^\/(?:(zh-CN|en-US)\/)?tools\/([^/]+)$/);
  const match = directoryMatch || toolMatch;
  if (!match) return null;

  const locale = match[1] || 'zh-CN';
  const slug = directoryMatch ? undefined : match[2];
  const params = new URLSearchParams({ locale, path: pathname });
  if (slug) params.set('slug', slug);
  return `/api/create-app-page?${params.toString()}`;
}

function getSeoTarget(requestUrl: URL): string | null {
  const pathname = normalizePath(requestUrl.pathname);

  if (pathname === '/sitemap.xml') return '/api/sitemap';
  const promptPreviewTarget = getPromptPreviewPageTarget(requestUrl);
  if (promptPreviewTarget) return promptPreviewTarget;
  if (isPromptSlugPath(pathname)) {
    return getPromptPageTarget(pathname);
  }
  if (isCreateAppPath(pathname)) {
    return getCreateAppPageTarget(pathname);
  }
  if (isExactSeoPath(pathname) || isPatternSeoPath(pathname)) {
    const params = new URLSearchParams(requestUrl.searchParams);
    params.set('path', pathname);
    return `/api/seo-page?${params.toString()}`;
  }
  return null;
}

/** 常见爬虫/社交分享/脚本 UA，用于判断是否需要服务端预渲染。 */
const CRAWLER_UA_PATTERN =
  /(bot|crawler|spider|slurp|bingpreview|bingbot|googlebot|google-inspectiontool|yandex|baiduspider|sogou|360spider|facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|embedly|outbrain|quora\s*link\s*preview|discordbot|slackbot|whatsapp|telegrambot|viber|line|micromessenger|vkShare|curl|wget|python-requests|python-urllib|axios|postman|phantomjs|puppeteer|playwright|headlesschrome)/i;

/**
 * 判断请求是否来自爬虫/脚本/无 UA 客户端。
 * 真实浏览器（Mozilla UA 且带 text/html Accept）返回纯 SPA 壳，避免刷新时闪现
 * 服务端预渲染内容；爬虫与脚本仍返回 SEO HTML。
 */
function isCrawlerRequest(request: Request): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  if (!userAgent) return true;
  if (CRAWLER_UA_PATTERN.test(userAgent)) return true;
  if (!userAgent.includes('Mozilla')) return true;
  const accept = request.headers.get('accept') || '';
  if (accept && !accept.includes('text/html')) return true;
  return false;
}

function isWorkerRenderableSeoTarget(target: string): boolean {
  return (
    target.startsWith('/api/seo-page?') ||
    target.startsWith('/api/prompt-page?') ||
    target.startsWith('/api/create-app-page?')
  );
}

function getPromptOgQueryParam(
  searchParams: URLSearchParams,
  key: string
): string {
  return searchParams.get(key)?.trim() || '';
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createPromptOgSvg(url: URL): string {
  const locale =
    getPromptOgQueryParam(url.searchParams, 'locale') === 'en-US'
      ? 'en-US'
      : 'zh-CN';
  const identifier =
    getPromptOgQueryParam(url.searchParams, 'slug') ||
    getPromptOgQueryParam(url.searchParams, 'id');
  const title =
    locale === 'en-US' ? 'Reusable visual prompt' : '可复用视觉 Prompt';
  const eyebrow =
    locale === 'en-US' ? 'WebToMind Prompt Case' : 'WebToMind 案例';
  const detail = identifier
    ? decodeURIComponent(identifier).replace(/[-_]+/g, ' ').slice(0, 80)
    : locale === 'en-US'
      ? 'AI image prompt library'
      : 'AI 图片 Prompt 案例库';

  return `<svg width="${PROMPT_OG_WIDTH}" height="${PROMPT_OG_HEIGHT}" viewBox="0 0 ${PROMPT_OG_WIDTH} ${PROMPT_OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeSvgText(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="0.48" stop-color="#1f2937"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
    <radialGradient id="light" cx="0.78" cy="0.18" r="0.72">
      <stop offset="0" stop-color="#fef3c7" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#fef3c7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#light)"/>
  <path d="M0 500 C210 430 310 610 560 540 C800 472 900 390 1200 455 L1200 630 L0 630 Z" fill="#14b8a6" fill-opacity="0.22"/>
  <path d="M95 110 H1105 V520 H95 Z" fill="#030712" fill-opacity="0.32" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
  <text x="140" y="180" fill="#99f6e4" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700">${escapeSvgText(eyebrow)}</text>
  <text x="140" y="284" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="800">${escapeSvgText(title)}</text>
  <text x="140" y="360" fill="#e5e7eb" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="500">${escapeSvgText(detail)}</text>
  <text x="140" y="470" fill="#ffffff" fill-opacity="0.82" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700">webtomind.com</text>
</svg>`;
}

function servePromptOgWorkerSvg(request: Request): Response {
  const url = new URL(request.url);
  const headers = new Headers({
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': PROMPT_OG_RESPONSE_CACHE_CONTROL,
    'X-Prompt-Og-Version': PROMPT_OG_IMAGE_VERSION,
    'X-Prompt-Og-Cache': 'WORKER-SVG'
  });

  return new Response(
    request.method === 'HEAD' ? null : createPromptOgSvg(url),
    {
      status: 200,
      headers
    }
  );
}

function buildPromptOgCachePublicUrl(url: URL, env: Env): string | null {
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!supabaseUrl) return null;

  const identifier =
    getPromptOgQueryParam(url.searchParams, 'slug') ||
    getPromptOgQueryParam(url.searchParams, 'id');
  if (!identifier) return null;

  const locale =
    getPromptOgQueryParam(url.searchParams, 'locale') === 'en-US'
      ? 'en-US'
      : 'zh-CN';
  const version =
    getPromptOgQueryParam(url.searchParams, 'v') || PROMPT_OG_IMAGE_VERSION;
  const key = [
    PROMPT_OG_CACHE_PREFIX,
    encodeURIComponent(version),
    locale,
    `${encodeURIComponent(identifier)}.png`
  ].join('/');

  return `${supabaseUrl}/storage/v1/object/public/${PROMPT_OG_CACHE_BUCKET}/${key}`;
}

async function tryServePromptOgCache(
  request: Request,
  env: Env
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;

  const sourceUrl = new URL(request.url);
  const cacheUrl = buildPromptOgCachePublicUrl(sourceUrl, env);
  if (!cacheUrl) return null;

  const upstream = await fetch(cacheUrl, {
    method: request.method,
    headers: {
      accept:
        request.headers.get('accept') || 'image/avif,image/webp,image/*,*/*'
    }
  });

  if (!upstream.ok) return null;

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') || 'image/png'
  );
  headers.set('Cache-Control', PROMPT_OG_RESPONSE_CACHE_CONTROL);
  headers.set('X-Prompt-Og-Version', PROMPT_OG_IMAGE_VERSION);
  headers.set('X-Prompt-Og-Cache', 'WORKER-HIT');
  headers.set('X-Prompt-Og-Cache-Url', cacheUrl);

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  const lastModified = upstream.headers.get('last-modified');
  if (lastModified) headers.set('Last-Modified', lastModified);
  const acceptRanges = upstream.headers.get('accept-ranges');
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

function getImageDrainSecret(env: Env): string {
  return env.IMAGE_DRAIN_SECRET || env.CRON_SECRET || '';
}

function getVideoDrainSecret(env: Env): string {
  return env.VIDEO_DRAIN_SECRET || env.CRON_SECRET || '';
}

function getCronSecret(env: Env): string {
  return env.CRON_SECRET || '';
}

async function enqueueImageGenerationTaskFromResponse(
  response: Response,
  env: Env,
  context?: WorkerExecutionContext,
  source = 'cloudflare-worker:/api/image/generate',
  requestId?: string
): Promise<Response> {
  if (!env.IMAGE_JOBS || response.status !== 202) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response;

  let payload: { queued?: unknown; taskId?: unknown; status?: unknown } | null =
    null;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (payload?.queued !== true || typeof payload.taskId !== 'string') {
    return response;
  }

  const taskId = payload.taskId;
  const enqueuedAt = new Date().toISOString();
  const enqueueStartedAt = Date.now();
  const enqueuePayload = {
    type: 'image_generation_task',
    taskId,
    status: typeof payload.status === 'string' ? payload.status : 'queued',
    enqueuedAt,
    requestId,
    source
  };
  const enqueue = env.IMAGE_JOBS.send(enqueuePayload)
    .then(() => {
      console.log(
        JSON.stringify({
          event: 'cloudflare_image_queue_enqueue',
          status: 'success',
          request_id: requestId,
          task_id: taskId,
          queue_name: 'webtomind-image-jobs',
          source,
          enqueue_ms: Date.now() - enqueueStartedAt
        })
      );
    })
    .catch(async (error) => {
      const enqueueMs = Date.now() - enqueueStartedAt;
      console.error(
        JSON.stringify({
          event: 'cloudflare_image_queue_enqueue',
          status: 'failed',
          request_id: requestId,
          task_id: taskId,
          queue_name: 'webtomind-image-jobs',
          source,
          enqueue_ms: enqueueMs,
          error_name: error instanceof Error ? error.name : 'UnknownError'
        })
      );
      await recordImageQueueEnqueueFailureAttempt({
        env,
        taskId,
        requestId,
        source,
        error,
        enqueueMs
      });
    });

  if (context) {
    context.waitUntil(enqueue);
  } else {
    await enqueue;
  }

  return response;
}

async function enqueueVideoGenerationTaskFromResponse(
  response: Response,
  env: Env,
  context?: WorkerExecutionContext,
  source = 'cloudflare-worker:/api/video/generate',
  requestId?: string
): Promise<Response> {
  const withVideoQueueHeader = (
    nextResponse: Response,
    status: string,
    taskId?: string
  ): Response => {
    const headers = new Headers(nextResponse.headers);
    headers.set('x-webtomind-video-queue-enqueue', status);
    if (taskId) headers.set('x-webtomind-video-task-id', taskId);
    return new Response(nextResponse.body, {
      status: nextResponse.status,
      statusText: nextResponse.statusText,
      headers
    });
  };

  if (response.status !== 202) {
    return withVideoQueueHeader(response, `worker-status-${response.status}`);
  }

  if (!env.VIDEO_JOBS) {
    console.warn(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'skipped',
        reason: 'missing_binding',
        request_id: requestId,
        source
      })
    );
    return withVideoQueueHeader(response, 'missing-binding');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    console.warn(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'skipped',
        reason: 'non_json_response',
        request_id: requestId,
        source,
        content_type: contentType
      })
    );
    return withVideoQueueHeader(response, 'non-json');
  }

  let payload: { queued?: unknown; taskId?: unknown; status?: unknown } | null =
    null;
  try {
    payload = await response.clone().json();
  } catch {
    console.warn(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'skipped',
        reason: 'json_parse_failed',
        request_id: requestId,
        source
      })
    );
    return withVideoQueueHeader(response, 'json-parse-failed');
  }

  if (payload?.queued !== true || typeof payload.taskId !== 'string') {
    console.warn(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'skipped',
        reason: 'payload_not_queued',
        request_id: requestId,
        source,
        payload_status:
          typeof payload?.status === 'string' ? payload.status : undefined
      })
    );
    return withVideoQueueHeader(response, 'payload-not-queued');
  }

  const taskId = payload.taskId;
  const enqueuedAt = new Date().toISOString();
  const enqueueStartedAt = Date.now();
  const enqueuePayload = {
    type: 'video_generation_task',
    taskId,
    phase: 'create',
    status: typeof payload.status === 'string' ? payload.status : 'queued',
    enqueuedAt,
    requestId,
    source
  };
  try {
    await env.VIDEO_JOBS.send(enqueuePayload);
    console.log(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'success',
        request_id: requestId,
        task_id: taskId,
        queue_name: 'webtomind-video-jobs',
        source,
        enqueue_ms: Date.now() - enqueueStartedAt
      })
    );
    if (context) {
      context.waitUntil(
        triggerVideoDrain(
          {
            messages: [
              {
                body: enqueuePayload
              }
            ]
          },
          env
        )
          .then(async (result) => {
            await reenqueueVideoTasksFromDrainResult(result, env);
            console.log(
              JSON.stringify({
                event: 'cloudflare_video_queue_inline_drain',
                status: 'success',
                request_id: requestId,
                task_id: taskId,
                processed_count: result.processedCount,
                reenqueue_count: result.reenqueueCount
              })
            );
          })
          .catch((error) => {
            console.error(
              JSON.stringify({
                event: 'cloudflare_video_queue_inline_drain',
                status: 'failed',
                request_id: requestId,
                task_id: taskId,
                error_name: error instanceof Error ? error.name : 'UnknownError'
              })
            );
          })
      );
    }
    return withVideoQueueHeader(response, 'success', taskId);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'cloudflare_video_queue_enqueue',
        status: 'failed',
        request_id: requestId,
        task_id: taskId,
        queue_name: 'webtomind-video-jobs',
        source,
        enqueue_ms: Date.now() - enqueueStartedAt,
        error_name: error instanceof Error ? error.name : 'UnknownError'
      })
    );
    if (context) {
      context.waitUntil(Promise.resolve());
    }
    return withVideoQueueHeader(response, 'failed', taskId);
  }
}

function isVideoQueueBatch(batch: ImageQueueBatch): boolean {
  if (batch.queue && /video/i.test(batch.queue)) return true;
  return batch.messages.some((message) => {
    if (!message.body || typeof message.body !== 'object') return false;
    return (
      (message.body as Record<string, unknown>).type === 'video_generation_task'
    );
  });
}

function extractImageQueueTaskIds(batch: ImageQueueBatch): string[] {
  return Array.from(
    new Set(
      batch.messages
        .map((message) => {
          if (!message.body || typeof message.body !== 'object') return null;
          const body = message.body as Record<string, unknown>;
          return typeof body.taskId === 'string' ? body.taskId : null;
        })
        .filter((taskId): taskId is string => Boolean(taskId))
    )
  );
}

function getImageQueueMessageMetadata(batch: ImageQueueBatch): Map<
  string,
  {
    requestId?: string;
    enqueuedAt?: string;
    messageId?: string;
    source?: string;
  }
> {
  const metadata = new Map<
    string,
    {
      requestId?: string;
      enqueuedAt?: string;
      messageId?: string;
      source?: string;
    }
  >();
  for (const message of batch.messages) {
    if (!message.body || typeof message.body !== 'object') continue;
    const body = message.body as Record<string, unknown>;
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    if (!taskId) continue;
    metadata.set(taskId, {
      requestId:
        typeof body.requestId === 'string' ? body.requestId : undefined,
      enqueuedAt:
        typeof body.enqueuedAt === 'string' ? body.enqueuedAt : undefined,
      messageId: message.id,
      source: typeof body.source === 'string' ? body.source : undefined
    });
  }
  return metadata;
}

function getQueueWaitMs(enqueuedAt?: string): number | undefined {
  if (!enqueuedAt) return undefined;
  const timestamp = new Date(enqueuedAt).getTime();
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Date.now() - timestamp);
}

function getSupabaseRestConfig(env: Env): {
  url: string;
  serviceKey: string;
} | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

async function readImageTaskQueueAttemptRecord(
  env: Env,
  taskId: string
): Promise<ImageTaskQueueAttemptRecord | null> {
  const config = getSupabaseRestConfig(env);
  if (!config) return null;
  const response = await fetch(
    `${config.url}/rest/v1/image_generation_tasks?id=eq.${encodeURIComponent(
      taskId
    )}&select=id,user_id,status&limit=1`,
    {
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        Accept: 'application/json'
      }
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json().catch(() => [])) as unknown;
  return Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
    ? (rows[0] as ImageTaskQueueAttemptRecord)
    : null;
}

async function recordImageQueueEnqueueFailureAttempt({
  env,
  taskId,
  requestId,
  source,
  error,
  enqueueMs
}: {
  env: Env;
  taskId: string;
  requestId?: string;
  source: string;
  error: unknown;
  enqueueMs: number;
}): Promise<void> {
  try {
    const config = getSupabaseRestConfig(env);
    if (!config) return;
    const task = await readImageTaskQueueAttemptRecord(env, taskId);
    if (!task?.user_id) return;

    const now = new Date().toISOString();
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Cloudflare image queue enqueue failed';
    const response = await fetch(
      `${config.url}/rest/v1/image_generation_attempts`,
      {
        method: 'POST',
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          task_id: taskId,
          user_id: task.user_id,
          request_mode: 'queued',
          provider: 'cloudflare_queue',
          model: 'image_generation_task',
          channel: 'queue',
          attempt_index: 0,
          started_at: now,
          finished_at: now,
          duration_ms: enqueueMs,
          status: 'failed',
          error_category: 'queue_enqueue',
          error_code: 'CLOUDFLARE_QUEUE_SEND_FAILED',
          error_message: errorMessage,
          metadata: {
            requestId,
            source,
            queueName: 'webtomind-image-jobs',
            taskStatus: task.status,
            errorName,
            fallback: 'queued_task_drain_scan'
          }
        })
      }
    );
    if (response.ok) return;
    console.warn(
      JSON.stringify({
        event: 'cloudflare_image_queue_enqueue_attempt_record',
        status: 'failed',
        request_id: requestId,
        task_id: taskId,
        http_status: response.status
      })
    );
  } catch (recordError) {
    console.warn(
      JSON.stringify({
        event: 'cloudflare_image_queue_enqueue_attempt_record',
        status: 'failed',
        request_id: requestId,
        task_id: taskId,
        error_name:
          recordError instanceof Error ? recordError.name : 'UnknownError'
      })
    );
  }
}

function logImageQueueMetric(input: {
  status: 'success' | 'failed';
  messageCount: number;
  taskCount: number;
  durationMs: number;
  processedCount?: unknown;
  claimedCount?: unknown;
  queuedMessageTaskCount?: unknown;
  errorName?: string;
  taskIds?: string[];
  queueWaitMaxMs?: number;
  failedCount?: number;
  refundFailedCount?: unknown;
  reenqueueCount?: unknown;
}): void {
  console.log(
    JSON.stringify({
      event: 'cloudflare_image_queue_drain',
      status: input.status,
      message_count: input.messageCount,
      task_count: input.taskCount,
      duration_ms: input.durationMs,
      execution_ms: input.durationMs,
      task_ids: input.taskIds,
      processed_count: input.processedCount,
      claimed_count: input.claimedCount,
      queued_message_task_count: input.queuedMessageTaskCount,
      queue_wait_max_ms: input.queueWaitMaxMs,
      failed_count: input.failedCount,
      refund_failed_count: input.refundFailedCount,
      reenqueue_count: input.reenqueueCount,
      error_name: input.errorName || undefined
    })
  );
}

function logImageQueueTaskMetrics(input: {
  batchStatus: 'success' | 'failed';
  taskIds: string[];
  messageMetadata: Map<
    string,
    {
      requestId?: string;
      enqueuedAt?: string;
      messageId?: string;
      source?: string;
    }
  >;
  durationMs: number;
  processed?: unknown;
  errorName?: string;
}): void {
  const processedByTaskId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(input.processed)) {
    for (const item of input.processed) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const taskId = typeof record.taskId === 'string' ? record.taskId : '';
      if (taskId) processedByTaskId.set(taskId, record);
    }
  }

  for (const taskId of input.taskIds) {
    const metadata = input.messageMetadata.get(taskId);
    const processed = processedByTaskId.get(taskId);
    const status =
      typeof processed?.status === 'string'
        ? processed.status
        : input.batchStatus === 'failed'
          ? 'failed'
          : 'unknown';
    console.log(
      JSON.stringify({
        event: 'cloudflare_image_queue_task',
        batch_status: input.batchStatus,
        request_id: metadata?.requestId,
        task_id: taskId,
        message_id: metadata?.messageId,
        source: metadata?.source,
        status,
        queue_wait_ms: getQueueWaitMs(metadata?.enqueuedAt),
        execution_ms: input.durationMs,
        failure_reason:
          typeof processed?.error === 'string' ? processed.error : undefined,
        refund_failed:
          typeof processed?.refundFailed === 'boolean'
            ? processed.refundFailed
            : undefined,
        error_name: input.errorName
      })
    );
  }
}

function isEmailCampaignQueueBatch(batch: ImageQueueBatch): boolean {
  if (batch.queue && /email|marketing/i.test(batch.queue)) return true;
  return batch.messages.some((message) => {
    if (!message.body || typeof message.body !== 'object') return false;
    return (
      (message.body as Record<string, unknown>).type === 'campaign_enqueue'
    );
  });
}

function buildEmailCampaignEnqueueJob(input: {
  cron: string;
  scheduledTime: number;
}): Record<string, unknown> {
  return {
    type: 'campaign_enqueue',
    jobId: `campaign_enqueue:${input.cron}:${input.scheduledTime}`,
    cron: input.cron,
    scheduledTime: input.scheduledTime,
    source: 'cloudflare-cron',
    enqueuedAt: new Date().toISOString()
  };
}

async function triggerWorkerEmailScheduler(
  batch: ImageQueueBatch,
  env: Env
): Promise<Record<string, unknown>> {
  const secret = getCronSecret(env);
  const response = await withRuntimeEnv(env, () =>
    handleMarketingEmailSchedulerRequest(
      new Request('https://webtomind.com/api/marketing/email-scheduler', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          'user-agent': 'webtomind-cloudflare-email-campaign-queue',
          'x-cron-secret': secret
        },
        body: JSON.stringify({
          source: 'cloudflare-queue',
          messages: batch.messages.map((message) => ({
            id: message.id,
            body: message.body
          }))
        })
      })
    )
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`email scheduler failed: ${response.status} ${body}`);
  }

  try {
    return body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return { raw: body.slice(0, 500) };
  }
}

async function triggerWorkerImageDrain(
  batch: ImageQueueBatch,
  env: Env
): Promise<Record<string, unknown>> {
  const secret = getImageDrainSecret(env);
  const configuredBatchSize = Number(env.IMAGE_QUEUE_DRAIN_BATCH_SIZE);
  const drainBatchSize =
    Number.isFinite(configuredBatchSize) && configuredBatchSize > 0
      ? Math.floor(configuredBatchSize)
      : Math.max(1, batch.messages.length || 1);
  const drainRequestId = `cloudflare-queue-${createRequestId()}`;
  const drainRequest = new Request('https://webtomind.com/api/image/drain', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      'user-agent': 'webtomind-cloudflare-image-queue',
      [REQUEST_ID_HEADER]: drainRequestId,
      [FRONTDOOR_RUNTIME_HEADER]: WORKER_RUNTIME,
      [ROUTE_HEADER]: 'queue-consumer:/api/image/drain',
      'x-image-drain-secret': secret
    },
    body: JSON.stringify({
      source: 'cloudflare-queue',
      requestedBatchSize: drainBatchSize,
      messages: batch.messages.map((message) => ({
        id: message.id,
        body: message.body
      }))
    })
  });
  const response = await withRuntimeEnv(env, () =>
    imageDrainHandler(drainRequest)
  );

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`image queue drain failed: ${response.status} ${body}`);
  }

  try {
    return body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return { raw: body.slice(0, 500) };
  }
}

async function triggerWorkerVideoDrain(
  batch: ImageQueueBatch,
  env: Env
): Promise<Record<string, unknown>> {
  const secret = getVideoDrainSecret(env);
  const configuredBatchSize = Number(env.VIDEO_QUEUE_DRAIN_BATCH_SIZE);
  const drainBatchSize =
    Number.isFinite(configuredBatchSize) && configuredBatchSize > 0
      ? Math.floor(configuredBatchSize)
      : Math.max(1, batch.messages.length || 1);
  const drainRequestId = `cloudflare-video-queue-${createRequestId()}`;
  const response = await withRuntimeEnv(env, () =>
    videoDrainHandler(
      new Request('https://webtomind.com/api/video/drain', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          'user-agent': 'webtomind-cloudflare-video-queue',
          [REQUEST_ID_HEADER]: drainRequestId,
          [FRONTDOOR_RUNTIME_HEADER]: WORKER_RUNTIME,
          [ROUTE_HEADER]: 'queue-consumer:/api/video/drain',
          'x-video-drain-secret': secret
        },
        body: JSON.stringify({
          source: 'cloudflare-queue',
          requestedBatchSize: drainBatchSize,
          messages: batch.messages.map((message) => ({
            id: message.id,
            body: message.body
          }))
        })
      })
    )
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`video queue drain failed: ${response.status} ${body}`);
  }

  try {
    return body ? (JSON.parse(body) as Record<string, unknown>) : {};
  } catch {
    return { raw: body.slice(0, 500) };
  }
}

function getWorkerVideoDrainMissingEnv(env: Env): string[] {
  const missing: string[] = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!env.ARK_API_KEY) missing.push('ARK_API_KEY');
  return missing;
}

async function triggerVideoDrain(
  batch: ImageQueueBatch,
  env: Env
): Promise<Record<string, unknown>> {
  const missing = getWorkerVideoDrainMissingEnv(env);
  if (missing.length > 0) {
    throw new Error(
      `Cloudflare video drain is missing required env: ${missing.join(', ')}`
    );
  }
  return triggerWorkerVideoDrain(batch, env);
}

async function reenqueueVideoTasksFromDrainResult(
  result: Record<string, unknown>,
  env: Env
): Promise<void> {
  if (!env.VIDEO_JOBS || !Array.isArray(result.reenqueue)) return;
  await Promise.all(
    result.reenqueue.map((item) => {
      if (!item || typeof item !== 'object') return Promise.resolve();
      const record = item as Record<string, unknown>;
      const taskId = typeof record.taskId === 'string' ? record.taskId : '';
      if (!taskId) return Promise.resolve();
      const delaySeconds =
        typeof record.delaySeconds === 'number' && record.delaySeconds > 0
          ? Math.min(Math.floor(record.delaySeconds), 900)
          : 5;
      return env.VIDEO_JOBS!.send(
        {
          type: 'video_generation_task',
          taskId,
          phase: record.phase === 'poll' ? 'poll' : 'create',
          status: 'running',
          enqueuedAt: new Date().toISOString(),
          source: 'cloudflare-worker:/api/video/drain'
        },
        { delaySeconds }
      );
    })
  );
}

async function reenqueueImageTasksFromDrainResult(
  result: Record<string, unknown>,
  env: Env
): Promise<void> {
  if (!env.IMAGE_JOBS || !Array.isArray(result.reenqueue)) return;
  await Promise.all(
    result.reenqueue.map((item) => {
      if (!item || typeof item !== 'object') return Promise.resolve();
      const record = item as Record<string, unknown>;
      const taskId = typeof record.taskId === 'string' ? record.taskId : '';
      if (!taskId) return Promise.resolve();
      const delaySeconds =
        typeof record.delaySeconds === 'number' && record.delaySeconds > 0
          ? Math.min(Math.floor(record.delaySeconds), 900)
          : 12;
      return env.IMAGE_JOBS!.send(
        {
          type: 'image_generation_task',
          taskId,
          status: 'running',
          enqueuedAt: new Date().toISOString(),
          source: 'cloudflare-worker:/api/image/drain'
        },
        { delaySeconds }
      );
    })
  );
}

async function fetchIndex(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = '/index.html';
  url.search = '';
  const response = await env.ASSETS.fetch(new Request(url.toString(), request));
  const headers = new Headers(response.headers);
  applyAppShellNoStoreHeaders(headers);
  return new Response(response.body, { status: response.status, headers });
}

async function fetchPromptLibraryIndex(
  request: Request,
  env: Env,
  context?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const htmlPromise = readAssetIndexHtml(request, env);
  // Filtered URLs have a different queryEcho. Do not preload default images
  // or serialize unrelated cases for search, favorites or preview links.
  const hasContentQuery = [...url.searchParams.keys()].some(
    (key) =>
      !key.startsWith('utm_') &&
      !['gclid', 'fbclid', 'msclkid', 'ref'].includes(key)
  );
  let bootstrap: Record<string, unknown> | null = null;
  if (!hasContentQuery) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const load = loadPromptLibraryBootstrap(
        request,
        env,
        url.pathname,
        context,
        false
      );
      context?.waitUntil(load.then(() => undefined));
      bootstrap = await Promise.race([
        load,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 100);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    // Static SEO fallback is not a complete client pagination payload.
    if (!bootstrap?.queryEcho || !Array.isArray(bootstrap.items))
      bootstrap = null;
  }
  const html = injectPromptLibraryBootstrap(
    await htmlPromise,
    {
      promptLibraryBootstrap: bootstrap
    },
    true
  );
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'x-webtomind-prompt-bootstrap': bootstrap ? 'embedded' : 'client-fallback'
  });
  applyAppShellNoStoreHeaders(headers);
  return new Response(html, { headers });
}

function applyAppShellNoStoreHeaders(headers: Headers): void {
  headers.delete('CF-Cache-Status');
  headers.delete('Age');
  headers.set(
    'Cache-Control',
    'no-cache, no-store, must-revalidate, max-age=0'
  );
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
}

function applyPublicSeoCacheHeaders(headers: Headers): void {
  headers.delete('CF-Cache-Status');
  headers.delete('Age');
  headers.delete('Pragma');
  headers.delete('Expires');
  headers.set(
    'Cache-Control',
    'public, max-age=60, stale-while-revalidate=300'
  );
  headers.set('CDN-Cache-Control', 'no-store');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
}

function getSeoHtmlAssetFingerprint(indexHtml: string): string {
  return (
    indexHtml.match(
      /<script[^>]+src=["']\/assets\/([^"']+\.js)["'][^>]*>/i
    )?.[1] || 'inline-index'
  );
}

function canUsePublicSeoHtmlCache(request: Request, env: Env): boolean {
  return (
    request.method === 'GET' &&
    Boolean(env.WEBTOMIND_PUBLIC_CACHE) &&
    !request.headers.has('authorization') &&
    !request.headers.has('cookie')
  );
}

export function canonicalizePublicSeoTargetForCache(target: string): string {
  const targetUrl = new URL(target, 'https://webtomind.local');
  const canonicalTarget = new URL(
    targetUrl.pathname,
    'https://webtomind.local'
  );
  const semanticParams =
    targetUrl.pathname === '/api/seo-page'
      ? ['path']
      : targetUrl.pathname === '/api/prompt-page'
        ? ['locale', 'slug', 'id', 'redirect']
        : targetUrl.pathname === '/api/create-app-page'
          ? ['locale', 'slug', 'path']
          : [];
  semanticParams.forEach((key) => {
    const value = targetUrl.searchParams.get(key);
    if (value) canonicalTarget.searchParams.set(key, value);
  });
  return `${canonicalTarget.pathname}${canonicalTarget.search}`;
}

function buildPublicSeoHtmlCacheKey(target: string, indexHtml: string): string {
  return [
    'public-seo-html',
    PUBLIC_SEO_HTML_CACHE_VERSION,
    getSeoHtmlAssetFingerprint(indexHtml),
    canonicalizePublicSeoTargetForCache(target)
  ].join(':');
}

async function readAssetIndexHtml(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  url.pathname = '/index.html';
  url.search = '';
  const response = await env.ASSETS.fetch(new Request(url.toString(), request));
  if (!response.ok) {
    throw new Error(`index.html asset not found: ${response.status}`);
  }
  return response.text();
}

function buildPromptLibraryBootstrapRequest(
  request: Request,
  rawPath: string,
  seoOnly = true
): Request | null {
  const normalizedPath = normalizePath(rawPath);
  const videoHub = normalizedPath === '/zh-CN/video-prompts';
  const routeMatch = normalizedPath.match(
    /^\/(zh-CN|en-US)\/(?:create\/)?prompts(?:\/(model|category)\/([^/]+))?$/
  );
  if (videoHub) {
    const params = new URLSearchParams({
      library: '1',
      limit: '100',
      sort: 'latest',
      v: PROMPT_LIBRARY_BOOTSTRAP_QUERY_VERSION,
      locale: 'zh-CN',
      requireImage: '1',
      label: 'video-motion',
      mediaType: 'video',
      seoOnly: '1'
    });
    const url = new URL('/api/content/prompt-cases', request.url);
    url.search = params.toString();
    return new Request(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  }
  if (!routeMatch) return null;

  const [, locale, routeType, routeSlug = ''] = routeMatch;
  const limit = 48;
  const sort = 'latest';
  const model = canonicalizePromptLibraryModel(
    routeType === 'model' ? routeSlug : ''
  );
  const label = canonicalizePromptLibraryLabel(
    routeType === 'category' ? routeSlug : ''
  );

  const params = new URLSearchParams({
    library: '1',
    limit: String(limit),
    sort,
    v: seoOnly ? PROMPT_LIBRARY_BOOTSTRAP_QUERY_VERSION : 'prompt-library-v2',
    locale,
    requireImage: '1'
  });
  if (seoOnly) params.set('seoOnly', '1');
  if (model) params.set('model', model);
  if (label) params.set('label', label);

  const url = new URL('/api/content/prompt-cases', request.url);
  url.search = params.toString();
  return new Request(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  });
}

async function loadPromptLibraryBootstrap(
  request: Request,
  env: Env,
  rawPath: string,
  context?: WorkerExecutionContext,
  seoOnly = true
): Promise<Record<string, unknown> | null> {
  const bootstrapRequest = buildPromptLibraryBootstrapRequest(
    request,
    rawPath,
    seoOnly
  );
  if (!bootstrapRequest) return null;

  const normalizedPath = normalizePath(rawPath);
  const locale = normalizedPath.startsWith('/en-US') ? 'en-US' : 'zh-CN';
  const snapshotKey = [
    'prompt-library-bootstrap',
    seoOnly ? PROMPT_LIBRARY_BOOTSTRAP_CACHE_VERSION : 'browser-v1',
    normalizedPath
  ].join(':');
  let cachedSnapshot: Record<string, unknown> | null = null;
  if (env.WEBTOMIND_PUBLIC_CACHE) {
    try {
      const cached = await env.WEBTOMIND_PUBLIC_CACHE.get(snapshotKey);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const snapshot = parsed as Record<string, unknown>;
          const age =
            Date.now() - Date.parse(String(snapshot.generatedAt || ''));
          if (seoOnly || (Number.isFinite(age) && age >= 0 && age < 300_000)) {
            cachedSnapshot = snapshot;
          }
        }
      }
    } catch (error) {
      console.warn('[Prompt library] bootstrap snapshot read failed:', error);
    }
  }

  const load = (async (): Promise<Record<string, unknown> | null> => {
    try {
      const response = await handlePublicContentCacheRequest(
        '/api/content/prompt-cases',
        bootstrapRequest,
        env,
        context,
        contentPromptCasesHandler
      );
      if (
        !response.ok ||
        /\b(?:no-store|private)\b/i.test(
          response.headers.get('cache-control') || ''
        )
      ) {
        return null;
      }
      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      const record = payload as Record<string, unknown>;
      const items = Array.isArray(record.items)
        ? record.items
        : Array.isArray(record.cases)
          ? record.cases
          : [];
      if (items.length === 0) return null;
      const snapshot = {
        ...record,
        items,
        status: 'complete',
        generatedAt: new Date().toISOString(),
        sourceVersion: PROMPT_LIBRARY_BOOTSTRAP_CACHE_VERSION
      };
      if (env.WEBTOMIND_PUBLIC_CACHE) {
        await env.WEBTOMIND_PUBLIC_CACHE.put(
          snapshotKey,
          JSON.stringify(snapshot),
          { expirationTtl: seoOnly ? 86_400 : 300 }
        );
      }
      return snapshot;
    } catch (error) {
      console.warn('[Prompt library] bootstrap load failed:', error);
      return null;
    }
  })();

  if (context) {
    context.waitUntil(load.then(() => undefined));
  }
  if (cachedSnapshot) return cachedSnapshot;

  const loaded = await load;
  if (loaded) return loaded;
  if (normalizedPath === '/zh-CN/video-prompts') {
    return {
      items: [],
      status: 'fallback-static',
      generatedAt: new Date().toISOString(),
      sourceVersion: PROMPT_LIBRARY_BOOTSTRAP_CACHE_VERSION
    };
  }
  return {
    items: getPromptSeoStaticLibraryCases({ locale, limit: 12 }),
    status: 'fallback-static',
    generatedAt: new Date().toISOString(),
    sourceVersion: PROMPT_LIBRARY_BOOTSTRAP_CACHE_VERSION
  };
}

async function renderSeoTargetFromAssets(
  request: Request,
  env: Env,
  target: string,
  context?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(target, 'https://webtomind.local');
  const indexHtml = await readAssetIndexHtml(request, env);
  const canUseCache = canUsePublicSeoHtmlCache(request, env);
  const cacheKey = buildPublicSeoHtmlCacheKey(target, indexHtml);

  if (canUseCache) {
    try {
      const cached = await env.WEBTOMIND_PUBLIC_CACHE!.get(cacheKey);
      if (cached !== null) {
        const headers = new Headers({
          'Content-Type': 'text/html; charset=utf-8',
          'x-webtomind-seo-renderer': 'cloudflare-assets',
          'x-webtomind-kv-cache': 'HIT'
        });
        applyPublicSeoCacheHeaders(headers);
        return new Response(cached, { status: 200, headers });
      }
    } catch (error) {
      console.warn('[Cloudflare KV] public SEO cache read failed:', error);
    }
  }

  let html = '';
  let status = 200;

  if (url.pathname === '/api/seo-page') {
    const rawPath = url.searchParams.get('path') || '/';
    const promptLibraryBootstrap = await loadPromptLibraryBootstrap(
      request,
      env,
      rawPath,
      context
    );
    const rendered = renderSeoPageHtmlWithStatus(indexHtml, rawPath, {
      promptLibraryBootstrap
    });
    html = rendered.html;
    status = rendered.status;
  } else if (url.pathname === '/api/create-app-page') {
    const locale =
      url.searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
    const slug = url.searchParams.get('slug') || '';
    const rendered = renderCreateAppPageHtml({ html: indexHtml, slug, locale });
    html = rendered.html;
    status = rendered.status;
  } else if (url.pathname === '/api/prompt-page') {
    const locale =
      url.searchParams.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
    const rendered = await withRuntimeEnv(env, () =>
      renderPromptPageHtml({
        html: indexHtml,
        locale,
        slug: url.searchParams.get('slug') || undefined,
        id: url.searchParams.get('id') || undefined,
        redirectIdToSlug: url.searchParams.get('redirect') === 'id-to-slug'
      })
    );
    if (rendered.redirectPath) {
      const location = withAcquisitionQuery(
        rendered.redirectPath,
        new URL(request.url).searchParams
      );
      return new Response(null, {
        status: rendered.status,
        headers: {
          Location: new URL(location, request.url).toString(),
          'Cache-Control': 'public, max-age=300, s-maxage=3600',
          'x-webtomind-seo-renderer': 'cloudflare-prompt-slug-redirect'
        }
      });
    }
    html = rendered.html;
    status = rendered.status;
  } else {
    throw new Error(`Unsupported SEO render target: ${target}`);
  }

  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'x-webtomind-seo-renderer': 'cloudflare-assets',
    'x-webtomind-kv-cache': canUseCache ? 'MISS' : 'BYPASS'
  });
  applyPublicSeoCacheHeaders(headers);

  if (canUseCache && status === 200) {
    const bodyByteLength = new TextEncoder().encode(html).byteLength;
    if (bodyByteLength <= PUBLIC_CONTENT_CACHE_MAX_BODY_BYTES) {
      const write = env
        .WEBTOMIND_PUBLIC_CACHE!.put(cacheKey, html, {
          expirationTtl: PUBLIC_SEO_HTML_CACHE_TTL_SECONDS
        })
        .catch((error) => {
          console.warn('[Cloudflare KV] public SEO cache write failed:', error);
        });
      if (context) {
        context.waitUntil(write);
      } else {
        void write;
      }
    }
  }

  return new Response(request.method === 'HEAD' ? '' : html, {
    status,
    headers
  });
}

async function renderNoindexAppShellFromAssets(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const indexHtml = await readAssetIndexHtml(request, env);
  // 优先使用路径前缀，无前缀时按请求语言（Cookie > Accept-Language）本地化，
  // 与客户端 LocaleGuard 的跳转结果保持一致，避免英文用户看到中文元数据。
  const pathLocale = pathname.startsWith('/en-US')
    ? 'en-US'
    : pathname.startsWith('/zh-CN')
      ? 'zh-CN'
      : null;
  const shellLocale =
    pathLocale ||
    detectLocaleFromCookie(request.headers.get('cookie')) ||
    detectLocaleFromAcceptLanguage(request.headers.get('accept-language'));
  const html = renderNoindexAppShellHtml(indexHtml, pathname, shellLocale);
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'x-webtomind-seo-renderer': 'cloudflare-noindex-shell'
  });
  applyAppShellNoStoreHeaders(headers);
  return new Response(request.method === 'HEAD' ? '' : html, {
    status: 200,
    headers
  });
}

async function fetchStaticAsset(request: Request, env: Env): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const pathname = new URL(request.url).pathname;
  const headers = new Headers(response.headers);

  if (pathname === '/sw.js') {
    headers.set(
      'Cache-Control',
      'no-cache, no-store, must-revalidate, max-age=0'
    );
  } else if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    /^\/assets\/[^/]+\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname)
  ) {
    // Vite content-hashed assets never change at the same URL. Cache them
    // immutably so a page refresh reuses the bundle from browser cache
    // instead of revalidating MBs of JS, which kept the SSR handoff visible.
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    headers.set(
      'Cloudflare-CDN-Cache-Control',
      'public, max-age=31536000, immutable'
    );
  }

  return new Response(response.body, { status: response.status, headers });
}

function parseSingleByteRange(
  value: string | null,
  total: number
): { offset: number; length: number } | null {
  if (!value) return null;
  const match = value.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    requestedEnd < offset ||
    offset >= total
  ) {
    return null;
  }
  const end = Math.min(total - 1, requestedEnd);
  return { offset, length: end - offset + 1 };
}

async function serveImageToolModel(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!env.MEDIA_BUCKET)
    return new Response('Model storage unavailable', { status: 503 });

  const pathname = normalizePath(new URL(request.url).pathname);
  const model = Object.values(IMAGE_TOOL_MODELS).find(
    (candidate) => candidate.route === pathname
  );
  if (!model || !isPublishedImageToolModel(model)) {
    return new Response('Verified model asset not found', { status: 404 });
  }
  const key = pathname.replace(/^\//, '');
  const head = await env.MEDIA_BUCKET.get(key);
  if (!head) {
    // 本地 wrangler dev 的 R2 模拟器默认不含模型对象；配置了
    // LOCAL_MODEL_ORIGIN（仅 cf-dev-real-api 写入）时按需回源线上，
    // 生产环境未配置该变量，行为不变。
    if (env.LOCAL_MODEL_ORIGIN) {
      const upstream = await fetch(`${env.LOCAL_MODEL_ORIGIN}${pathname}`, {
        headers: request.headers.get('range')
          ? { Range: request.headers.get('range') as string }
          : undefined
      });
      if (upstream.ok) {
        const fallbackHeaders = new Headers({
          'Content-Type': pathname.endsWith('.wasm')
            ? 'application/wasm'
            : pathname.endsWith('.mjs')
              ? 'text/javascript; charset=utf-8'
              : 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
          'X-Model-SHA256': model.sha256
        });
        const upstreamRange = upstream.headers.get('content-range');
        if (upstreamRange) {
          fallbackHeaders.set('Content-Range', upstreamRange);
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: fallbackHeaders
        });
      }
    }
    return new Response('Model asset not found', { status: 404 });
  }
  const fullBuffer = head.body ? null : await head.arrayBuffer();
  const total = head.size || fullBuffer?.byteLength || 0;
  if (!total) return new Response('Model asset is empty', { status: 502 });
  const rangeHeader = request.headers.get('range');
  const range = parseSingleByteRange(rangeHeader, total);
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` }
    });
  }
  const object = range ? await env.MEDIA_BUCKET.get(key, { range }) : head;
  if (!object) return new Response('Model asset not found', { status: 404 });
  const headers = new Headers({
    'Content-Type': pathname.endsWith('.wasm')
      ? 'application/wasm'
      : pathname.endsWith('.mjs')
        ? 'text/javascript; charset=utf-8'
        : 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Model-SHA256': model.sha256
  });
  if (range) {
    headers.set(
      'Content-Range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${total}`
    );
    headers.set('Content-Length', String(range.length));
  } else {
    headers.set('Content-Length', String(total));
  }
  const body =
    request.method === 'HEAD'
      ? null
      : object.body ||
        (range || !fullBuffer ? await object.arrayBuffer() : fullBuffer);
  return new Response(body, {
    status: range ? 206 : 200,
    headers
  });
}

function workerJsonResponse(
  data: unknown,
  status: number,
  headers?: HeadersInit
): Response {
  return Response.json(data, {
    status,
    headers
  });
}

function isWorkerArkVideoGenerationEnabled(env: Env): boolean {
  return env.ARK_VIDEO_GENERATION_ENABLED === 'true';
}

function isWorkerArkVideoLaunchEnabled(env: Env): boolean {
  return env.ARK_VIDEO_LAUNCH_ENABLED === 'true';
}

function isWorkerArkVideoGenerationAvailable(env: Env): boolean {
  return (
    isWorkerArkVideoGenerationEnabled(env) && isWorkerArkVideoLaunchEnabled(env)
  );
}

function getWorkerVideoEnablement(env: Env) {
  return {
    generationEnabled: isWorkerArkVideoGenerationEnabled(env),
    launchEnabled: isWorkerArkVideoLaunchEnabled(env)
  };
}

function buildWorkerVideoModelsPayload(env: Env) {
  const enabled = isWorkerArkVideoGenerationAvailable(env);
  return {
    enabled,
    message: enabled
      ? '视频生成通道已开启。'
      : '视频生成通道维护中，修复完成后再开放使用。',
    enablement: getWorkerVideoEnablement(env),
    models: getSeedanceVideoModels(env).map((model) => ({
      id: model.id,
      label: model.label,
      group: model.group,
      description: model.description,
      badges: model.badges,
      supportsTextToVideo: model.supportsTextToVideo,
      supportsImageToVideo: model.supportsImageToVideo,
      supportsReferenceVideo: model.supportsReferenceVideo,
      supportsReferenceAudio: model.supportsReferenceAudio,
      supportsGenerateAudio: model.supportsGenerateAudio,
      supportsWebSearch: model.supportsWebSearch,
      defaultGenerateAudio: model.defaultGenerateAudio,
      maxReferenceImages: model.maxReferenceImages,
      maxReferenceVideos: model.maxReferenceVideos,
      maxReferenceAudios: model.maxReferenceAudios,
      maxReferenceMediaDurationSeconds: model.maxReferenceMediaDurationSeconds,
      supportedDurations: model.supportedDurations,
      defaultDuration: model.defaultDuration,
      supportedAspectRatios: model.supportedAspectRatios,
      defaultAspectRatio: model.defaultAspectRatio,
      supportedResolutions: model.supportedResolutions,
      defaultResolution: model.defaultResolution,
      supportedOutputFormats: model.supportedOutputFormats,
      defaultOutputFormat: model.defaultOutputFormat,
      status: model.status
    }))
  };
}

function handleWorkerVideoModelsRequest(request: Request, env: Env): Response {
  const corsHeaders = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'GET') {
    return workerJsonResponse({ error: 'Method not allowed' }, 405, {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
      [ROUTE_HEADER]: 'worker-video-models:/api/video/models'
    });
  }
  return workerJsonResponse(buildWorkerVideoModelsPayload(env), 200, {
    ...corsHeaders,
    'Cache-Control': 'no-store',
    [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
    [ROUTE_HEADER]: 'worker-video-models:/api/video/models'
  });
}

function handleWorkerVideoGenerationMaintenanceRequest(
  request: Request,
  env: Env
): Response | null {
  const corsHeaders = getCorsHeadersForRequest(request);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (isWorkerArkVideoGenerationAvailable(env)) {
    return null;
  }
  return workerJsonResponse(
    {
      success: false,
      error: 'VIDEO_GENERATION_NOT_ENABLED',
      message: '视频生成通道维护中，修复完成后再开放使用。',
      enablement: getWorkerVideoEnablement(env)
    },
    501,
    {
      ...corsHeaders,
      'Cache-Control': 'no-store',
      [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
      [ROUTE_HEADER]: 'worker-video-maintenance:/api/video/generate',
      'x-webtomind-video-queue-enqueue': 'skipped-maintenance'
    }
  );
}

function buildPublicContentCacheKey(
  request: Request,
  pathname: string
): string {
  const url = new URL(request.url);
  const allowedParams =
    PUBLIC_CONTENT_CACHE_QUERY_PARAMS.get(pathname) || new Set<string>();
  const params = Array.from(url.searchParams.entries())
    .filter(([key]) => allowedParams.has(key))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey)
    );
  const search = new URLSearchParams(params).toString();
  return [
    'public-content',
    PUBLIC_CONTENT_CACHE_ROUTE_VERSIONS.get(pathname) ||
      PUBLIC_CONTENT_CACHE_VERSION,
    pathname,
    search
  ].join(':');
}

function getCloudflareDefaultCache(): Cache | null {
  const cacheStorage = (
    globalThis as typeof globalThis & {
      caches?: CacheStorage & { default?: Cache };
    }
  ).caches;
  return cacheStorage?.default || null;
}

function buildPublicContentEdgeCacheRequest(
  request: Request,
  pathname: string
): Request {
  const url = new URL(request.url);
  url.pathname = '/__webtomind-cache/public-content';
  url.search = new URLSearchParams({
    key: buildPublicContentCacheKey(request, pathname)
  }).toString();
  return new Request(url.toString(), { method: 'GET' });
}

function hasOnlyPublicContentCacheQueryParams(
  request: Request,
  pathname: string
): boolean {
  const allowedParams = PUBLIC_CONTENT_CACHE_QUERY_PARAMS.get(pathname);
  if (!allowedParams) return false;
  const url = new URL(request.url);
  return Array.from(url.searchParams.keys()).every((key) =>
    allowedParams.has(key)
  );
}

function canUsePublicContentCache(
  request: Request,
  pathname: string,
  env: Env
): boolean {
  if (!env.WEBTOMIND_PUBLIC_CACHE) return false;
  if (request.method !== 'GET') return false;
  if (!PUBLIC_CONTENT_CACHE_ROUTES.has(pathname)) return false;
  if (!hasOnlyPublicContentCacheQueryParams(request, pathname)) return false;
  if (request.headers.has('authorization')) return false;
  if (request.headers.has('cookie')) return false;
  if (request.headers.has('x-cron-secret')) return false;
  return true;
}

function shouldStorePublicContentResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return false;
  const cacheControl = response.headers.get('cache-control') || '';
  if (/\b(?:no-store|private)\b/i.test(cacheControl)) return false;
  return true;
}

async function handlePublicContentCacheRequest(
  pathname: string,
  request: Request,
  env: Env,
  context: WorkerExecutionContext | undefined,
  handler: (request: Request) => Promise<Response> | Response
): Promise<Response> {
  const ttl = PUBLIC_CONTENT_CACHE_ROUTES.get(pathname);
  if (!ttl || !canUsePublicContentCache(request, pathname, env)) {
    const response = await withRuntimeEnv(env, () => handler(request));
    const headers = new Headers(response.headers);
    if (PUBLIC_CONTENT_CACHE_ROUTES.has(pathname)) {
      headers.set('x-webtomind-kv-cache', 'BYPASS');
      headers.set('Vary', PUBLIC_CONTENT_CACHE_VARY);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  const cacheKey = buildPublicContentCacheKey(request, pathname);
  const corsHeaders = await withRuntimeEnv(env, () =>
    getCorsHeadersForRequest(request)
  );
  const edgeCache = getCloudflareDefaultCache();
  const edgeCacheRequest = edgeCache
    ? buildPublicContentEdgeCacheRequest(request, pathname)
    : null;

  if (edgeCache && edgeCacheRequest) {
    try {
      const cached = await edgeCache.match(edgeCacheRequest);
      if (cached) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${Math.min(ttl, 300)}, stale-while-revalidate=${ttl}`,
            Vary: PUBLIC_CONTENT_CACHE_VARY,
            ...corsHeaders,
            'x-webtomind-edge-cache': 'HIT',
            'x-webtomind-kv-cache': 'MISS'
          }
        });
      }
    } catch (error) {
      console.warn('[Cloudflare Cache] public content read failed:', error);
    }
  }

  try {
    const cached = await env.WEBTOMIND_PUBLIC_CACHE!.get(cacheKey);
    if (cached !== null) {
      return new Response(cached, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${Math.min(ttl, 300)}, stale-while-revalidate=${ttl}`,
          Vary: PUBLIC_CONTENT_CACHE_VARY,
          ...corsHeaders,
          'x-webtomind-edge-cache': edgeCache ? 'MISS' : 'BYPASS',
          'x-webtomind-kv-cache': 'HIT'
        }
      });
    }
  } catch (error) {
    console.warn('[Cloudflare KV] public content cache read failed:', error);
  }

  const response = await withRuntimeEnv(env, () => handler(request));
  const headers = new Headers(response.headers);
  headers.set('x-webtomind-edge-cache', edgeCache ? 'MISS' : 'BYPASS');
  headers.set('x-webtomind-kv-cache', 'MISS');
  headers.set('Vary', PUBLIC_CONTENT_CACHE_VARY);

  if (shouldStorePublicContentResponse(response)) {
    const responseForCache = response.clone();
    const write = responseForCache
      .text()
      .then((body) => {
        const bodyByteLength = new TextEncoder().encode(body).byteLength;
        if (bodyByteLength > PUBLIC_CONTENT_CACHE_MAX_BODY_BYTES) return;
        const writes: Array<Promise<unknown>> = [];
        if (edgeCache && edgeCacheRequest) {
          writes.push(
            edgeCache
              .put(
                edgeCacheRequest,
                new Response(body, {
                  headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': `public, max-age=${ttl}`
                  }
                })
              )
              .catch((error) => {
                console.warn(
                  '[Cloudflare Cache] public content write failed:',
                  error
                );
              })
          );
        }
        writes.push(
          env
            .WEBTOMIND_PUBLIC_CACHE!.put(cacheKey, body, {
              expirationTtl: ttl
            })
            .catch((error) => {
              console.warn(
                '[Cloudflare KV] public content cache write failed:',
                error
              );
            })
        );
        return Promise.all(writes);
      })
      .catch((error) => {
        console.warn('[Public content cache] response read failed:', error);
      });
    if (context) {
      context.waitUntil(write);
    } else {
      void write;
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Public, JS-rendered routes checked after each deploy by
// scripts/kitesurf-render-smoke.mjs. Selectors mirror the routes audited by
// scripts/website-ui-regression.mjs so Kitesurf acts as a cheap smoke layer
// ahead of the pixel-level Chromium audit.
const KITESURF_SMOKE_ROUTES: Array<{
  path: string;
  selectors: string[];
}> = [
  {
    path: '/zh-CN/create',
    selectors: ['title']
  },
  {
    path: '/zh-CN/prompts',
    selectors: ['title']
  },
  {
    path: '/gpt-image-2-prompts',
    selectors: ['title']
  },
  {
    path: '/mona-lisa-1-prompts',
    selectors: ['title']
  },
  {
    path: '/zh-CN/pricing',
    selectors: ['title']
  }
];

type KitesurfSmokeSelectorCheck = {
  selector: string;
  matches: number;
  ok: boolean;
};

type KitesurfSmokeRun = {
  path: string;
  url: string;
  ok: boolean;
  selectors: KitesurfSmokeSelectorCheck[];
  durationMs: number;
  error: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readScrapeResults(payload: unknown): Map<string, unknown[]> {
  const bySelector = new Map<string, unknown[]>();
  if (!isRecord(payload)) return bySelector;
  const result = payload.result;
  if (!Array.isArray(result)) return bySelector;
  for (const entry of result) {
    if (!isRecord(entry) || typeof entry.selector !== 'string') continue;
    bySelector.set(
      entry.selector,
      Array.isArray(entry.results) ? entry.results : []
    );
  }
  return bySelector;
}

async function handleKitesurfRenderSmokeRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const jsonResponse = (data: unknown, status = 200) =>
    workerJsonResponse(data, status, {
      'Cache-Control': 'no-store',
      [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
      [ROUTE_HEADER]: 'worker-smoke:kitesurf'
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const token = env.KITESURF_SMOKE_TOKEN || env.CRON_SECRET || '';
  if (!token) {
    return jsonResponse(
      {
        error: 'KITESURF_SMOKE_DISABLED',
        message:
          'Set KITESURF_SMOKE_TOKEN (or CRON_SECRET) before using the Kitesurf render smoke route.'
      },
      503
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
  }
  if (!env.BROWSER) {
    return jsonResponse(
      {
        error: 'BROWSER_BINDING_MISSING',
        message:
          'Add a [browser] binding to workers/webtomind.wrangler.toml before running the Kitesurf render smoke.'
      },
      503
    );
  }

  const url = new URL(request.url);
  const requestedPaths = url.searchParams.getAll('path');
  const routes =
    requestedPaths.length > 0
      ? KITESURF_SMOKE_ROUTES.filter((route) =>
          requestedPaths.includes(route.path)
        )
      : KITESURF_SMOKE_ROUTES;
  const wantScreenshots = url.searchParams.get('screenshot') === '1';
  const baseOrigin =
    env.KITESURF_SMOKE_BASE_URL ||
    `https://${env.CANONICAL_HOST || 'webtomind.com'}`;

  // Workers Free plan limits Quick Actions to ~1 request per 10 seconds and a
  // 10 minute daily browser budget, so pace routes and retry rate limits.
  const minIntervalMs = Number(env.KITESURF_SMOKE_MIN_INTERVAL_MS || 12000);
  const scrapeTimeoutMs = 12000;
  const runs: KitesurfSmokeRun[] = [];
  const screenshots: Array<{
    path: string;
    bytes: number;
    pngBase64: string;
  }> = [];
  let rateLimited = false;
  let lastRunAt = 0;

  for (const route of routes) {
    const now = Date.now();
    const waitMs = lastRunAt ? Math.max(0, lastRunAt + minIntervalMs - now) : 0;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRunAt = Date.now();

    const targetUrl = `${baseOrigin}${route.path}`;
    const startedAt = Date.now();
    const run: KitesurfSmokeRun = {
      path: route.path,
      url: targetUrl,
      ok: false,
      selectors: route.selectors.map((selector) => ({
        selector,
        matches: 0,
        ok: false
      })),
      durationMs: 0,
      error: null
    };

    try {
      // Renders the page with JS enabled via the Browser Run binding and
      // reports per-selector matches. The binding's quickAction() cannot
      // select the Kitesurf engine yet (body `browser` is rejected with
      // unrecognized_keys, and the wrangler schema has no engine field), so
      // this route uses the binding's default engine. The Kitesurf-specific
      // pass runs from scripts/kitesurf-render-smoke.mjs through the public
      // playground CDP or the REST endpoint with ?browser=kitesurf.
      let payload: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const scrapeResponse = await env.BROWSER.quickAction('scrape', {
          url: targetUrl,
          elements: route.selectors.map((selector) => ({ selector })),
          waitForTimeout: scrapeTimeoutMs,
          gotoOptions: { waitUntil: 'load', timeout: 45000 }
        });
        payload = await scrapeResponse.json().catch(() => null);
        const bySelector = readScrapeResults(payload);
        for (const check of run.selectors) {
          check.matches = (bySelector.get(check.selector) || []).length;
          check.ok = check.matches > 0;
        }
        const contentChecks = run.selectors.filter(
          (check) => check.selector !== 'title'
        );
        const hasContent = contentChecks.some((check) => check.ok);
        if (scrapeResponse.status === 429) {
          rateLimited = true;
        }
        if (
          scrapeResponse.status === 200 &&
          hasContent &&
          run.selectors.every((check) => check.ok)
        ) {
          break;
        }
        if (attempt === 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, scrapeResponse.status === 429 ? 15000 : 12000)
          );
          lastRunAt = Date.now();
        }
      }

      if (wantScreenshots) {
        const shotResponse = await env.BROWSER.quickAction('screenshot', {
          url: targetUrl,
          viewport: { width: 1280, height: 800 },
          waitForTimeout: scrapeTimeoutMs,
          gotoOptions: { waitUntil: 'load', timeout: 45000 }
        });
        const bytes = new Uint8Array(await shotResponse.arrayBuffer());
        screenshots.push({
          path: route.path,
          bytes: bytes.length,
          pngBase64: Buffer.from(bytes).toString('base64')
        });
      }

      if (rateLimited && run.selectors.every((check) => check.matches === 0)) {
        run.error = 'BROWSER_RUN_RATE_LIMITED';
      }
      run.ok = run.selectors.every((check) => check.ok);
    } catch (error) {
      run.error = error instanceof Error ? error.message : String(error);
    } finally {
      run.durationMs = Date.now() - startedAt;
    }
    runs.push(run);
  }

  const allOk = runs.length > 0 && runs.every((run) => run.ok);
  return jsonResponse(
    {
      ok: allOk,
      engine: 'browser-run-binding',
      rateLimited,
      baseOrigin,
      runs,
      screenshots
    },
    allOk ? 200 : 503
  );
}

async function handleHyperdriveDiagnosticRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = await withRuntimeEnv(env, () =>
    getCorsHeadersForRequest(request)
  );
  const jsonResponse = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      }
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const admin = await withRuntimeEnv(env, () => assertPromptCaseAdmin(request));
  if (!admin.ok) {
    return jsonResponse({ error: admin.error || 'Unauthorized' }, admin.status);
  }

  if (env.HYPERDRIVE_DIAGNOSTIC_ENABLED !== 'true') {
    return jsonResponse(
      {
        error: 'HYPERDRIVE_DIAGNOSTIC_DISABLED',
        message: 'Hyperdrive diagnostic route is disabled.'
      },
      404
    );
  }

  if (!env.HYPERDRIVE?.connectionString) {
    return jsonResponse(
      {
        error: 'HYPERDRIVE_NOT_CONFIGURED',
        message:
          'Bind a Cloudflare Hyperdrive configuration as HYPERDRIVE before running this diagnostic.'
      },
      503
    );
  }

  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: HYPERDRIVE_DIAGNOSTIC_CONNECTION_TIMEOUT_MS,
    query_timeout: HYPERDRIVE_DIAGNOSTIC_QUERY_TIMEOUT_MS
  });
  const startedAt = Date.now();

  try {
    await client.connect();
    const result = await client.query<{
      prompt_case_count: string;
      database_time: string;
    }>(`
      SELECT
        COUNT(*)::text AS prompt_case_count,
        NOW()::text AS database_time
      FROM public.prompt_cases
      WHERE is_published = true
        AND deleted_at IS NULL
        AND source_case_id IS NULL
    `);

    return jsonResponse({
      ok: true,
      runtime: WORKER_RUNTIME,
      route: '/api/debug/hyperdrive',
      durationMs: Date.now() - startedAt,
      promptCaseCount: Number(result.rows[0]?.prompt_case_count || 0),
      databaseTime: result.rows[0]?.database_time || null
    });
  } catch (error) {
    console.error('[Cloudflare Hyperdrive] diagnostic failed:', error);
    return jsonResponse(
      {
        error: 'HYPERDRIVE_DIAGNOSTIC_FAILED',
        message: 'Unable to complete the Hyperdrive read diagnostic.',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      },
      500
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function getQueueBinding(env: Env, binding: string): QueueBinding | undefined {
  return (env as unknown as Record<string, QueueBinding | undefined>)[binding];
}

async function readQueueDiagnosticMetric(
  env: Env,
  config: QueueDiagnosticConfig
): Promise<QueueDiagnosticResult> {
  const queue = getQueueBinding(env, config.binding);
  if (!queue) {
    return {
      ...config,
      configured: false,
      metricsAvailable: false,
      error: 'QUEUE_BINDING_MISSING'
    };
  }
  if (!queue.metrics) {
    return {
      ...config,
      configured: true,
      metricsAvailable: false,
      error: 'QUEUE_METRICS_UNAVAILABLE'
    };
  }
  const metrics = await queue.metrics();
  const oldest =
    metrics.oldestMessageTimestamp ??
    metrics.oldest_message_timestamp_ms ??
    null;
  return {
    ...config,
    configured: true,
    metricsAvailable: true,
    backlogCount: metrics.backlogCount ?? metrics.backlog_count ?? null,
    backlogBytes: metrics.backlogBytes ?? metrics.backlog_bytes ?? null,
    oldestMessageTimestampMs: oldest,
    oldestMessageAt:
      typeof oldest === 'number' && Number.isFinite(oldest)
        ? new Date(oldest).toISOString()
        : null
  };
}

async function handleQueueDiagnosticRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = await withRuntimeEnv(env, () =>
    getCorsHeadersForRequest(request)
  );
  const jsonResponse = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      }
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const admin = await withRuntimeEnv(env, () => assertPromptCaseAdmin(request));
  if (!admin.ok) {
    return jsonResponse({ error: admin.error || 'Unauthorized' }, admin.status);
  }

  const queues = await Promise.all(
    QUEUE_DIAGNOSTIC_BINDINGS.map(async (config) => {
      try {
        return await readQueueDiagnosticMetric(env, config);
      } catch (error) {
        return {
          ...config,
          configured: true,
          metricsAvailable: false,
          error: 'QUEUE_METRICS_FAILED',
          errorName: error instanceof Error ? error.name : 'UnknownError'
        };
      }
    })
  );
  const deadLetterBacklogCount = queues
    .filter((queue) => queue.kind === 'dead_letter')
    .reduce((sum, queue) => {
      const value =
        typeof queue.backlogCount === 'number' &&
        Number.isFinite(queue.backlogCount)
          ? queue.backlogCount
          : 0;
      return sum + value;
    }, 0);

  return jsonResponse({
    ok: true,
    runtime: WORKER_RUNTIME,
    route: '/api/debug/queues',
    deadLetterBacklogCount,
    queues
  });
}

async function handleRequest(
  request: Request,
  env: Env,
  context?: WorkerExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);
  const canonicalHost = env.CANONICAL_HOST?.trim();

  if (
    canonicalHost &&
    url.protocol === 'http:' &&
    (url.hostname === canonicalHost || url.hostname === `www.${canonicalHost}`)
  ) {
    url.protocol = 'https:';
    url.hostname = canonicalHost;
    return Response.redirect(url.toString(), 308);
  }

  if (canonicalHost && url.hostname === `www.${canonicalHost}`) {
    url.hostname = canonicalHost;
    return Response.redirect(url.toString(), 308);
  }

  const createBoardsRedirectTarget = getCreateBoardsRedirectTarget(url);
  if (createBoardsRedirectTarget)
    return redirectTo(request, createBoardsRedirectTarget);

  const legacyCreateAppRedirect = getLegacyCreateAppRedirect(url);
  if (legacyCreateAppRedirect) {
    if (/^https?:\/\//.test(legacyCreateAppRedirect)) {
      return Response.redirect(legacyCreateAppRedirect, 301);
    }
    return redirectTo(request, legacyCreateAppRedirect, 301);
  }

  const legacyCreatorRouteRedirect = getLegacyCreatorRouteRedirectTarget(url);
  if (legacyCreatorRouteRedirect) {
    return redirectTo(request, legacyCreatorRouteRedirect);
  }

  const legacyUseCaseDetailRedirect = getLegacyUseCaseDetailRedirectTarget(url);
  if (legacyUseCaseDetailRedirect) {
    return redirectTo(request, legacyUseCaseDetailRedirect);
  }

  const legacyPromptSlugRedirect = getLegacyPromptSlugRedirectTarget(url);
  if (legacyPromptSlugRedirect) {
    return redirectTo(request, legacyPromptSlugRedirect);
  }

  const legacyPromptPreviewRedirect = getLegacyPromptPreviewRedirectTarget(url);
  if (legacyPromptPreviewRedirect) {
    return redirectTo(request, legacyPromptPreviewRedirect);
  }

  if (RETIRED_SEO_PATHS.has(pathname)) {
    return new Response('Gone', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  }

  const redirectTarget = EXACT_REDIRECTS.get(pathname);
  if (redirectTarget) {
    const locale = detectLocaleFromAcceptLanguage(
      request.headers.get('accept-language')
    );
    const explicitLocale =
      detectLocaleFromCookie(request.headers.get('cookie')) || locale;
    const targetPath = redirectTarget.replace(/\{locale\}/g, explicitLocale);
    const preserveQuery =
      pathname === '/' ||
      pathname === '/tools/comfyui-workflow-checker' ||
      pathname === '/prompts' ||
      pathname === '/zh-CN/prompts';
    return redirectTo(
      request,
      preserveQuery ? `${targetPath}${url.search}` : targetPath
    );
  }

  const localePromptIdRedirect = getLocalePromptIdRedirect(pathname);
  if (localePromptIdRedirect) {
    return redirectTo(request, localePromptIdRedirect);
  }

  const promptDetailRedirect = getPromptDetailRedirect(pathname);
  if (promptDetailRedirect) {
    const locale =
      detectLocaleFromCookie(request.headers.get('cookie')) ||
      detectLocaleFromAcceptLanguage(request.headers.get('accept-language'));
    return redirectTo(
      request,
      promptDetailRedirect.replace(/\{locale\}/g, locale) + url.search
    );
  }

  if (pathname === '/healthz') {
    return Response.json({
      status: 'ok',
      runtime: 'cloudflare-worker'
    });
  }

  if (pathname === BOOT_WATCHDOG_PATH) {
    return serveBootWatchdog();
  }

  if (pathname === '/__smoke/kitesurf') {
    return handleKitesurfRenderSmokeRequest(request, env);
  }

  if (pathname === '/index.html') {
    return fetchIndex(request, env);
  }

  if (pathname.startsWith('/models/image-tools/')) {
    return serveImageToolModel(request, env);
  }

  if (isMoodboardAppShellPath(pathname)) {
    return renderNoindexAppShellFromAssets(request, env, pathname);
  }

  if (isStaticAssetPath(pathname)) {
    return fetchStaticAsset(request, env);
  }

  if (pathname === '/sitemap.xml') {
    return withRuntimeEnv(env, () => sitemapHandler(request));
  }

  if (/^\/v1(?:\/|$)/.test(pathname)) {
    return withRuntimeEnv(env, () =>
      apiMarketplaceGatewayHandler(request, context)
    );
  }

  if (isNlmApiPath(pathname) || pathname.startsWith('/api/')) {
    if (isNlmApiPath(pathname)) {
      return workerJsonResponse(
        {
          error: 'NLM_SERVICE_RETIRED',
          message: 'The legacy NotebookLM service has been retired.'
        },
        410,
        {
          'Cache-Control': 'no-store',
          [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
          [ROUTE_HEADER]: 'worker-retired:/api/nlm/*'
        }
      );
    }
    if (pathname === '/api/prompt-og') {
      const cachedPromptOg = await tryServePromptOgCache(request, env);
      if (cachedPromptOg) return cachedPromptOg;
      return servePromptOgWorkerSvg(request);
    }
    if (pathname === '/api/agent/skill-chat') {
      return workerJsonResponse(
        {
          error: 'SKILL_CHAT_LEGACY_RUNTIME_DISABLED',
          message:
            'The legacy Node skill-chat endpoint has been disabled on the Cloudflare front door. Use /api/agent/smart-chat or the Worker-native skill runtime.'
        },
        410,
        {
          'Cache-Control': 'no-store',
          [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
          [ROUTE_HEADER]: 'worker-disabled:/api/agent/skill-chat'
        }
      );
    }
    if (pathname === '/api/image/generate') {
      const response = await withRuntimeEnv(env, () =>
        imageGenerateHandler(request)
      );
      return enqueueImageGenerationTaskFromResponse(
        response,
        env,
        context,
        'cloudflare-worker:/api/image/generate',
        request.headers.get(REQUEST_ID_HEADER) || undefined
      );
    }
    if (pathname === '/api/tools/gpt-image-2-denoise') {
      const response = await withRuntimeEnv(env, () =>
        handleGptImage2DenoiseRequest(request)
      );
      return enqueueImageGenerationTaskFromResponse(
        response,
        env,
        context,
        'cloudflare-worker:/api/tools/gpt-image-2-denoise',
        request.headers.get(REQUEST_ID_HEADER) || undefined
      );
    }
    if (pathname === '/api/image/task') {
      if (request.method === 'GET' || request.method === 'OPTIONS') {
        return withRuntimeEnv(env, () => imageTaskStatusHandler(request));
      }
      const taskActionResponse = await withRuntimeEnv(env, () =>
        handleCloudflareImageTaskAction(request.clone())
      );
      if (taskActionResponse) return taskActionResponse;
      const response = await withRuntimeEnv(env, () =>
        imageTaskHandler(request)
      );
      return enqueueImageGenerationTaskFromResponse(
        response,
        env,
        context,
        'cloudflare-worker:/api/image/task',
        request.headers.get(REQUEST_ID_HEADER) || undefined
      );
    }
    if (pathname === '/api/video/models') {
      return handleWorkerVideoModelsRequest(request, env);
    }
    if (pathname === '/api/video/generate') {
      const maintenanceResponse = handleWorkerVideoGenerationMaintenanceRequest(
        request,
        env
      );
      if (maintenanceResponse) return maintenanceResponse;
      const response = await withRuntimeEnv(env, () =>
        videoGenerateHandler(request.clone())
      );
      return enqueueVideoGenerationTaskFromResponse(
        response,
        env,
        context,
        'cloudflare-worker-native:/api/video/generate',
        request.headers.get(REQUEST_ID_HEADER) || undefined
      );
    }
    if (pathname === '/api/debug/tuzi-omni-smoke') {
      return Response.json(
        {
          error: 'TUZI_OMNI_SMOKE_DISABLED',
          message:
            'This legacy Vercel-only smoke route has been disabled on the Cloudflare front door.'
        },
        { status: 410 }
      );
    }
    if (pathname === '/api/debug/hyperdrive') {
      return handleHyperdriveDiagnosticRequest(request, env);
    }
    if (pathname === '/api/debug/queues') {
      return handleQueueDiagnosticRequest(request, env);
    }

    const localApiHandler = getWorkerApiHandler(pathname);
    if (localApiHandler) {
      if (PUBLIC_CONTENT_CACHE_ROUTES.has(pathname)) {
        return handlePublicContentCacheRequest(
          pathname,
          request,
          env,
          context,
          localApiHandler
        );
      }
      return withRuntimeEnv(env, () => localApiHandler(request));
    }

    return workerJsonResponse(
      {
        error: 'WORKER_API_ROUTE_NOT_FOUND',
        message:
          'This API route is not available on the Cloudflare Worker runtime.'
      },
      404,
      {
        'Cache-Control': 'no-store',
        [ORIGIN_RUNTIME_HEADER]: WORKER_RUNTIME,
        [ROUTE_HEADER]: 'worker-api-missing'
      }
    );
  }

  const seoTarget = getSeoTarget(url);
  if (seoTarget) {
    if (isWorkerRenderableSeoTarget(seoTarget) && isCrawlerRequest(request)) {
      return renderSeoTargetFromAssets(request, env, seoTarget, context);
    }
    if (
      request.method === 'GET' &&
      seoTarget.startsWith('/api/seo-page?') &&
      /^\/(zh-CN|en-US)\/prompts(?:\/(model|category)\/[^/]+)?$/.test(
        url.pathname
      )
    ) {
      return fetchPromptLibraryIndex(request, env, context);
    }
    return fetchIndex(request, env);
  }

  if (isNoindexAppShellPath(pathname)) {
    return renderNoindexAppShellFromAssets(request, env, pathname);
  }

  if (isCrawlerRequest(request)) {
    return renderSeoTargetFromAssets(
      request,
      env,
      `/api/seo-page?path=${encodeURIComponent(pathname)}`,
      context
    );
  }
  return fetchIndex(request, env);
}

function getRequestRouteLabel(request: Request, env: Env): string {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);
  const canonicalHost = env.CANONICAL_HOST?.trim();

  if (
    canonicalHost &&
    url.protocol === 'http:' &&
    (url.hostname === canonicalHost || url.hostname === `www.${canonicalHost}`)
  )
    return 'redirect:http-to-https';
  if (canonicalHost && url.hostname === `www.${canonicalHost}`)
    return 'redirect:www';
  if (getCreateBoardsRedirectTarget(url)) return 'redirect:create-boards';
  if (getLegacyCreatorRouteRedirectTarget(url))
    return 'redirect:legacy-creator-route';
  if (getLegacyUseCaseDetailRedirectTarget(url))
    return 'redirect:legacy-blog-detail';
  if (getLegacyPromptSlugRedirectTarget(url))
    return 'redirect:legacy-prompt-slug';
  if (getLegacyPromptPreviewRedirectTarget(url))
    return 'redirect:legacy-prompt-preview';
  if (RETIRED_SEO_PATHS.has(pathname)) return 'worker-retired:seo-page';
  if (EXACT_REDIRECTS.has(pathname)) return `redirect:${pathname}`;
  if (getLocalePromptIdRedirect(pathname)) return 'redirect:prompt-id';
  if (getPromptDetailRedirect(pathname)) return 'redirect:prompt-detail';
  if (pathname === '/healthz') return 'healthz';
  if (pathname === '/__smoke/kitesurf') return 'worker-smoke:kitesurf';
  if (isMoodboardAppShellPath(pathname)) return 'worker-noindex-shell';
  if (isStaticAssetPath(pathname) || pathname === '/index.html') return 'asset';

  if (
    /^\/v1(?:\/|$)/.test(pathname) ||
    isNlmApiPath(pathname) ||
    pathname.startsWith('/api/')
  ) {
    if (pathname === '/api/prompt-og') return 'worker-api:/api/prompt-og';
    if (pathname === '/api/agent/skill-chat')
      return 'worker-disabled:/api/agent/skill-chat';
    if (pathname === '/api/image/generate')
      return 'worker-api:/api/image/generate';
    if (pathname === '/api/image/task') return 'worker-api:/api/image/task';
    if (pathname === '/api/video/generate')
      return 'queue-worker:/api/video/generate';
    if (pathname === '/api/debug/tuzi-omni-smoke')
      return 'worker-disabled:/api/debug/tuzi-omni-smoke';
    if (pathname === '/api/debug/hyperdrive')
      return 'worker-api:/api/debug/hyperdrive';
    if (pathname === '/api/debug/queues') return 'worker-api:/api/debug/queues';
    const workerRoute = getWorkerApiRouteLabel(pathname);
    if (workerRoute) return `worker-api:${workerRoute}`;
    if (isNlmApiPath(pathname)) return 'worker-retired:/api/nlm/*';
    return 'worker-api-missing';
  }

  const seoTarget = getSeoTarget(url);
  if (seoTarget) {
    if (isWorkerRenderableSeoTarget(seoTarget)) {
      return isCrawlerRequest(request) ? 'worker-seo' : 'worker-seo-skip';
    }
    return 'worker-seo-fallback';
  }
  if (!isCrawlerRequest(request)) {
    return 'worker-spa';
  }
  return isNoindexAppShellPath(pathname)
    ? 'worker-noindex-shell'
    : 'worker-404';
}

export function getSeoRouteLabelForTest(path: string): string {
  const url = new URL(path, 'https://webtomind.com');
  return getRequestRouteLabel(new Request(url.toString()), {
    CANONICAL_HOST: 'webtomind.com'
  } as Env);
}

export function getSeoTargetForTest(path: string): string | null {
  return getSeoTarget(new URL(path, 'https://webtomind.com'));
}

export function getPublicContentCacheKeyForTest(path: string): string {
  const url = new URL(path, 'https://webtomind.com');
  return buildPublicContentCacheKey(
    new Request(url.toString()),
    normalizePath(url.pathname)
  );
}

function logWorkerRequestMetric(input: {
  request: Request;
  route: string;
  requestId: string;
  originRuntime?: string;
  status: number;
  durationMs: number;
  errorName?: string;
}): void {
  console.log(
    JSON.stringify({
      event: 'cloudflare_worker_request',
      request_id: input.requestId,
      runtime: WORKER_RUNTIME,
      origin_runtime: input.originRuntime || WORKER_RUNTIME,
      route: input.route,
      method: input.request.method,
      status: input.status,
      duration_ms: input.durationMs,
      error_name: input.errorName || undefined
    })
  );
}

async function handleInstrumentedRequest(
  request: Request,
  env: Env,
  context?: WorkerExecutionContext
): Promise<Response> {
  const startedAt = Date.now();
  const route = getRequestRouteLabel(request, env);
  const observability: RequestObservability = {
    requestId: getRequestId(request),
    route
  };
  const instrumentedRequest = withObservabilityRequestHeaders(
    request,
    observability
  );

  try {
    const response = await handleRequest(instrumentedRequest, env, context);
    const durationMs = Date.now() - startedAt;
    const instrumentedResponse = withObservabilityResponseHeaders(
      instrumentedRequest,
      response,
      observability,
      durationMs
    );
    logWorkerRequestMetric({
      request: instrumentedRequest,
      route,
      requestId: observability.requestId,
      originRuntime:
        instrumentedResponse.headers.get(ORIGIN_RUNTIME_HEADER) || undefined,
      status: instrumentedResponse.status,
      durationMs
    });
    return instrumentedResponse;
  } catch (error) {
    logWorkerRequestMetric({
      request: instrumentedRequest,
      route,
      requestId: observability.requestId,
      status: 500,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    throw error;
  }
}

// Keep the historical Durable Object class export until a deliberate
// delete-class migration is run in Cloudflare. The current Worker has no
// binding or route for this class, so retaining this export only prevents
// Cloudflare from rejecting deployments that still reference the old class.
export { WatermarksRemoverContainer } from './watermarks-container';

export default {
  fetch(request: Request, env: Env, context: WorkerExecutionContext) {
    return handleInstrumentedRequest(request, env, context);
  },
  async queue(batch: ImageQueueBatch, env: Env) {
    if (isEmailCampaignQueueBatch(batch)) {
      await triggerWorkerEmailScheduler(batch, env);
      return;
    }

    if (isVideoQueueBatch(batch)) {
      const result = await triggerVideoDrain(batch, env);
      await reenqueueVideoTasksFromDrainResult(result, env);
      console.log(
        JSON.stringify({
          event: 'cloudflare_video_queue_drain',
          status: 'success',
          message_count: batch.messages.length,
          processed_count: result.processedCount,
          reenqueue_count: result.reenqueueCount
        })
      );
      return;
    }

    const startedAt = Date.now();
    const taskIds = extractImageQueueTaskIds(batch);
    const messageMetadata = getImageQueueMessageMetadata(batch);
    try {
      const result = await triggerWorkerImageDrain(batch, env);
      await reenqueueImageTasksFromDrainResult(result, env);
      const durationMs = Date.now() - startedAt;
      const queueWaitValues = taskIds
        .map((taskId) =>
          getQueueWaitMs(messageMetadata.get(taskId)?.enqueuedAt)
        )
        .filter((value): value is number => typeof value === 'number');
      const processed = Array.isArray(result.processed) ? result.processed : [];
      const failedCount = processed.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        return (item as Record<string, unknown>).status === 'failed';
      }).length;
      logImageQueueTaskMetrics({
        batchStatus: 'success',
        taskIds,
        messageMetadata,
        durationMs,
        processed: result.processed
      });
      logImageQueueMetric({
        status: 'success',
        messageCount: batch.messages.length,
        taskCount: taskIds.length,
        durationMs,
        taskIds,
        processedCount: result.processedCount,
        claimedCount: result.claimedCount,
        queuedMessageTaskCount: result.queuedMessageTaskCount,
        queueWaitMaxMs:
          queueWaitValues.length > 0 ? Math.max(...queueWaitValues) : undefined,
        failedCount,
        refundFailedCount: result.refundFailedCount,
        reenqueueCount: result.reenqueueCount
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      logImageQueueTaskMetrics({
        batchStatus: 'failed',
        taskIds,
        messageMetadata,
        durationMs,
        errorName
      });
      logImageQueueMetric({
        status: 'failed',
        messageCount: batch.messages.length,
        taskCount: taskIds.length,
        durationMs,
        taskIds,
        errorName
      });
      throw error;
    }
  },
  scheduled(
    controller: { cron: string; scheduledTime: number },
    env: Env,
    context: WorkerExecutionContext
  ) {
    if (controller.cron === '*/1 * * * *') {
      const videoRun = triggerVideoDrain({ messages: [] }, env)
        .then(async (result) => {
          await reenqueueVideoTasksFromDrainResult(result, env);
          console.log(
            JSON.stringify({
              event: 'cloudflare_video_queue_cron_drain',
              status: 'success',
              processed_count: result.processedCount,
              reenqueue_count: result.reenqueueCount,
              cron: controller.cron
            })
          );
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              event: 'cloudflare_video_queue_cron_drain',
              status: 'failed',
              cron: controller.cron,
              error_name: error instanceof Error ? error.name : 'UnknownError'
            })
          );
        });
      const imageRun = triggerWorkerImageDrain({ messages: [] }, env)
        .then(async (result) => {
          await reenqueueImageTasksFromDrainResult(result, env);
          console.log(
            JSON.stringify({
              event: 'cloudflare_image_queue_cron_drain',
              status: 'success',
              processed_count: result.processedCount,
              claimed_count: result.claimedCount,
              reenqueue_count: result.reenqueueCount,
              cron: controller.cron
            })
          );
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              event: 'cloudflare_image_queue_cron_drain',
              status: 'failed',
              cron: controller.cron,
              error_name: error instanceof Error ? error.name : 'UnknownError'
            })
          );
        });
      const visualQualityRun = withRuntimeEnv(env, () =>
        runImageVisualQualitySweep()
      )
        .then((result) => {
          console.log(
            JSON.stringify({
              event: 'cloudflare_image_visual_quality_sweep',
              status: 'success',
              cron: controller.cron,
              ...result
            })
          );
        })
        .catch((error) => {
          console.error(
            JSON.stringify({
              event: 'cloudflare_image_visual_quality_sweep',
              status: 'failed',
              cron: controller.cron,
              error_name: error instanceof Error ? error.name : 'UnknownError'
            })
          );
        });
      const run = Promise.allSettled([videoRun, imageRun, visualQualityRun]);
      context.waitUntil(run);
      return;
    }

    if (controller.cron === '15 1 * * *') {
      const job = buildEmailCampaignEnqueueJob({
        cron: controller.cron,
        scheduledTime: controller.scheduledTime
      });
      const run = env.EMAIL_CAMPAIGN_JOBS
        ? env.EMAIL_CAMPAIGN_JOBS.send(job)
        : triggerWorkerEmailScheduler(
            {
              messages: [
                {
                  body: {
                    ...job,
                    source: 'cloudflare-cron-legacy-fallback'
                  }
                }
              ]
            },
            env
          );
      context.waitUntil(run);
      return;
    }

    if (controller.cron === '*/10 * * * *') {
      const run = withRuntimeEnv(env, async () => {
        const apiMarketplaceAdmin = getSupabaseAdmin();
        if (apiMarketplaceAdmin) {
          const { data: staleUsageResult, error: staleUsageError } =
            await apiMarketplaceAdmin.rpc('expire_stale_api_usage', {
              p_max_age_seconds: 1800
            });
          const { data: settlementQueueResult, error: settlementQueueError } =
            await apiMarketplaceAdmin.rpc(
              'process_api_usage_settlement_queue',
              { p_batch_size: 50 }
            );
          const queuePayload =
            settlementQueueResult && typeof settlementQueueResult === 'object'
              ? (settlementQueueResult as Record<string, unknown>)
              : null;
          const deadSettlementCount = Number(queuePayload?.dead_count || 0);
          if (!settlementQueueError && deadSettlementCount > 0) {
            // Dead-lettered settlements mean a paid upstream call may never be
            // billed. The stale-reservation job can later refund the remaining
            // reservation, so alert immediately instead of waiting for manual
            // queue inspection. Alert failures must not break the cron itself.
            try {
              await sendViaResend({
                to: API_MARKETPLACE_ADMIN_EMAIL,
                subject: '[WebToMind] API 结算死信告警',
                html: '<p>API 计费结算队列出现死信，请立即核对 api_usage_settlement_queue。</p>',
                text: 'API 计费结算队列出现死信，请立即核对 api_usage_settlement_queue。'
              });
            } catch (alertError) {
              console.error(
                JSON.stringify({
                  event: 'api_marketplace_settlement_dead_letter_alert_failed',
                  error_name:
                    alertError instanceof Error
                      ? alertError.message
                      : 'UnknownError'
                })
              );
            }
          }
          console.log(
            JSON.stringify({
              event: 'api_marketplace_stale_reservation_recovery',
              status:
                staleUsageError || settlementQueueError ? 'failed' : 'success',
              cron: controller.cron,
              result: staleUsageError || staleUsageResult,
              settlement_queue: settlementQueueError || queuePayload,
              dead_settlement_count: deadSettlementCount
            })
          );
        } else {
          console.error(
            JSON.stringify({
              event: 'api_marketplace_stale_reservation_recovery',
              status: 'failed',
              cron: controller.cron,
              error: 'Supabase admin client is not configured'
            })
          );
        }

        if (apiMarketplaceAdmin) {
          // Failed generation refunds are only flagged on the task; nothing
          // retries them. Alert once per window so paid credits are returned.
          try {
            const windowEnd = new Date(controller.scheduledTime);
            const refundScan = await findRecentRefundFailures(
              apiMarketplaceAdmin,
              new Date(windowEnd.getTime() - 10 * 60 * 1000),
              windowEnd
            );
            const alert = buildRefundFailureAlert(refundScan);
            if (alert) {
              await sendViaResend({ to: API_MARKETPLACE_ADMIN_EMAIL, ...alert });
            }
            console.log(
              JSON.stringify({
                event: 'generation_refund_failure_monitor',
                status: refundScan.errors.length > 0 ? 'failed' : 'success',
                cron: controller.cron,
                image_refund_failed_count: refundScan.taskIds.image.length,
                video_refund_failed_count: refundScan.taskIds.video.length,
                alerted: Boolean(alert),
                errors: refundScan.errors
              })
            );
          } catch (monitorError) {
            console.error(
              JSON.stringify({
                event: 'generation_refund_failure_monitor',
                status: 'failed',
                cron: controller.cron,
                error:
                  monitorError instanceof Error
                    ? monitorError.message
                    : 'UnknownError'
              })
            );
          }
        }

        const secret = getCronSecret(env);
        const recoveryResponse = await handleMarketingEmailSchedulerRequest(
          new Request(
            'https://webtomind.com/api/marketing/email-scheduler?mode=checkout-recovery',
            {
              method: 'POST',
              headers: {
                authorization: `Bearer ${secret}`,
                'content-type': 'application/json',
                'x-cron-secret': secret,
                'user-agent': 'webtomind-cloudflare-checkout-recovery-cron'
              }
            }
          )
        );
        const recoveryBody = await recoveryResponse.json().catch(() => null);
        console.log(
          JSON.stringify({
            event: 'cloudflare_checkout_recovery_cron',
            status: recoveryResponse.ok ? 'success' : 'failed',
            cron: controller.cron,
            http_status: recoveryResponse.status,
            result: recoveryBody
          })
        );
        const response = await marketingEmailDrainHandler(
          new Request('https://webtomind.com/api/marketing/email-drain', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${secret}`,
              'x-cron-secret': secret,
              'user-agent': 'webtomind-cloudflare-email-drain-cron'
            }
          })
        );
        const body = (await response.json().catch(() => null)) as {
          claimed?: unknown;
          processed?: unknown;
          error?: unknown;
        } | null;
        console.log(
          JSON.stringify({
            event: 'cloudflare_email_drain_cron',
            status: response.ok ? 'success' : 'failed',
            cron: controller.cron,
            http_status: response.status,
            claimed: body?.claimed,
            processed_count: Array.isArray(body?.processed)
              ? body.processed.length
              : undefined,
            error: body?.error
          })
        );
      }).catch((error) => {
        console.error(
          JSON.stringify({
            event: 'cloudflare_email_drain_cron',
            status: 'failed',
            cron: controller.cron,
            error_name: error instanceof Error ? error.name : 'UnknownError'
          })
        );
      });
      context.waitUntil(run);
      return;
    }

    if (controller.cron !== '0 3 * * *') {
      return;
    }

    const run = withRuntimeEnv(env, async () => {
      const request = new Request(
        'https://webtomind.com/api/membership/grant-monthly',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.CRON_SECRET || ''}`,
            'x-cron-secret': env.CRON_SECRET || '',
            'user-agent': 'cloudflare-cron'
          }
        }
      );
      const response = await membershipGrantMonthlyHandler(request);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `membership grant cron failed: ${response.status} ${body}`
        );
      }
    });

    context.waitUntil(run);
  }
};
