-- API marketplace shared-wallet accounting.
--
-- Keys are authentication credentials only. All active keys belonging to a
-- user spend from the same api_wallets row. The legacy api_keys.balance_cents
-- column remains for schema compatibility and historical reads, but is
-- migrated to the user wallet and is no longer a source of truth.

SET search_path = public;

-- Keep old transaction types readable while adding explicit shared-wallet
-- reservation/settlement entries for the user-facing ledger.
ALTER TABLE public.api_wallet_transactions
  DROP CONSTRAINT IF EXISTS api_wallet_transactions_type_check;

ALTER TABLE public.api_wallet_transactions
  ADD CONSTRAINT api_wallet_transactions_type_check
  CHECK (
    type IN (
      'deposit',
      'key_fund',
      'key_refund',
      'manual_adjustment',
      'usage_charge',
      'usage_refund'
    )
  );

-- Move any balance created by the retired per-key funding flow back to the
-- account wallet exactly once. This is a no-op after the key balance has been
-- cleared, so it is safe to rehearse against a restored database.
DO $shared_wallet_key_migration$
DECLARE
  v_key RECORD;
  v_wallet_balance BIGINT;
BEGIN
  FOR v_key IN
    SELECT id, user_id, balance_cents
    FROM public.api_keys
    WHERE balance_cents > 0
    ORDER BY user_id, id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('shared_wallet_key_migration'),
      hashtext(v_key.id::TEXT)
    );

    INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
    VALUES (v_key.user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.api_wallets
    SET balance_cents = balance_cents + v_key.balance_cents,
        updated_at = now()
    WHERE user_id = v_key.user_id
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
      v_key.user_id,
      v_key.id,
      'manual_adjustment',
      v_key.balance_cents,
      v_wallet_balance,
      'shared_wallet_migration',
      'shared-wallet-key:' || v_key.id::TEXT,
      jsonb_build_object(
        'reason', 'migrate_legacy_key_balance',
        'key_id', v_key.id,
        'migrated_cents', v_key.balance_cents
      )
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING;

    UPDATE public.api_keys
    SET balance_cents = 0,
        updated_at = now()
    WHERE id = v_key.id
      AND balance_cents = v_key.balance_cents;
  END LOOP;
END;
$shared_wallet_key_migration$;

-- The old endpoint is retired. Keeping the function definition allows old
-- migration history to remain valid, while revoking execution prevents any
-- caller from moving wallet money into a key again.
REVOKE EXECUTE ON FUNCTION public.fund_api_key(UUID, UUID, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reserve_api_wallet: atomically reserve from the shared account wallet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_api_wallet(
  p_key_id UUID,
  p_user_id UUID,
  p_request_id TEXT,
  p_amount_cents BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $reserve_api_wallet_shared$
DECLARE
  v_usage public.api_usage_logs%ROWTYPE;
  v_key public.api_keys%ROWTYPE;
  v_wallet_balance BIGINT;
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_request_id IS NULL OR length(btrim(p_request_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST_ID');
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('reserve_api_wallet'),
    hashtext(p_user_id::TEXT || ':' || p_request_id)
  );

  SELECT * INTO v_usage
  FROM public.api_usage_logs
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_usage.user_id <> p_user_id OR v_usage.key_id IS DISTINCT FROM p_key_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REQUEST_ID_CONFLICT');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'usage_id', v_usage.id,
      'status', v_usage.status,
      'reserved_cents', v_usage.reserved_cents
    );
  END IF;

  -- Wallet is locked before the key, matching revoke and the legacy funding
  -- lock order. This prevents account/key money deadlocks during rotation.
  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT * INTO v_key
  FROM public.api_keys
  WHERE id = p_key_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_FOUND');
  END IF;
  IF v_key.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_OWNERSHIP_MISMATCH');
  END IF;
  IF v_key.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_ACTIVE', 'status', v_key.status);
  END IF;
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_EXPIRED');
  END IF;
  IF v_wallet_balance < p_amount_cents THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_WALLET_BALANCE',
      'required_cents', p_amount_cents,
      'wallet_balance_cents', v_wallet_balance
    );
  END IF;

  UPDATE public.api_wallets
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_wallet_balance;

  INSERT INTO public.api_usage_logs (
    user_id,
    key_id,
    request_id,
    status,
    model,
    endpoint,
    reserved_cents,
    actual_customer_cents,
    upstream_cost_cents,
    metadata
  ) VALUES (
    p_user_id,
    p_key_id,
    p_request_id,
    'reserved',
    COALESCE(NULLIF(v_metadata->>'model', ''), ''),
    COALESCE(NULLIF(v_metadata->>'endpoint', ''), ''),
    p_amount_cents,
    0,
    0,
    v_metadata
  )
  RETURNING * INTO v_usage;

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
    p_user_id,
    p_key_id,
    'usage_charge',
    -p_amount_cents,
    v_wallet_balance,
    'api_usage_reservation',
    'usage-reserve:' || p_request_id,
    v_metadata || jsonb_build_object(
      'request_id', p_request_id,
      'reserved_cents', p_amount_cents
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'usage_id', v_usage.id,
    'status', 'reserved',
    'reserved_cents', p_amount_cents,
    'wallet_balance_cents', v_wallet_balance
  );
END;
$reserve_api_wallet_shared$;

-- ---------------------------------------------------------------------------
-- settle_api_usage: close the wallet reservation and settle the delta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_api_usage(
  p_request_id TEXT,
  p_actual_customer_cents BIGINT,
  p_upstream_cost_cents BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $settle_api_usage_shared$
DECLARE
  v_usage public.api_usage_logs%ROWTYPE;
  v_key public.api_keys%ROWTYPE;
  v_wallet_balance BIGINT;
  v_diff BIGINT;
  v_refund_cents BIGINT := 0;
  v_settled_customer_cents BIGINT;
  v_status TEXT;
  v_total_spent BIGINT := 0;
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
    SELECT balance_cents INTO v_wallet_balance
    FROM public.api_wallets
    WHERE user_id = v_usage.user_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'usage_id', v_usage.id,
      'status', v_usage.status,
      'actual_customer_cents', v_usage.actual_customer_cents,
      'upstream_cost_cents', v_usage.upstream_cost_cents,
      'wallet_balance_cents', v_wallet_balance
    );
  END IF;

  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (v_usage.user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = v_usage.user_id
  FOR UPDATE;

  -- Keep the same wallet -> key order as reserve/revoke. The key is only
  -- updated for per-key usage statistics; its balance is never charged.
  IF v_usage.key_id IS NOT NULL THEN
    SELECT * INTO v_key
    FROM public.api_keys
    WHERE id = v_usage.key_id
    FOR UPDATE;
  END IF;

  v_settled_customer_cents := p_actual_customer_cents;
  v_diff := p_actual_customer_cents - v_usage.reserved_cents;

  IF v_diff > 0 AND v_wallet_balance < v_diff THEN
    v_settled_customer_cents := v_usage.reserved_cents;
    v_metadata := v_metadata || jsonb_build_object(
      'settlement_adjustment', 'capped_to_reservation',
      'requested_customer_cents', p_actual_customer_cents,
      'required_extra_cents', v_diff
    );
    v_diff := 0;
  END IF;

  IF v_settled_customer_cents < v_usage.reserved_cents THEN
    v_refund_cents := v_usage.reserved_cents - v_settled_customer_cents;
    UPDATE public.api_wallets
    SET balance_cents = balance_cents + v_refund_cents,
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
      v_refund_cents,
      v_wallet_balance,
      'api_usage_settlement',
      'usage-refund:' || v_usage.id::TEXT,
      v_metadata || jsonb_build_object(
        'request_id', p_request_id,
        'refund_cents', v_refund_cents
      )
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING;
  ELSIF v_settled_customer_cents > v_usage.reserved_cents THEN
    UPDATE public.api_wallets
    SET balance_cents = balance_cents - (v_settled_customer_cents - v_usage.reserved_cents),
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
      'usage_charge',
      -(v_settled_customer_cents - v_usage.reserved_cents),
      v_wallet_balance,
      'api_usage_settlement',
      'usage-extra:' || v_usage.id::TEXT,
      v_metadata || jsonb_build_object(
        'request_id', p_request_id,
        'extra_charge_cents', v_settled_customer_cents - v_usage.reserved_cents
      )
    )
    ON CONFLICT (user_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
    DO NOTHING;
  END IF;

  v_status := CASE WHEN v_settled_customer_cents > 0 THEN 'succeeded' ELSE 'failed' END;
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

  IF v_usage.key_id IS NOT NULL AND v_key.id IS NOT NULL THEN
    UPDATE public.api_keys
    SET total_spent_cents = total_spent_cents + v_settled_customer_cents,
        last_used_at = now(),
        updated_at = now()
    WHERE id = v_usage.key_id
    RETURNING total_spent_cents INTO v_total_spent;
  END IF;

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
    'ok', true,
    'idempotent', false,
    'usage_id', v_usage.id,
    'status', v_status,
    'reserved_cents', v_usage.reserved_cents,
    'actual_customer_cents', v_settled_customer_cents,
    'upstream_cost_cents', p_upstream_cost_cents,
    'wallet_balance_cents', v_wallet_balance,
    'wallet_refund_cents', v_refund_cents,
    'total_spent_cents', v_total_spent
  );
END;
$settle_api_usage_shared$;

-- Shared-wallet stale recovery always returns the reservation to the wallet;
-- it never attempts to restore quota to an API key.
CREATE OR REPLACE FUNCTION public.expire_stale_api_usage(
  p_max_age_seconds INTEGER DEFAULT 900
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire_stale_api_usage_shared$
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
$expire_stale_api_usage_shared$;

COMMENT ON FUNCTION public.reserve_api_wallet(UUID, UUID, TEXT, BIGINT, JSONB) IS
  'Reserve integer cents from the user account wallet; API keys are authentication-only.';

COMMENT ON FUNCTION public.settle_api_usage(TEXT, BIGINT, BIGINT, JSONB) IS
  'Settle a shared-wallet API reservation with an idempotent charge/refund delta.';

COMMENT ON FUNCTION public.expire_stale_api_usage(INTEGER) IS
  'Refund stale API reservations to the account wallet.';
