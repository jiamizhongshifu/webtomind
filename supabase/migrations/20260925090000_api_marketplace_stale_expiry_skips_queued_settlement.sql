-- A settlement that failed inline is persisted to api_usage_settlement_queue
-- and retried with backoff of up to an hour. expire_stale_api_usage used to
-- refund every reservation older than the cutoff, including ones whose
-- observed usage was still queued. The queued settle_api_usage then saw a
-- non-reserved row, returned an idempotent success and the queue marked the
-- job succeeded: the completed upstream call was never billed and the
-- dead-letter alert never fired.
--
-- Skip reservations with a pending or processing queue job. Dead jobs keep
-- the existing behavior (alerted by the cron, then refunded by stale recovery).

CREATE OR REPLACE FUNCTION public.expire_stale_api_usage(
  p_max_age_seconds INTEGER DEFAULT 900
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire_stale_api_usage_queue_aware$
DECLARE
  v_usage RECORD;
  v_wallet_balance BIGINT;
  v_refund_count INTEGER := 0;
  v_max_age_seconds INTEGER := GREATEST(COALESCE(p_max_age_seconds, 900), 60);
BEGIN
  FOR v_usage IN
    SELECT id, user_id, key_id, request_id, reserved_cents
    FROM public.api_usage_logs
    WHERE status = 'reserved'
      AND reserved_at < now() - make_interval(secs => v_max_age_seconds)
      AND NOT EXISTS (
        SELECT 1
        FROM public.api_usage_settlement_queue queued
        WHERE queued.request_id = api_usage_logs.request_id
          AND queued.status IN ('pending', 'processing')
      )
    ORDER BY reserved_at
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
    VALUES (v_usage.user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance_cents INTO v_wallet_balance
    FROM public.api_wallets
    WHERE user_id = v_usage.user_id
    FOR UPDATE;

    UPDATE public.api_wallets
    SET balance_cents = balance_cents + v_usage.reserved_cents,
        updated_at = now()
    WHERE user_id = v_usage.user_id
    RETURNING balance_cents INTO v_wallet_balance;

    INSERT INTO public.api_wallet_transactions (
      user_id,
      key_id,
      type,
      amount_cents,
      balance_after_cents,
      source,
      idempotency_key,
      metadata
    ) VALUES (
      v_usage.user_id,
      v_usage.key_id,
      'usage_refund',
      v_usage.reserved_cents,
      v_wallet_balance,
      'api_usage_expiry',
      'usage-expiry:' || v_usage.id::TEXT,
      jsonb_build_object(
        'request_id', v_usage.request_id,
        'refund_cents', v_usage.reserved_cents,
        'reason', 'stale_reservation_refund'
      )
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING;

    UPDATE public.api_usage_logs
    SET status = 'failed',
        actual_customer_cents = 0,
        upstream_cost_cents = 0,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'reconciliation', 'stale_reservation_refund',
          'refund_cents', v_usage.reserved_cents,
          'refund_destination', 'wallet'
        ),
        settled_at = now(),
        updated_at = now()
    WHERE id = v_usage.id
      AND status = 'reserved';

    IF FOUND THEN v_refund_count := v_refund_count + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_refund_count,
    'max_age_seconds', v_max_age_seconds
  );
END;
$expire_stale_api_usage_queue_aware$;

COMMENT ON FUNCTION public.expire_stale_api_usage(INTEGER) IS
  'Refund stale API reservations to the account wallet, skipping reservations whose observed usage is still queued for settlement.';
