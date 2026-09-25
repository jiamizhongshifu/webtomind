-- Database-level search and exact counts for the public prompt library.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.search_prompt_cases_public(
  p_limit INTEGER DEFAULT 100,
  p_locale TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_tag TEXT DEFAULT NULL,
  p_package_slug TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_featured_only BOOLEAN DEFAULT false,
  p_require_image BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH params AS (
  SELECT
    GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000)) AS limit_value,
    NULLIF(BTRIM(COALESCE(p_locale, '')), '') AS locale_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_category, '')), '')) AS category_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_model, '')), '')) AS model_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_tag, '')), '')) AS tag_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_package_slug, '')), '')) AS package_slug_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_search, '')), '')) AS search_value,
    COALESCE(p_featured_only, false) AS featured_only_value,
    COALESCE(p_require_image, false) AS require_image_value
),
published_cases AS (
  SELECT pc.*
  FROM public.prompt_cases pc
  CROSS JOIN params p
  WHERE pc.is_published = true
    AND pc.deleted_at IS NULL
    AND pc.source_case_id IS NULL
    AND (
      p.locale_value IS NULL
      OR pc.locale = p.locale_value
      OR (
        p.locale_value = 'zh-CN'
        AND (
          NULLIF(pc.title_zh, '') IS NOT NULL
          OR NULLIF(pc.prompt_zh, '') IS NOT NULL
          OR NULLIF(pc.prompt_preview_zh, '') IS NOT NULL
        )
      )
      OR (
        p.locale_value = 'en-US'
        AND (
          NULLIF(pc.title_en, '') IS NOT NULL
          OR NULLIF(pc.prompt_en, '') IS NOT NULL
          OR NULLIF(pc.prompt_preview_en, '') IS NOT NULL
        )
      )
    )
    AND (
      p.require_image_value = false
      OR NULLIF(BTRIM(COALESCE(pc.image_url, '')), '') IS NOT NULL
      OR jsonb_array_length(COALESCE(pc.image_urls, '[]'::jsonb)) > 0
    )
    AND (
      p.featured_only_value = false
      OR pc.featured = true
      OR LOWER(COALESCE(pc.category, '')) = 'featured'
    )
    AND (
      p.package_slug_value IS NULL
      OR LOWER(COALESCE(pc.package_slug, '')) = p.package_slug_value
    )
    AND (
      p.tag_value IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(pc.tags, '[]'::jsonb)) AS tag(value)
        WHERE LOWER(tag.value) = p.tag_value
      )
    )
    AND (
      p.category_value IS NULL
      OR LOWER(COALESCE(pc.category, '')) = p.category_value
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(pc.tags, '[]'::jsonb)) AS tag(value)
        WHERE LOWER(tag.value) = p.category_value
      )
    )
    AND (
      p.search_value IS NULL
      OR LOWER(CONCAT_WS(
        ' ',
        pc.title,
        pc.title_zh,
        pc.title_en,
        pc.slug,
        pc.category,
        pc.model,
        pc.package_slug,
        pc.commercial_intent,
        pc.prompt_preview,
        pc.prompt_preview_zh,
        pc.prompt_preview_en,
        pc.prompt,
        pc.prompt_zh,
        pc.prompt_en,
        pc.tags::TEXT
      )) LIKE '%' || p.search_value || '%'
    )
),
navigation_cases AS (
  SELECT pc.*
  FROM published_cases pc
),
filtered_cases AS (
  SELECT pc.*
  FROM published_cases pc
  CROSS JOIN params p
  WHERE (
    p.model_value IS NULL
    OR LOWER(COALESCE(pc.model, '')) = p.model_value
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(pc.tags, '[]'::jsonb)) AS tag(value)
      WHERE LOWER(tag.value) = p.model_value
    )
  )
),
ordered_cases AS (
  SELECT *
  FROM filtered_cases
  ORDER BY
    featured DESC,
    sort_order ASC,
    created_at DESC,
    id ASC
  LIMIT (SELECT limit_value FROM params)
),
model_counts AS (
  SELECT COALESCE(
    jsonb_object_agg(model_key, case_count ORDER BY model_key),
    '{}'::jsonb
  ) AS value
  FROM (
    SELECT COALESCE(NULLIF(model, ''), 'unknown') AS model_key, COUNT(*) AS case_count
    FROM navigation_cases
    GROUP BY COALESCE(NULLIF(model, ''), 'unknown')
  ) counts
),
category_counts AS (
  SELECT COALESCE(
    jsonb_object_agg(category_key, case_count ORDER BY category_key),
    '{}'::jsonb
  ) AS value
  FROM (
    SELECT COALESCE(NULLIF(category, ''), 'featured') AS category_key, COUNT(*) AS case_count
    FROM filtered_cases
    GROUP BY COALESCE(NULLIF(category, ''), 'featured')
  ) counts
)
SELECT jsonb_build_object(
  'cases',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(ordered_cases) ORDER BY featured DESC, sort_order ASC, created_at DESC, id ASC)
        FROM ordered_cases
      ),
      '[]'::jsonb
    ),
  'total', (SELECT COUNT(*) FROM filtered_cases),
  'navigationTotal', (SELECT COUNT(*) FROM navigation_cases),
  'modelCounts', (SELECT value FROM model_counts),
  'categoryCounts', (SELECT value FROM category_counts)
);
$$;

GRANT EXECUTE ON FUNCTION public.search_prompt_cases_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN
) TO anon, authenticated, service_role;
