-- Align free image quota with the 100 daily-credit policy.
-- A free user can afford one base image generation per daily refresh.

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
    '1'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE name = 'free'
   OR id::text = 'free';

UPDATE public.user_credits
SET
  daily_credits = LEAST(COALESCE(daily_credits, 0), 100),
  daily_credits_max = 100,
  daily_image_gen_max = 1,
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
    OR COALESCE(daily_image_gen_max, 0) <> 1
  );

NOTIFY pgrst, 'reload schema';
