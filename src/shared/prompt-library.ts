export type PromptLibrarySort = 'featured' | 'latest' | 'hot';

export type PromptLibrarySource = 'database' | 'cache' | 'fallback';

export interface PromptLibraryFacetDefinition {
  slug: string;
  labelZh: string;
  labelEn: string;
  aliases: string[];
}

export interface PromptLibraryQuery {
  locale: 'zh-CN' | 'en-US' | string;
  model?: string;
  label?: string;
  mediaType?: 'image' | 'video';
  seoOnly?: boolean;
  sort: PromptLibrarySort;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface PromptLibraryFacet {
  slug: string;
  label: string;
  count: number;
  active: boolean;
}

export interface PromptLibrarySortFacet {
  slug: PromptLibrarySort;
  label: string;
  active: boolean;
}

export interface PromptLibraryFacets {
  models: PromptLibraryFacet[];
  labels: PromptLibraryFacet[];
  sorts: PromptLibrarySortFacet[];
}

export interface PromptLibraryPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
}

export const PROMPT_LIBRARY_MODELS: PromptLibraryFacetDefinition[] = [
  {
    slug: 'gpt-image-2',
    labelZh: 'GPT Image 2',
    labelEn: 'GPT Image 2',
    aliases: ['gpt-image-2', 'gpt image 2', 'gpt image2']
  },
  {
    slug: 'nano-banana',
    labelZh: 'Nano Banana',
    labelEn: 'Nano Banana',
    aliases: ['nano-banana', 'nano banana', 'nanobanana', 'gemini image']
  },
  {
    slug: 'flux',
    labelZh: 'Flux',
    labelEn: 'Flux',
    aliases: ['flux', 'flux ai']
  },
  {
    slug: 'grok-imagine',
    labelZh: 'Grok Imagine',
    labelEn: 'Grok Imagine',
    aliases: [
      'grok-imagine',
      'grok imagine',
      'imagine image 2.0',
      'imagine image 2',
      'grok imagine image 2.0',
      'xai imagine image 2.0'
    ]
  },
  {
    slug: 'midjourney-alternative',
    labelZh: 'Midjourney',
    labelEn: 'Midjourney',
    aliases: ['midjourney-alternative', 'midjourney', 'midjourney v7', 'mj']
  },
  {
    slug: 'seedream',
    labelZh: 'Seedream',
    labelEn: 'Seedream',
    aliases: ['seedream', 'seedream-5-lite', 'seedream-5.0-lite']
  },
  {
    slug: 'seedance-2-0',
    labelZh: 'Seedance 2.0',
    labelEn: 'Seedance 2.0',
    aliases: ['seedance-2-0', 'seedance 2.0', 'seedance']
  }
];

export const PROMPT_LIBRARY_LABELS: PromptLibraryFacetDefinition[] = [
  {
    slug: 'featured',
    labelZh: '精选',
    labelEn: 'Featured',
    aliases: ['featured', '精选']
  },
  {
    slug: 'portrait-photography',
    labelZh: '人像摄影',
    labelEn: 'Portrait',
    aliases: [
      'portrait-photography',
      'portrait',
      'ai-portrait',
      'portrait prompts',
      'fashion'
    ]
  },
  {
    slug: 'product-commercial',
    labelZh: '商品广告',
    labelEn: 'Product Ads',
    aliases: [
      'product-commercial',
      'product-images',
      'product',
      'ecommerce',
      'commercial',
      'skincare'
    ]
  },
  {
    slug: 'poster-key-visual',
    labelZh: '海报 KV',
    labelEn: 'Poster KV',
    aliases: ['poster-key-visual', 'poster', 'kv', 'key visual']
  },
  {
    slug: 'social-cover-thumbnail',
    labelZh: '封面缩略图',
    labelEn: 'Covers',
    aliases: [
      'social-cover-thumbnail',
      'cover',
      'thumbnail',
      'xiaohongshu',
      'wechat-cover'
    ]
  },
  {
    slug: 'character-design',
    labelZh: '角色设定',
    labelEn: 'Character',
    aliases: [
      'character-design',
      'character',
      'character consistency',
      'concept art',
      '角色'
    ]
  },
  {
    slug: 'ui-infographic',
    labelZh: 'UI 信息图',
    labelEn: 'UI Infographic',
    aliases: ['ui-infographic', 'ui', 'infographic', 'dashboard']
  },
  {
    slug: 'interior-architecture',
    labelZh: '建筑空间',
    labelEn: 'Architecture',
    aliases: ['interior-architecture', 'architecture', 'interior', 'space']
  },
  {
    slug: 'style-remix-reference',
    labelZh: '风格改写',
    labelEn: 'Style Remix',
    aliases: ['style-remix-reference', 'style-remix', 'style reference', 'sref']
  },
  {
    slug: 'video-motion',
    labelZh: '视频分镜',
    labelEn: 'Video Storyboard',
    aliases: ['video-motion', 'video', 'motion', 'storyboard']
  }
];

export const PROMPT_LIBRARY_SORTS: Array<{
  slug: PromptLibrarySort;
  labelZh: string;
  labelEn: string;
}> = [
  { slug: 'featured', labelZh: '精选', labelEn: 'Featured' },
  { slug: 'latest', labelZh: '最新', labelEn: 'Latest' },
  { slug: 'hot', labelZh: '最热', labelEn: 'Hot' }
];

export function normalizePromptLibraryToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s.]+/g, '-');
}

function compactPromptLibraryToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '');
}

function getRecordString(
  source: Record<string, unknown>,
  keys: string[]
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function getRecordStringArray(
  source: Record<string, unknown>,
  keys: string[]
): string[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    }
  }
  return [];
}

function definitionMatches(
  definition: PromptLibraryFacetDefinition,
  value: unknown
): boolean {
  const compactValue = compactPromptLibraryToken(value);
  if (!compactValue) return false;
  return [definition.slug, ...definition.aliases].some(
    (alias) => compactPromptLibraryToken(alias) === compactValue
  );
}

export function canonicalizePromptLibraryModel(value: unknown): string {
  const direct = normalizePromptLibraryToken(value);
  if (!direct) return '';
  const exactDefinition = PROMPT_LIBRARY_MODELS.find(
    (definition) => definition.slug === direct
  );
  if (exactDefinition) return exactDefinition.slug;
  const matchedDefinition = PROMPT_LIBRARY_MODELS.find((definition) =>
    definitionMatches(definition, value)
  );
  return matchedDefinition?.slug || direct;
}

export function canonicalizePromptLibraryLabel(value: unknown): string {
  const direct = normalizePromptLibraryToken(value);
  if (!direct) return '';
  const exactDefinition = PROMPT_LIBRARY_LABELS.find(
    (definition) => definition.slug === direct
  );
  if (exactDefinition) return exactDefinition.slug;
  const matchedDefinition = PROMPT_LIBRARY_LABELS.find((definition) =>
    definitionMatches(definition, value)
  );
  return matchedDefinition?.slug || direct;
}

export function getPromptLibraryModelSlug(
  source: Record<string, unknown>
): string {
  const model = getRecordString(source, ['canonical_model_slug', 'model']);
  const canonicalModel = canonicalizePromptLibraryModel(model);
  if (canonicalModel) return canonicalModel;

  const tags = getRecordStringArray(source, ['tags']);
  for (const tag of tags) {
    const matched = PROMPT_LIBRARY_MODELS.find((definition) =>
      definitionMatches(definition, tag)
    );
    if (matched) return matched.slug;
  }
  return 'unknown';
}

export function getPromptLibraryLabelSlugs(
  source: Record<string, unknown>
): string[] {
  const slugs = new Set<string>();
  const existingCanonical = getRecordStringArray(source, [
    'canonical_label_slugs',
    'canonicalLabelSlugs'
  ]);
  existingCanonical.forEach((value) => {
    const canonical = canonicalizePromptLibraryLabel(value);
    if (canonical) slugs.add(canonical);
  });

  const category = getRecordString(source, ['category']);
  const packageSlug = getRecordString(source, ['package_slug', 'packageSlug']);
  const tags = getRecordStringArray(source, ['tags']);
  const candidates = [category, packageSlug, ...tags].filter(Boolean);

  candidates.forEach((candidate) => {
    PROMPT_LIBRARY_LABELS.forEach((definition) => {
      if (definitionMatches(definition, candidate)) {
        slugs.add(definition.slug);
      }
    });
  });

  if (
    source.featured === true ||
    normalizePromptLibraryToken(category) === 'featured'
  ) {
    slugs.add('featured');
  }

  return Array.from(slugs);
}

export function getPromptLibraryFacetLabel(
  definition: Pick<PromptLibraryFacetDefinition, 'labelZh' | 'labelEn'>,
  locale: string
): string {
  return locale === 'zh-CN' ? definition.labelZh : definition.labelEn;
}

export function normalizePromptLibrarySort(value: unknown): PromptLibrarySort {
  const sort = normalizePromptLibraryToken(value);
  if (sort === 'latest' || sort === 'hot') return sort;
  return 'featured';
}
