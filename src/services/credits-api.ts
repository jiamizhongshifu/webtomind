/**
 * 积分系统 API 服务层
 * 处理积分查询、消耗、签到等操作
 */

import { getApiBaseUrl, isExtensionEnv } from '@/utils/env';
import { getAccessToken } from './workspace-api';
import { createLogger } from '@/utils/logger';

const log = createLogger('CreditsAPI');
import type {
  CreditsBalanceResponse,
  ConsumeCreditsRequest,
  ConsumeCreditsResponse,
  CreditTransaction,
  CreditSource,
  CheckinResult,
  DailyLoginRewardResult,
  VideoGenerationCostEstimate,
  CreditPackage
} from '@/types/membership';

// API 基础地址
// 生产环境：优先使用当前域名避免 CORS 问题
const API_BASE = getApiBaseUrl();

// ============================================
// 错误类型
// ============================================

/** 积分不足错误 */
export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public current: number
  ) {
    super(`积分不足：需要 ${required} 积分，当前余额 ${current}`);
    this.name = 'InsufficientCreditsError';
  }
}

/** 功能配额用尽错误 */
export class QuotaExceededError extends Error {
  constructor(
    public feature: string,
    public used: number,
    public max: number,
    public resetAt: string
  ) {
    super(`${feature} 配额已用尽：${used}/${max}`);
    this.name = 'QuotaExceededError';
  }
}

// ============================================
// 内部工具函数
// ============================================

/**
 * 带认证的 fetch 封装
 */
async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  headers.set('Content-Type', 'application/json');

  return fetch(url, {
    ...options,
    headers
  });
}

// ============================================
// 积分余额 API
// ============================================

/**
 * 获取积分余额
 */
export async function getCreditsBalance(): Promise<CreditsBalanceResponse> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_credits_balance'
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取积分余额失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/credits/balance`);
  if (!response.ok) {
    throw new Error('获取积分余额失败');
  }
  return response.json();
}

/**
 * 获取图片生成的当前积分单价(真相源 = 后端 credit_costs.image_generation)。
 * 公开价格,无需鉴权。前端成本预告用它跟随后端,避免硬编码漂移。
 * 失败时由调用方回退到本地常量。
 */
export async function getImageGenerationCost(options?: {
  imageSize?: string;
  quality?: string;
  model?: string;
  referenceImageCount?: number;
  referenceMode?: string;
  referenceImageSizes?: Array<{ width: number; height: number }>;
}): Promise<number> {
  const params = new URLSearchParams();
  if (options?.imageSize) params.set('imageSize', options.imageSize);
  if (options?.quality) params.set('quality', options.quality);
  if (options?.model) params.set('model', options.model);
  if (typeof options?.referenceImageCount === 'number') {
    params.set('referenceImageCount', String(options.referenceImageCount));
  }
  if (Array.isArray(options?.referenceImageSizes)) {
    params.set(
      'referenceImageSizes',
      JSON.stringify(options.referenceImageSizes)
    );
  }
  if (options?.referenceMode)
    params.set('referenceMode', options.referenceMode);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/credits/image-cost${query ? `?${query}` : ''}`
  );
  if (!response.ok) {
    throw new Error(`image-cost request failed: ${response.status}`);
  }
  const data = (await response.json()) as { cost?: number };
  if (typeof data.cost !== 'number') {
    throw new Error('image-cost response missing cost');
  }
  return data.cost;
}

export async function getVideoGenerationCost(options?: {
  model?: string;
  duration?: number;
  resolution?: string;
  referenceImageCount?: number;
  referenceVideoCount?: number;
  referenceAudioCount?: number;
  referenceVideoDurations?: number[];
}): Promise<VideoGenerationCostEstimate> {
  const params = new URLSearchParams();
  if (options?.model) params.set('model', options.model);
  if (typeof options?.duration === 'number') {
    params.set('duration', String(options.duration));
  }
  if (options?.resolution) params.set('resolution', options.resolution);
  if (typeof options?.referenceImageCount === 'number') {
    params.set('referenceImageCount', String(options.referenceImageCount));
  }
  if (typeof options?.referenceVideoCount === 'number') {
    params.set('referenceVideoCount', String(options.referenceVideoCount));
  }
  if (
    Array.isArray(options?.referenceVideoDurations) &&
    options.referenceVideoDurations.length > 0
  ) {
    params.set(
      'referenceVideoDurations',
      options.referenceVideoDurations.map((d) => String(d)).join(',')
    );
  }
  if (typeof options?.referenceAudioCount === 'number') {
    params.set('referenceAudioCount', String(options.referenceAudioCount));
  }
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/api/credits/video-cost${query ? `?${query}` : ''}`
  );
  if (!response.ok) {
    throw new Error(`video-cost request failed: ${response.status}`);
  }
  const data = (await response.json()) as VideoGenerationCostEstimate;
  if (typeof data.cost !== 'number') {
    throw new Error('video-cost response missing cost');
  }
  return data;
}

// ============================================
// 积分消耗 API
// ============================================

/**
 * 消耗积分
 * @param action 操作类型
 * @param metadata 额外元数据
 * @param tokenUsage Token 使用量（用于动态计费）
 * @throws InsufficientCreditsError 积分不足时抛出
 * @throws QuotaExceededError 功能配额用尽时抛出
 */
export async function consumeCredits(
  action: CreditSource,
  metadata?: Record<string, unknown>,
  tokenUsage?: { inputTokens: number; outputTokens: number }
): Promise<ConsumeCreditsResponse> {
  // 将 tokenUsage 合并到 metadata 中
  const mergedMetadata = tokenUsage
    ? {
        ...metadata,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens
      }
    : metadata;

  const request: ConsumeCreditsRequest = { action, metadata: mergedMetadata };

  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'consume_credits',
      data: request
    });

    if (response.success) {
      return response.data;
    }

    // 处理特定错误
    if (
      response.error === 'INSUFFICIENT_CREDITS' ||
      response.error === 'INSUFFICIENT_MEDIA_CREDITS'
    ) {
      throw new InsufficientCreditsError(response.required, response.current);
    }
    if (response.error === 'QUOTA_EXCEEDED') {
      throw new QuotaExceededError(
        response.feature,
        response.used,
        response.max,
        response.resetAt
      );
    }

    throw new Error(response.error || '消耗积分失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/credits/consume`, {
    method: 'POST',
    body: JSON.stringify(request)
  });

  if (response.status === 402) {
    const error = await response.json();
    if (
      error.error === 'INSUFFICIENT_CREDITS' ||
      error.error === 'INSUFFICIENT_MEDIA_CREDITS'
    ) {
      throw new InsufficientCreditsError(error.required, error.current);
    }
    if (error.error === 'QUOTA_EXCEEDED') {
      throw new QuotaExceededError(
        error.feature,
        error.used,
        error.max,
        error.resetAt
      );
    }
  }

  if (!response.ok) {
    let errorMessage = '消耗积分失败';
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
      log.error(
        '[CreditsAPI] Server error:',
        JSON.stringify(errorData, null, 2)
      );
    } catch {
      log.error('[CreditsAPI] Failed to parse error response');
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * 检查是否有足够积分执行操作
 * @param action 操作类型
 * @returns 是否有足够积分
 */
export async function hasEnoughCredits(action: CreditSource): Promise<boolean> {
  try {
    const balance = await getCreditsBalance();
    // 获取操作所需积分（从配置表获取，这里用本地默认值）
    const costMap: Partial<Record<CreditSource, number>> = {
      ai_chat_basic: 1,
      ai_chat_advanced: 5,
      image_generation: 10,
      video_transcription: 2,
      content_save: 1,
      mindmap_generation: 3
    };
    const cost = costMap[action] || 1;
    return balance.credits.total >= cost;
  } catch {
    return false;
  }
}

// ============================================
// 签到 API
// ============================================

/**
 * 每日签到
 * @returns 签到结果
 */
export async function dailyCheckin(): Promise<CheckinResult> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'daily_checkin'
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '签到失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/credits/checkin`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '签到失败');
  }

  return response.json();
}

export async function claimDailyLoginReward(): Promise<DailyLoginRewardResult> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'daily_login_reward'
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '每日登录奖励领取失败');
  }

  const response = await authFetch(
    `${API_BASE}/api/credits/daily-login-reward`,
    {
      method: 'POST'
    }
  );

  const result = (await response.json().catch(() => ({}))) as
    | DailyLoginRewardResult
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      'error' in result && result.error ? result.error : '每日登录奖励领取失败'
    );
  }

  return result as DailyLoginRewardResult;
}

/**
 * 检查今日是否可签到
 */
export async function canCheckinToday(): Promise<boolean> {
  try {
    const balance = await getCreditsBalance();
    return balance.checkin.canCheckin;
  } catch {
    return false;
  }
}

// ============================================
// 交易记录 API
// ============================================

/** 每日使用数据 */
export interface DailyUsageData {
  date: string;
  usage: number;
}

/** 每日使用统计响应 */
export interface DailyUsageResponse {
  usage: DailyUsageData[];
  period: {
    start: string;
    end: string;
    days: number;
  };
}

/**
 * 获取每日积分使用统计
 * @param days 天数（默认14天，最多30天）
 */
export async function getDailyUsage(days = 14): Promise<DailyUsageResponse> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_daily_usage',
      data: { days }
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取使用统计失败');
  }

  // HTTP API
  const response = await authFetch(
    `${API_BASE}/api/credits/daily-usage?days=${days}`
  );

  if (!response.ok) {
    throw new Error('获取使用统计失败');
  }

  return response.json();
}

/**
 * 获取积分交易记录
 * @param page 页码（从1开始）
 * @param limit 每页数量
 */
export async function getTransactions(
  page = 1,
  limit = 20
): Promise<{
  transactions: CreditTransaction[];
  total: number;
  hasMore: boolean;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const offset = (safePage - 1) * safeLimit;

  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_credit_transactions',
      data: { page: safePage, limit: safeLimit }
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取交易记录失败');
  }

  // HTTP API
  const response = await authFetch(
    `${API_BASE}/api/credits/transactions?offset=${offset}&limit=${safeLimit}`
  );

  if (!response.ok) {
    throw new Error('获取交易记录失败');
  }

  const result = (await response.json()) as {
    transactions?: CreditTransaction[];
    total?: number;
    hasMore?: boolean;
    pagination?: {
      total?: number;
      hasMore?: boolean;
    };
  };

  return {
    transactions: result.transactions || [],
    total: result.total ?? result.pagination?.total ?? 0,
    hasMore: result.hasMore ?? result.pagination?.hasMore ?? false
  };
}

// ============================================
// 积分包 API
// ============================================

/**
 * 获取积分包列表
 */
export async function getCreditPackages(): Promise<CreditPackage[]> {
  if (isExtensionEnv()) {
    const response = await chrome.runtime.sendMessage({
      action: 'get_credit_packages'
    });
    if (response.success) {
      return response.data;
    }
    throw new Error(response.error || '获取积分包失败');
  }

  // HTTP API
  const response = await authFetch(`${API_BASE}/api/credits/packages`);

  if (!response.ok) {
    throw new Error('获取积分包失败');
  }

  const result = await response.json();
  return result.packages;
}

// ============================================
// 工具函数
// ============================================

/**
 * 格式化积分数量显示
 */
export function formatCredits(credits: number): string {
  if (credits >= 10000) {
    return `${(credits / 10000).toFixed(1)}万`;
  }
  if (credits >= 1000) {
    return `${(credits / 1000).toFixed(1)}k`;
  }
  return credits.toLocaleString();
}

/**
 * 获取积分来源/用途的显示文本
 */
export function getCreditSourceLabel(
  source: CreditSource,
  lang = 'zh-CN'
): string {
  const labels: Record<CreditSource, Record<string, string>> = {
    daily_refresh: { 'zh-CN': '每日刷新', 'en-US': 'Daily Refresh' },
    monthly_grant: { 'zh-CN': '月度赠送', 'en-US': 'Monthly Grant' },
    daily_checkin: { 'zh-CN': '每日签到', 'en-US': 'Daily Check-in' },
    referral_bonus: { 'zh-CN': '邀请奖励', 'en-US': 'Referral Bonus' },
    purchase: { 'zh-CN': '购买积分', 'en-US': 'Purchase' },
    promo_code: { 'zh-CN': '兑换码', 'en-US': 'Promo Code' },
    free_daily_quota_policy: {
      'zh-CN': '免费额度校准（非消费）',
      'en-US': 'Free quota reconciliation (not usage)'
    },
    ai_chat_basic: { 'zh-CN': 'AI对话', 'en-US': 'AI Chat' },
    ai_chat_advanced: {
      'zh-CN': 'AI对话(高级)',
      'en-US': 'AI Chat (Advanced)'
    },
    image_generation: { 'zh-CN': '图片生成', 'en-US': 'Image Generation' },
    video_generation: { 'zh-CN': '视频生成', 'en-US': 'Video Generation' },
    video_transcription: {
      'zh-CN': '视频转录',
      'en-US': 'Video Transcription'
    },
    content_save: { 'zh-CN': '保存内容', 'en-US': 'Save Content' },
    mindmap_generation: { 'zh-CN': '思维导图', 'en-US': 'Mind Map' },
    // NotebookLM 功能
    nlm_flashcards: { 'zh-CN': '闪卡生成', 'en-US': 'Flashcards' },
    nlm_mindmap: { 'zh-CN': '思维导图', 'en-US': 'Mind Map' },
    nlm_quiz: { 'zh-CN': '测验生成', 'en-US': 'Quiz' },
    nlm_report: { 'zh-CN': '报告生成', 'en-US': 'Report' },
    nlm_summary: { 'zh-CN': '摘要生成', 'en-US': 'Summary' },
    nlm_audio: { 'zh-CN': '音频概览', 'en-US': 'Audio Overview' },
    nlm_video: { 'zh-CN': '视频概览', 'en-US': 'Video Overview' },
    nlm_infographic: { 'zh-CN': '信息图', 'en-US': 'Infographic' },
    nlm_slide_deck: { 'zh-CN': '演示文稿', 'en-US': 'Slide Deck' },
    nlm_data_table: { 'zh-CN': '数据表格', 'en-US': 'Data Table' }
  };

  return labels[source]?.[lang] || labels[source]?.['zh-CN'] || source;
}
