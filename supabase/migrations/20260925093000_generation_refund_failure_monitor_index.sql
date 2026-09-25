-- Support the */10 cron refund-failure monitor
-- (api/credits/refund-failure-monitor.ts), which lists tasks flagged
-- refund_failed = true in the last window. Partial indexes stay tiny because
-- only failed refunds are indexed.

CREATE INDEX IF NOT EXISTS image_generation_tasks_refund_failed_updated_idx
  ON public.image_generation_tasks (updated_at)
  WHERE refund_failed;

CREATE INDEX IF NOT EXISTS video_generation_tasks_refund_failed_updated_idx
  ON public.video_generation_tasks (updated_at)
  WHERE refund_failed;
