-- Keep weaving quota SECURITY DEFINER RPCs callable only from trusted
-- server-side endpoints. Browser clients pass through API routes that verify
-- the user and then call these functions with the service_role client.

SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.consume_weaving_quota(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_weaving_quota(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_weaving_quota(UUID, TEXT)
  TO service_role;

GRANT EXECUTE ON FUNCTION public.refund_weaving_quota(UUID, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
