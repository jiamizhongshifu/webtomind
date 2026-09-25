-- Fix Supabase linter warning: function_search_path_mutable
-- Affected functions:
--   public.set_cards_updated_at()
--   public.set_studio_documents_updated_at()

ALTER FUNCTION public.set_cards_updated_at()
  SET search_path = public;

ALTER FUNCTION public.set_studio_documents_updated_at()
  SET search_path = public;

