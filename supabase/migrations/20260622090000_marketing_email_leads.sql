-- Public homepage email capture for the hot-case digest.

SET search_path = public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.marketing_email_leads (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  case_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  offer_enabled BOOLEAN NOT NULL DEFAULT false,
  unsubscribe_token TEXT NOT NULL DEFAULT replace(extensions.gen_random_uuid()::text, '-', ''),
  source TEXT NOT NULL DEFAULT 'home_hot_cases',
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_leads_locale_check
    CHECK (locale IN ('zh-CN', 'en-US')),
  CONSTRAINT marketing_email_leads_email_not_blank
    CHECK (length(trim(email)) > 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_leads_token
  ON public.marketing_email_leads (unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_marketing_email_leads_locale_digest
  ON public.marketing_email_leads (locale, case_digest_enabled)
  WHERE unsubscribed_at IS NULL;

ALTER TABLE public.marketing_email_leads ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.marketing_email_leads TO service_role;
