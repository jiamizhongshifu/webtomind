-- Stop recurring digests and reengagement (including checkout recovery).
-- Keep signup welcome emails, unsubscribe choices, and delivery history intact.
-- Enforce this in the database so already-deployed schedulers cannot revive mail.

CREATE OR REPLACE FUNCTION public.enforce_welcome_only_email_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.case_digest_enabled := false;
  NEW.offer_enabled := false;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_welcome_only_email_preferences() FROM PUBLIC;

CREATE OR REPLACE TRIGGER enforce_welcome_only_email_preferences
  BEFORE INSERT OR UPDATE ON public.marketing_email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_welcome_only_email_preferences();

CREATE OR REPLACE TRIGGER enforce_welcome_only_email_leads
  BEFORE INSERT OR UPDATE ON public.marketing_email_leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_welcome_only_email_preferences();

ALTER TABLE public.marketing_email_preferences
  ALTER COLUMN case_digest_enabled SET DEFAULT false,
  ALTER COLUMN offer_enabled SET DEFAULT false;
ALTER TABLE public.marketing_email_leads
  ALTER COLUMN case_digest_enabled SET DEFAULT false,
  ALTER COLUMN offer_enabled SET DEFAULT false;

UPDATE public.marketing_email_preferences
SET case_digest_enabled = false, offer_enabled = false
WHERE case_digest_enabled OR offer_enabled;
UPDATE public.marketing_email_leads
SET case_digest_enabled = false, offer_enabled = false
WHERE case_digest_enabled OR offer_enabled;

CREATE OR REPLACE FUNCTION public.enforce_welcome_only_email_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email_type <> 'welcome' THEN
    -- Suppress claims entirely: an old drain must not receive a RETURNING row.
    IF NEW.status = 'sending' THEN
      RETURN NULL;
    END IF;
    IF NEW.status = 'queued' THEN
      NEW.status := 'failed';
      NEW.last_error := 'recurring_email_disabled_welcome_only';
      NEW.leased_until := NULL;
      NEW.next_attempt_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_welcome_only_email_queue() FROM PUBLIC;

CREATE OR REPLACE TRIGGER enforce_welcome_only_email_queue
  BEFORE INSERT OR UPDATE ON public.marketing_email_queue
  FOR EACH ROW EXECUTE FUNCTION public.enforce_welcome_only_email_queue();

UPDATE public.marketing_email_queue
SET status = 'failed',
    last_error = 'recurring_email_disabled_welcome_only',
    leased_until = NULL,
    next_attempt_at = NULL
WHERE email_type IN ('case_digest', 'limited_offer')
  AND status IN ('queued', 'sending');

UPDATE public.marketing_email_campaigns
SET status = 'paused'
WHERE email_type IN ('case_digest', 'limited_offer')
  AND status IN ('draft', 'queued');
