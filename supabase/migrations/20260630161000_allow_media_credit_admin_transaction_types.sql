-- Keep media-credit admin adjustments compatible with the transaction
-- type values written by admin_adjust_media_credits and historical credit RPCs.

SET search_path = public;

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (
    type IN (
      'consume',
      'usage',
      'refund',
      'earn',
      'purchase',
      'subscription_grant',
      'referral_reward'
    )
  );

NOTIFY pgrst, 'reload schema';
