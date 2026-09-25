import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getCorsHeadersForRequest,
  getUserIdFromRequest
} from '../utils/auth.js';

type ImageTaskAction = 'cancel' | 'delete_failed' | 'retry';
type ImageTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

interface ImageGenerationTaskRecord {
  id: string;
  user_id: string;
  status: ImageTaskStatus;
  request_payload: unknown;
  result_payload?: Record<string, unknown> | null;
  refund_failed?: boolean | null;
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function jsonResponse(
  data: unknown,
  corsHeaders: Record<string, string>,
  status = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function getImageTaskBillingIdempotencyKey(
  taskId: string,
  billingPhase: string
): string {
  return `image_task:${taskId}:${billingPhase}`;
}

function parseQueuedImageGenerationPrepaidCredit(payload: unknown):
  | {
      consumed: number;
      creditType?: string;
      creditBreakdown?: Record<string, number>;
    }
  | undefined {
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  const prepaid =
    record?.prepaidCredit && typeof record.prepaidCredit === 'object'
      ? (record.prepaidCredit as Record<string, unknown>)
      : null;
  const consumed = Number(prepaid?.consumed || 0);
  if (!consumed) return undefined;
  const rawBreakdown =
    prepaid?.creditBreakdown && typeof prepaid.creditBreakdown === 'object'
      ? (prepaid.creditBreakdown as Record<string, unknown>)
      : null;
  const creditBreakdown = rawBreakdown
    ? ({
        daily: Number(rawBreakdown.daily || 0),
        subscription: Number(rawBreakdown.subscription || 0),
        bonus: Number(rawBreakdown.bonus || 0),
        ...(Number(rawBreakdown.referral || 0) > 0
          ? { referral: Number(rawBreakdown.referral || 0) }
          : {}),
        ...(Number(rawBreakdown.media || 0) > 0
          ? { media: Number(rawBreakdown.media || 0) }
          : {}),
        ...(Number(rawBreakdown.promoMedia || 0) > 0
          ? { promoMedia: Number(rawBreakdown.promoMedia || 0) }
          : {})
      } as Record<string, number>)
    : undefined;
  return {
    consumed,
    creditType:
      typeof prepaid?.creditType === 'string' ? prepaid.creditType : undefined,
    creditBreakdown
  };
}

type CancelledImageTaskStatus = 'queued' | 'running' | 'cancelled';

function getCancelledTaskStatus(
  task: ImageGenerationTaskRecord
): CancelledImageTaskStatus | undefined {
  const status = task.result_payload?.cancelledTaskStatus;
  return status === 'queued' || status === 'running' || status === 'cancelled'
    ? status
    : undefined;
}

function getCancelInterruptMode(status: CancelledImageTaskStatus) {
  return status === 'running' ? 'soft' : 'queue';
}

async function refundCancelledImageTaskCredit({
  sb,
  userId,
  task,
  cancelledTaskStatus
}: {
  sb: SupabaseClient;
  userId: string;
  task: ImageGenerationTaskRecord;
  cancelledTaskStatus: CancelledImageTaskStatus;
}): Promise<{ refunded: number; refundFailed: boolean }> {
  const prepaidCredit = parseQueuedImageGenerationPrepaidCredit(
    task.request_payload
  );
  if (!prepaidCredit?.consumed) {
    return { refunded: 0, refundFailed: false };
  }

  const billingPhase = 'queue_cancel_refund';
  const refundMetadata = {
    billingDomain: 'image_task',
    billingPhase,
    idempotency_key: getImageTaskBillingIdempotencyKey(task.id, billingPhase),
    taskId: task.id,
    cancelledTaskStatus,
    creditBreakdown: prepaidCredit.creditBreakdown
  };
  const { data, error } = await sb.rpc('refund_generation_credit', {
    p_user_id: userId,
    p_amount: prepaidCredit.consumed,
    p_credit_type: prepaidCredit.creditType || 'bonus',
    p_source: `image_task:${task.id}:${billingPhase}`,
    p_metadata: refundMetadata
  });

  if (error) {
    console.error('[ImageTaskActions] cancel refund failed:', {
      userId,
      taskId: task.id,
      message: error.message
    });
    const fallback = await sb.rpc('refund_image_generation_credit', {
      p_user_id: userId,
      p_amount: prepaidCredit.consumed,
      p_credit_type: prepaidCredit.creditType || 'bonus',
      p_metadata: refundMetadata
    });
    if (fallback.error) {
      return { refunded: 0, refundFailed: true };
    }
    const fallbackResult = fallback.data as {
      success?: boolean;
      refunded?: number;
      error?: string;
    };
    if (fallbackResult?.success === false) {
      return { refunded: 0, refundFailed: true };
    }
    return {
      refunded: Number(fallbackResult?.refunded || prepaidCredit.consumed),
      refundFailed: false
    };
  }

  const result = data as {
    success?: boolean;
    refunded?: number;
    error?: string;
  };
  if (result?.success === false) {
    console.error('[ImageTaskActions] cancel refund rejected:', {
      userId,
      taskId: task.id,
      error: result.error || 'unknown'
    });
    return { refunded: 0, refundFailed: true };
  }

  return {
    refunded: Number(result?.refunded || prepaidCredit.consumed),
    refundFailed: false
  };
}

async function markCancelledRefundResult({
  sb,
  taskId,
  refunded,
  refundFailed,
  cancelledTaskStatus
}: {
  sb: SupabaseClient;
  taskId: string;
  refunded: number;
  refundFailed: boolean;
  cancelledTaskStatus: CancelledImageTaskStatus;
}): Promise<void> {
  const { error } = await sb
    .from('image_generation_tasks')
    .update({
      status: 'cancelled',
      locked_until: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result_payload: {
        success: true,
        cancelled: true,
        refunded,
        billingPhase: 'queue_cancel_refund',
        cancelledTaskStatus,
        interruptMode: getCancelInterruptMode(cancelledTaskStatus)
      },
      refund_failed: refundFailed
    })
    .eq('id', taskId);

  if (error) {
    console.error('[ImageTaskActions] cancel refund status update failed:', {
      taskId,
      message: error.message
    });
  }
}

export async function handleCancelImageTaskRequest({
  sb,
  userId,
  taskId,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  taskId: string;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { data: targetTask, error: targetTaskError } = await sb
    .from('image_generation_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetTaskError) {
    console.error('[ImageTaskActions] cancel task lookup failed:', {
      userId,
      taskId,
      message: targetTaskError.message
    });
    return jsonResponse({ error: 'task cancel failed' }, corsHeaders, 500);
  }

  const existingTask = targetTask as ImageGenerationTaskRecord | null;

  if (!existingTask) {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务不存在，无法取消。'
      },
      corsHeaders,
      409
    );
  }

  if (existingTask.status === 'cancelled') {
    const cancelledTaskStatus =
      getCancelledTaskStatus(existingTask) || 'cancelled';
    if (existingTask.refund_failed) {
      const retryRefund = await refundCancelledImageTaskCredit({
        sb,
        userId,
        task: existingTask,
        cancelledTaskStatus
      });
      if (!retryRefund.refundFailed) {
        await markCancelledRefundResult({
          sb,
          taskId,
          refunded: retryRefund.refunded,
          refundFailed: false,
          cancelledTaskStatus
        });
      }
      return jsonResponse(
        {
          success: true,
          taskId,
          status: 'cancelled',
          refunded: retryRefund.refunded,
          refundFailed: retryRefund.refundFailed,
          cancelledTaskStatus,
          interruptMode: getCancelInterruptMode(cancelledTaskStatus)
        },
        corsHeaders
      );
    }

    return jsonResponse(
      {
        success: true,
        taskId,
        status: 'cancelled',
        refundFailed: false,
        cancelledTaskStatus,
        interruptMode: getCancelInterruptMode(cancelledTaskStatus)
      },
      corsHeaders
    );
  }

  if (existingTask.status !== 'queued' && existingTask.status !== 'running') {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务已结束，不能取消。'
      },
      corsHeaders,
      409
    );
  }

  const cancelledTaskStatus = existingTask.status;
  const { data, error } = await sb
    .from('image_generation_tasks')
    .update({
      status: 'cancelled',
      locked_until: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message:
        cancelledTaskStatus === 'running'
          ? '用户中止正在进行的生图任务'
          : '用户取消排队任务',
      refund_failed: true,
      result_payload: {
        success: true,
        cancelled: true,
        refunded: 0,
        billingPhase: 'queue_cancel_refund',
        cancelledTaskStatus,
        interruptMode: getCancelInterruptMode(cancelledTaskStatus)
      }
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .eq('status', cancelledTaskStatus)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('[ImageTaskActions] cancel task failed:', {
      userId,
      taskId,
      message: error.message
    });
    return jsonResponse({ error: 'task cancel failed' }, corsHeaders, 500);
  }

  const task = data as ImageGenerationTaskRecord | null;
  if (!task) {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_CANCELABLE',
        message: '任务状态已变化，请刷新后重试。'
      },
      corsHeaders,
      409
    );
  }

  const refund = await refundCancelledImageTaskCredit({
    sb,
    userId,
    task: existingTask,
    cancelledTaskStatus
  });
  await markCancelledRefundResult({
    sb,
    taskId,
    refunded: refund.refunded,
    refundFailed: refund.refundFailed,
    cancelledTaskStatus
  });

  return jsonResponse(
    {
      success: true,
      taskId,
      status: 'cancelled',
      refunded: refund.refunded,
      refundFailed: refund.refundFailed,
      cancelledTaskStatus,
      interruptMode: getCancelInterruptMode(cancelledTaskStatus)
    },
    corsHeaders
  );
}

async function handleDeleteFailedImageTaskRequest({
  sb,
  userId,
  taskId,
  corsHeaders
}: {
  sb: SupabaseClient;
  userId: string;
  taskId: string;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { data: targetTask, error: targetTaskError } = await sb
    .from('image_generation_tasks')
    .select('id,status,created_at')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetTaskError) {
    console.error('[ImageTaskActions] delete failed task lookup failed:', {
      userId,
      taskId,
      message: targetTaskError.message
    });
    return jsonResponse({ error: 'task delete failed' }, corsHeaders, 500);
  }

  if (!targetTask) {
    return jsonResponse({ success: true, taskId, deleted: false }, corsHeaders);
  }

  if (targetTask.status !== 'failed') {
    return jsonResponse(
      {
        error: 'IMAGE_TASK_NOT_DELETABLE',
        message: '只能清理已失败的任务。'
      },
      corsHeaders,
      409
    );
  }

  const { data, error } = await sb
    .from('image_generation_tasks')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'failed')
    .lte('created_at', targetTask.created_at)
    .select('id');

  if (error) {
    console.error('[ImageTaskActions] delete failed task failed:', {
      userId,
      taskId,
      message: error.message
    });
    return jsonResponse({ error: 'task delete failed' }, corsHeaders, 500);
  }

  return jsonResponse(
    {
      success: true,
      taskId,
      deleted: true,
      deletedTaskIds: (data || []).map((task) => task.id)
    },
    corsHeaders
  );
}

export async function handleCloudflareImageTaskAction(
  request: Request
): Promise<Response | null> {
  const corsHeaders = {
    ...getCorsHeadersForRequest(request),
    'Cache-Control': 'no-store',
    'x-webtomind-image-task-action-runtime': 'cloudflare-worker'
  };

  if (request.method !== 'POST') return null;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
  };
  const taskId = body.id?.trim();
  const action = body.action?.trim() as ImageTaskAction | undefined;

  if (action === 'retry') {
    return null;
  }

  if (!taskId || !action) {
    return jsonResponse(
      { error: 'task id and action are required' },
      corsHeaders,
      400
    );
  }

  if (action !== 'cancel' && action !== 'delete_failed') {
    return jsonResponse({ error: 'unknown task action' }, corsHeaders, 400);
  }

  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return jsonResponse({ error: '请先登录' }, corsHeaders, 401);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse({ error: 'Supabase not configured' }, corsHeaders, 500);
  }

  if (action === 'cancel') {
    return handleCancelImageTaskRequest({
      sb,
      userId,
      taskId,
      corsHeaders
    });
  }

  return handleDeleteFailedImageTaskRequest({
    sb,
    userId,
    taskId,
    corsHeaders
  });
}
