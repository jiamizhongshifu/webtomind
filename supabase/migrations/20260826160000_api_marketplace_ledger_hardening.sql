-- API marketplace ledger hardening.
--
-- This migration is intentionally additive: the original marketplace
-- migration may already be applied in production. It closes two races found
-- during the pre-release audit:
--   1. fund and revoke now acquire the user's wallet before the key, so they
--      cannot deadlock by taking those locks in opposite orders;
--   2. if a key is revoked while a request is reserved, a later settlement or
--      stale-reservation recovery returns the unused amount to the master
--      wallet instead of putting it back on an inaccessible revoked key.

SET search_path = public;

-- Durable retry queue for the small window between an upstream success and a
-- failed edge-to-database settlement call. The request id remains the
-- idempotency key, so replaying a job cannot double-charge a customer.
CREATE TABLE IF NOT EXISTS public.api_usage_settlement_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id UUID NOT NULL REFERENCES public.api_usage_logs(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE,
  actual_customer_cents BIGINT NOT NULL CHECK (actual_customer_cents >= 0),
  upstream_cost_cents BIGINT NOT NULL CHECK (upstream_cost_cents >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_settlement_queue_ready_idx
  ON public.api_usage_settlement_queue(status, next_attempt_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.api_usage_settlement_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_usage_settlement_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_usage_settlement_queue TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_api_key(
  p_user_id UUID,
  p_key_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $revoke_api_key_hardened$
DECLARE
  v_key public.api_keys%ROWTYPE;
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_idempotency_key TEXT := COALESCE(
    NULLIF(btrim(COALESCE(v_metadata->>'idempotency_key', '')), ''),
    'revoke:' || p_key_id::TEXT
  );
  v_wallet_balance BIGINT;
  v_refund_cents BIGINT;
  v_transaction_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_key_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_KEY');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('api_key_money'),
    hashtext(p_user_id::TEXT || ':' || p_key_id::TEXT)
  );

  -- Match fund_api_key's wallet -> key order. The wallet row is created before
  -- either balance is read, so concurrent fund/revoke operations serialize.
  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT *
  INTO v_key
  FROM public.api_keys
  WHERE id = p_key_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_FOUND');
  END IF;

  v_refund_cents := v_key.balance_cents;

  IF v_refund_cents > 0 THEN
    UPDATE public.api_wallets
    SET balance_cents = balance_cents + v_refund_cents,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_cents INTO v_wallet_balance;

    UPDATE public.api_keys
    SET balance_cents = 0,
        status = 'revoked',
        updated_at = now()
    WHERE id = p_key_id;

    INSERT INTO public.api_wallet_transactions (
      user_id, key_id, type, amount_cents, balance_after_cents,
      source, idempotency_key, metadata
    ) VALUES (
      p_user_id, p_key_id, 'key_refund', v_refund_cents,
      v_wallet_balance, 'api_key_revoke', v_idempotency_key,
      v_metadata || jsonb_build_object('refunded_cents', v_refund_cents)
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_transaction_id;
  ELSE
    UPDATE public.api_keys
    SET status = 'revoked',
        updated_at = now()
    WHERE id = p_key_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', v_key.status = 'revoked' AND v_refund_cents = 0,
    'status', 'revoked',
    'refunded_cents', v_refund_cents,
    'wallet_balance_cents', v_wallet_balance,
    'transaction_id', v_transaction_id
  );
END;
$revoke_api_key_hardened$;

CREATE OR REPLACE FUNCTION public.settle_api_usage(
  p_request_id TEXT,
  p_actual_customer_cents BIGINT,
  p_upstream_cost_cents BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $settle_api_usage_hardened$
DECLARE
  v_usage public.api_usage_logs%ROWTYPE;
  v_key public.api_keys%ROWTYPE;
  v_diff BIGINT;
  v_balance BIGINT;
  v_total_spent BIGINT;
  v_status TEXT;
  v_settled_customer_cents BIGINT;
  v_refund_cents BIGINT;
  v_wallet_balance BIGINT;
  v_refund_transaction_id UUID;
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_input_tokens INTEGER := 0;
  v_output_tokens INTEGER := 0;
BEGIN
  IF p_request_id IS NULL OR length(btrim(p_request_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST_ID');
  END IF;
  IF p_actual_customer_cents IS NULL OR p_actual_customer_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_ACTUAL_AMOUNT');
  END IF;
  IF p_upstream_cost_cents IS NULL OR p_upstream_cost_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_UPSTREAM_COST');
  END IF;

  SELECT * INTO v_usage
  FROM public.api_usage_logs
  WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_REQUEST');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('settle_api_usage'),
    hashtext(v_usage.user_id::TEXT || ':' || p_request_id)
  );

  SELECT * INTO v_usage
  FROM public.api_usage_logs
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_usage.status <> 'reserved' THEN
    SELECT balance_cents INTO v_balance
    FROM public.api_keys
    WHERE id = v_usage.key_id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'usage_id', v_usage.id,
      'status', v_usage.status,
      'actual_customer_cents', v_usage.actual_customer_cents,
      'upstream_cost_cents', v_usage.upstream_cost_cents,
      'key_balance_cents', v_balance
    );
  END IF;

  -- Keep the same wallet -> key order as fund_api_key and revoke_api_key.
  -- Settlement normally does not need to change the wallet, but it does when
  -- a revoked key's unused reservation is refunded to the master wallet.
  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (v_usage.user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = v_usage.user_id
  FOR UPDATE;

  SELECT * INTO v_key
  FROM public.api_keys
  WHERE id = v_usage.key_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_FOUND');
  END IF;

  v_diff := p_actual_customer_cents - v_usage.reserved_cents;
  v_input_tokens := CASE
    WHEN COALESCE(v_metadata->>'input_tokens', '') ~ '^[0-9]+$'
      THEN LEAST((v_metadata->>'input_tokens')::BIGINT, 2147483647)::INTEGER
    ELSE 0
  END;
  v_output_tokens := CASE
    WHEN COALESCE(v_metadata->>'output_tokens', '') ~ '^[0-9]+$'
      THEN LEAST((v_metadata->>'output_tokens')::BIGINT, 2147483647)::INTEGER
    ELSE 0
  END;

  -- Revoke can refund the currently available key balance while a request is
  -- still in flight. Any later surplus refund must go to the wallet, and an
  -- observed amount above the reservation is capped because the revoked key
  -- cannot receive an additional customer charge.
  IF v_key.status = 'revoked' THEN
    v_settled_customer_cents := LEAST(
      p_actual_customer_cents,
      v_usage.reserved_cents
    );
    v_status := CASE
      WHEN v_settled_customer_cents > 0 THEN 'succeeded'
      ELSE 'failed'
    END;

    IF p_actual_customer_cents < v_usage.reserved_cents THEN
      v_refund_cents := v_usage.reserved_cents - p_actual_customer_cents;
      INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
      VALUES (v_usage.user_id, 0, 0)
      ON CONFLICT (user_id) DO NOTHING;

      SELECT balance_cents INTO v_wallet_balance
      FROM public.api_wallets
      WHERE user_id = v_usage.user_id
      FOR UPDATE;

      UPDATE public.api_wallets
      SET balance_cents = balance_cents + v_refund_cents,
          updated_at = now()
      WHERE user_id = v_usage.user_id
      RETURNING balance_cents INTO v_wallet_balance;

      INSERT INTO public.api_wallet_transactions (
        user_id, key_id, type, amount_cents, balance_after_cents,
        source, idempotency_key, metadata
      ) VALUES (
        v_usage.user_id, v_usage.key_id, 'key_refund', v_refund_cents,
        v_wallet_balance, 'api_usage_settlement',
        'usage-refund:' || v_usage.id::TEXT,
        v_metadata || jsonb_build_object(
          'refund_cents', v_refund_cents,
          'request_id', p_request_id,
          'reason', 'revoked_key_settlement'
        )
      )
      ON CONFLICT (user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
      DO NOTHING
      RETURNING id INTO v_refund_transaction_id;
    ELSIF p_actual_customer_cents > v_usage.reserved_cents THEN
      v_metadata := v_metadata || jsonb_build_object(
        'settlement_adjustment', 'capped_to_reservation',
        'requested_customer_cents', p_actual_customer_cents
      );
    END IF;

    UPDATE public.api_keys
    SET balance_cents = 0,
        total_spent_cents = total_spent_cents + v_settled_customer_cents,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_usage.key_id
    RETURNING balance_cents, total_spent_cents
    INTO v_balance, v_total_spent;

    UPDATE public.api_usage_logs
    SET status = v_status,
        actual_customer_cents = v_settled_customer_cents,
        upstream_cost_cents = p_upstream_cost_cents,
        input_tokens = v_input_tokens,
        output_tokens = v_output_tokens,
        total_tokens = v_input_tokens + v_output_tokens,
        metadata = v_metadata,
        settled_at = now(),
        updated_at = now()
    WHERE id = v_usage.id;

    RETURN jsonb_build_object(
      'ok', true, 'idempotent', false, 'status', v_status,
      'usage_id', v_usage.id,
      'reserved_cents', v_usage.reserved_cents,
      'actual_customer_cents', v_settled_customer_cents,
      'upstream_cost_cents', p_upstream_cost_cents,
      'key_balance_cents', v_balance,
      'total_spent_cents', v_total_spent,
      'wallet_refund_cents', COALESCE(v_refund_cents, 0),
      'wallet_transaction_id', v_refund_transaction_id
    );
  END IF;

  IF v_diff > 0 AND v_key.balance_cents < v_diff THEN
    v_status := CASE WHEN p_actual_customer_cents > 0 THEN 'succeeded' ELSE 'failed' END;
    v_metadata := v_metadata || jsonb_build_object(
      'settlement_adjustment', 'capped_to_reservation',
      'requested_customer_cents', p_actual_customer_cents,
      'required_extra_cents', v_diff
    );

    UPDATE public.api_keys
    SET total_spent_cents = total_spent_cents + v_usage.reserved_cents,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_usage.key_id
    RETURNING balance_cents, total_spent_cents
    INTO v_balance, v_total_spent;

    UPDATE public.api_usage_logs
    SET status = v_status,
        actual_customer_cents = v_usage.reserved_cents,
        upstream_cost_cents = p_upstream_cost_cents,
        input_tokens = v_input_tokens,
        output_tokens = v_output_tokens,
        total_tokens = v_input_tokens + v_output_tokens,
        metadata = v_metadata,
        settled_at = now(),
        updated_at = now()
    WHERE id = v_usage.id;

    RETURN jsonb_build_object(
      'ok', true, 'idempotent', false, 'adjusted', true,
      'usage_id', v_usage.id, 'status', v_status,
      'reserved_cents', v_usage.reserved_cents,
      'actual_customer_cents', v_usage.reserved_cents,
      'requested_customer_cents', p_actual_customer_cents,
      'upstream_cost_cents', p_upstream_cost_cents,
      'key_balance_cents', v_balance, 'total_spent_cents', v_total_spent
    );
  END IF;

  v_status := CASE WHEN p_actual_customer_cents > 0 THEN 'succeeded' ELSE 'failed' END;
  UPDATE public.api_keys
  SET balance_cents = balance_cents - v_diff,
      total_spent_cents = total_spent_cents + p_actual_customer_cents,
      last_used_at = now(),
      updated_at = now()
  WHERE id = v_usage.key_id
  RETURNING balance_cents, total_spent_cents
  INTO v_balance, v_total_spent;

  UPDATE public.api_usage_logs
  SET status = v_status,
      actual_customer_cents = p_actual_customer_cents,
      upstream_cost_cents = p_upstream_cost_cents,
      input_tokens = v_input_tokens,
      output_tokens = v_output_tokens,
      total_tokens = v_input_tokens + v_output_tokens,
      metadata = v_metadata,
      settled_at = now(),
      updated_at = now()
  WHERE id = v_usage.id;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'usage_id', v_usage.id,
    'status', v_status, 'reserved_cents', v_usage.reserved_cents,
    'actual_customer_cents', p_actual_customer_cents,
    'upstream_cost_cents', p_upstream_cost_cents,
    'key_balance_cents', v_balance, 'total_spent_cents', v_total_spent
  );
END;
$settle_api_usage_hardened$;

CREATE OR REPLACE FUNCTION public.expire_stale_api_usage(
  p_max_age_seconds INTEGER DEFAULT 1800
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire_stale_api_usage_hardened$
DECLARE
  v_usage RECORD;
  v_key_status TEXT;
  v_wallet_balance BIGINT;
  v_refund_transaction_id UUID;
  v_refund_count INTEGER := 0;
  v_max_age_seconds INTEGER := GREATEST(COALESCE(p_max_age_seconds, 1800), 900);
BEGIN
  FOR v_usage IN
    SELECT id, user_id, key_id, reserved_cents
    FROM public.api_usage_logs
    WHERE status = 'reserved'
      AND reserved_at < now() - make_interval(secs => v_max_age_seconds)
    ORDER BY reserved_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_key_status := NULL;
    v_wallet_balance := NULL;
    v_refund_transaction_id := NULL;

    -- Keep the same wallet -> key order as fund_api_key, revoke_api_key and
    -- settle_api_usage. Without this, stale-recovery could hold a key lock
    -- while waiting for the wallet that revoke is holding.
    INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
    VALUES (v_usage.user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance_cents INTO v_wallet_balance
    FROM public.api_wallets
    WHERE user_id = v_usage.user_id
    FOR UPDATE;

    IF v_usage.key_id IS NOT NULL THEN
      SELECT status INTO v_key_status
      FROM public.api_keys
      WHERE id = v_usage.key_id
      FOR UPDATE;

      IF v_key_status = 'revoked' THEN
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
          user_id, key_id, type, amount_cents, balance_after_cents,
          source, idempotency_key, metadata
        ) VALUES (
          v_usage.user_id, v_usage.key_id, 'key_refund', v_usage.reserved_cents,
          v_wallet_balance, 'api_usage_settlement',
          'usage-refund:' || v_usage.id::TEXT,
          jsonb_build_object(
            'refund_cents', v_usage.reserved_cents,
            'reason', 'stale_reservation_revoked_key'
          )
        )
        ON CONFLICT (user_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_refund_transaction_id;
      ELSIF v_key_status IS NOT NULL THEN
        UPDATE public.api_keys
        SET balance_cents = balance_cents + v_usage.reserved_cents,
            updated_at = now()
        WHERE id = v_usage.key_id;
      END IF;
    END IF;

    UPDATE public.api_usage_logs
    SET status = 'failed',
        actual_customer_cents = 0,
        upstream_cost_cents = 0,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'reconciliation', 'stale_reservation_refund',
          'refund_cents', v_usage.reserved_cents,
          'max_age_seconds', v_max_age_seconds,
          'refund_destination', CASE
            WHEN v_key_status = 'revoked' THEN 'wallet'
            ELSE 'key'
          END
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
$expire_stale_api_usage_hardened$;

COMMENT ON FUNCTION public.revoke_api_key(UUID, UUID, JSONB) IS
  'Permanently revoke a key using wallet-before-key lock order and return its unused balance to the master wallet.';

COMMENT ON FUNCTION public.settle_api_usage(TEXT, BIGINT, BIGINT, JSONB) IS
  'Close a reservation idempotently; refunds revoked-key reservations to the master wallet and caps unfunded extra usage.';

COMMENT ON FUNCTION public.expire_stale_api_usage(INTEGER) IS
  'Refund stale reservations to the active key or, when the key was revoked, to the master wallet.';

CREATE OR REPLACE FUNCTION public.queue_api_usage_settlement(
  p_request_id TEXT,
  p_actual_customer_cents BIGINT,
  p_upstream_cost_cents BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $queue_api_usage_settlement$
DECLARE
  v_usage_id UUID;
BEGIN
  IF p_request_id IS NULL OR length(btrim(p_request_id)) = 0
     OR p_actual_customer_cents IS NULL OR p_actual_customer_cents < 0
     OR p_upstream_cost_cents IS NULL OR p_upstream_cost_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SETTLEMENT');
  END IF;

  SELECT id INTO v_usage_id
  FROM public.api_usage_logs
  WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_REQUEST');
  END IF;

  INSERT INTO public.api_usage_settlement_queue (
    usage_id, request_id, actual_customer_cents, upstream_cost_cents, metadata
  ) VALUES (
    v_usage_id, p_request_id, p_actual_customer_cents,
    p_upstream_cost_cents, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (request_id) DO UPDATE
  SET actual_customer_cents = EXCLUDED.actual_customer_cents,
      upstream_cost_cents = EXCLUDED.upstream_cost_cents,
      metadata = EXCLUDED.metadata,
      status = CASE
        WHEN public.api_usage_settlement_queue.status = 'succeeded'
          THEN public.api_usage_settlement_queue.status
        ELSE 'pending'
      END,
      next_attempt_at = CASE
        WHEN public.api_usage_settlement_queue.status = 'succeeded'
          THEN public.api_usage_settlement_queue.next_attempt_at
        ELSE now()
      END,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'usage_id', v_usage_id
  );
END;
$queue_api_usage_settlement$;

CREATE OR REPLACE FUNCTION public.process_api_usage_settlement_queue(
  p_batch_size INTEGER DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $process_api_usage_settlement_queue$
DECLARE
  v_job RECORD;
  v_result JSONB;
  v_processed INTEGER := 0;
  v_succeeded INTEGER := 0;
  v_dead INTEGER := 0;
  v_batch_size INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 50), 1), 100);
  v_error TEXT;
BEGIN
  FOR v_job IN
    SELECT *
    FROM public.api_usage_settlement_queue
    WHERE (
      status = 'pending'
      AND next_attempt_at <= now()
    ) OR (
      status = 'processing'
      AND updated_at < now() - interval '10 minutes'
    )
    ORDER BY next_attempt_at, created_at
    LIMIT v_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.api_usage_settlement_queue
    SET status = 'processing',
        attempts = attempts + 1,
        updated_at = now()
    WHERE id = v_job.id;

    v_result := public.settle_api_usage(
      v_job.request_id,
      v_job.actual_customer_cents,
      v_job.upstream_cost_cents,
      v_job.metadata
    );

    IF COALESCE((v_result->>'ok')::BOOLEAN, false) THEN
      UPDATE public.api_usage_settlement_queue
      SET status = 'succeeded',
          last_error = NULL,
          updated_at = now()
      WHERE id = v_job.id;
      v_succeeded := v_succeeded + 1;
    ELSE
      v_error := COALESCE(v_result->>'error', 'SETTLEMENT_FAILED');
      UPDATE public.api_usage_settlement_queue
      SET status = CASE WHEN v_job.attempts + 1 >= 12 THEN 'dead' ELSE 'pending' END,
          next_attempt_at = now() + make_interval(
            mins => LEAST(60, GREATEST(1, (v_job.attempts + 1) * 5))
          ),
          last_error = left(v_error, 200),
          updated_at = now()
      WHERE id = v_job.id;
      IF v_job.attempts + 1 >= 12 THEN v_dead := v_dead + 1; END IF;
    END IF;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'processed_count', v_processed,
    'succeeded_count', v_succeeded,
    'dead_count', v_dead,
    'batch_size', v_batch_size
  );
END;
$process_api_usage_settlement_queue$;

REVOKE ALL ON FUNCTION public.queue_api_usage_settlement(TEXT, BIGINT, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_api_usage_settlement(TEXT, BIGINT, BIGINT, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.process_api_usage_settlement_queue(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_api_usage_settlement_queue(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.queue_api_usage_settlement(TEXT, BIGINT, BIGINT, JSONB) IS
  'Persist an observed upstream usage charge for durable idempotent settlement retry.';

COMMENT ON FUNCTION public.process_api_usage_settlement_queue(INTEGER) IS
  'Retry queued API usage settlements from the service-role scheduler with bounded backoff.';
