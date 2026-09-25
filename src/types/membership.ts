/**
 * 会员系统与积分系统类型定义
 */

import type {
  SeedanceVideoModelId,
  SeedanceVideoResolution
} from '../shared/seedance-video-models';

// ==================== 套餐相关 ====================

/** 套餐名称 */
export type PlanName = 'free' | 'pro' | 'max';

/** 订阅状态 */
export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'past_due';

/** 计费周期 */
export type BillingCycle = 'monthly' | 'yearly';

/** 套餐定义 */
export interface SubscriptionPlan {
  id: string;
  name: PlanName;
  displayName: Record<string, string>;
  priceMonthly: number;
  priceYearly: number;
  monthlyCredits: number;
  features: PlanFeatures;
  limits: PlanLimits;
  sortOrder: number;
  isActive: boolean;
  checkoutEnabled?: boolean;
  checkoutProviders?: Array<'stripe' | 'alipay'>;
  checkoutPrices?: {
    alipay?: {
      currency: 'CNY';
      priceMonthly: number;
      priceYearly: number;
    };
  };
  checkoutUnavailableReason?: string;
}

/** 套餐功能 */
export interface PlanFeatures {
  aiModels: string[];
  imageGeneration: boolean;
  youtubeTranscription: boolean;
  prioritySupport: boolean;
  earlyAccess?: boolean;
}

/** 套餐限制 */
export interface PlanLimits {
  maxMaterials: number; // -1 表示无限
  maxConversations: number; // -1 表示无限
  dailyCredits: number; // -1 表示无限
  dailyImageGeneration: number; // 每日图片生成次数限制
  maxFileSizeMb?: number;
}

/** 用户订阅信息 */
export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planName: PlanName;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentProvider?: 'stripe' | 'zpay';
  externalSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 积分相关 ====================

/** 积分类型 */
export type CreditType =
  | 'daily'
  | 'subscription'
  | 'bonus'
  | 'media'
  | 'promo_media'
  | 'referral'
  | 'mixed';

/** 交易类型 */
export type TransactionType =
  | 'earn'
  | 'consume'
  | 'refund'
  | 'expire'
  | 'admin_adjustment';

/** 积分来源/用途 */
export type CreditSource =
  // 获取来源
  | 'daily_refresh' // 每日刷新
  | 'monthly_grant' // 每月套餐赠送
  | 'daily_checkin' // 每日签到
  | 'referral_bonus' // 邀请奖励
  | 'purchase' // 购买积分包
  | 'promo_code' // 兑换码
  | 'free_daily_quota_policy' // 免费版每日额度系统校准
  // 消耗用途
  | 'ai_chat_basic' // AI对话(基础模型)
  | 'ai_chat_advanced' // AI对话(高级模型)
  | 'image_generation' // 图片生成
  | 'video_generation' // 视频生成
  | 'video_transcription' // 视频转录
  | 'content_save' // 保存内容卡片
  | 'mindmap_generation' // 思维导图生成
  // NotebookLM 功能
  | 'nlm_flashcards' // NotebookLM 闪卡生成
  | 'nlm_mindmap' // NotebookLM 思维导图
  | 'nlm_quiz' // NotebookLM 测验生成
  | 'nlm_report' // NotebookLM 报告生成
  | 'nlm_summary' // NotebookLM 摘要生成
  | 'nlm_audio' // NotebookLM 音频概览
  | 'nlm_video' // NotebookLM 视频概览
  | 'nlm_infographic' // NotebookLM 信息图
  | 'nlm_slide_deck' // NotebookLM 演示文稿
  | 'nlm_data_table'; // NotebookLM 数据表格

/** 用户积分信息 */
export interface UserCredits {
  id: string;
  userId: string;

  // 每日积分（UTC 00:00 刷新，不累积）
  dailyCredits: number;
  dailyCreditsMax: number;
  lastDailyRefresh: string;

  // 附加积分（可累积）
  bonusCredits: number;
  mediaCredits?: number;
  promoMediaCredits?: number;

  // 统计
  totalEarned: number;
  totalConsumed: number;

  // 签到相关
  lastCheckinDate: string | null;
  consecutiveCheckinDays: number;

  // 功能配额
  dailyImageGenUsed: number;
  dailyImageGenMax: number;

  createdAt: string;
  updatedAt: string;
}

/** 积分余额响应 */
export interface CreditsBalanceResponse {
  credits: {
    daily: number;
    dailyMax: number;
    subscription: number;
    subscriptionMax: number;
    subscriptionPeriodStart: string | null;
    subscriptionPeriodEnd: string | null;
    bonus: number;
    referral?: number;
    media?: number;
    promoMedia?: number;
    total: number;
    lastDailyRefresh: string;
  };
  checkin: {
    lastDate: string | null;
    consecutiveDays: number;
    canCheckin: boolean;
  };
  quota: {
    dailyImageGen: {
      used: number;
      max: number;
    };
  };
  subscription: {
    planName: PlanName;
    status: SubscriptionStatus;
    currentPeriodEnd: string;
  } | null;
}

/** 积分交易记录 */
export interface CreditTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  creditType: CreditType;
  amount: number;
  balanceAfter: number;
  source: CreditSource;
  sourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** 积分消耗配置 */
export interface CreditCost {
  id: string;
  action: CreditSource;
  cost: number;
  description: Record<string, string>;
  isActive: boolean;
}

export interface VideoGenerationCostEstimate {
  action: 'video_generation';
  cost: number;
  model: SeedanceVideoModelId;
  modelLabel: string;
  modelMultiplier: number;
  duration: number;
  durationUnits: number;
  resolution: SeedanceVideoResolution;
  resolutionMultiplier: number;
  baseUnitCost: number;
  baseCost: number;
  referenceAdjustment: number;
  modelAdjustment: number;
  resolutionAdjustment: number;
  tiers: {
    baseUnitSeconds: number;
    baseUnitCost: number;
    referenceImage: number;
    referenceVideo: number;
    minCost: number;
  };
}

/** 积分包产品 */
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonusCredits: number;
  isActive: boolean;
  sortOrder: number;
}

// ==================== 签到相关 ====================

/** 签到结果 */
export interface CheckinResult {
  success: boolean;
  reward: number;
  consecutiveDays: number;
  balance: {
    daily: number;
    subscription?: number;
    bonus: number;
    total: number;
  };
}

/** 每日登录自动奖励结果 */
export interface DailyLoginRewardResult {
  success: boolean;
  alreadyClaimed: boolean;
  capReached?: boolean;
  reward: number;
  monthlyCap: number;
  monthlyClaimed: number;
  consecutiveDays: number;
  balance: {
    daily: number;
    subscription?: number;
    bonus: number;
    referral?: number;
    total: number;
  };
}

// ==================== 邀请相关 ====================

/** 邀请状态 */
export type ReferralStatus = 'pending' | 'completed' | 'rewarded';

/** 邀请记录 */
export interface Referral {
  id: string;
  referrerId: string;
  refereeId: string;
  status: ReferralStatus;
  referrerReward: number;
  refereeReward: number;
  rewardedAt?: string;
  createdAt: string;
}

/** 邀请统计 */
export interface ReferralStats {
  referralCode: string;
  totalInvited: number;
  totalRewarded: number;
  creditsEarned: number;
}

// ==================== 支付相关 ====================

/** 订单类型 */
export type OrderType = 'subscription' | 'credit_package';

/** 订单状态 */
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

/** 支付订单 */
export interface PaymentOrder {
  id: string;
  userId: string;
  orderType: OrderType;
  productId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentProvider?: string;
  externalOrderId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  paidAt?: string;
  updatedAt: string;
}

// ==================== API 请求/响应 ====================

/** 消耗积分请求 */
export interface ConsumeCreditsRequest {
  action: CreditSource;
  metadata?: Record<string, unknown>;
  /** Token 使用量（用于动态计费） */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** 消耗积分响应 */
export interface ConsumeCreditsResponse {
  success: boolean;
  consumed: number;
  creditType: CreditType;
  balance: {
    daily: number;
    bonus: number;
    total: number;
  };
  /** Token 使用量（动态计费时返回） */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/** 积分不足错误 */
export interface InsufficientCreditsError {
  error: 'INSUFFICIENT_CREDITS' | 'INSUFFICIENT_MEDIA_CREDITS';
  required: number;
  current: number;
}

/** 功能配额用尽错误 */
export interface QuotaExceededError {
  error: 'QUOTA_EXCEEDED';
  feature: string;
  used: number;
  max: number;
  resetAt: string;
}
