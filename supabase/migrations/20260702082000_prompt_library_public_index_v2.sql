-- Canonical public prompt library index and search RPC.
-- Keeps gallery items, model facets, and label facets on one query contract.

SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_public_library_base
  ON public.prompt_cases (locale, featured DESC, sort_order ASC, created_at DESC)
  WHERE is_published = true
    AND deleted_at IS NULL
    AND source_case_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prompt_cases_tags_gin
  ON public.prompt_cases USING GIN (tags);

DROP VIEW IF EXISTS public.prompt_case_public_index;

CREATE VIEW public.prompt_case_public_index
WITH (security_invoker = true)
AS
WITH normalized AS (
  SELECT
    pc.*,
    LOWER(CONCAT_WS(
      ' ',
      pc.model,
      pc.category,
      pc.package_slug,
      pc.tags::TEXT
    )) AS facet_text,
    REGEXP_REPLACE(
      LOWER(CONCAT_WS(
        ' ',
        pc.model,
        pc.category,
        pc.package_slug,
        pc.tags::TEXT
      )),
      '[^a-z0-9]+',
      '',
      'g'
    ) AS compact_facet_text,
    LOWER(CONCAT_WS(
      ' ',
      pc.title,
      pc.title_zh,
      pc.title_en,
      pc.prompt_preview,
      pc.prompt_preview_zh,
      pc.prompt_preview_en,
      pc.commercial_intent,
      pc.category,
      pc.package_slug,
      pc.tags::TEXT
    )) AS searchable_text
  FROM public.prompt_cases pc
  WHERE pc.is_published = true
    AND pc.deleted_at IS NULL
    AND pc.source_case_id IS NULL
)
SELECT
  normalized.*,
  CASE
    WHEN compact_facet_text ~ '(seedance20|seedance)' THEN 'seedance-2-0'
    WHEN compact_facet_text ~ '(seedream50lite|seedream5lite|seedream)' THEN 'seedream'
    WHEN compact_facet_text ~ '(midjourneyalternative|midjourneyv7|midjourneynijiv7|midjourney|mj)' THEN 'midjourney-alternative'
    WHEN compact_facet_text ~ '(nanobanana|geminiimage)' THEN 'nano-banana'
    WHEN compact_facet_text ~ '(fluxai|flux)' THEN 'flux'
    WHEN compact_facet_text ~ '(gptimage2|gpt4oimage|gpt4o)' THEN 'gpt-image-2'
    ELSE NULLIF(REGEXP_REPLACE(LOWER(COALESCE(normalized.model, '')), '[_.[:space:]]+', '-', 'g'), '')
  END AS canonical_model_slug,
  ARRAY_REMOVE(ARRAY[
    CASE
      WHEN normalized.featured = true
        OR LOWER(COALESCE(normalized.category, '')) = 'featured'
        OR compact_facet_text ~ '(featured)'
        OR facet_text LIKE '%精选%'
      THEN 'featured'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(portraitphotography|aiportrait|portraitprompts|portrait|fashion)'
        OR facet_text LIKE '%人像%'
        OR facet_text LIKE '%写真%'
      THEN 'portrait-photography'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(productcommercial|productimages|ecommerce|commercial|skincare|product)'
        OR facet_text LIKE '%商品%'
        OR facet_text LIKE '%电商%'
        OR facet_text LIKE '%广告%'
      THEN 'product-commercial'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(posterkeyvisual|keyvisual|poster|kv)'
        OR facet_text LIKE '%海报%'
      THEN 'poster-key-visual'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(socialcoverthumbnail|wechatcover|xiaohongshu|thumbnail|cover)'
        OR facet_text LIKE '%封面%'
        OR facet_text LIKE '%缩略图%'
      THEN 'social-cover-thumbnail'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(characterdesign|characterconsistency|conceptart|character)'
        OR facet_text LIKE '%角色%'
      THEN 'character-design'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(uiinfographic|infographic|dashboard|ui)'
        OR facet_text LIKE '%信息图%'
      THEN 'ui-infographic'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(interiorarchitecture|architecture|interior|space)'
        OR facet_text LIKE '%建筑%'
        OR facet_text LIKE '%空间%'
        OR facet_text LIKE '%室内%'
      THEN 'interior-architecture'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(styleremixreference|styleremix|stylereference|sref)'
        OR facet_text LIKE '%风格%'
      THEN 'style-remix-reference'::TEXT
    END,
    CASE
      WHEN compact_facet_text ~ '(videomotion|storyboard|motion|video)'
        OR facet_text LIKE '%视频%'
        OR facet_text LIKE '%分镜%'
      THEN 'video-motion'::TEXT
    END
  ], NULL)::TEXT[] AS canonical_label_slugs,
  COALESCE(normalized.sort_order, 0) AS featured_rank,
  normalized.created_at AS published_at,
  (
    LN(1 + GREATEST(COALESCE(normalized.view_count, 0), 0)) * 0.35 +
    LN(1 + GREATEST(COALESCE(normalized.copy_count, 0), 0)) * 0.25 +
    LN(1 + GREATEST(COALESCE(normalized.generate_count, 0), 0)) * 0.25 +
    CASE WHEN normalized.featured THEN 0.75 ELSE 0 END
  )::NUMERIC AS hot_score
FROM normalized;

CREATE OR REPLACE FUNCTION public.search_prompt_library_public(
  p_limit INTEGER DEFAULT 36,
  p_locale TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_label TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'featured',
  p_cursor TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_require_image BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH params AS (
  SELECT
    LEAST(GREATEST(COALESCE(p_limit, 36), 1), 100) AS limit_value,
    NULLIF(BTRIM(COALESCE(p_locale, '')), '') AS locale_value,
    NULLIF(REGEXP_REPLACE(LOWER(BTRIM(COALESCE(p_model, ''))), '[_.[:space:]]+', '-', 'g'), '') AS model_value,
    NULLIF(REGEXP_REPLACE(LOWER(BTRIM(COALESCE(p_label, ''))), '[_.[:space:]]+', '-', 'g'), '') AS label_value,
    CASE
      WHEN LOWER(BTRIM(COALESCE(p_sort, ''))) IN ('latest', 'hot')
      THEN LOWER(BTRIM(COALESCE(p_sort, '')))
      ELSE 'featured'
    END AS sort_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^offset:[0-9]+$'
      THEN GREATEST(REPLACE(p_cursor, 'offset:', '')::INTEGER, 0)
      ELSE 0
    END AS offset_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN SPLIT_PART(p_cursor, ':', 3)
      ELSE NULL
    END AS cursor_sort_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN SPLIT_PART(p_cursor, ':', 4) = '1'
      ELSE NULL
    END AS cursor_featured_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN NULLIF(SPLIT_PART(p_cursor, ':', 5), '')::NUMERIC
      ELSE NULL
    END AS cursor_rank_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN NULLIF(SPLIT_PART(p_cursor, ':', 6), '')::NUMERIC
      ELSE NULL
    END AS cursor_hot_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN TO_TIMESTAMP((NULLIF(SPLIT_PART(p_cursor, ':', 7), '')::NUMERIC) / 1000.0)
      ELSE NULL
    END AS cursor_published_value,
    CASE
      WHEN COALESCE(p_cursor, '') ~ '^cursor:v1:(featured|latest|hot):'
      THEN NULLIF(SPLIT_PART(p_cursor, ':', 8), '')
      ELSE NULL
    END AS cursor_id_value,
    LOWER(NULLIF(BTRIM(COALESCE(p_search, '')), '')) AS search_value,
    COALESCE(p_require_image, true) AS require_image_value
),
model_defs AS (
  SELECT *
  FROM (VALUES
    ('gpt-image-2'::TEXT, 'GPT Image 2'::TEXT, 'GPT Image 2'::TEXT, 10),
    ('nano-banana', 'Nano Banana', 'Nano Banana', 20),
    ('flux', 'Flux', 'Flux', 30),
    ('midjourney-alternative', 'Midjourney', 'Midjourney', 40),
    ('seedream', 'Seedream', 'Seedream', 50),
    ('seedance-2-0', 'Seedance 2.0', 'Seedance 2.0', 60)
  ) AS definition(slug, label_zh, label_en, sort_order)
),
label_defs AS (
  SELECT *
  FROM (VALUES
    ('featured'::TEXT, '精选'::TEXT, 'Featured'::TEXT, 10),
    ('portrait-photography', '人像摄影', 'Portrait', 20),
    ('product-commercial', '商品广告', 'Product Ads', 30),
    ('poster-key-visual', '海报 KV', 'Poster KV', 40),
    ('social-cover-thumbnail', '封面缩略图', 'Covers', 50),
    ('character-design', '角色设定', 'Character', 60),
    ('ui-infographic', 'UI 信息图', 'UI Infographic', 70),
    ('interior-architecture', '建筑空间', 'Architecture', 80),
    ('style-remix-reference', '风格改写', 'Style Remix', 90),
    ('video-motion', '视频分镜', 'Video Storyboard', 100)
  ) AS definition(slug, label_zh, label_en, sort_order)
),
base_cases AS (
  SELECT pci.*
  FROM public.prompt_case_public_index pci
  CROSS JOIN params p
  WHERE (
      p.locale_value IS NULL
      OR pci.locale = p.locale_value
      OR (
        p.locale_value = 'zh-CN'
        AND (
          NULLIF(BTRIM(COALESCE(pci.title_zh, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(pci.prompt_zh, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(pci.prompt_preview_zh, '')), '') IS NOT NULL
        )
      )
      OR (
        p.locale_value = 'en-US'
        AND (
          NULLIF(BTRIM(COALESCE(pci.title_en, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(pci.prompt_en, '')), '') IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(pci.prompt_preview_en, '')), '') IS NOT NULL
        )
      )
    )
    AND (
      p.require_image_value = false
      OR NULLIF(BTRIM(COALESCE(pci.image_url, '')), '') IS NOT NULL
      OR jsonb_array_length(COALESCE(pci.image_urls, '[]'::jsonb)) > 0
    )
    AND (
      p.search_value IS NULL
      OR LOWER(COALESCE(pci.searchable_text, '')) LIKE '%' || p.search_value || '%'
      OR LOWER(COALESCE(pci.prompt, '')) LIKE '%' || p.search_value || '%'
      OR LOWER(COALESCE(pci.prompt_zh, '')) LIKE '%' || p.search_value || '%'
      OR LOWER(COALESCE(pci.prompt_en, '')) LIKE '%' || p.search_value || '%'
    )
),
rows_for_model_facets AS (
  SELECT base_cases.*
  FROM base_cases
  CROSS JOIN params p
  WHERE p.label_value IS NULL
    OR p.label_value = ANY(base_cases.canonical_label_slugs)
),
rows_for_label_facets AS (
  SELECT base_cases.*
  FROM base_cases
  CROSS JOIN params p
  WHERE p.model_value IS NULL
    OR base_cases.canonical_model_slug = p.model_value
),
filtered_cases AS (
  SELECT base_cases.*
  FROM base_cases
  CROSS JOIN params p
  WHERE (
      p.model_value IS NULL
      OR base_cases.canonical_model_slug = p.model_value
    )
    AND (
      p.label_value IS NULL
      OR p.label_value = ANY(base_cases.canonical_label_slugs)
    )
),
ordered_cases AS (
  SELECT
    filtered_cases.*,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE WHEN p.sort_value = 'featured' THEN filtered_cases.featured END DESC,
        CASE WHEN p.sort_value = 'featured' THEN filtered_cases.featured_rank END ASC NULLS LAST,
        CASE WHEN p.sort_value = 'hot' THEN filtered_cases.hot_score END DESC NULLS LAST,
        filtered_cases.published_at DESC,
        CASE WHEN p.sort_value = 'featured' THEN filtered_cases.id END ASC,
        CASE WHEN p.sort_value <> 'featured' THEN filtered_cases.id END DESC
    ) AS library_row_number
  FROM filtered_cases
  CROSS JOIN params p
),
page_cases AS (
  SELECT ordered_cases.*
  FROM ordered_cases
  CROSS JOIN params p
  WHERE (
      p.cursor_sort_value IS NULL
      AND ordered_cases.library_row_number > p.offset_value
    )
    OR (
      p.cursor_sort_value = p.sort_value
      AND (
        (
          p.sort_value = 'featured'
          AND (
            ordered_cases.featured < p.cursor_featured_value
            OR (
              ordered_cases.featured = p.cursor_featured_value
              AND ordered_cases.featured_rank > p.cursor_rank_value
            )
            OR (
              ordered_cases.featured = p.cursor_featured_value
              AND ordered_cases.featured_rank = p.cursor_rank_value
              AND ordered_cases.published_at < p.cursor_published_value
            )
            OR (
              ordered_cases.featured = p.cursor_featured_value
              AND ordered_cases.featured_rank = p.cursor_rank_value
              AND ordered_cases.published_at = p.cursor_published_value
              AND ordered_cases.id::TEXT > p.cursor_id_value
            )
          )
        )
        OR (
          p.sort_value = 'latest'
          AND (
            ordered_cases.published_at < p.cursor_published_value
            OR (
              ordered_cases.published_at = p.cursor_published_value
              AND ordered_cases.id::TEXT < p.cursor_id_value
            )
          )
        )
        OR (
          p.sort_value = 'hot'
          AND (
            ordered_cases.hot_score < p.cursor_hot_value
            OR (
              ordered_cases.hot_score = p.cursor_hot_value
              AND ordered_cases.published_at < p.cursor_published_value
            )
            OR (
              ordered_cases.hot_score = p.cursor_hot_value
              AND ordered_cases.published_at = p.cursor_published_value
              AND ordered_cases.id::TEXT < p.cursor_id_value
            )
          )
        )
      )
    )
  ORDER BY ordered_cases.library_row_number
  LIMIT ((SELECT limit_value FROM params) + 1)
),
visible_page_cases AS (
  SELECT page_cases.*
  FROM page_cases
  ORDER BY page_cases.library_row_number
  LIMIT (SELECT limit_value FROM params)
),
total_count AS (
  SELECT COUNT(*)::INTEGER AS value FROM filtered_cases
),
model_counts AS (
  SELECT
    md.slug,
    md.label_zh,
    md.label_en,
    md.sort_order,
    COUNT(rfm.id)::INTEGER AS case_count
  FROM model_defs md
  LEFT JOIN rows_for_model_facets rfm
    ON rfm.canonical_model_slug = md.slug
  GROUP BY md.slug, md.label_zh, md.label_en, md.sort_order
),
label_counts AS (
  SELECT
    ld.slug,
    ld.label_zh,
    ld.label_en,
    ld.sort_order,
    COUNT(rfl.id)::INTEGER AS case_count
  FROM label_defs ld
  LEFT JOIN rows_for_label_facets rfl
    ON ld.slug = ANY(rfl.canonical_label_slugs)
  GROUP BY ld.slug, ld.label_zh, ld.label_en, ld.sort_order
),
facet_payload AS (
  SELECT jsonb_build_object(
    'models',
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', slug,
          'label', CASE WHEN (SELECT locale_value FROM params) = 'en-US' THEN label_en ELSE label_zh END,
          'count', case_count,
          'active', slug = (SELECT model_value FROM params)
        )
        ORDER BY sort_order
      )
      FROM model_counts
    ),
    'labels',
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'slug', slug,
          'label', CASE WHEN (SELECT locale_value FROM params) = 'en-US' THEN label_en ELSE label_zh END,
          'count', case_count,
          'active', slug = (SELECT label_value FROM params)
        )
        ORDER BY sort_order
      )
      FROM label_counts
    ),
    'sorts',
    jsonb_build_array(
      jsonb_build_object(
        'slug', 'featured',
        'label', CASE WHEN (SELECT locale_value FROM params) = 'en-US' THEN 'Featured' ELSE '精选' END,
        'active', (SELECT sort_value FROM params) = 'featured'
      ),
      jsonb_build_object(
        'slug', 'latest',
        'label', CASE WHEN (SELECT locale_value FROM params) = 'en-US' THEN 'Latest' ELSE '最新' END,
        'active', (SELECT sort_value FROM params) = 'latest'
      ),
      jsonb_build_object(
        'slug', 'hot',
        'label', CASE WHEN (SELECT locale_value FROM params) = 'en-US' THEN 'Hot' ELSE '最热' END,
        'active', (SELECT sort_value FROM params) = 'hot'
      )
    )
  ) AS value
)
SELECT jsonb_build_object(
  'items', COALESCE((
    SELECT jsonb_agg(
      to_jsonb(visible_page_cases)
        - 'library_row_number'
        - 'facet_text'
        - 'compact_facet_text'
        - 'searchable_text'
      ORDER BY visible_page_cases.library_row_number
    )
    FROM visible_page_cases
  ), '[]'::jsonb),
  'total', (SELECT value FROM total_count),
  'pageInfo', jsonb_build_object(
    'nextCursor',
    CASE
      WHEN (SELECT COUNT(*) FROM page_cases) > (SELECT limit_value FROM params)
      THEN (
        SELECT CONCAT_WS(
          ':',
          'cursor',
          'v1',
          (SELECT sort_value FROM params),
          CASE WHEN visible_page_cases.featured THEN '1' ELSE '0' END,
          visible_page_cases.featured_rank::TEXT,
          visible_page_cases.hot_score::TEXT,
          FLOOR(EXTRACT(EPOCH FROM visible_page_cases.published_at) * 1000)::BIGINT::TEXT,
          visible_page_cases.id::TEXT
        )
        FROM visible_page_cases
        ORDER BY visible_page_cases.library_row_number DESC
        LIMIT 1
      )
      ELSE NULL
    END,
    'hasMore', (SELECT COUNT(*) FROM page_cases) > (SELECT limit_value FROM params)
  ),
  'facets', (SELECT value FROM facet_payload),
  'queryEcho', jsonb_build_object(
    'locale', COALESCE((SELECT locale_value FROM params), 'zh-CN'),
    'model', (SELECT model_value FROM params),
    'label', (SELECT label_value FROM params),
    'sort', (SELECT sort_value FROM params),
    'q', NULLIF(COALESCE(p_search, ''), ''),
    'cursor', NULLIF(COALESCE(p_cursor, ''), ''),
    'limit', (SELECT limit_value FROM params)
  ),
  'version', 'prompt-library-v2',
  'source', 'database'
);
$$;

REVOKE EXECUTE ON FUNCTION public.search_prompt_library_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_prompt_library_public(
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
