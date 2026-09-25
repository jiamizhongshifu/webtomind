-- Remove the legacy one-argument overload after introducing the idempotent
-- two-argument weaving quota RPC.

SET search_path = public;

DROP FUNCTION IF EXISTS public.consume_weaving_quota(UUID);

NOTIFY pgrst, 'reload schema';
