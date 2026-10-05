-- Serialize future subscription checkouts without rewriting historical orders.
-- Existing pending orders must be reconciled with their provider, never aged out
-- locally while a payable provider session could still be open.
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.guard_subscription_checkout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_type <> 'subscription' OR NEW.status NOT IN ('pending', 'processing') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('pending', 'processing') AND OLD.user_id = NEW.user_id THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('subscription_checkout'), hashtext(NEW.user_id::text));
  IF EXISTS (SELECT 1 FROM public.payment_orders WHERE user_id = NEW.user_id AND product_type = 'subscription' AND status IN ('pending','processing') AND id <> NEW.id)
  OR EXISTS (
    SELECT 1 FROM public.user_subscriptions WHERE user_id = NEW.user_id AND (
      (status IN ('active','trialing','past_due') AND (stripe_subscription_id IS NOT NULL OR current_period_end > now()))
      OR (status = 'canceled' AND current_period_end > now() AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL))
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SUBSCRIPTION_CHECKOUT_IN_PROGRESS';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_subscription_checkout() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_subscription_checkout ON public.payment_orders;
CREATE TRIGGER guard_subscription_checkout BEFORE INSERT OR UPDATE OF status ON public.payment_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_subscription_checkout();
