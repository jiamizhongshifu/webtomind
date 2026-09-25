-- Apply the free-plan quota normalization added after the original
-- 20260623094000 migration had already been run in production.

SET search_path = public;

UPDATE public.subscription_plans
SET
  monthly_credits = 100,
  limits = jsonb_set(
    jsonb_set(
      COALESCE(limits, '{}'::jsonb) - 'dailyImageGen',
      '{dailyCredits}',
      '100'::jsonb,
      true
    ),
    '{dailyImageGeneration}',
    '10'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name = 'free'
   OR id::text = 'free';

UPDATE public.user_credits
SET
  daily_credits = LEAST(COALESCE(daily_credits, 0), 100),
  daily_credits_max = 100,
  daily_image_gen_max = 10,
  updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = public.user_credits.user_id
      AND s.status IN ('active', 'trialing', 'past_due', 'canceled')
      AND (
        s.status <> 'canceled'
        OR s.current_period_end::date >= CURRENT_DATE
      )
  )
  AND (
    COALESCE(daily_credits_max, 0) <> 100
    OR COALESCE(daily_credits, 0) > 100
    OR COALESCE(daily_image_gen_max, 0) <> 10
  );

NOTIFY pgrst, 'reload schema';
