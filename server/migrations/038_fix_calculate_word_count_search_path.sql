-- Migration: Fix calculate_word_count function search_path security warning

SET search_path = public;

CREATE OR REPLACE FUNCTION public.calculate_word_count(p_content TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    IF p_content IS NULL OR p_content = '' THEN
        RETURN 0;
    END IF;
    RETURN array_length(regexp_split_to_array(trim(p_content), '\s+'), 1);
END;
$$;
