-- API marketplace: user rechargable wallet, per-key spendable quota, and
-- per-request reservation/settlement ledger for the Tuzi-reseller model.
--
-- Accounting model
--   * api_wallets is the master account. Money only enters via
--     grant_api_wallet_credit (integer cents, positive).
--   * Funding a key (wallet -> key) is a 'key_fund' wallet transaction; the
--     key balance is the spendable quota enforced at request time.
--   * reserve_api_wallet atomically deducts the reservation from the key
--     balance and creates a 'reserved' usage row. It runs BEFORE any upstream
--     call so an upstream success can never exceed the customer's balance.
--   * settle_api_usage closes a reservation by the final amount: refunds the
--     difference when actual < reserved, or charges the extra when actual >
--     reserved. If the extra cannot be funded, it caps the customer charge at
--     the reservation and records the adjustment. It is idempotent per request_id.

SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Recharge packages (public catalog; prices in integer cents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_credit_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0),
  credit_cents BIGINT NOT NULL CHECK (credit_cents > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep the first catalog deterministic, while allowing later admin edits to
-- remain untouched. `price_cents` is CNY fen; `credit_cents` is USD cents of
-- API spending power, matching the upstream quota unit.
INSERT INTO public.api_credit_packages (id, name, price_cents, credit_cents, sort_order, metadata)
VALUES
  ('api_cny_10', '¥10 充值', 1000, 100, 10, '{"price_currency":"CNY","credit_currency":"USD","kind":"api_balance"}'::jsonb),
  ('api_cny_50', '¥50 充值', 5000, 500, 20, '{"price_currency":"CNY","credit_currency":"USD","kind":"api_balance"}'::jsonb),
  ('api_cny_100', '¥100 充值', 10000, 1000, 30, '{"price_currency":"CNY","credit_currency":"USD","kind":"api_balance"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) User API keys (each key carries its own spendable balance in cents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 64),
  -- Visible prefix only; the full secret is never stored in plaintext.
  key_prefix TEXT NOT NULL CHECK (length(key_prefix) BETWEEN 4 AND 32),
  -- sha256 hex of the full secret; used for lookup when a request presents a key.
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  -- Reference to the Tuzi-side key (pool assignment / quota mirror), if any.
  upstream_key_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'revoked')),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_spent_cents BIGINT NOT NULL DEFAULT 0 CHECK (total_spent_cents >= 0),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx
  ON public.api_keys(key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_prefix_idx
  ON public.api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS api_keys_user_status_idx
  ON public.api_keys(user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Master wallet per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_deposited_cents BIGINT NOT NULL DEFAULT 0
    CHECK (total_deposited_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4) Wallet ledger (deposits, wallet -> key funding, key refunds)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN ('deposit', 'key_fund', 'key_refund', 'manual_adjustment')),
  -- Signed: positive adds to the wallet, negative removes from it.
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents BIGINT NOT NULL CHECK (balance_after_cents >= 0),
  source TEXT NOT NULL DEFAULT 'manual',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_wallet_transactions_idempotency_idx
  ON public.api_wallet_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_wallet_transactions_user_created_idx
  ON public.api_wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_wallet_transactions_key_idx
  ON public.api_wallet_transactions(key_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5) Per-request usage ledger (reservation -> settlement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'succeeded', 'failed')),
  model TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  reserved_cents BIGINT NOT NULL DEFAULT 0 CHECK (reserved_cents >= 0),
  actual_customer_cents BIGINT NOT NULL DEFAULT 0
    CHECK (actual_customer_cents >= 0),
  upstream_cost_cents BIGINT NOT NULL DEFAULT 0
    CHECK (upstream_cost_cents >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_usage_logs_request_id_unique UNIQUE (request_id)
);

CREATE INDEX IF NOT EXISTS api_usage_logs_user_created_idx
  ON public.api_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_logs_key_idx
  ON public.api_usage_logs(key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_logs_reserved_open_idx
  ON public.api_usage_logs(status, created_at)
  WHERE status = 'reserved';

-- ---------------------------------------------------------------------------
-- RLS: users read only their own wallet / transactions / keys / usage logs;
-- packages are a public catalog. All writes happen through service role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credit_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own api wallet" ON public.api_wallets;
CREATE POLICY "Users read own api wallet"
  ON public.api_wallets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own api wallet transactions"
  ON public.api_wallet_transactions;
CREATE POLICY "Users read own api wallet transactions"
  ON public.api_wallet_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own api keys" ON public.api_keys;
CREATE POLICY "Users read own api keys"
  ON public.api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own api usage logs" ON public.api_usage_logs;
CREATE POLICY "Users read own api usage logs"
  ON public.api_usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read api credit packages"
  ON public.api_credit_packages;
CREATE POLICY "Anyone can read api credit packages"
  ON public.api_credit_packages
  FOR SELECT
  USING (true);

REVOKE ALL ON public.api_wallets FROM PUBLIC;
GRANT SELECT ON public.api_wallets TO authenticated;
GRANT ALL ON public.api_wallets TO service_role;

REVOKE ALL ON public.api_wallet_transactions FROM PUBLIC;
GRANT SELECT ON public.api_wallet_transactions TO authenticated;
GRANT ALL ON public.api_wallet_transactions TO service_role;

REVOKE ALL ON public.api_keys FROM PUBLIC;
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

REVOKE ALL ON public.api_usage_logs FROM PUBLIC;
GRANT SELECT ON public.api_usage_logs TO authenticated;
GRANT ALL ON public.api_usage_logs TO service_role;

REVOKE ALL ON public.api_credit_packages FROM PUBLIC;
GRANT SELECT ON public.api_credit_packages TO anon, authenticated;
GRANT ALL ON public.api_credit_packages TO service_role;

-- ---------------------------------------------------------------------------
-- grant_api_wallet_credit: idempotent wallet top-up (integer cents).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_api_wallet_credit(
  p_user_id UUID,
  p_amount_cents BIGINT,
  p_source TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $grant_api_wallet_credit$
DECLARE
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_idempotency_key TEXT := NULLIF(btrim(COALESCE(v_metadata->>'idempotency_key', '')), '');
  v_balance BIGINT;
  v_transaction_id UUID;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF p_source IS NULL OR length(btrim(p_source)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('grant_api_wallet_credit'),
      hashtext(p_user_id::TEXT || ':' || v_idempotency_key)
    );

    SELECT id, balance_after_cents
    INTO v_transaction_id, v_balance
    FROM public.api_wallet_transactions
    WHERE user_id = p_user_id
      AND idempotency_key = v_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'balance_cents', v_balance,
        'transaction_id', v_transaction_id
      );
    END IF;
  END IF;

  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (p_user_id, p_amount_cents, p_amount_cents)
  ON CONFLICT (user_id) DO UPDATE SET
    balance_cents = public.api_wallets.balance_cents + p_amount_cents,
    total_deposited_cents = public.api_wallets.total_deposited_cents + p_amount_cents,
    updated_at = now()
  RETURNING balance_cents
  INTO v_balance;

  INSERT INTO public.api_wallet_transactions (
    user_id,
    type,
    amount_cents,
    balance_after_cents,
    source,
    idempotency_key,
    metadata
  ) VALUES (
    p_user_id,
    'deposit',
    p_amount_cents,
    v_balance,
    p_source,
    v_idempotency_key,
    v_metadata
  )
  RETURNING id
  INTO v_transaction_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'balance_cents', v_balance,
    'transaction_id', v_transaction_id
  );
END;
$grant_api_wallet_credit$;

-- ---------------------------------------------------------------------------
-- fund_api_key: move already-paid wallet balance into one spendable key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fund_api_key(
  p_user_id UUID,
  p_key_id UUID,
  p_amount_cents BIGINT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fund_api_key$
DECLARE
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
  v_idempotency_key TEXT := NULLIF(btrim(COALESCE(v_metadata->>'idempotency_key', '')), '');
  v_wallet_balance BIGINT;
  v_key_balance BIGINT;
  v_transaction_id UUID;
  v_existing_key_id UUID;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('fund_api_key'),
      hashtext(p_user_id::TEXT || ':' || v_idempotency_key)
    );

    SELECT id, key_id, balance_after_cents
    INTO v_transaction_id, v_existing_key_id, v_wallet_balance
    FROM public.api_wallet_transactions
    WHERE user_id = p_user_id
      AND idempotency_key = v_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT balance_cents INTO v_key_balance
      FROM public.api_keys
      WHERE id = v_existing_key_id;
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'wallet_balance_cents', v_wallet_balance,
        'key_balance_cents', v_key_balance,
        'transaction_id', v_transaction_id
      );
    END IF;
  END IF;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet_balance < p_amount_cents THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_WALLET_BALANCE',
      'wallet_balance_cents', COALESCE(v_wallet_balance, 0),
      'required_cents', p_amount_cents
    );
  END IF;

  SELECT balance_cents
  INTO v_key_balance
  FROM public.api_keys
  WHERE id = p_key_id
    AND user_id = p_user_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_FOUND_OR_INACTIVE');
  END IF;

  UPDATE public.api_wallets
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_wallet_balance;

  UPDATE public.api_keys
  SET balance_cents = balance_cents + p_amount_cents,
      updated_at = now()
  WHERE id = p_key_id
  RETURNING balance_cents INTO v_key_balance;

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
    'key_fund',
    -p_amount_cents,
    v_wallet_balance,
    'api_key_fund',
    v_idempotency_key,
    v_metadata
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'wallet_balance_cents', v_wallet_balance,
    'key_balance_cents', v_key_balance,
    'transaction_id', v_transaction_id
  );
END;
$fund_api_key$;

-- ---------------------------------------------------------------------------
-- revoke_api_key: permanently revoke a key and atomically return any unused
-- key balance to the user's master wallet. This prevents funds from becoming
-- unreachable when a key is retired.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_api_key(
  p_user_id UUID,
  p_key_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $revoke_api_key$
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
    hashtext('revoke_api_key'),
    hashtext(p_user_id::TEXT || ':' || p_key_id::TEXT)
  );

  SELECT *
  INTO v_key
  FROM public.api_keys
  WHERE id = p_key_id
  FOR UPDATE;

  IF NOT FOUND OR v_key.user_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'KEY_NOT_FOUND');
  END IF;

  v_refund_cents := v_key.balance_cents;

  INSERT INTO public.api_wallets (user_id, balance_cents, total_deposited_cents)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance_cents
  INTO v_wallet_balance
  FROM public.api_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

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
      'key_refund',
      v_refund_cents,
      v_wallet_balance,
      'api_key_revoke',
      v_idempotency_key,
      v_metadata || jsonb_build_object('refunded_cents', v_refund_cents)
    )
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
$revoke_api_key$;

-- ---------------------------------------------------------------------------
-- reserve_api_wallet: atomic pre-charge against the key balance BEFORE the
-- upstream call. Creates the unique request_id usage row and deducts the
-- reservation from the key in the same transaction.
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
AS $reserve_api_wallet$
DECLARE
  v_usage public.api_usage_logs%ROWTYPE;
  v_key public.api_keys%ROWTYPE;
  v_balance BIGINT;
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

  SELECT *
  INTO v_usage
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

  SELECT *
  INTO v_key
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

  IF v_key.balance_cents < p_amount_cents THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'INSUFFICIENT_KEY_BALANCE',
      'required_cents', p_amount_cents,
      'key_balance_cents', v_key.balance_cents
    );
  END IF;

  UPDATE public.api_keys
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE id = p_key_id
  RETURNING balance_cents
  INTO v_balance;

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
  RETURNING id
  INTO v_usage.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'usage_id', v_usage.id,
    'status', 'reserved',
    'reserved_cents', p_amount_cents,
    'key_balance_cents', v_balance
  );
END;
$reserve_api_wallet$;

-- ---------------------------------------------------------------------------
-- settle_api_usage: closes a reservation by the final amount. Refunds the
-- difference when actual < reserved, or charges the extra when actual >
-- reserved. Idempotent per request_id; never drives a key balance below zero
-- (returns ok=false and leaves the reservation open instead).
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
AS $settle_api_usage$
DECLARE
  v_usage public.api_usage_logs%ROWTYPE;
  v_key public.api_keys%ROWTYPE;
  v_diff BIGINT;
  v_balance BIGINT;
  v_total_spent BIGINT;
  v_status TEXT;
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

  SELECT *
  INTO v_usage
  FROM public.api_usage_logs
  WHERE request_id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'UNKNOWN_REQUEST',
      'request_id', p_request_id
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('settle_api_usage'),
    hashtext(v_usage.user_id::TEXT || ':' || p_request_id)
  );

  SELECT *
  INTO v_usage
  FROM public.api_usage_logs
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_usage.status <> 'reserved' THEN
    SELECT balance_cents
    INTO v_balance
    FROM public.api_keys
    WHERE id = v_usage.key_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'usage_id', v_usage.id,
      'status', v_usage.status,
      'actual_customer_cents', v_usage.actual_customer_cents,
      'upstream_cost_cents', v_usage.upstream_cost_cents,
      'key_balance_cents', v_balance
    );
  END IF;

  SELECT *
  INTO v_key
  FROM public.api_keys
  WHERE id = v_usage.key_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'KEY_NOT_FOUND',
      'usage_id', v_usage.id
    );
  END IF;

  v_diff := p_actual_customer_cents - v_usage.reserved_cents;

  v_input_tokens := COALESCE(NULLIF(v_metadata->>'input_tokens', '')::INTEGER, 0);
  v_output_tokens := COALESCE(NULLIF(v_metadata->>'output_tokens', '')::INTEGER, 0);

  IF v_diff > 0 AND v_key.balance_cents < v_diff THEN
    -- The upstream request has already completed, but the reservation cannot
    -- fund the full observed usage. Close the ledger at the reserved amount
    -- instead of leaving money permanently stuck in `reserved`. The
    -- adjustment is recorded for reconciliation and the user is never
    -- charged beyond the balance that was available before the request.
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
      'ok', true,
      'idempotent', false,
      'adjusted', true,
      'usage_id', v_usage.id,
      'status', v_status,
      'reserved_cents', v_usage.reserved_cents,
      'actual_customer_cents', v_usage.reserved_cents,
      'requested_customer_cents', p_actual_customer_cents,
      'upstream_cost_cents', p_upstream_cost_cents,
      'key_balance_cents', v_balance,
      'total_spent_cents', v_total_spent
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
    'ok', true,
    'idempotent', false,
    'usage_id', v_usage.id,
    'status', v_status,
    'reserved_cents', v_usage.reserved_cents,
    'actual_customer_cents', p_actual_customer_cents,
    'upstream_cost_cents', p_upstream_cost_cents,
    'key_balance_cents', v_balance,
    'total_spent_cents', v_total_spent
  );
END;
$settle_api_usage$;

-- expire_stale_api_usage: refunds reservations whose request worker died
-- before settlement. This is the recovery path for client disconnects,
-- deployment interruption, and other failures that happen after reserve but
-- before the normal settlement RPC completes.
CREATE OR REPLACE FUNCTION public.expire_stale_api_usage(
  p_max_age_seconds INTEGER DEFAULT 1800
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $expire_stale_api_usage$
DECLARE
  v_usage RECORD;
  v_refund_count INTEGER := 0;
  v_max_age_seconds INTEGER := GREATEST(COALESCE(p_max_age_seconds, 1800), 900);
BEGIN
  FOR v_usage IN
    SELECT id, key_id, reserved_cents
    FROM public.api_usage_logs
    WHERE status = 'reserved'
      AND reserved_at < now() - make_interval(secs => v_max_age_seconds)
    ORDER BY reserved_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_usage.key_id IS NOT NULL THEN
      UPDATE public.api_keys
      SET balance_cents = balance_cents + v_usage.reserved_cents,
          updated_at = now()
      WHERE id = v_usage.key_id;
    END IF;

    UPDATE public.api_usage_logs
    SET status = 'failed',
        actual_customer_cents = 0,
        upstream_cost_cents = 0,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'reconciliation', 'stale_reservation_refund',
          'refund_cents', v_usage.reserved_cents,
          'max_age_seconds', v_max_age_seconds
        ),
        settled_at = now(),
        updated_at = now()
    WHERE id = v_usage.id
      AND status = 'reserved';

    IF FOUND THEN
      v_refund_count := v_refund_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'expired_count', v_refund_count,
    'max_age_seconds', v_max_age_seconds
  );
END;
$expire_stale_api_usage$;

-- get_api_usage_total: server-side aggregate for the authenticated user's
-- customer-facing spend. Keeping this in SQL avoids PostgREST row limits and
-- does not expose the upstream cost basis to the client.
CREATE OR REPLACE FUNCTION public.get_api_usage_total(
  p_user_id UUID,
  p_key_id UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $get_api_usage_total$
  SELECT COALESCE(SUM(actual_customer_cents), 0)::BIGINT
  FROM public.api_usage_logs
  WHERE user_id = p_user_id
    AND (p_key_id IS NULL OR key_id = p_key_id);
$get_api_usage_total$;

REVOKE ALL ON FUNCTION public.get_api_usage_total(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_usage_total(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_api_usage(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_api_usage(INTEGER)
  TO service_role;

-- Only the server (service role) may move wallet / key money.
REVOKE EXECUTE ON FUNCTION public.grant_api_wallet_credit(UUID, BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_api_wallet_credit(UUID, BIGINT, TEXT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.fund_api_key(UUID, UUID, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_api_key(UUID, UUID, BIGINT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.revoke_api_key(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID, UUID, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.reserve_api_wallet(UUID, UUID, TEXT, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_api_wallet(UUID, UUID, TEXT, BIGINT, JSONB)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.settle_api_usage(TEXT, BIGINT, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_api_usage(TEXT, BIGINT, BIGINT, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.reserve_api_wallet(UUID, UUID, TEXT, BIGINT, JSONB) IS
  'Atomically reserve p_amount_cents from the key balance and create a unique '
  'request_id usage row BEFORE calling upstream; ok=false when the key balance '
  'is insufficient so an upstream success can never exceed the customer balance.';

COMMENT ON FUNCTION public.fund_api_key(UUID, UUID, BIGINT, JSONB) IS
  'Move already-paid balance from a user wallet into one active API key. '
  'The operation is idempotent when metadata.idempotency_key is provided.';

COMMENT ON FUNCTION public.revoke_api_key(UUID, UUID, JSONB) IS
  'Permanently revoke a key and return its unused balance to the master wallet '
  'in the same transaction.';

COMMENT ON FUNCTION public.settle_api_usage(TEXT, BIGINT, BIGINT, JSONB) IS
  'Close a reservation by final amount: refund difference or charge the extra. '
  'Idempotent per request_id; caps an underfunded final charge to the reservation '
  'and records the adjustment instead of leaving money stuck in reserved.';

COMMENT ON FUNCTION public.expire_stale_api_usage(INTEGER) IS
  'Refund and close reservations older than the configured safety window. '
  'Service-role cron only; active requests should settle before this window.';

NOTIFY pgrst, 'reload schema';
