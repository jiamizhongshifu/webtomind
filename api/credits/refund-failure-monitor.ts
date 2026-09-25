import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Image and video tasks record `refund_failed = true` when a failed paid
 * generation could not return its prepaid credits. Nothing retries those
 * refunds automatically, so surface every newly flagged task to an operator.
 */
const REFUND_FAILURE_TABLES = {
  image: 'image_generation_tasks',
  video: 'video_generation_tasks'
} as const;

const MAX_TASK_IDS_PER_KIND = 50;

export type RefundFailureKind = keyof typeof REFUND_FAILURE_TABLES;

export interface RefundFailureScan {
  windowStart: string;
  windowEnd: string;
  taskIds: Record<RefundFailureKind, string[]>;
  errors: string[];
}

export async function findRecentRefundFailures(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date
): Promise<RefundFailureScan> {
  const scan: RefundFailureScan = {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    taskIds: { image: [], video: [] },
    errors: []
  };
  for (const kind of Object.keys(REFUND_FAILURE_TABLES) as RefundFailureKind[]) {
    const { data, error } = await supabase
      .from(REFUND_FAILURE_TABLES[kind])
      .select('id')
      .eq('refund_failed', true)
      .gte('updated_at', scan.windowStart)
      .lt('updated_at', scan.windowEnd)
      .order('updated_at', { ascending: true })
      .limit(MAX_TASK_IDS_PER_KIND);
    if (error) {
      scan.errors.push(`${kind}: ${error.message}`);
      continue;
    }
    scan.taskIds[kind] = ((data || []) as Array<{ id: string }>).map(
      (row) => row.id
    );
  }
  return scan;
}

export function buildRefundFailureAlert(
  scan: RefundFailureScan
): { subject: string; html: string; text: string } | null {
  const imageCount = scan.taskIds.image.length;
  const videoCount = scan.taskIds.video.length;
  if (imageCount === 0 && videoCount === 0) return null;

  const lines = [
    `生成失败后积分退款未成功，需要人工核对并补退。`,
    `时间窗口：${scan.windowStart} ~ ${scan.windowEnd}`,
    `图片任务（image_generation_tasks）：${imageCount} 个`,
    ...scan.taskIds.image.map((id) => `  - ${id}`),
    `视频任务（video_generation_tasks）：${videoCount} 个`,
    ...scan.taskIds.video.map((id) => `  - ${id}`),
    `每类最多列出 ${MAX_TASK_IDS_PER_KIND} 个；补退请使用任务原退款的幂等键，避免重复退款。`
  ];
  const text = lines.join('\n');
  const html = lines
    .map((line) =>
      line.replace(/[&<>]/g, (char) =>
        char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'
      )
    )
    .map((line) => `<p>${line}</p>`)
    .join('');
  return {
    subject: `[WebToMind] 生成退款失败告警（图片 ${imageCount} / 视频 ${videoCount}）`,
    html,
    text
  };
}
