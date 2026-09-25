-- Allow PostgREST upsert(... onConflict: 'idempotency_key') to match a
-- concrete unique index. Partial unique indexes cannot satisfy that conflict
-- target, which made conversion event writes fail silently in the API.

SET search_path = public;

DROP INDEX IF EXISTS public.idx_conversion_events_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_events_idempotency_key
  ON public.conversion_events (idempotency_key);
