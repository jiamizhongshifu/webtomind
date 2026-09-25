-- Rebalance starter rewards so free credits teach the workflow without replacing paid usage.
-- Daily login amounts are passed from src/shared/daily-login-reward.ts by the API.
-- This migration syncs the persisted task reward pool from 100 credits to 60 credits.

SET search_path = '';

UPDATE public.reward_tasks
SET
  reward_amount = CASE identifier
    WHEN 'generate_first_commercial_image' THEN 15
    WHEN 'save_prompt_case_or_prompt_asset' THEN 10
    WHEN 'use_reference_image' THEN 10
    WHEN 'reuse_gallery_generation' THEN 10
    WHEN 'launch_create_app' THEN 10
    WHEN 'create_or_open_board' THEN 5
    ELSE reward_amount
  END,
  updated_at = NOW()
WHERE identifier IN (
  'generate_first_commercial_image',
  'save_prompt_case_or_prompt_asset',
  'use_reference_image',
  'reuse_gallery_generation',
  'launch_create_app',
  'create_or_open_board'
);

NOTIFY pgrst, 'reload schema';
