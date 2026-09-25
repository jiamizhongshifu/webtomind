BEGIN;

ALTER TABLE public.marketing_email_queue
  ADD COLUMN IF NOT EXISTS delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_provider_event TEXT,
  ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMPTZ;

ALTER TABLE public.marketing_email_queue
  DROP CONSTRAINT IF EXISTS marketing_email_queue_delivery_status_check;

ALTER TABLE public.marketing_email_queue
  ADD CONSTRAINT marketing_email_queue_delivery_status_check
  CHECK (
    delivery_status IS NULL OR delivery_status IN (
      'accepted',
      'sent',
      'delivered',
      'delivery_delayed',
      'opened',
      'clicked',
      'bounced',
      'complained',
      'failed'
    )
  );

UPDATE public.marketing_email_queue
SET delivery_status = 'accepted'
WHERE status = 'sent'
  AND delivery_status IS NULL;

CREATE TABLE IF NOT EXISTS public.marketing_email_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  svix_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  queue_id UUID REFERENCES public.marketing_email_queue(id) ON DELETE SET NULL,
  campaign_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  event_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_provider_events_type_check
    CHECK (
      event_type IN (
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.opened',
        'email.clicked',
        'email.bounced',
        'email.complained',
        'email.failed'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_provider_events_message
  ON public.marketing_email_provider_events (provider_message_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_email_provider_events_campaign
  ON public.marketing_email_provider_events (campaign_key, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_provider_message
  ON public.marketing_email_queue (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_active_recipient
  ON public.marketing_email_queue (lower(recipient_email), status)
  WHERE status IN ('queued', 'sending');

CREATE INDEX IF NOT EXISTS idx_marketing_email_leads_email_lower
  ON public.marketing_email_leads (lower(email));

CREATE TABLE IF NOT EXISTS public.marketing_email_system_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_key TEXT NOT NULL UNIQUE,
  audit_type TEXT NOT NULL,
  status TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_system_audits_status_check
    CHECK (status IN ('passed', 'failed'))
);

UPDATE public.marketing_email_campaigns AS campaign
SET status = 'paused',
    metadata = COALESCE(campaign.metadata, '{}'::jsonb) || jsonb_build_object(
      'closedAsEmptyAt',
      NOW(),
      'closedAsEmptyReason',
      'campaign_had_no_queue_rows'
    ),
    updated_at = NOW()
WHERE campaign.status = 'queued'
  AND campaign.scheduled_for < CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1
    FROM public.marketing_email_queue AS queue
    WHERE queue.campaign_key = campaign.campaign_key
  );

ALTER TABLE public.marketing_email_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_email_system_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_email_provider_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.marketing_email_system_audits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_email_provider_events TO service_role;
GRANT ALL ON public.marketing_email_system_audits TO service_role;

CREATE OR REPLACE FUNCTION public.record_marketing_email_provider_event(
  p_svix_id TEXT,
  p_event_type TEXT,
  p_provider_message_id TEXT,
  p_recipient_email TEXT,
  p_subject TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_should_suppress BOOLEAN,
  p_event_detail JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
  v_queue_id UUID;
  v_recipient_email TEXT;
  v_campaign_key TEXT;
  v_delivery_status TEXT;
  v_suppressed_campaign_keys TEXT[];
  v_suppressed_campaign_key TEXT;
BEGIN
  IF p_svix_id IS NULL OR btrim(p_svix_id) = '' THEN
    RAISE EXCEPTION 'svix id is required';
  END IF;
  IF p_event_type NOT IN (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.complained',
    'email.failed'
  ) THEN
    RAISE EXCEPTION 'unsupported Resend event type';
  END IF;

  SELECT id, recipient_email, campaign_key
  INTO v_queue_id, v_recipient_email, v_campaign_key
  FROM public.marketing_email_queue
  WHERE provider_message_id = p_provider_message_id
  ORDER BY sent_at DESC NULLS LAST
  LIMIT 1;

  IF v_queue_id IS NULL
    AND p_recipient_email IS NOT NULL
    AND btrim(p_recipient_email) <> ''
  THEN
    SELECT id, recipient_email, campaign_key
    INTO v_queue_id, v_recipient_email, v_campaign_key
    FROM public.marketing_email_queue
    WHERE provider_message_id IS NULL
      AND lower(recipient_email) = lower(p_recipient_email)
      AND (p_subject IS NULL OR subject = p_subject)
      AND status = 'sent'
    ORDER BY sent_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF v_queue_id IS NOT NULL AND p_provider_message_id IS NOT NULL THEN
      UPDATE public.marketing_email_queue
      SET provider_message_id = p_provider_message_id,
          updated_at = NOW()
      WHERE id = v_queue_id
        AND provider_message_id IS NULL;
    END IF;
  END IF;

  -- A verified complaint or permanent bounce must suppress the address even
  -- when provider-message persistence raced the webhook or the message came
  -- from another Resend flow and therefore has no marketing queue row.
  v_recipient_email := COALESCE(
    v_recipient_email,
    NULLIF(btrim(p_recipient_email), '')
  );

  INSERT INTO public.marketing_email_provider_events (
    svix_id,
    event_type,
    provider_message_id,
    queue_id,
    campaign_key,
    occurred_at,
    event_detail
  )
  VALUES (
    p_svix_id,
    p_event_type,
    p_provider_message_id,
    v_queue_id,
    v_campaign_key,
    p_occurred_at,
    COALESCE(p_event_detail, '{}'::jsonb)
  )
  ON CONFLICT (svix_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_delivery_status := replace(p_event_type, 'email.', '');
  IF v_queue_id IS NOT NULL THEN
    UPDATE public.marketing_email_queue
    SET delivery_status = CASE
          WHEN p_occurred_at >= COALESCE(last_provider_event_at, '-infinity'::timestamptz)
            THEN v_delivery_status
          ELSE delivery_status
        END,
        last_provider_event = CASE
          WHEN p_occurred_at >= COALESCE(last_provider_event_at, '-infinity'::timestamptz)
            THEN p_event_type
          ELSE last_provider_event
        END,
        last_provider_event_at = GREATEST(
          COALESCE(last_provider_event_at, '-infinity'::timestamptz),
          p_occurred_at
        ),
        delivered_at = CASE
          WHEN p_event_type = 'email.delivered'
            THEN COALESCE(delivered_at, p_occurred_at)
          ELSE delivered_at
        END,
        bounced_at = CASE
          WHEN p_event_type = 'email.bounced'
            THEN COALESCE(bounced_at, p_occurred_at)
          ELSE bounced_at
        END,
        complained_at = CASE
          WHEN p_event_type = 'email.complained'
            THEN COALESCE(complained_at, p_occurred_at)
          ELSE complained_at
        END,
        last_error = CASE
          WHEN p_event_type IN ('email.bounced', 'email.complained', 'email.failed')
            THEN 'provider_' || replace(p_event_type, 'email.', '')
          ELSE last_error
        END,
        updated_at = NOW()
    WHERE id = v_queue_id;
  END IF;

  IF p_should_suppress AND v_recipient_email IS NOT NULL THEN
    UPDATE public.marketing_email_preferences
    SET welcome_enabled = FALSE,
        case_digest_enabled = FALSE,
        offer_enabled = FALSE,
        unsubscribed_at = COALESCE(unsubscribed_at, p_occurred_at),
        updated_at = NOW()
    WHERE lower(email) = lower(v_recipient_email);

    UPDATE public.marketing_email_leads
    SET case_digest_enabled = FALSE,
        offer_enabled = FALSE,
        unsubscribed_at = COALESCE(unsubscribed_at, p_occurred_at),
        updated_at = NOW()
    WHERE lower(email) = lower(v_recipient_email);

    WITH suppressed AS (
      UPDATE public.marketing_email_queue
      SET status = 'failed',
          leased_until = NULL,
          next_attempt_at = NULL,
          last_error = CASE
            WHEN p_event_type = 'email.complained'
              THEN 'recipient_spam_complaint'
            ELSE 'recipient_permanent_bounce'
          END,
          updated_at = NOW()
      WHERE lower(recipient_email) = lower(v_recipient_email)
        AND status IN ('queued', 'sending')
      RETURNING campaign_key
    )
    SELECT array_agg(DISTINCT campaign_key)
    INTO v_suppressed_campaign_keys
    FROM suppressed
    WHERE campaign_key IS NOT NULL;

    FOREACH v_suppressed_campaign_key IN ARRAY COALESCE(
      v_suppressed_campaign_keys,
      ARRAY[]::TEXT[]
    )
    LOOP
      PERFORM public.refresh_marketing_email_campaign_status(
        v_suppressed_campaign_key
      );
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_marketing_email_queue_upsert_contract()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.marketing_email_queue (
    recipient_email,
    email_type,
    subject,
    html,
    text_body,
    campaign_key,
    status,
    scheduled_at,
    metadata
  )
  VALUES (
    'delivery-canary@webtomind.test',
    'case_digest',
    'Marketing email queue contract canary',
    '<p>canary</p>',
    'canary',
    '__canary__:queue-conflict-contract',
    'queued',
    NOW() + INTERVAL '1 day',
    jsonb_build_object('canary', TRUE)
  )
  ON CONFLICT (recipient_email, email_type, campaign_key)
  DO UPDATE SET updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_id;

  DELETE FROM public.marketing_email_queue
  WHERE id = v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_marketing_email_campaign_status(
  p_campaign_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queued BIGINT;
  v_sending BIGINT;
  v_sent BIGINT;
  v_failed BIGINT;
  v_status TEXT;
  v_updated BOOLEAN;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'queued'),
    COUNT(*) FILTER (WHERE status = 'sending'),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO v_queued, v_sending, v_sent, v_failed
  FROM public.marketing_email_queue
  WHERE campaign_key = p_campaign_key;

  v_status := CASE
    WHEN v_queued + v_sending > 0 THEN 'queued'
    WHEN v_sent > 0 THEN 'sent'
    ELSE 'paused'
  END;

  UPDATE public.marketing_email_campaigns
  SET status = v_status,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'queueStatusCounts',
        jsonb_build_object(
          'queued', v_queued,
          'sending', v_sending,
          'sent', v_sent,
          'failed', v_failed
        ),
        'queueStatusUpdatedAt',
        NOW()
      ),
      updated_at = NOW()
  WHERE campaign_key = p_campaign_key;
  v_updated := FOUND;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'campaignKey', p_campaign_key,
    'status', v_status,
    'queued', v_queued,
    'sending', v_sending,
    'sent', v_sent,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_marketing_email_provider_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_marketing_email_queue_upsert_contract()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_marketing_email_campaign_status(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_marketing_email_provider_event(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_marketing_email_queue_upsert_contract()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_marketing_email_campaign_status(TEXT)
  TO service_role;

COMMIT;
