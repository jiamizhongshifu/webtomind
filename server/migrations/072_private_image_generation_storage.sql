-- Private storage and refund support for the visual image creator.

SET search_path = public;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-generated-images',
  'user-generated-images',
  false,
  20971520,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own generated images" ON storage.objects;
CREATE POLICY "Users can read own generated images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-generated-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can insert own generated images" ON storage.objects;
CREATE POLICY "Users can insert own generated images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-generated-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own generated images" ON storage.objects;
CREATE POLICY "Users can delete own generated images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-generated-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE OR REPLACE FUNCTION public.refund_image_generation_credit(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT DEFAULT 'bonus',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_credits public.user_credits%ROWTYPE;
  v_refund_to TEXT;
  v_new_daily INTEGER;
  v_new_bonus INTEGER;
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  SELECT *
  INTO v_user_credits
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  v_refund_to := CASE WHEN p_credit_type = 'daily' THEN 'daily' ELSE 'bonus' END;

  IF v_refund_to = 'daily' THEN
    v_new_daily := LEAST(
      v_user_credits.daily_credits_max,
      v_user_credits.daily_credits + p_amount
    );
    v_new_bonus :=
      v_user_credits.bonus_credits +
      GREATEST(
        0,
        v_user_credits.daily_credits + p_amount - v_user_credits.daily_credits_max
      );
  ELSE
    v_new_daily := v_user_credits.daily_credits;
    v_new_bonus := v_user_credits.bonus_credits + p_amount;
  END IF;

  UPDATE public.user_credits
  SET
    daily_credits = v_new_daily,
    bonus_credits = v_new_bonus,
    total_consumed = GREATEST(0, total_consumed - p_amount),
    daily_image_gen_used = GREATEST(0, daily_image_gen_used - 1),
    updated_at = now()
  WHERE user_id = p_user_id;

  v_balance := v_new_daily + v_new_bonus;

  INSERT INTO public.credit_transactions (
    user_id,
    type,
    credit_type,
    amount,
    balance_after,
    source,
    description,
    metadata
  )
  VALUES (
    p_user_id,
    'refund',
    v_refund_to,
    p_amount,
    v_balance,
    'image_generation_refund',
    'Image generation failed; credits refunded',
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'refunded', p_amount,
    'credit_type', v_refund_to,
    'balance', v_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_image_generation_credit(UUID, INTEGER, TEXT, JSONB)
TO authenticated, service_role;
