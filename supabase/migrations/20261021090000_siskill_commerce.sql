-- Independent SiSkill one-time commerce. Additive: no WebToMind tables/functions altered.
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.siskill_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 version text NOT NULL,
 object_key text NOT NULL CHECK (object_key LIKE 'siskill/%' AND object_key NOT LIKE '%..%'),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 bytes bigint NOT NULL CHECK (bytes > 0),
 status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','published','withdrawn')),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(slug,version),
 CHECK (status <> 'published' OR reviewed_at IS NOT NULL)
);
CREATE TABLE public.siskill_products (
 sku text PRIMARY KEY CHECK (sku ~ '^siskill_[a-z0-9_]{1,100}$'),
 product_scope text NOT NULL DEFAULT 'siskill' CHECK (product_scope='siskill'),
 name text NOT NULL,
 release_id uuid NOT NULL REFERENCES public.siskill_releases(id) ON DELETE RESTRICT,
 usd_cents integer NOT NULL CHECK (usd_cents > 0),
 cny_cents integer NOT NULL CHECK (cny_cents > 0),
 contract_version text NOT NULL,
 active boolean NOT NULL DEFAULT false
);
CREATE TABLE public.siskill_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_scope text NOT NULL DEFAULT 'siskill' CHECK (product_scope='siskill'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 sku text NOT NULL REFERENCES public.siskill_products(sku) ON DELETE RESTRICT,
 release_id uuid NOT NULL REFERENCES public.siskill_releases(id) ON DELETE RESTRICT,
 provider text NOT NULL CHECK (provider IN ('stripe','zpay')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','expired')),
 amount integer NOT NULL CHECK (amount>0),
 currency text NOT NULL CHECK (currency IN ('usd','cny')),
 snapshot jsonb NOT NULL,
 checkout_id text,
 checkout_url text,
 provider_payment_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 refunded_at timestamptz,
 UNIQUE(provider,checkout_id),
 UNIQUE(provider,provider_payment_id)
);
CREATE UNIQUE INDEX siskill_one_pending_sku ON public.siskill_orders(user_id,sku) WHERE status='pending';
CREATE TABLE public.siskill_grants (
 order_id uuid PRIMARY KEY REFERENCES public.siskill_orders(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 release_id uuid NOT NULL REFERENCES public.siskill_releases(id) ON DELETE RESTRICT,
 product_scope text NOT NULL DEFAULT 'siskill' CHECK (product_scope='siskill'),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.siskill_payment_events (
 provider text NOT NULL CHECK (provider IN ('stripe','zpay')),
 event_id text NOT NULL,
 order_id uuid NOT NULL REFERENCES public.siskill_orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('paid','refunded','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,event_id)
);
ALTER TABLE public.siskill_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siskill_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siskill_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siskill_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siskill_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siskill_releases,public.siskill_products,public.siskill_orders,public.siskill_grants,public.siskill_payment_events FROM anon,authenticated;
GRANT SELECT ON public.siskill_orders,public.siskill_grants TO authenticated;
GRANT ALL ON public.siskill_releases,public.siskill_products,public.siskill_orders,public.siskill_grants,public.siskill_payment_events TO service_role;
CREATE POLICY siskill_own_orders ON public.siskill_orders FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY siskill_own_grants ON public.siskill_grants FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Price, version and contract come only from the reviewed server catalog.
CREATE FUNCTION public.siskill_create_order(p_user uuid,p_sku text,p_provider text,p_locale text DEFAULT 'en-US')
RETURNS public.siskill_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.siskill_products; r public.siskill_releases; o public.siskill_orders;
BEGIN
 IF p_locale IS NULL OR p_locale NOT IN ('en-US','zh-CN') THEN RAISE EXCEPTION 'INVALID_LOCALE'; END IF;
 IF p_provider NOT IN ('stripe','zpay') THEN RAISE EXCEPTION 'INVALID_PROVIDER'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('siskill'),hashtext(p_user::text));
 SELECT * INTO p FROM public.siskill_products WHERE sku=p_sku AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'; END IF;
 SELECT * INTO r FROM public.siskill_releases WHERE id=p.release_id AND status='published' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RELEASE_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM public.siskill_grants g JOIN public.siskill_releases v ON v.id=g.release_id WHERE g.user_id=p_user AND g.status='active' AND v.slug=r.slug) THEN RAISE EXCEPTION 'ALREADY_OWNED'; END IF;
 SELECT * INTO o FROM public.siskill_orders WHERE user_id=p_user AND sku=p_sku AND status='pending' FOR UPDATE;
 IF FOUND THEN
   IF o.provider<>p_provider THEN RAISE EXCEPTION 'PENDING_OTHER_PROVIDER'; END IF;
   RETURN o;
 END IF;
 INSERT INTO public.siskill_orders(user_id,sku,release_id,provider,amount,currency,snapshot)
 VALUES(p_user,p_sku,r.id,p_provider,CASE WHEN p_provider='stripe' THEN p.usd_cents ELSE p.cny_cents END,
 CASE WHEN p_provider='stripe' THEN 'usd' ELSE 'cny' END,
 jsonb_build_object('product_scope','siskill','locale',p_locale,'name',p.name,'slug',r.slug,'version',r.version,'sha256',r.sha256,'bytes',r.bytes,'contract_version',p.contract_version)) RETURNING * INTO o;
 RETURN o;
END $$;

CREATE FUNCTION public.siskill_bind_checkout(p_order uuid,p_checkout_id text,p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.siskill_orders;
BEGIN
 SELECT * INTO o FROM public.siskill_orders WHERE id=p_order FOR UPDATE;
 IF o.id IS NULL OR o.status<>'pending' OR p_checkout_id IS NULL OR p_checkout_id='' THEN RAISE EXCEPTION 'INVALID_CHECKOUT'; END IF;
 IF o.checkout_id IS NOT NULL AND o.checkout_id<>p_checkout_id THEN RAISE EXCEPTION 'CHECKOUT_CONFLICT'; END IF;
 UPDATE public.siskill_orders SET checkout_id=p_checkout_id,checkout_url=p_url WHERE id=p_order;
END $$;

-- Called only after provider signature/merchant verification. Payment and access change atomically.
CREATE FUNCTION public.siskill_apply_payment(p_order uuid,p_provider text,p_event text,p_kind text,p_payment text,p_amount integer,p_currency text,p_checkout text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.siskill_orders; previous public.siskill_payment_events;
BEGIN
 SELECT * INTO o FROM public.siskill_orders WHERE id=p_order FOR UPDATE;
 IF o.id IS NULL OR o.provider<>p_provider OR o.amount IS DISTINCT FROM p_amount OR o.currency IS DISTINCT FROM p_currency
 OR o.product_scope<>'siskill' OR p_event IS NULL OR p_event='' OR p_kind NOT IN ('paid','refunded','expired') THEN RAISE EXCEPTION 'PAYMENT_MISMATCH'; END IF;
 IF p_kind='paid' AND o.provider='stripe' AND (p_checkout IS NULL OR o.checkout_id IS DISTINCT FROM p_checkout) THEN RAISE EXCEPTION 'CHECKOUT_MISMATCH'; END IF;
 IF p_kind IN ('paid','refunded') AND (p_payment IS NULL OR p_payment='') THEN RAISE EXCEPTION 'MISSING_PAYMENT_ID'; END IF;
 IF o.provider_payment_id IS NOT NULL AND p_kind<>'expired' AND o.provider_payment_id IS DISTINCT FROM p_payment THEN RAISE EXCEPTION 'PAYMENT_ID_MISMATCH'; END IF;
 SELECT * INTO previous FROM public.siskill_payment_events WHERE provider=p_provider AND event_id=p_event;
 IF FOUND THEN
   IF previous.order_id<>p_order OR previous.kind<>p_kind THEN RAISE EXCEPTION 'EVENT_REPLAY_CONFLICT'; END IF;
   RETURN o.status;
 END IF;
 INSERT INTO public.siskill_payment_events(provider,event_id,order_id,kind) VALUES(p_provider,p_event,p_order,p_kind);
 IF p_kind='refunded' THEN
   UPDATE public.siskill_orders SET status='refunded',refunded_at=now(),provider_payment_id=p_payment WHERE id=p_order;
   UPDATE public.siskill_grants SET status='revoked' WHERE order_id=p_order;
 ELSIF p_kind='paid' AND o.status<>'refunded' THEN
   -- A delayed verified payment may arrive after expiry. It must still be fulfilled.
   UPDATE public.siskill_orders SET status='paid',paid_at=COALESCE(paid_at,now()),provider_payment_id=p_payment WHERE id=p_order;
   INSERT INTO public.siskill_grants(order_id,user_id,release_id) VALUES(o.id,o.user_id,o.release_id) ON CONFLICT(order_id) DO NOTHING;
 ELSIF p_kind='expired' AND o.status='pending' THEN
   UPDATE public.siskill_orders SET status='expired' WHERE id=p_order;
 END IF;
 SELECT * INTO o FROM public.siskill_orders WHERE id=p_order;
 RETURN o.status;
END $$;
REVOKE ALL ON FUNCTION public.siskill_create_order(uuid,text,text,text),public.siskill_bind_checkout(uuid,text,text),public.siskill_apply_payment(uuid,text,text,text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siskill_create_order(uuid,text,text,text),public.siskill_bind_checkout(uuid,text,text),public.siskill_apply_payment(uuid,text,text,text,text,integer,text,text) TO service_role;
-- No seed is sellable. Publish reviewed releases and explicitly activate each SKU separately.

CREATE FUNCTION public.siskill_freeze_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.reviewed_at IS NOT NULL AND (NEW.slug,NEW.version,NEW.object_key,NEW.sha256,NEW.bytes,NEW.reviewed_at)
 IS DISTINCT FROM (OLD.slug,OLD.version,OLD.object_key,OLD.sha256,OLD.bytes,OLD.reviewed_at) THEN RAISE EXCEPTION 'RELEASE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER siskill_freeze_release BEFORE UPDATE ON public.siskill_releases FOR EACH ROW EXECUTE FUNCTION public.siskill_freeze_release();
CREATE FUNCTION public.siskill_freeze_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.product_scope,NEW.user_id,NEW.sku,NEW.release_id,NEW.provider,NEW.amount,NEW.currency,NEW.snapshot,NEW.created_at)
 IS DISTINCT FROM (OLD.product_scope,OLD.user_id,OLD.sku,OLD.release_id,OLD.provider,OLD.amount,OLD.currency,OLD.snapshot,OLD.created_at) THEN RAISE EXCEPTION 'ORDER_CONTRACT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER siskill_freeze_order BEFORE UPDATE ON public.siskill_orders FOR EACH ROW EXECUTE FUNCTION public.siskill_freeze_order();
REVOKE ALL ON FUNCTION public.siskill_freeze_release(),public.siskill_freeze_order() FROM PUBLIC,anon,authenticated;
