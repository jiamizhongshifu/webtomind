/**
 * provider_policy 跨 provider 回退策略（方案 B，2026-08-11 拍板）。
 *
 * 背景：preflight 已拦截明显违规内容，能走到 provider 的请求是边界内容；
 * 其中约 70% 的 policy 失败是「输出被判 unsafe」而非输入违规，且不同
 * provider 判定不一致。方案 B 允许这类失败**跨 provider 回退一次**：
 * - explicit（裸露/色情关键词）保持终态，不回退；
 * - 每请求最多一次 policy 回退；
 * - 每日回退次数受预算限制（默认 100，env 可调），同时每次回退写
 *   `policy_fallback` 审计事件，预算与审计共用同一计数。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordConversionEvent } from '../../utils/conversion-events.js';

export type PolicyFailureKind = 'explicit' | 'output_safety' | 'other';

const EXPLICIT_POLICY_PATTERNS = [
  /裸露|裸体|裸照|全裸|露点|色情|情色|性爱|性行为|做爱|成人内容|成人影片/i,
  /nudity|nude|topless|porn|hardcore|erotic|sexual|explicit sexual|sex act|intercourse|adult content/i
];

const OUTPUT_SAFETY_PATTERNS = [
  /unsafe|safety system|moderation|rejected by upstream|generated images appear|安全|审核|违规|拒绝/i
];

export function classifyPolicyFailureMessage(
  message: string | null | undefined
): PolicyFailureKind {
  const text = String(message || '');
  if (EXPLICIT_POLICY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'explicit';
  }
  if (OUTPUT_SAFETY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'output_safety';
  }
  return 'other';
}

export function isExplicitPolicyContentMessage(
  message: string | null | undefined
): boolean {
  return classifyPolicyFailureMessage(message) === 'explicit';
}

export interface PolicyFallbackBudget {
  consume(input: {
    fromProvider: string;
    toProvider: string;
    messageKind: PolicyFailureKind;
  }): Promise<boolean>;
}

export function createDailyPolicyFallbackBudget(
  sb: SupabaseClient,
  options: { taskId?: string; limit?: number; now?: Date } = {}
): PolicyFallbackBudget {
  // 0 表示完全关闭跨 provider policy 回退；未配置默认 100。
  const configuredLimit = options.limit;
  const limit =
    configuredLimit !== undefined && Number.isFinite(configuredLimit)
    ? Math.max(0, Math.floor(configuredLimit))
    : 100;
  return {
    async consume(input) {
      if (limit === 0) {
        return false;
      }
      const now = options.now || new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const { count, error } = await sb
        .from('conversion_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_name', 'policy_fallback')
        .gte('occurred_at', startOfDay.toISOString());
      if (error) {
        // 预算查询失败时放行（回退是优化不是合规闸门），但保留审计写入。
        console.warn('[PolicyFallback] budget check failed, allowing fallback:', {
          message: error.message
        });
      } else if ((count ?? 0) >= limit) {
        console.warn('[PolicyFallback] daily budget exhausted, policy stays terminal:', {
          count,
          limit
        });
        return false;
      }

      await recordConversionEvent(sb, {
        eventName: 'policy_fallback',
        eventSource: 'image_generate',
        entityType: 'image_task',
        entityId: options.taskId || null,
        idempotencyKey: `policy_fallback:${options.taskId || 'untracked'}:${
          input.fromProvider
        }`,
        metadata: {
          from_provider: input.fromProvider,
          to_provider: input.toProvider,
          message_kind: input.messageKind
        }
      });
      return true;
    }
  };
}
