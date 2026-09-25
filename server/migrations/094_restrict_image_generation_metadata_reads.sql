-- Keep internal image-generation metadata out of authenticated client reads.
-- User-facing history is served by the API, which maps an explicit safe field set.

SET search_path = public;

REVOKE SELECT ON TABLE public.image_generations FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  image_url,
  prompt,
  negative_prompt,
  model_label,
  provider,
  provider_model,
  aspect_ratio,
  quality,
  asset_ids,
  created_at
) ON TABLE public.image_generations TO authenticated;

GRANT ALL ON TABLE public.image_generations TO service_role;
