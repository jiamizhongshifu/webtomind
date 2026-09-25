SET search_path = public;

CREATE TABLE IF NOT EXISTS public.image_character_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  locked_traits JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT image_character_cards_name_check
    CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  CONSTRAINT image_character_cards_locked_traits_check
    CHECK (jsonb_typeof(locked_traits) = 'array')
);

CREATE TABLE IF NOT EXISTS public.image_character_card_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.image_character_cards(id)
    ON DELETE CASCADE,
  reference_asset_id UUID NOT NULL REFERENCES public.image_reference_assets(id)
    ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, reference_asset_id)
);

CREATE INDEX IF NOT EXISTS image_character_cards_user_created_idx
  ON public.image_character_cards (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS image_character_card_references_card_idx
  ON public.image_character_card_references (card_id, position);

CREATE INDEX IF NOT EXISTS image_character_card_references_reference_idx
  ON public.image_character_card_references (reference_asset_id);

ALTER TABLE public.image_character_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_character_card_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_character_cards_owner_select"
  ON public.image_character_cards;
CREATE POLICY "image_character_cards_owner_select"
ON public.image_character_cards
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_character_cards_owner_insert"
  ON public.image_character_cards;
CREATE POLICY "image_character_cards_owner_insert"
ON public.image_character_cards
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_character_cards_owner_update"
  ON public.image_character_cards;
CREATE POLICY "image_character_cards_owner_update"
ON public.image_character_cards
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "image_character_cards_owner_delete"
  ON public.image_character_cards;
CREATE POLICY "image_character_cards_owner_delete"
ON public.image_character_cards
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "image_character_cards_service_role_all"
  ON public.image_character_cards;
CREATE POLICY "image_character_cards_service_role_all"
ON public.image_character_cards
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "image_character_card_references_owner_select"
  ON public.image_character_card_references;
CREATE POLICY "image_character_card_references_owner_select"
ON public.image_character_card_references
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.image_character_cards card
    WHERE card.id = image_character_card_references.card_id
      AND card.user_id = auth.uid()
      AND card.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "image_character_card_references_owner_insert"
  ON public.image_character_card_references;
CREATE POLICY "image_character_card_references_owner_insert"
ON public.image_character_card_references
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.image_character_cards card
    WHERE card.id = image_character_card_references.card_id
      AND card.user_id = auth.uid()
      AND card.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.image_reference_assets ref
    WHERE ref.id = image_character_card_references.reference_asset_id
      AND ref.user_id = auth.uid()
      AND ref.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "image_character_card_references_owner_update"
  ON public.image_character_card_references;
CREATE POLICY "image_character_card_references_owner_update"
ON public.image_character_card_references
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.image_character_cards card
    WHERE card.id = image_character_card_references.card_id
      AND card.user_id = auth.uid()
      AND card.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.image_character_cards card
    WHERE card.id = image_character_card_references.card_id
      AND card.user_id = auth.uid()
      AND card.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM public.image_reference_assets ref
    WHERE ref.id = image_character_card_references.reference_asset_id
      AND ref.user_id = auth.uid()
      AND ref.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "image_character_card_references_owner_delete"
  ON public.image_character_card_references;
CREATE POLICY "image_character_card_references_owner_delete"
ON public.image_character_card_references
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.image_character_cards card
    WHERE card.id = image_character_card_references.card_id
      AND card.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "image_character_card_references_service_role_all"
  ON public.image_character_card_references;
CREATE POLICY "image_character_card_references_service_role_all"
ON public.image_character_card_references
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_image_character_cards_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_image_character_cards_updated_at
  ON public.image_character_cards;
CREATE TRIGGER trg_image_character_cards_updated_at
BEFORE UPDATE ON public.image_character_cards
FOR EACH ROW EXECUTE FUNCTION public.set_image_character_cards_updated_at();
