/**
 * 工具积分中间件
 *
 * 在工具执行前检查积分余额，执行成功后扣除积分。
 * 作为工作台基础设施，所有计费工具统一在此管理。
 */

import { createClient } from '@supabase/supabase-js';
import type { ToolResult } from '../types/api.js';

// ============================================
// 计费工具映射：工具名 → credit_costs.action
// ============================================

const BILLABLE_TOOLS: Record<string, string> = {
  web_search: 'web_search',
  grok_x_search: 'grok_x_search',
  e2b_execute: 'e2b_execute',
  generate_image: 'image_generation'
};

// E2B 按执行时长计费配置
const E2B_PRICING = {
  baseCredits: 2, // 基础积分（启动沙箱）
  perSecondCredits: 0.2, // 每秒积分消耗
  minCredits: 3, // 最低消耗
  maxCredits: 50 // 最高消耗（防止滥用）
};

// 图片生成按尺寸计费配置（仅用于 server 端旧工具执行链路 tool-executor，
// 该链路仍走 Gemini 直连；skill-image-chat 的出图走平台 /api/image/generate 通道，
// 由 src/shared/image-generation-pricing.ts 的平台实时定价决定，两套定价相互独立）。
const IMAGE_PRICING: Record<string, number> = {
  '1k': 100,
  '2k': 150,
  '4k': 250
};

// ============================================
// Supabase 客户端（延迟初始化）
// ============================================

let supabase: ReturnType<typeof createClient> | null = null;

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      return null;
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================
// 核心函数
// ============================================

/**
 * 判断工具是否需要扣积分
 */
export function isBillableTool(toolName: string): boolean {
  return toolName in BILLABLE_TOOLS;
}

/**
 * 获取工具对应的 action 名称
 */
export function getToolAction(toolName: string): string | null {
  return BILLABLE_TOOLS[toolName] || null;
}

/**
 * 计算 E2B 执行的动态积分消耗
 * @param executionTimeMs 执行时间（毫秒）
 */
function calculateE2BCredits(executionTimeMs: number): number {
  const executionSeconds = Math.ceil(executionTimeMs / 1000);
  const calculated =
    E2B_PRICING.baseCredits + executionSeconds * E2B_PRICING.perSecondCredits;
  const credits = Math.ceil(calculated);
  return Math.min(
    Math.max(credits, E2B_PRICING.minCredits),
    E2B_PRICING.maxCredits
  );
}

/**
 * 计算图片生成的动态积分消耗
 * @param imageSize 图片尺寸 (1k, 2k, 4k)
 */
function calculateImageCredits(imageSize: string): number {
  return IMAGE_PRICING[imageSize] || IMAGE_PRICING['2k']; // 默认 2k
}

/** 获取指定图片尺寸的积分单价（供调用方在出图前做余额预检） */
export function getImageCreditCost(imageSize: string): number {
  return calculateImageCredits(imageSize);
}

/**
 * 带积分检查的工具执行包装器
 *
 * 流程：
 * 1. 检查是否需要扣积分
 * 2. 需要时：验证用户已登录
 * 3. 执行工具
 * 4. 成功后扣积分（E2B 按实际执行时长动态计费）
 * 5. 失败则不扣积分
 */
export async function withCreditCheck(
  toolName: string,
  userId: string | undefined,
  executeFn: () => Promise<ToolResult>
): Promise<ToolResult> {
  const action = BILLABLE_TOOLS[toolName];

  // 非计费工具，直接执行
  if (!action) {
    return executeFn();
  }

  // 计费工具需要用户登录
  if (!userId) {
    return {
      success: false,
      error: `使用 ${toolName} 需要登录`
    };
  }

  const sb = getSupabase();
  if (!sb) {
    // 数据库不可用时仍允许执行（降级策略）
    console.warn(
      `[CreditMiddleware] Supabase not available, skipping credit check for ${toolName}`
    );
    return executeFn();
  }

  // 执行工具
  const result = await executeFn();

  // 执行失败不扣积分
  if (!result.success) {
    return result;
  }

  // 成功后扣积分
  try {
    // 构建 metadata
    const metadata: Record<string, unknown> = {
      tool: toolName,
      timestamp: new Date().toISOString()
    };

    // E2B 特殊处理：按执行时长动态计费
    if (
      toolName === 'e2b_execute' &&
      result.data &&
      typeof result.data === 'object'
    ) {
      const data = result.data as { executionTime?: number };
      if (data.executionTime) {
        const dynamicCredits = calculateE2BCredits(data.executionTime);
        metadata.executionTimeMs = data.executionTime;
        metadata.dynamicCredits = dynamicCredits;
        console.log(
          `[CreditMiddleware] E2B execution: ${data.executionTime}ms → ${dynamicCredits} credits`
        );
      }
    }

    // 图片生成特殊处理：按尺寸动态计费
    if (
      toolName === 'generate_image' &&
      result.data &&
      typeof result.data === 'object'
    ) {
      const data = result.data as {
        _billing?: { imageSize?: string; tokens?: number };
      };
      if (data._billing?.imageSize) {
        const dynamicCredits = calculateImageCredits(data._billing.imageSize);
        metadata.imageSize = data._billing.imageSize;
        metadata.tokens = data._billing.tokens;
        metadata.dynamicCredits = dynamicCredits;
        console.log(
          `[CreditMiddleware] Image generation: ${data._billing.imageSize} → ${dynamicCredits} credits`
        );
      }
    }

    const rpcClient = sb as unknown as SupabaseRpcClient;
    const { data: creditResult, error: creditError } = await rpcClient.rpc(
      'consume_credits',
      {
        p_user_id: userId,
        p_action: action,
        p_metadata: metadata
      }
    );

    if (creditError) {
      console.error(
        `[CreditMiddleware] consume_credits RPC error:`,
        creditError
      );
      // 扣费失败但工具已执行成功，记录日志但不影响返回
      return result;
    }

    const creditData = creditResult as {
      success: boolean;
      error?: string;
      consumed?: number;
      balance?: { total: number };
    };

    if (!creditData.success) {
      // 余额不足 - 工具已执行但无法扣费
      // 生产环境应改为预扣模式，此处记录警告
      console.warn(
        `[CreditMiddleware] Credit deduction failed for ${toolName}:`,
        creditData.error
      );

      if (creditData.error === 'INSUFFICIENT_CREDITS') {
        // 返回积分不足提示，附带工具结果
        return {
          success: true,
          data: result.data,
          error: '积分不足，本次调用将不计费。请充值后继续使用。'
        };
      }
      return result;
    }

    console.log(
      `[CreditMiddleware] ${toolName} charged ${creditData.consumed} credits, remaining: ${creditData.balance?.total}`
    );

    // 在返回数据中附带积分信息
    return {
      ...result,
      data: {
        ...(typeof result.data === 'object' && result.data !== null
          ? result.data
          : { result: result.data }),
        _credits: {
          consumed: creditData.consumed,
          remaining: creditData.balance?.total
        }
      }
    };
  } catch (error) {
    console.error(`[CreditMiddleware] Error during credit deduction:`, error);
    return result;
  }
}
