import type { VercelRequest, VercelResponse } from '../utils/vercel-types';
import {
  beijingDateKey,
  beijingWeekday,
  buildUnsubscribeUrl,
  EmailContent,
  escapeHtml,
  generateMarketingHeroImage,
  getEnvInt,
  getSiteUrl,
  getSupabaseAdmin,
  isAuthorizedCronRequest,
  Locale,
  MarketingEmailPreference,
  MarketingEmailType,
  parseWeekdays,
  pickPromptCaseImage,
  PromptCase,
  renderEmailLayout
} from './email-utils.js';
import {
  HOMEPAGE_CASE_DIGEST_MARKER_KEY,
  isMissingRelationError,
  readSubscriptionMarkerMetadata
} from './subscription-markers.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300
};

type QueueResult = {
  type: MarketingEmailType;
  locale: Locale;
  campaignKey: string;
  recipients: number;
  queued: number;
  segment?: ReengagementSegmentKey | 'generic';
  skipped?: string;
};

type ReengagementSegmentKey =
  | 'checkout_started_no_purchase'
  | 'generated_no_purchase'
  | 'paid_not_activated';

export type CampaignEnqueueJob = {
  type: 'campaign_enqueue';
  jobId?: string;
  cron?: string;
  scheduledTime?: number;
  dateKey?: string;
  emailTypes?: MarketingEmailType[];
  segment?: ReengagementSegmentKey | 'generic';
  source?: string;
};

type ReengagementSegment = {
  user_id: string;
  segment_key: ReengagementSegmentKey;
  last_signal_at: string;
  metadata: Record<string, unknown> | null;
};

export type CheckoutRecoveryStage = 'initial_30m' | 'followup_6h';

type CheckoutRecoveryCandidate = {
  order_id: string;
  user_id: string;
  product_type: 'subscription' | 'credit_package';
  product_id: string;
  provider: string;
  checkout_started_at: string;
  recovery_stage: CheckoutRecoveryStage;
  metadata: Record<string, unknown> | null;
};

type SchedulerRequestLike = {
  method?: string;
  url?: string;
  headers: Headers | Record<string, string | string[] | undefined>;
  body?: unknown;
};

type SchedulerResult = {
  status: number;
  body: unknown;
};

export function chunkMarketingEmailRows<T>(
  rows: T[],
  batchSize: number
): T[][] {
  if (rows.length === 0) return [];
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += safeBatchSize) {
    batches.push(rows.slice(index, index + safeBatchSize));
  }
  return batches;
}

class ReengagementSegmentsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReengagementSegmentsUnavailableError';
  }
}

const REENGAGEMENT_SEGMENTS: ReengagementSegmentKey[] = [
  'checkout_started_no_purchase',
  'generated_no_purchase',
  'paid_not_activated'
];

function isMarketingEmailType(value: unknown): value is MarketingEmailType {
  return (
    value === 'case_digest' || value === 'limited_offer' || value === 'welcome'
  );
}

function isReengagementSegmentKey(
  value: unknown
): value is ReengagementSegmentKey {
  return (
    value === 'checkout_started_no_purchase' ||
    value === 'generated_no_purchase' ||
    value === 'paid_not_activated'
  );
}

function normalizeCampaignEnqueueJob(
  value: unknown
): CampaignEnqueueJob | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.type !== 'campaign_enqueue') return null;
  const rawTypes = Array.isArray(record.emailTypes)
    ? record.emailTypes
    : Array.isArray(record.campaignTypes)
      ? record.campaignTypes
      : [];
  const emailTypes = rawTypes.filter(isMarketingEmailType);
  const segment =
    record.segment === 'generic'
      ? 'generic'
      : isReengagementSegmentKey(record.segment)
        ? record.segment
        : undefined;

  return {
    type: 'campaign_enqueue',
    jobId: typeof record.jobId === 'string' ? record.jobId : undefined,
    cron: typeof record.cron === 'string' ? record.cron : undefined,
    scheduledTime:
      typeof record.scheduledTime === 'number' &&
      Number.isFinite(record.scheduledTime)
        ? record.scheduledTime
        : undefined,
    dateKey:
      typeof record.dateKey === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(record.dateKey)
        ? record.dateKey
        : undefined,
    emailTypes: emailTypes.length > 0 ? emailTypes : undefined,
    segment,
    source: typeof record.source === 'string' ? record.source : undefined
  };
}

export function extractCampaignEnqueueJobs(
  body: unknown
): CampaignEnqueueJob[] {
  const jobs: CampaignEnqueueJob[] = [];
  const visit = (value: unknown) => {
    const job = normalizeCampaignEnqueueJob(value);
    if (job) jobs.push(job);
  };

  visit(body);
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.messages)) {
      for (const message of record.messages) {
        visit(message);
        if (message && typeof message === 'object') {
          visit((message as Record<string, unknown>).body);
        }
      }
    }
  }

  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key =
      job.jobId ||
      `${job.dateKey || ''}:${job.cron || ''}:${job.emailTypes?.join(',') || ''}:${job.segment || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function json(res: VercelResponse, status: number, data: unknown): void {
  res.status(status).json(data);
}

function campaignTypesForRequest(
  request: SchedulerRequestLike,
  jobs: CampaignEnqueueJob[] = []
): MarketingEmailType[] {
  const jobTypes = Array.from(
    new Set(jobs.flatMap((job) => job.emailTypes || []))
  ).filter((type) => type !== 'welcome');
  if (jobTypes.length > 0) return jobTypes;

  const url = new URL(request.url || '', getSiteUrl());
  const type = url.searchParams.get('type') as MarketingEmailType | null;
  if (type === 'case_digest' || type === 'limited_offer') return [type];

  const weekday = beijingWeekday();
  const caseDays = parseWeekdays(
    process.env.MARKETING_CASE_DIGEST_WEEKDAYS,
    [1]
  );
  const offerDays = parseWeekdays(process.env.MARKETING_OFFER_WEEKDAYS, [4]);
  const types: MarketingEmailType[] = [];
  if (caseDays.includes(weekday)) types.push('case_digest');
  if (offerDays.includes(weekday)) types.push('limited_offer');
  return types;
}

function reengagementSegmentsForRequest(
  request: SchedulerRequestLike,
  jobs: CampaignEnqueueJob[] = []
): Array<ReengagementSegmentKey | 'generic'> {
  const jobSegments = Array.from(
    new Set(
      jobs
        .map((job) => job.segment)
        .filter(
          (segment): segment is ReengagementSegmentKey | 'generic' =>
            segment === 'generic' || Boolean(segment)
        )
    )
  );
  if (jobSegments.length > 0) return jobSegments;

  const url = new URL(request.url || '', getSiteUrl());
  const segment = url.searchParams.get('segment') as
    | ReengagementSegmentKey
    | 'generic'
    | null;
  if (segment === 'generic') return ['generic'];
  if (segment && REENGAGEMENT_SEGMENTS.includes(segment)) return [segment];
  return REENGAGEMENT_SEGMENTS;
}

function schedulerDateKey(jobs: CampaignEnqueueJob[]): string {
  const explicit = jobs.find((job) => job.dateKey)?.dateKey;
  if (explicit) return explicit;
  const scheduledTime = jobs.find((job) => job.scheduledTime)?.scheduledTime;
  return beijingDateKey(
    typeof scheduledTime === 'number' ? new Date(scheduledTime) : new Date()
  );
}

export function isMarketingEmailSchedulerValidationRequest(
  request: Pick<SchedulerRequestLike, 'url' | 'body'>
): boolean {
  const url = new URL(request.url || '', getSiteUrl());
  if (url.searchParams.get('mode') === 'validate') return true;
  if (!request.body || typeof request.body !== 'object') return false;
  return (request.body as Record<string, unknown>).mode === 'validate';
}

async function validateMarketingEmailScheduler(
  dateKey: string,
  types: MarketingEmailType[]
): Promise<{
  queueConflictContract: boolean;
  recipientSelectionReady: boolean;
  recipientCounts: Array<{
    type: MarketingEmailType;
    locale: Locale;
    recipients: number;
  }>;
}> {
  const supabase = getSupabaseAdmin();
  const { data: queueContract, error: queueContractError } = await supabase.rpc(
    'verify_marketing_email_queue_upsert_contract'
  );
  if (queueContractError) throw queueContractError;

  const recipientCounts: Array<{
    type: MarketingEmailType;
    locale: Locale;
    recipients: number;
  }> = [];
  for (const type of types) {
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const recipients = await fetchRecipients(type, locale);
      recipientCounts.push({
        type,
        locale,
        recipients: recipients.length
      });
    }
  }

  const result = {
    queueConflictContract: queueContract === true,
    recipientSelectionReady:
      types.length > 0 &&
      types.every((type) =>
        recipientCounts.some(
          (count) => count.type === type && count.recipients > 0
        )
      ),
    recipientCounts
  };
  const status =
    result.queueConflictContract && result.recipientSelectionReady
      ? 'passed'
      : 'failed';
  const { error: auditError } = await supabase
    .from('marketing_email_system_audits')
    .upsert(
      {
        audit_key: `scheduler-validation:${dateKey}:${types.join(',')}`,
        audit_type: 'scheduler_validation',
        status,
        detail: {
          dateKey,
          types,
          ...result
        },
        updated_at: new Date().toISOString()
      },
      { onConflict: 'audit_key' }
    );
  if (auditError) throw auditError;
  return result;
}

function isReengagementSegmentsUnavailable(error: unknown): boolean {
  if (error instanceof ReengagementSegmentsUnavailableError) return true;
  if (!error || typeof error !== 'object') return false;

  const record = error as { code?: unknown; message?: unknown };
  const message =
    typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    record.code === 'PGRST205' ||
    record.code === '42P01' ||
    message.includes('conversion_reengagement_segments') ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
}

function promptCaseUrl(item: PromptCase, locale: Locale): string {
  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  if (item.slug)
    return `${getSiteUrl()}${localePrefix}/prompts/${encodeURIComponent(item.slug)}`;
  return `${getSiteUrl()}${localePrefix}/create/prompts/share/${encodeURIComponent(item.id)}`;
}

function promptLibraryUrl(locale: Locale): string {
  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  return `${getSiteUrl()}${localePrefix}/prompts`;
}

function renderCaseCards(items: PromptCase[], locale: Locale): string {
  return items
    .map((item) => {
      const title = item.title || 'Untitled prompt';
      const imageUrl = pickPromptCaseImage(item);
      const categoryLabel =
        item.category ||
        (locale === 'en-US' ? 'Featured prompt case' : '精选提示词案例');
      const stats = [
        item.generate_count ? `${item.generate_count} runs` : '',
        item.copy_count ? `${item.copy_count} copies` : ''
      ].filter(Boolean);
      return `<div style="border:1px solid #dbe5ff;border-radius:18px;padding:16px;margin:0 0 16px;background:#ffffff;box-shadow:0 10px 28px rgba(15,23,42,.08);">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" style="display:block;width:100%;max-width:560px;border-radius:14px;margin-bottom:14px;border:1px solid #e2e8f0;" />` : ''}
        <p style="margin:0 0 10px;">
          <span style="display:inline-block;background:#ff3ccf;color:#111827;border:1px solid #111827;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;">${escapeHtml(categoryLabel)}</span>
          ${stats.length > 0 ? `<span style="display:inline-block;margin-left:6px;background:#d8ff2e;color:#111827;border:1px solid #111827;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;">${escapeHtml(stats.join(' · '))}</span>` : ''}
        </p>
        <h2 style="font-size:20px;line-height:1.35;margin:0 0 8px;color:#0f172a;">${escapeHtml(title)}</h2>
        <p style="font-size:14px;line-height:1.65;color:#475569;margin:0 0 14px;">${locale === 'en-US' ? 'Open the full prompt, model settings, and reusable visual logic.' : '打开完整 Prompt、模型设置和可复用的视觉逻辑。'}</p>
        <a href="${escapeHtml(promptCaseUrl(item, locale))}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:13px;font-weight:800;border-radius:999px;padding:10px 14px;box-shadow:4px 4px 0 #d8ff2e;">${locale === 'en-US' ? 'Open case' : '打开案例'}</a>
      </div>`;
    })
    .join('');
}

async function fetchPromptCases(limit: number): Promise<PromptCase[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('prompt_cases')
    .select(
      'id,title,slug,image_url,image_urls,prompt,category,tags,generate_count,copy_count,view_count,featured,created_at'
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('featured', { ascending: false })
    .order('generate_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[MarketingEmail] prompt case fetch failed:', error.message);
    return [];
  }

  return (data || []) as PromptCase[];
}

function buildCaseDigestContent(
  locale: Locale,
  promptCases: PromptCase[],
  heroImageUrl: string | null
): EmailContent {
  const ctaUrl = promptLibraryUrl(locale);
  const bodyHtml =
    promptCases.length > 0
      ? renderCaseCards(promptCases, locale)
      : `<p>${locale === 'en-US' ? 'Browse the prompt library for reusable visual workflows.' : '进入提示词案例库，查看可复用的图片生成工作流。'}</p>`;

  if (locale === 'en-US') {
    return {
      subject: 'This week in AI image workflows / 本周 AI 图片案例',
      previewText: 'Curated prompt cases you can reuse directly.',
      title: 'Curated AI image cases',
      intro:
        'A compact collection of reusable prompt cases for faster image generation experiments. 本周精选一组可直接复用、改写和再次生成的图片工作流。',
      bodyHtml,
      textBody: `Curated AI image cases: ${ctaUrl}`,
      ctaLabel: 'Browse all cases / 查看全部案例',
      ctaUrl,
      heroImageUrl
    };
  }

  return {
    subject: '本周 AI 图片生成精品案例合集 / Weekly AI image cases',
    previewText: '精选可直接复用的提示词案例。',
    title: '本周精品案例合集',
    intro:
      '帮你整理了一组可复用的 AI 图片生成案例，适合直接打开、复制、改写和再次生成。A compact set of reusable prompt cases for your next image workflow.',
    bodyHtml,
    textBody: `本周精品案例合集：${ctaUrl}`,
    ctaLabel: '查看全部案例 / Browse Cases',
    ctaUrl,
    heroImageUrl
  };
}

async function parseSchedulerFetchBody(request: Request): Promise<unknown> {
  if (request.method !== 'POST') return undefined;
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function getSegmentPricingUrl(
  locale: Locale,
  segment?: ReengagementSegmentKey,
  recoveryStage?: CheckoutRecoveryStage
): string {
  const localePrefix = locale === 'en-US' ? '/en-US' : '/zh-CN';
  const campaign = segment ? `reengagement_${segment}` : 'limited_offer';
  const source =
    segment === 'checkout_started_no_purchase'
      ? 'email_checkout_abandon'
      : segment === 'generated_no_purchase'
        ? 'email_generated_no_purchase'
        : segment === 'paid_not_activated'
          ? 'email_paid_not_activated'
          : 'email_limited_offer';
  const targetsPricing = segment !== 'paid_not_activated';
  const targetPath = targetsPricing ? '/pricing' : '/create';
  const url = new URL(`${getSiteUrl()}${localePrefix}${targetPath}`);
  url.searchParams.set('source', source);
  url.searchParams.set('utm_source', 'email');
  url.searchParams.set('utm_medium', 'marketing');
  url.searchParams.set('utm_campaign', campaign);
  if (targetsPricing) {
    if (segment === 'checkout_started_no_purchase') {
      url.searchParams.set('plan', 'pro');
      url.searchParams.set('mode', 'monthly');
    }
  }
  if (recoveryStage) {
    url.searchParams.set('utm_campaign', `checkout_recovery_${recoveryStage}`);
  }
  return url.toString();
}

export function getCheckoutRecoveryCampaignKey(
  orderId: string,
  stage: CheckoutRecoveryStage,
  locale: Locale
): string {
  return `limited_offer:checkout_recovery:${orderId}:${stage}:${locale}`;
}

export function buildCheckoutRecoveryContent(
  locale: Locale,
  stage: CheckoutRecoveryStage
): EmailContent {
  const ctaUrl = getSegmentPricingUrl(
    locale,
    'checkout_started_no_purchase',
    stage
  );
  const isFollowup = stage === 'followup_6h';

  if (locale === 'en-US') {
    return {
      subject: isFollowup
        ? 'Your WebToMind Pro checkout is still available'
        : 'Continue your WebToMind Pro checkout',
      previewText: isFollowup
        ? 'Return to the monthly Pro plan and continue your image workflow.'
        : 'Pick up the monthly Pro checkout you started.',
      title: isFollowup ? 'Ready when you are' : 'Continue where you left off',
      intro:
        'Your payment was not completed. Monthly Pro remains selected so you can return without rebuilding your plan choice.',
      bodyHtml:
        '<ul style="padding-left:20px;margin:0 0 18px;"><li>Monthly Pro is preselected.</li><li>Your image workflow remains available after checkout.</li><li>You can review the price before confirming payment.</li></ul>',
      textBody: `Continue your monthly WebToMind Pro checkout: ${ctaUrl}`,
      ctaLabel: 'Continue checkout',
      ctaUrl,
      heroImageUrl: null
    };
  }

  return {
    subject: isFollowup
      ? '你的 WebToMind Pro 支付仍可继续'
      : '继续完成 WebToMind Pro 支付',
    previewText: isFollowup
      ? '返回 Pro 月付方案，继续你的图片工作流。'
      : '继续刚才未完成的 Pro 月付流程。',
    title: isFollowup ? '准备好时继续即可' : '从刚才中断的位置继续',
    intro: '你的支付尚未完成。返回后会继续展示 Pro 月付，无需重新选择套餐。',
    bodyHtml:
      '<ul style="padding-left:20px;margin:0 0 18px;"><li>默认选择 Pro 月付方案。</li><li>支付后可继续原来的图片创作流程。</li><li>确认付款前仍可再次核对价格。</li></ul>',
    textBody: `继续完成 WebToMind Pro 月付：${ctaUrl}`,
    ctaLabel: '继续支付',
    ctaUrl,
    heroImageUrl: null
  };
}

export function buildSegmentOfferContent(
  locale: Locale,
  segment: ReengagementSegmentKey,
  heroImageUrl: string | null
): EmailContent {
  const ctaUrl = getSegmentPricingUrl(locale, segment);

  if (segment === 'checkout_started_no_purchase') {
    if (locale === 'en-US') {
      return {
        subject: 'Continue your WebToMind workflow with Pro',
        previewText:
          'Pro gives ongoing image workflows the best balance of capacity and value.',
        title: 'Pick up your workflow with Pro',
        intro:
          'Your checkout was not completed. WebToMind Pro is the recommended plan for creators who want predictable monthly capacity and a continuous prompt-to-image workflow.',
        bodyHtml:
          '<ul style="padding-left:20px;margin:0 0 18px;"><li>Use a predictable monthly allowance for prompt experiments and image iterations.</li><li>Keep reusable prompt cases, generation history and assets in one workflow.</li><li>Credit packs remain available only when you need temporary capacity beyond your plan.</li></ul>',
        textBody: `Continue your WebToMind workflow with Pro: ${ctaUrl}`,
        ctaLabel: 'Continue with Pro',
        ctaUrl,
        heroImageUrl
      };
    }

    return {
      subject: '使用 WebToMind Pro 继续你的图片工作流',
      previewText: 'Pro 会员兼顾月度生成额度与持续工作流，是默认推荐方案。',
      title: '用 Pro 继续未完成的创作',
      intro:
        '你之前的支付流程还没有完成。对于需要持续生成和复用 Prompt 的创作者，Pro 会员在月度额度与使用成本之间更均衡。',
      bodyHtml:
        '<ul style="padding-left:20px;margin:0 0 18px;"><li>用稳定的月度额度支持提示词实验和图片迭代。</li><li>把精品案例、生成记录和素材放在同一个持续工作流里。</li><li>积分包仅用于会员额度之外的临时补量。</li></ul>',
      textBody: `使用 WebToMind Pro 继续你的图片工作流：${ctaUrl}`,
      ctaLabel: '继续选择 Pro',
      ctaUrl,
      heroImageUrl
    };
  }

  if (segment === 'generated_no_purchase') {
    if (locale === 'en-US') {
      return {
        subject: 'Turn your image tests into a repeatable Pro workflow',
        previewText:
          'Pro is the recommended value plan for ongoing generation and prompt reuse.',
        title: 'Keep creating with a Pro workflow',
        intro:
          'You have already generated images in WebToMind. Pro is the recommended next step when you want predictable monthly capacity instead of rebuilding or interrupting each prompt workflow.',
        bodyHtml:
          '<ul style="padding-left:20px;margin:0 0 18px;"><li>Use monthly capacity for prompt variants and production-ready outputs.</li><li>Reuse prompt cases to shorten each new image experiment.</li><li>Keep generation history and assets connected to your creator workspace; use credit packs only for temporary extra capacity.</li></ul>',
        textBody: `Keep creating with WebToMind Pro: ${ctaUrl}`,
        ctaLabel: 'View Pro plan',
        ctaUrl,
        heroImageUrl
      };
    }

    return {
      subject: '用 Pro 把图片测试变成稳定工作流',
      previewText: 'Pro 是持续生成、复用 Prompt 和管理创作记录的推荐方案。',
      title: '把一次生成变成持续创作',
      intro:
        '你已经在 WebToMind 完成过图片生成。需要继续迭代时，Pro 会员用稳定月度额度承接 Prompt、生成记录和素材复用，比临时补量更适合持续创作。',
      bodyHtml:
        '<ul style="padding-left:20px;margin:0 0 18px;"><li>用月度额度支持提示词变体和可交付图片输出。</li><li>复用精选案例，减少每次从零开始调 Prompt 的时间。</li><li>生成历史和素材继续保存在创作工作区；积分包仅用于临时追加额度。</li></ul>',
      textBody: `使用 WebToMind Pro 继续创作：${ctaUrl}`,
      ctaLabel: '查看 Pro 方案',
      ctaUrl,
      heroImageUrl
    };
  }

  if (locale === 'en-US') {
    return {
      subject: 'Your WebToMind credits are ready to use',
      previewText:
        'Return to the creator workspace and run your next image prompt.',
      title: 'Start using what you unlocked',
      intro:
        'Your purchase is active. The fastest next step is to return to the image creator and run one prompt while the workflow context is still fresh.',
      bodyHtml:
        '<ul style="padding-left:20px;margin:0 0 18px;"><li>Open the image creator and test one prompt.</li><li>Reuse a featured prompt case if you want a faster starting point.</li><li>Your purchased credits are available for the next generation run.</li></ul>',
      textBody: `Start generating in WebToMind: ${ctaUrl}`,
      ctaLabel: 'Create an image',
      ctaUrl,
      heroImageUrl
    };
  }

  return {
    subject: '你的 WebToMind 积分已经可以使用',
    previewText: '回到创作页，趁工作流还清晰时跑一次新的图片提示词。',
    title: '开始使用你已经解锁的能力',
    intro:
      '你的付费已经生效。现在最直接的下一步，是回到图片创作页，趁需求还清晰时生成一张图。',
    bodyHtml:
      '<ul style="padding-left:20px;margin:0 0 18px;"><li>打开图片创作页，测试一个提示词。</li><li>如果不想从零开始，可以先复用一个精选案例。</li><li>你购买的积分可直接用于下一次生成。</li></ul>',
    textBody: `开始使用 WebToMind 生成图片：${ctaUrl}`,
    ctaLabel: '去生成图片',
    ctaUrl,
    heroImageUrl
  };
}

function buildOfferContent(
  locale: Locale,
  heroImageUrl: string | null,
  segment?: ReengagementSegmentKey
): EmailContent {
  if (segment) {
    return buildSegmentOfferContent(locale, segment, heroImageUrl);
  }

  const discountLabel =
    locale === 'en-US'
      ? process.env.MARKETING_OFFER_LABEL_EN || 'Limited-time creator offer'
      : process.env.MARKETING_OFFER_LABEL_ZH || '限时创作者优惠';
  const offerDetail =
    locale === 'en-US'
      ? process.env.MARKETING_OFFER_DETAIL_EN ||
        'Upgrade this week to unlock higher image generation limits, premium models, and a repeatable visual workflow.'
      : process.env.MARKETING_OFFER_DETAIL_ZH ||
        '本周升级可解锁更高图片生成额度、高级模型和可复用的视觉工作流。';
  const ctaUrl = getSegmentPricingUrl(locale);

  if (locale === 'en-US') {
    return {
      subject: `${discountLabel}: upgrade WebToMind`,
      previewText:
        'Unlock more AI image generation capacity before the offer ends.',
      title: discountLabel,
      intro: offerDetail,
      bodyHtml:
        '<ul style="padding-left:20px;margin:0 0 18px;"><li>More monthly credits for image generation.</li><li>Higher daily generation capacity.</li><li>Reusable prompt cases and workflow history.</li></ul><p style="font-weight:700;">Offer window is limited. Upgrade while this campaign is active.</p>',
      textBody: `${discountLabel}. ${offerDetail}. ${ctaUrl}`,
      ctaLabel: 'View plans',
      ctaUrl,
      heroImageUrl
    };
  }

  return {
    subject: `${discountLabel}：升级 WebToMind 付费套餐`,
    previewText: '在优惠结束前解锁更高 AI 图片生成额度。',
    title: discountLabel,
    intro: offerDetail,
    bodyHtml:
      '<ul style="padding-left:20px;margin:0 0 18px;"><li>更多每月积分，用于图片生成与创作工作流。</li><li>更高每日图片生成额度。</li><li>复用提示词案例、历史记录和稳定创作链路。</li></ul><p style="font-weight:700;">优惠窗口有限，建议在本轮活动结束前完成升级。</p>',
    textBody: `${discountLabel}。${offerDetail}。${ctaUrl}`,
    ctaLabel: '查看付费套餐',
    ctaUrl,
    heroImageUrl
  };
}

async function activePaidUserIds(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id,status,current_period_end')
    .in('status', ['active', 'trialing', 'past_due', 'canceled']);

  if (error) {
    console.warn('[MarketingEmail] subscription fetch failed:', error.message);
    return new Set();
  }

  return new Set(
    (data || [])
      .filter((sub) => {
        if (sub.status === 'canceled') {
          return Boolean(
            sub.current_period_end && sub.current_period_end >= today
          );
        }
        return true;
      })
      .map((sub) => sub.user_id)
      .filter(Boolean)
  );
}

async function fetchReengagementSegments(
  segment: ReengagementSegmentKey
): Promise<ReengagementSegment[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conversion_reengagement_segments')
    .select('user_id,segment_key,last_signal_at,metadata')
    .eq('segment_key', segment)
    .order('last_signal_at', { ascending: false })
    .limit(getEnvInt('MARKETING_REENGAGEMENT_RECIPIENT_LIMIT', 1000, 1, 5000));

  if (error) {
    if (isReengagementSegmentsUnavailable(error)) {
      throw new ReengagementSegmentsUnavailableError(
        'conversion_reengagement_segments is unavailable'
      );
    }
    console.warn('[MarketingEmail] reengagement segment fetch failed:', {
      segment,
      message: error.message
    });
    return [];
  }

  return (data || []).filter(
    (item): item is ReengagementSegment =>
      typeof item.user_id === 'string' &&
      REENGAGEMENT_SEGMENTS.includes(item.segment_key as ReengagementSegmentKey)
  );
}

function mergeSegmentMetadata(
  recipients: MarketingEmailPreference[],
  segments: ReengagementSegment[]
): MarketingEmailPreference[] {
  const segmentByUserId = new Map(
    segments.map((item) => [item.user_id, item] as const)
  );

  return recipients.map((recipient) => {
    const segment = recipient.user_id
      ? segmentByUserId.get(recipient.user_id)
      : undefined;
    return {
      ...recipient,
      reengagementSegment: segment?.segment_key,
      reengagementLastSignalAt: segment?.last_signal_at,
      reengagementMetadata: segment?.metadata || undefined
    } as MarketingEmailPreference;
  });
}

function dedupeRecipientsByEmail(
  recipients: MarketingEmailPreference[]
): MarketingEmailPreference[] {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const email = recipient.email.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

async function fetchLeadRecipients(
  type: MarketingEmailType,
  locale: Locale
): Promise<MarketingEmailPreference[]> {
  if (type !== 'case_digest') return [];
  const supabase = getSupabaseAdmin();
  const markerRecipients = await fetchQueueMarkerRecipients(locale);
  const { data, error } = await supabase
    .from('marketing_email_leads')
    .select('*')
    .eq('case_digest_enabled', true)
    .eq('locale', locale)
    .is('unsubscribed_at', null)
    .limit(getEnvInt('MARKETING_EMAIL_LEAD_RECIPIENT_LIMIT', 2000, 1, 10000));

  if (error) {
    if (isMissingRelationError(error)) return markerRecipients;
    throw error;
  }

  return dedupeRecipientsByEmail([
    ...(data || []).map((item) => ({
      user_id: null,
      email: String(item.email || ''),
      locale,
      unsubscribe_token: String(item.unsubscribe_token || ''),
      welcome_enabled: false,
      case_digest_enabled: Boolean(item.case_digest_enabled),
      offer_enabled: false,
      unsubscribed_at: item.unsubscribed_at || null
    })),
    ...markerRecipients
  ]);
}

async function fetchQueueMarkerRecipients(
  locale: Locale
): Promise<MarketingEmailPreference[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('marketing_email_queue')
    .select('recipient_email,metadata')
    .eq('email_type', 'case_digest')
    .eq('campaign_key', HOMEPAGE_CASE_DIGEST_MARKER_KEY)
    .limit(getEnvInt('MARKETING_EMAIL_LEAD_RECIPIENT_LIMIT', 2000, 1, 10000));

  if (error) {
    console.warn(
      '[MarketingEmail] subscription marker lookup failed:',
      error.message
    );
    return [];
  }

  const recipients: MarketingEmailPreference[] = [];
  for (const item of data || []) {
    const metadata = readSubscriptionMarkerMetadata(item.metadata);
    if (!metadata) continue;
    if (metadata.locale !== locale) continue;
    if (!metadata.caseDigestEnabled || metadata.unsubscribedAt) continue;
    recipients.push({
      user_id: null,
      email: String(item.recipient_email || ''),
      locale,
      unsubscribe_token: metadata.unsubscribeToken,
      welcome_enabled: false,
      case_digest_enabled: true,
      offer_enabled: false,
      unsubscribed_at: null
    });
  }
  return recipients;
}

async function fetchRecipients(
  type: MarketingEmailType,
  locale: Locale,
  segment?: ReengagementSegmentKey
): Promise<MarketingEmailPreference[]> {
  const supabase = getSupabaseAdmin();
  const enabledColumn =
    type === 'case_digest' ? 'case_digest_enabled' : 'offer_enabled';
  let userIds: string[] | undefined;
  let segments: ReengagementSegment[] = [];

  if (type === 'limited_offer' && segment) {
    segments = await fetchReengagementSegments(segment);
    userIds = Array.from(new Set(segments.map((item) => item.user_id)));
    if (userIds.length === 0) return [];
  }

  let query = supabase
    .from('marketing_email_preferences')
    .select('*')
    .eq(enabledColumn, true)
    .eq('locale', locale)
    .is('unsubscribed_at', null)
    .limit(getEnvInt('MARKETING_EMAIL_RECIPIENT_LIMIT', 2000, 1, 10000));

  if (userIds) {
    query = query.in('user_id', userIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const recipients = (data || []) as MarketingEmailPreference[];
  const leadRecipients = await fetchLeadRecipients(type, locale);
  const allRecipients = dedupeRecipientsByEmail([
    ...recipients,
    ...leadRecipients
  ]);
  if (type !== 'limited_offer') return allRecipients;

  if (segment) {
    return mergeSegmentMetadata(allRecipients, segments);
  }

  const paidUsers = await activePaidUserIds();
  return allRecipients.filter((item) =>
    item.user_id ? !paidUsers.has(item.user_id) : true
  );
}

async function queueCampaign(
  type: MarketingEmailType,
  locale: Locale,
  dateKey: string,
  segment?: ReengagementSegmentKey,
  excludeUserIds: Set<string> = new Set()
): Promise<QueueResult> {
  const supabase = getSupabaseAdmin();
  const campaignKey = segment
    ? `${type}:${segment}:${locale}:${dateKey}`
    : `${type}:${locale}:${dateKey}`;
  const promptCases =
    type === 'case_digest'
      ? await fetchPromptCases(
          getEnvInt('MARKETING_CASE_DIGEST_LIMIT', 5, 1, 12)
        )
      : [];
  const fallbackHero =
    type === 'case_digest' ? pickPromptCaseImage(promptCases[0]) : null;
  const heroPrompt =
    type === 'case_digest'
      ? 'A polished editorial email hero for a curated AI image generation case digest, showing reusable prompt cards, image thumbnails, and a warm professional creator workflow mood. No text, no logos.'
      : segment === 'paid_not_activated'
        ? 'A polished email hero for returning to an AI image creator workspace after purchase, showing a clean prompt editor, credit status, and a ready-to-run image workflow. No text, no logos.'
        : segment === 'checkout_started_no_purchase'
          ? 'A polished email hero for continuing an AI image generation checkout, showing pricing cards, prompt thumbnails, and a professional creator workflow. No text, no logos.'
          : 'A polished email hero for a limited-time AI image generation creator offer, showing premium visual workflow, prompt cards, and image generation controls. No text, no logos.';
  let generatedHero: string | null = null;
  try {
    generatedHero = await generateMarketingHeroImage(
      supabase,
      campaignKey,
      heroPrompt
    );
  } catch (error) {
    console.warn(
      '[MarketingEmail] hero generation failed; continuing without it:',
      {
        campaignKey,
        message: error instanceof Error ? error.message : String(error)
      }
    );
  }
  const content =
    type === 'case_digest'
      ? buildCaseDigestContent(
          locale,
          promptCases,
          generatedHero || fallbackHero
        )
      : buildOfferContent(locale, generatedHero || fallbackHero, segment);
  const recipients = await fetchRecipients(type, locale, segment);

  if (recipients.length === 0) {
    return {
      type,
      locale,
      campaignKey,
      recipients: 0,
      queued: 0,
      segment,
      skipped: 'no_recipients'
    };
  }

  const dedupedRecipients =
    excludeUserIds.size > 0
      ? recipients.filter(
          (recipient) =>
            !recipient.user_id || !excludeUserIds.has(recipient.user_id)
        )
      : recipients;

  if (dedupedRecipients.length === 0) {
    return {
      type,
      locale,
      campaignKey,
      recipients: recipients.length,
      queued: 0,
      segment,
      skipped: 'all_recipients_already_queued_in_higher_priority_segment'
    };
  }

  const { error: campaignError } = await supabase
    .from('marketing_email_campaigns')
    .upsert(
      {
        campaign_key: campaignKey,
        email_type: type,
        status: 'queued',
        title: content.title,
        subject: content.subject,
        preview_text: content.previewText,
        cta_label: content.ctaLabel,
        cta_url: content.ctaUrl,
        hero_image_url: content.heroImageUrl || null,
        scheduled_for: dateKey,
        metadata: {
          locale,
          reengagementSegment: segment || null,
          promptCaseIds: promptCases.map((item) => item.id),
          generatedHero: Boolean(generatedHero)
        }
      },
      { onConflict: 'campaign_key' }
    );

  if (campaignError) throw campaignError;

  const rows = dedupedRecipients.map((recipient) => {
    const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribe_token);
    const html = renderEmailLayout(content, unsubscribeUrl);
    return {
      user_id: recipient.user_id,
      recipient_email: recipient.email,
      email_type: type,
      subject: content.subject,
      preview_text: content.previewText,
      html,
      text_body: content.textBody,
      cta_label: content.ctaLabel,
      cta_url: content.ctaUrl,
      hero_image_url: content.heroImageUrl || null,
      campaign_key: campaignKey,
      scheduled_at: new Date().toISOString(),
      metadata: {
        locale,
        unsubscribeToken: recipient.unsubscribe_token,
        reengagementSegment: segment || null,
        reengagementLastSignalAt:
          (
            recipient as MarketingEmailPreference & {
              reengagementLastSignalAt?: string;
            }
          ).reengagementLastSignalAt || null,
        reengagementMetadata:
          (
            recipient as MarketingEmailPreference & {
              reengagementMetadata?: Record<string, unknown>;
            }
          ).reengagementMetadata || null
      }
    };
  });

  const queueInsertBatchSize = getEnvInt(
    'MARKETING_EMAIL_QUEUE_INSERT_BATCH_SIZE',
    25,
    1,
    100
  );
  let queued = 0;
  for (const rowBatch of chunkMarketingEmailRows(rows, queueInsertBatchSize)) {
    const { error: queueError } = await supabase
      .from('marketing_email_queue')
      .upsert(rowBatch, {
        onConflict: 'recipient_email,email_type,campaign_key',
        ignoreDuplicates: true
      });

    if (queueError) throw queueError;
    queued += rowBatch.length;
  }

  return {
    type,
    locale,
    campaignKey,
    segment,
    recipients: dedupedRecipients.length,
    queued
  };
}

async function queueCheckoutRecoveryCampaigns(): Promise<{
  candidates: number;
  eligible: number;
  queued: number;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('checkout_recovery_candidates')
    .select(
      'order_id,user_id,product_type,product_id,provider,checkout_started_at,recovery_stage,metadata'
    )
    .order('checkout_started_at', { ascending: true })
    .limit(getEnvInt('CHECKOUT_RECOVERY_RECIPIENT_LIMIT', 500, 1, 2000));

  if (error) throw error;
  const candidates = (data || []).filter(
    (item): item is CheckoutRecoveryCandidate =>
      typeof item.order_id === 'string' &&
      typeof item.user_id === 'string' &&
      (item.recovery_stage === 'initial_30m' ||
        item.recovery_stage === 'followup_6h')
  );
  if (candidates.length === 0) {
    return { candidates: 0, eligible: 0, queued: 0 };
  }

  const userIds = Array.from(new Set(candidates.map((item) => item.user_id)));
  const [{ data: preferenceRows, error: preferenceError }, paidUsers] =
    await Promise.all([
      supabase
        .from('marketing_email_preferences')
        .select('*')
        .in('user_id', userIds)
        .eq('offer_enabled', true)
        .is('unsubscribed_at', null),
      activePaidUserIds()
    ]);
  if (preferenceError) throw preferenceError;

  const preferenceByUserId = new Map(
    ((preferenceRows || []) as MarketingEmailPreference[]).map((preference) => [
      preference.user_id,
      preference
    ])
  );
  const rows = candidates.flatMap((candidate) => {
    if (paidUsers.has(candidate.user_id)) return [];
    const preference = preferenceByUserId.get(candidate.user_id);
    if (!preference?.user_id) return [];
    const locale = preference.locale;
    const content = buildCheckoutRecoveryContent(
      locale,
      candidate.recovery_stage
    );
    const campaignKey = getCheckoutRecoveryCampaignKey(
      candidate.order_id,
      candidate.recovery_stage,
      locale
    );
    return [{ candidate, preference, content, campaignKey }];
  });

  if (rows.length === 0) {
    return { candidates: candidates.length, eligible: 0, queued: 0 };
  }

  const scheduledFor = beijingDateKey();
  const { error: campaignError } = await supabase
    .from('marketing_email_campaigns')
    .upsert(
      rows.map(({ candidate, content, campaignKey, preference }) => ({
        campaign_key: campaignKey,
        email_type: 'limited_offer',
        status: 'queued',
        title: content.title,
        subject: content.subject,
        preview_text: content.previewText,
        cta_label: content.ctaLabel,
        cta_url: content.ctaUrl,
        hero_image_url: null,
        scheduled_for: scheduledFor,
        metadata: {
          locale: preference.locale,
          recoveryStage: candidate.recovery_stage,
          orderId: candidate.order_id,
          checkoutStartedAt: candidate.checkout_started_at
        }
      })),
      { onConflict: 'campaign_key', ignoreDuplicates: true }
    );
  if (campaignError) throw campaignError;

  const scheduledAt = new Date().toISOString();
  const queueRows = rows.map(
    ({ candidate, preference, content, campaignKey }) => {
      const unsubscribeUrl = buildUnsubscribeUrl(preference.unsubscribe_token);
      return {
        user_id: preference.user_id,
        recipient_email: preference.email,
        email_type: 'limited_offer' as const,
        subject: content.subject,
        preview_text: content.previewText,
        html: renderEmailLayout(content, unsubscribeUrl),
        text_body: content.textBody,
        cta_label: content.ctaLabel,
        cta_url: content.ctaUrl,
        hero_image_url: null,
        campaign_key: campaignKey,
        scheduled_at: scheduledAt,
        metadata: {
          locale: preference.locale,
          unsubscribeToken: preference.unsubscribe_token,
          reengagementSegment: 'checkout_started_no_purchase',
          recoveryStage: candidate.recovery_stage,
          orderId: candidate.order_id,
          productType: candidate.product_type,
          productId: candidate.product_id,
          paymentProvider: candidate.provider,
          checkoutStartedAt: candidate.checkout_started_at
        }
      };
    }
  );

  let queued = 0;
  for (const rowBatch of chunkMarketingEmailRows(queueRows, 25)) {
    const { error: queueError } = await supabase
      .from('marketing_email_queue')
      .upsert(rowBatch, {
        onConflict: 'recipient_email,email_type,campaign_key',
        ignoreDuplicates: true
      });
    if (queueError) throw queueError;
    queued += rowBatch.length;
  }

  return {
    candidates: candidates.length,
    eligible: rows.length,
    queued
  };
}

async function runMarketingEmailScheduler(
  request: SchedulerRequestLike
): Promise<SchedulerResult> {
  if (!['GET', 'POST'].includes(request.method || '')) {
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  if (!isAuthorizedCronRequest(request)) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  try {
    const jobs = extractCampaignEnqueueJobs(request.body);
    const dateKey = schedulerDateKey(jobs);
    const types = campaignTypesForRequest(request, jobs);
    const schedulerMode = new URL(
      request.url || '',
      getSiteUrl()
    ).searchParams.get('mode');
    if (schedulerMode === 'checkout-recovery') {
      const recovery = await queueCheckoutRecoveryCampaigns();
      return {
        status: 200,
        body: { success: true, mode: schedulerMode, ...recovery }
      };
    }
    if (isMarketingEmailSchedulerValidationRequest(request)) {
      const validation = await validateMarketingEmailScheduler(dateKey, types);
      const validationPassed =
        validation.queueConflictContract && validation.recipientSelectionReady;
      return {
        status: validationPassed ? 200 : 500,
        body: {
          success: validationPassed,
          mode: 'validate',
          dateKey,
          types,
          validation
        }
      };
    }
    if (types.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          dateKey,
          jobIds: jobs.map((job) => job.jobId).filter(Boolean),
          queued: [],
          message: 'No marketing email campaigns scheduled for today'
        }
      };
    }

    const results: QueueResult[] = [];
    for (const type of types) {
      if (type === 'limited_offer') {
        const queuedUserIdsByLocale: Record<Locale, Set<string>> = {
          'zh-CN': new Set<string>(),
          'en-US': new Set<string>()
        };
        for (const segment of reengagementSegmentsForRequest(request, jobs)) {
          const segmentKey = segment === 'generic' ? undefined : segment;
          let zhResult: QueueResult;
          let enResult: QueueResult;
          try {
            zhResult = await queueCampaign(
              type,
              'zh-CN',
              dateKey,
              segmentKey,
              queuedUserIdsByLocale['zh-CN']
            );
            enResult = await queueCampaign(
              type,
              'en-US',
              dateKey,
              segmentKey,
              queuedUserIdsByLocale['en-US']
            );
          } catch (error) {
            if (segmentKey && isReengagementSegmentsUnavailable(error)) {
              console.warn(
                '[MarketingEmail] reengagement segments unavailable; falling back to generic limited_offer',
                { segment: segmentKey }
              );
              const fallbackZh = await queueCampaign(
                type,
                'zh-CN',
                dateKey,
                undefined,
                queuedUserIdsByLocale['zh-CN']
              );
              const fallbackEn = await queueCampaign(
                type,
                'en-US',
                dateKey,
                undefined,
                queuedUserIdsByLocale['en-US']
              );
              results.push({ ...fallbackZh, segment: 'generic' });
              results.push({ ...fallbackEn, segment: 'generic' });
              break;
            }
            throw error;
          }
          if (!zhResult.skipped && segment !== 'generic') {
            const zhRecipients = await fetchRecipients(type, 'zh-CN', segment);
            zhRecipients.forEach((recipient) => {
              if (recipient.user_id) {
                queuedUserIdsByLocale['zh-CN'].add(recipient.user_id);
              }
            });
          }
          if (!enResult.skipped && segment !== 'generic') {
            const enRecipients = await fetchRecipients(type, 'en-US', segment);
            enRecipients.forEach((recipient) => {
              if (recipient.user_id) {
                queuedUserIdsByLocale['en-US'].add(recipient.user_id);
              }
            });
          }
          results.push(
            segment === 'generic'
              ? { ...zhResult, segment: 'generic' }
              : zhResult
          );
          results.push(
            segment === 'generic'
              ? { ...enResult, segment: 'generic' }
              : enResult
          );
        }
        continue;
      }

      results.push(await queueCampaign(type, 'zh-CN', dateKey));
      results.push(await queueCampaign(type, 'en-US', dateKey));
    }

    return {
      status: 200,
      body: {
        success: true,
        dateKey,
        jobIds: jobs.map((job) => job.jobId).filter(Boolean),
        results
      }
    };
  } catch (error) {
    console.error('[MarketingEmail] scheduler failed:', error);
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : 'Scheduler failed'
      }
    };
  }
}

export async function handleMarketingEmailSchedulerRequest(
  request: Request
): Promise<Response> {
  const result = await runMarketingEmailScheduler({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: await parseSchedulerFetchBody(request)
  });
  return Response.json(result.body, { status: result.status });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  const result = await runMarketingEmailScheduler({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body
  });
  return json(response, result.status, result.body);
}
