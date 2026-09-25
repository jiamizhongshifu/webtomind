-- Marketing email automation: preferences, campaigns, queue, and welcome-email trigger.

SET search_path = public;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.marketing_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  welcome_enabled BOOLEAN NOT NULL DEFAULT true,
  case_digest_enabled BOOLEAN NOT NULL DEFAULT true,
  offer_enabled BOOLEAN NOT NULL DEFAULT true,
  unsubscribe_token TEXT NOT NULL DEFAULT replace(extensions.gen_random_uuid()::text, '-', ''),
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_preferences_locale_check
    CHECK (locale IN ('zh-CN', 'en-US')),
  CONSTRAINT marketing_email_preferences_email_not_blank
    CHECK (length(trim(email)) > 3)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_preferences_token
  ON public.marketing_email_preferences (unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_marketing_email_preferences_email
  ON public.marketing_email_preferences (lower(email));

CREATE TABLE IF NOT EXISTS public.marketing_email_campaigns (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  campaign_key TEXT NOT NULL UNIQUE,
  email_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  cta_label TEXT,
  cta_url TEXT,
  hero_image_url TEXT,
  scheduled_for DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_campaigns_email_type_check
    CHECK (email_type IN ('welcome', 'case_digest', 'limited_offer')),
  CONSTRAINT marketing_email_campaigns_status_check
    CHECK (status IN ('draft', 'queued', 'sent', 'paused'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_campaigns_type_created
  ON public.marketing_email_campaigns (email_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_email_queue (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  html TEXT NOT NULL,
  text_body TEXT NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  hero_image_url TEXT,
  campaign_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_email_queue_email_type_check
    CHECK (email_type IN ('welcome', 'case_digest', 'limited_offer')),
  CONSTRAINT marketing_email_queue_status_check
    CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  CONSTRAINT marketing_email_queue_attempts_nonnegative
    CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_queue_recipient_campaign
  ON public.marketing_email_queue (recipient_email, email_type, campaign_key)
  WHERE campaign_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_email_queue_due
  ON public.marketing_email_queue (status, scheduled_at, created_at)
  WHERE status = 'queued';

DROP TRIGGER IF EXISTS update_marketing_email_preferences_updated_at
  ON public.marketing_email_preferences;
CREATE TRIGGER update_marketing_email_preferences_updated_at
  BEFORE UPDATE ON public.marketing_email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketing_email_campaigns_updated_at
  ON public.marketing_email_campaigns;
CREATE TRIGGER update_marketing_email_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_marketing_email_queue_updated_at
  ON public.marketing_email_queue;
CREATE TRIGGER update_marketing_email_queue_updated_at
  BEFORE UPDATE ON public.marketing_email_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user_marketing_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := trim(COALESCE(NEW.email, ''));
  v_locale TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale', ''), 'zh-CN');
BEGIN
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  IF v_locale NOT IN ('zh-CN', 'en-US') THEN
    v_locale := 'zh-CN';
  END IF;

  INSERT INTO public.marketing_email_preferences (user_id, email, locale)
  VALUES (NEW.id, v_email, v_locale)
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      locale = EXCLUDED.locale,
      updated_at = NOW();

  INSERT INTO public.marketing_email_queue (
    user_id,
    recipient_email,
    email_type,
    subject,
    preview_text,
    html,
    text_body,
    cta_label,
    cta_url,
    campaign_key,
    metadata
  )
  VALUES (
    NEW.id,
    v_email,
    'welcome',
    CASE WHEN v_locale = 'en-US'
      THEN 'Welcome to WebToMind'
      ELSE '欢迎来到 WebToMind'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN 'Start your reusable AI image workflow.'
      ELSE '从可复用的 AI 图片工作流开始。'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN '<h1>Welcome to WebToMind</h1><p>Your account is ready. Start from the prompt library, reuse curated image cases, and build a repeatable AI image workflow.</p><p><a href="https://webtomind.com/en-US/create/prompts">Browse prompt cases</a></p><p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>'
      ELSE '<h1>欢迎来到 WebToMind</h1><p>你的账号已经准备好。可以先从精品提示词案例开始，复用图片案例，并搭建稳定的 AI 图片生成工作流。</p><p><a href="https://webtomind.com/zh-CN/create/prompts">查看精品案例</a></p><p><a href="{{unsubscribe_url}}">退订邮件</a></p>'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN 'Welcome to WebToMind. Browse prompt cases: https://webtomind.com/en-US/create/prompts'
      ELSE '欢迎来到 WebToMind。查看精品案例：https://webtomind.com/zh-CN/create/prompts'
    END,
    CASE WHEN v_locale = 'en-US' THEN 'Browse prompt cases' ELSE '查看精品案例' END,
    CASE WHEN v_locale = 'en-US'
      THEN 'https://webtomind.com/en-US/create/prompts'
      ELSE 'https://webtomind.com/zh-CN/create/prompts'
    END,
    'welcome:' || NEW.id::text,
    jsonb_build_object('locale', v_locale, 'source', 'auth_trigger')
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_marketing_email ON auth.users;
CREATE TRIGGER on_auth_user_created_marketing_email
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_marketing_email();

ALTER TABLE public.marketing_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own marketing email preferences"
  ON public.marketing_email_preferences;
CREATE POLICY "Users view own marketing email preferences"
  ON public.marketing_email_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own marketing email preferences"
  ON public.marketing_email_preferences;
CREATE POLICY "Users update own marketing email preferences"
  ON public.marketing_email_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON public.marketing_email_preferences TO authenticated;
GRANT ALL ON public.marketing_email_preferences TO service_role;
GRANT ALL ON public.marketing_email_campaigns TO service_role;
GRANT ALL ON public.marketing_email_queue TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-email-assets',
  'marketing-email-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
