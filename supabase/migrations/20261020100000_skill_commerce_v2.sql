-- Content-only products never write user_subscriptions or user_credits.
-- Existing Skill Pro / Pro / Max contracts and orders remain unchanged.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.skill_products (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('single', 'subscription')),
  name TEXT NOT NULL,
  skill_slug TEXT REFERENCES public.skill_catalog(slug) ON DELETE RESTRICT,
  price_usd INTEGER NOT NULL CHECK (price_usd > 0),
  price_cny INTEGER NOT NULL CHECK (price_cny > 0),
  yearly_usd INTEGER CHECK (yearly_usd > 0),
  yearly_cny INTEGER CHECK (yearly_cny > 0),
  is_active BOOLEAN NOT NULL DEFAULT false,
  contract_version TEXT NOT NULL DEFAULT 'skills-2026-10-v2',
  CHECK ((kind = 'single' AND skill_slug IS NOT NULL AND yearly_usd IS NULL AND yearly_cny IS NULL)
    OR (kind = 'subscription' AND skill_slug IS NULL AND yearly_usd IS NOT NULL AND yearly_cny IS NOT NULL))
);
ALTER TABLE public.skill_products ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.skill_products TO anon, authenticated;
GRANT ALL ON public.skill_products TO service_role;
CREATE POLICY skill_products_read ON public.skill_products FOR SELECT TO anon, authenticated USING (is_active);

INSERT INTO public.skill_products (id,kind,name,price_usd,price_cny,yearly_usd,yearly_cny)
VALUES ('skill_pro_content_v2','subscription','Skill Pro',999,4900,7900,39900);
INSERT INTO public.skill_products (id,kind,name,skill_slug,price_usd,price_cny)
SELECT 'skill_xhs_carousel_v1','single','Xiaohongshu Carousel',slug,999,5900
FROM public.skill_catalog WHERE slug = 'xhs-carousel';

CREATE TABLE public.skill_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.skill_products(id),
  payment_order_id UUID NOT NULL UNIQUE REFERENCES public.payment_orders(id),
  status TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  external_subscription_id TEXT NOT NULL UNIQUE,
  payment_provider TEXT NOT NULL CHECK (payment_provider IN ('stripe','zpay')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (current_period_end > current_period_start)
);
ALTER TABLE public.skill_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.skill_subscriptions TO authenticated;
GRANT ALL ON public.skill_subscriptions TO service_role;
CREATE POLICY own_skill_subscriptions ON public.skill_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX skill_subscriptions_user ON public.skill_subscriptions(user_id);

CREATE TABLE public.skill_subscription_refunds (
  invoice_id TEXT PRIMARY KEY,
  external_subscription_id TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  CHECK (period_end > period_start)
);
ALTER TABLE public.skill_subscription_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.skill_subscription_refunds FROM anon,authenticated;
GRANT ALL ON public.skill_subscription_refunds TO service_role;

-- Extend only the product-type constraint, retaining all existing order kinds.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.payment_orders'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%product_type%'
  LOOP EXECUTE format('ALTER TABLE public.payment_orders DROP CONSTRAINT %I',c.conname); END LOOP;
END $$;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_product_type_check
CHECK (product_type IN ('subscription','credit_package','api_credit_package','skill_lifetime','skill_subscription','skill_purchase'));

-- A pending payable session must not be silently replaced after a timeout.
CREATE FUNCTION public.guard_skill_commerce_checkout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_type NOT IN ('skill_subscription','skill_purchase')
    OR NEW.status NOT IN ('pending','processing') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('pending','processing') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('skill_commerce'),hashtext(NEW.user_id::text));
  IF EXISTS (
    SELECT 1 FROM public.payment_orders o WHERE o.user_id=NEW.user_id AND o.id<>NEW.id
      AND o.product_type IN ('skill_subscription','skill_purchase') AND o.status IN ('pending','processing')
      AND (NEW.product_type='skill_subscription' OR o.product_type='skill_subscription' OR o.product_id=NEW.product_id)
  ) OR EXISTS (
    SELECT 1 FROM public.skill_entitlements e WHERE e.user_id=NEW.user_id
      AND e.status='active' AND e.starts_at<=now() AND (e.ends_at IS NULL OR e.ends_at>now())
      AND (e.skill_id IS NULL OR (NEW.product_type='skill_purchase' AND e.skill_id=(NEW.metadata->'skillSnapshot'->>'skillId')::uuid))
  ) OR EXISTS (
    SELECT 1 FROM public.user_subscriptions s JOIN public.subscription_plans p ON p.id=s.plan_id
      WHERE s.user_id=NEW.user_id AND p.skill_tier_access='premium'
        AND s.status IN ('active','trialing','canceled','cancelled') AND s.current_period_end>now()
  ) OR (NEW.product_type='skill_subscription' AND EXISTS (
    SELECT 1 FROM public.skill_subscriptions s WHERE s.user_id=NEW.user_id
      AND (s.current_period_end>now() OR (s.stripe_subscription_id IS NOT NULL AND s.status IN ('active','trialing','past_due','unpaid','paused')))
      AND s.status NOT IN ('incomplete_expired')
  )) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='SKILL_CHECKOUT_CONFLICT';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_skill_commerce_checkout() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_skill_commerce_checkout BEFORE INSERT OR UPDATE OF status ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_skill_commerce_checkout();

-- One transaction records content subscription and grants the order-scoped access.
CREATE FUNCTION public.fulfill_skill_commerce(
  p_order_id UUID, p_provider TEXT, p_external_id TEXT, p_customer_id TEXT,
  p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders; snap JSONB; skill UUID; period public.skill_subscriptions;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status<>'processing' OR o.provider<>p_provider
    OR o.product_type NOT IN ('skill_subscription','skill_purchase') THEN
    RAISE EXCEPTION 'Invalid content order';
  END IF;
  snap := o.metadata->'skillSnapshot';
  IF snap IS NULL OR snap->>'productId' IS DISTINCT FROM o.product_id
    OR snap->>'contractVersion' IS NULL THEN RAISE EXCEPTION 'Missing content contract snapshot'; END IF;
  IF o.product_type='skill_purchase' THEN
    skill := (snap->>'skillId')::uuid;
    IF skill IS NULL OR snap->>'version' IS NULL THEN RAISE EXCEPTION 'Missing purchased version'; END IF;
    PERFORM public.grant_skill_entitlement(o.user_id,o.id,'single_purchase',skill,p_starts_at,NULL,NULL,snap);
  ELSE
    IF p_external_id IS NULL OR p_external_id='' OR p_ends_at IS NULL OR p_ends_at<=p_starts_at THEN
      RAISE EXCEPTION 'Invalid content subscription period';
    END IF;
    INSERT INTO public.skill_subscriptions (
      user_id,plan_id,payment_order_id,status,billing_cycle,current_period_start,current_period_end,
      stripe_subscription_id,stripe_customer_id,external_subscription_id,payment_provider
    ) VALUES (
      o.user_id,o.product_id,o.id,'active',o.metadata->>'billingCycle',p_starts_at,p_ends_at,
      CASE WHEN p_provider='stripe' THEN p_external_id END,p_customer_id,p_external_id,p_provider
    ) ON CONFLICT (payment_order_id) DO NOTHING;
    SELECT * INTO period FROM public.skill_subscriptions WHERE payment_order_id=o.id;
    PERFORM public.grant_skill_entitlement(o.user_id,o.id,'subscription',NULL,period.current_period_start,period.current_period_end,p_external_id,snap);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_skill_commerce(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_skill_commerce(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ) TO service_role;

CREATE FUNCTION public.sync_skill_commerce_subscription(
  p_external_id TEXT,p_status TEXT,p_start TIMESTAMPTZ,p_end TIMESTAMPTZ,p_cancel BOOLEAN,p_has_access BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.skill_subscriptions SET status=p_status,current_period_start=p_start,
    current_period_end=p_end,cancel_at_period_end=p_cancel,updated_at=now()
    WHERE stripe_subscription_id=p_external_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content subscription not fulfilled yet'; END IF;
  PERFORM public.sync_subscription_skill_entitlements(p_external_id,
    p_has_access AND NOT EXISTS (SELECT 1 FROM public.skill_subscription_refunds
      WHERE external_subscription_id=p_external_id AND period_start<p_end AND period_end>p_start),
    p_end,jsonb_build_object('stripe_status',p_status));
END $$;
REVOKE ALL ON FUNCTION public.sync_skill_commerce_subscription(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_skill_commerce_subscription(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,BOOLEAN,BOOLEAN) TO service_role;

CREATE FUNCTION public.refund_skill_purchase(p_order_id UUID,p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.payment_orders;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id=p_order_id FOR UPDATE;
  IF o.product_type IS DISTINCT FROM 'skill_purchase' THEN RAISE EXCEPTION 'Not a Skill purchase'; END IF;
  PERFORM public.revoke_skill_entitlements_for_order(p_order_id,p_reason);
  UPDATE public.payment_orders SET status='refunded',updated_at=now() WHERE id=p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.refund_skill_purchase(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_skill_purchase(UUID,TEXT) TO service_role;

-- Refund only the paid interval, not an unrelated purchase or a later paid renewal.
CREATE FUNCTION public.refund_skill_subscription_period(
  p_external_id TEXT,p_invoice_id TEXT,p_start TIMESTAMPTZ,p_end TIMESTAMPTZ,p_reason TEXT,p_initial BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sub public.skill_subscriptions;
BEGIN
  SELECT * INTO sub FROM public.skill_subscriptions WHERE stripe_subscription_id=p_external_id FOR UPDATE;
  IF sub.id IS NULL THEN RAISE EXCEPTION 'Content subscription not fulfilled yet; retry refund'; END IF;
  INSERT INTO public.skill_subscription_refunds VALUES (p_invoice_id,p_external_id,p_start,p_end,p_reason)
    ON CONFLICT (invoice_id) DO NOTHING;
  IF sub.current_period_start<p_end AND sub.current_period_end>p_start THEN
    PERFORM public.sync_subscription_skill_entitlements(p_external_id,false,sub.current_period_end,jsonb_build_object('refund_reason',p_reason));
  END IF;
  IF p_initial THEN
    UPDATE public.payment_orders SET status='refunded',updated_at=now() WHERE id=sub.payment_order_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.refund_skill_subscription_period(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_skill_subscription_period(TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,BOOLEAN) TO service_role;
