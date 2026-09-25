/**
 * 批量图片生成执行 API
 * 用户确认后调用此 API 开始批量生成图片
 *
 * 支持的图片生成服务:
 * 1. Gemini (主要) - 支持参考图片
 * 2. 阿里云 Z-Image (备用) - 当 Gemini 失败时自动切换
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAndDownloadImage } from '../ai/aliyun/z-image';
import {
  getCorsHeadersForRequest,
  getSupabaseAdmin,
  getUserIdFromRequest
} from '../utils/auth';
import { IMAGE_GENERATION_BASE_CREDIT_COST } from '../../src/shared/image-generation-pricing';
import { isOfficialGeminiEnabled } from '../utils/model-provider-routing';

export const config = {
  runtime: 'edge',
  regions: ['iad1'],
  maxDuration: 120 // 批量生成需要更长时间
};

// 安全修复：限制批量任务数量
const MAX_BATCH_TASKS = 20;

interface BatchTask {
  id: string;
  index: number;
  title: string;
  prompt: string;
}

type SupabaseRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{
    data: {
      success: boolean;
      error?: string;
      consumed?: number;
      credit_type?: string;
      credit_breakdown?: Record<string, number>;
    } | null;
    error: { message: string } | null;
  }>;
};

async function refundBatchImageCredit(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  creditType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const rpcClient = supabase as unknown as SupabaseRpcClient;
    const { data, error } = await rpcClient.rpc(
      'refund_image_generation_credit',
      {
        // p_amount 是积分数额(非次数):必须退回实际扣除的 consumed,
        // 否则扣 10 退 1 会净吞用户 9 积分/张。p_credit_type 跟随扣费来源。
        p_user_id: userId,
        p_amount: amount,
        p_credit_type: creditType,
        p_metadata: metadata
      }
    );
    if (error || data?.success === false) {
      console.error('[BatchImageExecute] refund failed:', {
        userId,
        error: error?.message || data?.error,
        metadata
      });
    }
  } catch (refundErr) {
    console.error('[BatchImageExecute] refund threw:', refundErr);
  }
}

/**
 * 使用 Gemini 生成图片
 */
async function generateImageWithGemini(
  apiKey: string,
  prompt: string,
  referenceImages?: Array<{ data: string; mimeType: string }>
): Promise<string | null> {
  // 安全修复：使用 Header 传递 API Key
  const apiUrl =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent';

  const parts: unknown[] = [];
  if (referenceImages && referenceImages.length > 0) {
    for (const img of referenceImages) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }
  parts.push({ text: prompt });

  // 给单张生成加超时:挂起的请求会被 abort → 返回 null → 上层走退款分支,
  // 避免一直挂到 lambda 180s 被强杀(那种情况已扣费却来不及退款)。
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), 60000);
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            imageSize: '2048x2048'
          }
        }
      }),
      signal: abortController.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData
    );
    return part?.inlineData
      ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 使用阿里云 Z-Image 生成图片 (备用方案)
 */
async function generateImageWithZImageFallback(
  apiKey: string,
  prompt: string
): Promise<string | null> {
  console.log('[BatchImageExecute] Trying Z-Image fallback...');
  const result = await generateAndDownloadImage(apiKey, { prompt });
  if (result.success && result.base64Url) {
    console.log('[BatchImageExecute] Z-Image fallback succeeded');
    return result.base64Url;
  }
  console.log('[BatchImageExecute] Z-Image fallback failed:', result.error);
  return null;
}

/**
 * 生成图片 (带 fallback 逻辑)
 * 优先使用 Gemini，失败时尝试阿里云 Z-Image
 *
 * 返回 usedZImageFallback=true 时上层应提示用户：Z-Image 不支持参考图，
 * 若原请求带有 referenceImages，结果将忽略参考图。
 */
async function generateImage(
  geminiKey: string | undefined,
  prompt: string,
  referenceImages?: Array<{ data: string; mimeType: string }>
): Promise<{ imageUrl: string | null; usedZImageFallback: boolean }> {
  if (geminiKey) {
    const geminiResult = await generateImageWithGemini(
      geminiKey,
      prompt,
      referenceImages
    );
    if (geminiResult) {
      return { imageUrl: geminiResult, usedZImageFallback: false };
    }
  }

  const dashscopeKey = process.env.DASHSCOPE_API_KEY;
  if (dashscopeKey) {
    const fallback = await generateImageWithZImageFallback(
      dashscopeKey,
      prompt
    );
    return { imageUrl: fallback, usedZImageFallback: !!fallback };
  }

  return { imageUrl: null, usedZImageFallback: false };
}

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });

  // 安全修复：添加认证检查
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const apiKey = isOfficialGeminiEnabled()
    ? process.env.GEMINI_API_KEY
    : undefined;
  if (!apiKey && !process.env.DASHSCOPE_API_KEY)
    return new Response(
      JSON.stringify({ error: 'Image provider unavailable' }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  try {
    const body = (await request.json()) as {
      tasks: BatchTask[];
      referenceImages?: Array<{ data: string; mimeType: string }>;
    };
    const { tasks, referenceImages } = body;

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: 'No tasks provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 安全修复：限制批量任务数量
    if (tasks.length > MAX_BATCH_TASKS) {
      return new Response(
        JSON.stringify({
          error: `Too many tasks. Maximum allowed: ${MAX_BATCH_TASKS}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const encoder = new TextEncoder();

    console.log('[BatchImageExecute] Starting batch generation:', {
      taskCount: tasks.length,
      hasReferenceImages: !!referenceImages
    });

    const stream = new ReadableStream({
      async start(controller) {
        let completedCount = 0;
        let failedCount = 0;

        // 积分 RPC 必须走已验证身份后的服务端 admin client，避免客户端直调 SECURITY DEFINER。
        const supabase = getSupabaseAdmin();
        const authUserId: string | null = userId;
        if (!supabase) {
          console.error(
            '[BatchImageExecute] Supabase admin client unavailable'
          );
        }

        // 发送初始化事件
        controller.enqueue(
          encoder.encode(
            `event: batch_image\ndata: ${JSON.stringify({
              batchTasks: tasks.map((t) => ({
                id: t.id,
                index: t.index,
                title: t.title,
                prompt: t.prompt,
                status: 'pending'
              })),
              totalCount: tasks.length,
              completedCount: 0,
              failedCount: 0
            })}\n\n`
          )
        );

        // 逐个生成图片
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];

          // 发送当前任务开始状态
          controller.enqueue(
            encoder.encode(
              `event: batch_image\ndata: ${JSON.stringify({
                batchTaskId: task.id,
                batchTaskStatus: 'generating'
              })}\n\n`
            )
          );

          // 扣费（每张图片单独扣费）
          let creditConsumed = false;
          // 记录本张实际扣除的积分数额与来源,用于失败时等额退款。
          let creditConsumedAmount = 0;
          let creditConsumedType = 'bonus';
          let creditConsumedBreakdown: Record<string, number> | undefined;
          if (supabase && authUserId) {
            try {
              const rpcClient = supabase as unknown as SupabaseRpcClient;
              const { data: result, error: rpcError } = await rpcClient.rpc(
                'consume_credits',
                {
                  p_user_id: authUserId,
                  p_action: 'image_generation',
                  p_metadata: { source: 'batch_image_execute', batch_index: i }
                }
              );

              if (rpcError || !result?.success) {
                console.log(
                  '[BatchImageExecute] Quota exhausted at index:',
                  i,
                  result
                );

                // 发送配额超限事件（用于前端显示升级提示）
                const errorType = result?.error || 'QUOTA_EXCEEDED';
                const quotaExceededData: Record<string, unknown> = {
                  errorType,
                  feature: 'image_generation',
                  completedCount,
                  totalCount: tasks.length
                };

                // 根据错误类型添加额外信息
                if (errorType === 'QUOTA_EXCEEDED') {
                  quotaExceededData.used = (
                    result as Record<string, unknown>
                  )?.used;
                  quotaExceededData.max = (
                    result as Record<string, unknown>
                  )?.max;
                  // 计算明天 UTC 0 点作为重置时间
                  const tomorrow = new Date();
                  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                  tomorrow.setUTCHours(0, 0, 0, 0);
                  quotaExceededData.resetAt = tomorrow.toISOString();
                } else if (
                  errorType === 'INSUFFICIENT_CREDITS' ||
                  errorType === 'INSUFFICIENT_MEDIA_CREDITS'
                ) {
                  quotaExceededData.currentBalance = (
                    result as Record<string, unknown>
                  )?.current_balance;
                  quotaExceededData.required = (
                    result as Record<string, unknown>
                  )?.required;
                }

                controller.enqueue(
                  encoder.encode(
                    `event: quota_exceeded\ndata: ${JSON.stringify(quotaExceededData)}\n\n`
                  )
                );

                // 标记当前任务失败
                controller.enqueue(
                  encoder.encode(
                    `event: batch_image\ndata: ${JSON.stringify({
                      batchTaskId: task.id,
                      batchTaskStatus: 'error',
                      batchTaskError:
                        errorType === 'QUOTA_EXCEEDED'
                          ? '今日生图次数已达上限'
                          : '积分不足'
                    })}\n\n`
                  )
                );
                failedCount++;

                // 标记剩余任务为已取消
                for (let j = i + 1; j < tasks.length; j++) {
                  controller.enqueue(
                    encoder.encode(
                      `event: batch_image\ndata: ${JSON.stringify({
                        batchTaskId: tasks[j].id,
                        batchTaskStatus: 'cancelled',
                        batchTaskError:
                          errorType === 'QUOTA_EXCEEDED'
                            ? '今日生图次数已达上限，已取消'
                            : '积分不足，已取消'
                      })}\n\n`
                    )
                  );
                  failedCount++;
                }
                break;
              }
              creditConsumed = true;
              // consume_credits 返回 { consumed, credit_type };扣费成功时必带。
              // 兜底当前基础档,避免极端缺字段时退少。
              const consumedRaw = Number(
                (result as Record<string, unknown>)?.consumed
              );
              creditConsumedAmount =
                Number.isFinite(consumedRaw) && consumedRaw > 0
                  ? consumedRaw
                  : IMAGE_GENERATION_BASE_CREDIT_COST;
              creditConsumedType = String(
                (result as Record<string, unknown>)?.credit_type || 'bonus'
              );
              const rawBreakdown = (result as Record<string, unknown>)
                ?.credit_breakdown;
              if (rawBreakdown && typeof rawBreakdown === 'object') {
                const parsedBreakdown = Object.fromEntries(
                  Object.entries(rawBreakdown as Record<string, unknown>).map(
                    ([key, value]) => [key, Number(value || 0)]
                  )
                );
                creditConsumedBreakdown = {
                  daily: parsedBreakdown.daily || 0,
                  subscription: parsedBreakdown.subscription || 0,
                  bonus: parsedBreakdown.bonus || 0,
                  referral: parsedBreakdown.referral || 0,
                  media: parsedBreakdown.media || 0,
                  promoMedia: parsedBreakdown.promoMedia || 0
                };
              }
            } catch (err) {
              console.error(
                '[BatchImageExecute] Credit consumption error:',
                err
              );
            }
          }

          // 生成图片
          const refundIfNeeded = async (reason: string) => {
            if (creditConsumed && supabase && authUserId) {
              const refundMetadata: Record<string, unknown> = {
                source: 'batch_image_execute',
                batch_index: i,
                task_id: task.id,
                failureReason: reason
              };
              if (creditConsumedBreakdown) {
                refundMetadata.creditBreakdown = creditConsumedBreakdown;
              }
              await refundBatchImageCredit(
                supabase,
                authUserId,
                creditConsumedAmount,
                creditConsumedType,
                refundMetadata
              );
            }
          };
          try {
            const genResult = await generateImage(
              apiKey,
              task.prompt,
              referenceImages
            );

            if (genResult.imageUrl) {
              completedCount++;
              if (
                genResult.usedZImageFallback &&
                referenceImages &&
                referenceImages.length > 0
              ) {
                controller.enqueue(
                  encoder.encode(
                    `event: batch_image_warning\ndata: ${JSON.stringify({
                      batchTaskId: task.id,
                      warning: 'reference_images_dropped',
                      message:
                        '主模型不可用已自动切换至 Z-Image，本次未应用参考图。'
                    })}\n\n`
                  )
                );
              }
              controller.enqueue(
                encoder.encode(
                  `event: batch_image\ndata: ${JSON.stringify({
                    batchTaskId: task.id,
                    batchTaskStatus: 'done',
                    batchTaskImageUrl: genResult.imageUrl,
                    batchTaskTitle: task.title,
                    usedFallback: genResult.usedZImageFallback
                  })}\n\n`
                )
              );
            } else {
              failedCount++;
              await refundIfNeeded('generate_returned_null');
              controller.enqueue(
                encoder.encode(
                  `event: batch_image\ndata: ${JSON.stringify({
                    batchTaskId: task.id,
                    batchTaskStatus: 'error',
                    batchTaskError: '图片生成失败，已退还本次积分'
                  })}\n\n`
                )
              );
            }
          } catch (genErr: unknown) {
            failedCount++;
            const errorMessage =
              genErr instanceof Error ? genErr.message : '生成出错';
            await refundIfNeeded(errorMessage);
            controller.enqueue(
              encoder.encode(
                `event: batch_image\ndata: ${JSON.stringify({
                  batchTaskId: task.id,
                  batchTaskStatus: 'error',
                  batchTaskError: `${errorMessage}，已退还本次积分`
                })}\n\n`
              )
            );
          }
        }

        // 发送完成事件
        console.log('[BatchImageExecute] Batch generation complete:', {
          completedCount,
          failedCount
        });
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              tokenUsage: { inputTokens: 0, outputTokens: 0 },
              isBatchImageGeneration: true,
              completedCount,
              failedCount
            })}\n\n`
          )
        );
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (err) {
    console.error('[BatchImageExecute] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
