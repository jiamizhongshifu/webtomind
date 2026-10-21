-- Additive SiSkill membership contracts. No legacy WebToMind objects are changed.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.siskill_releases ADD COLUMN member_eligible boolean NOT NULL DEFAULT false;
CREATE TABLE public.siskill_plans (
 id text PRIMARY KEY CHECK (id IN ('pro_monthly','pro_yearly')),
 name text NOT NULL,
 stripe_price_id text UNIQUE CHECK (stripe_price_id LIKE 'price_%'),
 amount integer NOT NULL CHECK (amount>0),
 currency text NOT NULL DEFAULT 'usd' CHECK (currency='usd'),
 interval text NOT NULL CHECK (interval IN ('month','year')),
 contract_version text NOT NULL,
 livemode boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT false,
 CHECK (NOT active OR stripe_price_id IS NOT NULL)
);
INSERT INTO public.siskill_plans(id,name,amount,interval,contract_version) VALUES
 ('pro_monthly','SiSkill Pro Monthly',999,'month','siskill-pro-2026-10-v1'),
 ('pro_yearly','SiSkill Pro Yearly',7900,'year','siskill-pro-2026-10-v1');
CREATE TABLE public.siskill_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 plan_id text NOT NULL REFERENCES public.siskill_plans(id),
 snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','bound','ended')),
 checkout_id text UNIQUE,
 subscription_id text UNIQUE,
 customer_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);
CREATE UNIQUE INDEX siskill_one_open_membership ON public.siskill_memberships(user_id) WHERE state<>'ended';
ALTER TABLE public.siskill_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siskill_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siskill_plans,public.siskill_memberships FROM anon,authenticated;
GRANT ALL ON public.siskill_plans,public.siskill_memberships TO service_role;
GRANT SELECT ON public.siskill_memberships TO authenticated;
CREATE POLICY siskill_own_memberships ON public.siskill_memberships FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.siskill_reserve_membership(p_user uuid,p_plan text,p_locale text)
RETURNS public.siskill_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.siskill_plans; m public.siskill_memberships;
BEGIN
 IF p_locale IS NULL OR p_locale NOT IN ('en-US','zh-CN') THEN RAISE EXCEPTION 'INVALID_LOCALE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('siskill-membership'),hashtext(p_user::text));
 SELECT * INTO m FROM public.siskill_memberships WHERE user_id=p_user AND state<>'ended' FOR UPDATE;
 IF FOUND THEN
  IF m.plan_id<>p_plan OR m.state='bound' THEN RAISE EXCEPTION 'MEMBERSHIP_EXISTS'; END IF;
  RETURN m;
 END IF;
 SELECT * INTO p FROM public.siskill_plans WHERE id=p_plan AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_UNAVAILABLE'; END IF;
 INSERT INTO public.siskill_memberships(user_id,plan_id,snapshot)
 VALUES(p_user,p_plan,to_jsonb(p)||jsonb_build_object('locale',p_locale,'product_scope','siskill')) RETURNING * INTO m;
 RETURN m;
END $$;
CREATE FUNCTION public.siskill_bind_membership(p_id uuid,p_checkout text,p_subscription text DEFAULT NULL,p_customer text DEFAULT NULL,p_end boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.siskill_memberships;
BEGIN
 SELECT * INTO m FROM public.siskill_memberships WHERE id=p_id FOR UPDATE;
 IF m.id IS NULL OR p_checkout IS NULL OR p_checkout NOT LIKE 'cs_%' OR
 (m.checkout_id IS NOT NULL AND m.checkout_id<>p_checkout) OR
 (m.subscription_id IS NOT NULL AND p_subscription IS DISTINCT FROM m.subscription_id) OR
 (m.customer_id IS NOT NULL AND p_customer IS DISTINCT FROM m.customer_id) OR
 (p_subscription IS NOT NULL AND (p_subscription NOT LIKE 'sub_%' OR p_customer IS NULL OR p_customer NOT LIKE 'cus_%'))
 THEN RAISE EXCEPTION 'MEMBERSHIP_MISMATCH'; END IF;
 UPDATE public.siskill_memberships SET checkout_id=p_checkout,
 subscription_id=COALESCE(subscription_id,p_subscription),customer_id=COALESCE(customer_id,p_customer),
 state=CASE WHEN p_end OR state='ended' THEN 'ended' WHEN p_subscription IS NOT NULL THEN 'bound' ELSE 'pending' END,
 ended_at=CASE WHEN p_end THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE id=p_id;
END $$;
CREATE FUNCTION public.siskill_membership_contract_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.user_id,NEW.plan_id,NEW.snapshot,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.plan_id,OLD.snapshot,OLD.created_at)
 THEN RAISE EXCEPTION 'IMMUTABLE_MEMBERSHIP_CONTRACT'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER siskill_membership_contract_guard BEFORE UPDATE ON public.siskill_memberships FOR EACH ROW EXECUTE FUNCTION public.siskill_membership_contract_immutable();
REVOKE ALL ON FUNCTION public.siskill_reserve_membership(uuid,text,text),public.siskill_bind_membership(uuid,text,text,text,boolean),public.siskill_membership_contract_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.siskill_reserve_membership(uuid,text,text),public.siskill_bind_membership(uuid,text,text,text,boolean) TO service_role;
