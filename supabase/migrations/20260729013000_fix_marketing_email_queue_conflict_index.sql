BEGIN;

-- PostgREST emits ON CONFLICT (recipient_email, email_type, campaign_key).
-- PostgreSQL cannot infer the previous partial index without the same WHERE
-- predicate, so every scheduled campaign failed after its campaign row was
-- created. NULL campaign keys remain distinct under this full unique index.
DROP INDEX IF EXISTS public.idx_marketing_email_queue_recipient_campaign;

CREATE UNIQUE INDEX idx_marketing_email_queue_recipient_campaign
  ON public.marketing_email_queue (recipient_email, email_type, campaign_key);

COMMIT;
