-- Add lease and retry backoff fields for marketing email delivery.

SET search_path = public;

ALTER TABLE public.marketing_email_queue
  ADD COLUMN IF NOT EXISTS leased_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.marketing_email_queue
SET attempt_count = GREATEST(attempt_count, attempts)
WHERE attempts IS NOT NULL;

ALTER TABLE public.marketing_email_queue
  DROP CONSTRAINT IF EXISTS marketing_email_queue_attempt_count_nonnegative;

ALTER TABLE public.marketing_email_queue
  ADD CONSTRAINT marketing_email_queue_attempt_count_nonnegative
    CHECK (attempt_count >= 0);

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_due_with_backoff
  ON public.marketing_email_queue (status, next_attempt_at, scheduled_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_expired_lease
  ON public.marketing_email_queue (status, leased_until, created_at)
  WHERE status = 'sending';
