import {
  getAssetById,
  imagePromptAssets,
  type ImagePromptAsset,
  type ImagePromptSlot,
  type PromptLocale
} from './image-prompt-core';
import { getPromptStyleGridTemplateSeoCopy } from '@/shared/prompt-style-grid-seo';

export type PromptStyleGridTemplateSlug =
  | 'taste'
  | 'portrait'
  | 'product'
  | 'character'
  | 'gpt-image-2'
  | 'nano-banana'
  | 'seedream'
  | 'midjourney'
  | 'social-cover'
  | 'anime-avatar'
  | 'sticker'
  | 'cinematic-poster';

export type PromptStyleGridSlotId =
  | 'style'
  | 'lighting'
  | 'background'
  | 'composition'
  | 'subject'
  | 'layout'
  | 'lens'
  | 'detail';

export type PromptStyleGridSlot = {
  id: PromptStyleGridSlotId;
  label: string;
  description: string;
  sourceSlots: ImagePromptSlot[];
};

export type PromptStyleGridTemplate = {
  slug: PromptStyleGridTemplateSlug;
  title: string;
  shortTitle: string;
  category: string;
  description: string;
  thumbnailUrl: string;
  recommendedModel: string;
  recommendedImageSize: string;
  seoKeywords: string[];
  defaultAssetIds: string[];
  caseFilter: {
    category?: string;
    model?: string;
    packageSlug?: string;
    tag?: string;
  };
};

const themeCardThumbnailUrls: Record<PromptStyleGridTemplateSlug, string> = {
  taste: new URL('../assets/theme-cards/taste.webp', import.meta.url).href,
  portrait: new URL('../assets/theme-cards/portrait.webp', import.meta.url)
    .href,
  product: new URL('../assets/theme-cards/product.webp', import.meta.url).href,
  character: new URL('../assets/theme-cards/character.webp', import.meta.url)
    .href,
  'gpt-image-2': new URL(
    '../assets/theme-cards/gpt-image-2.webp',
    import.meta.url
  ).href,
  'nano-banana': new URL(
    '../assets/theme-cards/nano-banana.webp',
    import.meta.url
  ).href,
  seedream: new URL('../assets/theme-cards/seedream.webp', import.meta.url)
    .href,
  midjourney: new URL('../assets/theme-cards/midjourney.webp', import.meta.url)
    .href,
  'social-cover': new URL(
    '../assets/theme-cards/social-cover.webp',
    import.meta.url
  ).href,
  'anime-avatar': new URL(
    '../assets/theme-cards/anime-avatar.webp',
    import.meta.url
  ).href,
  sticker: new URL('../assets/theme-cards/sticker.webp', import.meta.url).href,
  'cinematic-poster': new URL(
    '../assets/theme-cards/cinematic-poster.webp',
    import.meta.url
  ).href
};

export const promptStyleGridSlots: PromptStyleGridSlot[] = [
  {
    id: 'style',
    label: 'Style',
    description: 'Overall art direction and output mood.',
    sourceSlots: ['style']
  },
  {
    id: 'lighting',
    label: 'Lighting',
    description: 'Light source, contrast and highlight behavior.',
    sourceSlots: ['lighting']
  },
  {
    id: 'background',
    label: 'Background',
    description: 'Scene, space and environmental context.',
    sourceSlots: ['background']
  },
  {
    id: 'composition',
    label: 'Composition',
    description: 'Shot size, framing and camera position.',
    sourceSlots: ['shot']
  },
  {
    id: 'subject',
    label: 'Subject',
    description: 'Character, model or central visual anchor.',
    sourceSlots: ['character']
  },
  {
    id: 'layout',
    label: 'Layout',
    description: 'Graphic system, text space and reading path.',
    sourceSlots: ['layoutDesign']
  },
  {
    id: 'lens',
    label: 'Lens',
    description: 'Camera language, depth and optical texture.',
    sourceSlots: ['lens']
  },
  {
    id: 'detail',
    label: 'Detail',
    description: 'Props, accessories or post effects that add memory.',
    sourceSlots: ['visualEffect', 'accessory', 'prop', 'makeup', 'pose']
  }
];

export const promptStyleGridTemplates: PromptStyleGridTemplate[] = [
  {
    slug: 'taste',
    title: 'Personal Taste Theme Card',
    shortTitle: 'Personal Taste',
    category: 'Starter',
    description:
      'A balanced starter card for creators who want a clear visual direction before opening the studio.',
    thumbnailUrl: themeCardThumbnailUrls.taste,
    recommendedModel: 'gpt-image-2',
    recommendedImageSize: '1024x1536',
    seoKeywords: [
      'AI image prompt style grid',
      'AI image prompt template',
      'AI image prompts for creators'
    ],
    defaultAssetIds: [
      'style-clean-product-editorial',
      'lighting-large-softbox',
      'background-warm-studio',
      'shot-half-body',
      'character-refined-model',
      'layoutDesign-magazine-cover-grid',
      'lens-85mm-portrait',
      'visualEffect-fine-film-grain'
    ],
    caseFilter: { packageSlug: 'ai-image-prompt-examples' }
  },
  {
    slug: 'portrait',
    title: 'Portrait Theme Card',
    shortTitle: 'Portrait',
    category: 'Portrait',
    description:
      'Pick the portrait styling, lighting, camera and face details before filling the card.',
    thumbnailUrl: themeCardThumbnailUrls.portrait,
    recommendedModel: 'gpt-image-2',
    recommendedImageSize: '1024x1536',
    seoKeywords: [
      'AI portrait prompt template',
      'AI portrait style grid',
      'GPT Image 2 portrait prompts'
    ],
    defaultAssetIds: [
      'style-high-end-fashion-photo',
      'lighting-soft-backlit',
      'background-warm-studio',
      'shot-face-closeup',
      'character-refined-model',
      'layoutDesign-lookbook-callout-grid',
      'lens-85mm-portrait',
      'makeup-natural-clean'
    ],
    caseFilter: { category: 'ai-portrait' }
  },
  {
    slug: 'product',
    title: 'Product Photography Theme Card',
    shortTitle: 'Product Shoot',
    category: 'Product',
    description:
      'Shape a product photography card with studio light, clean framing, ecommerce layout and selling-point texture.',
    thumbnailUrl: themeCardThumbnailUrls.product,
    recommendedModel: 'wan-image-2-7-pro',
    recommendedImageSize: '1536x1024',
    seoKeywords: [
      'AI product photography prompt',
      'product photography prompt grid',
      'AI ecommerce image prompt template'
    ],
    defaultAssetIds: [
      'style-clean-product-editorial',
      'lighting-large-softbox',
      'background-warm-studio',
      'shot-full-body',
      'character-refined-model',
      'layoutDesign-ecommerce-kv',
      'lens-35mm-documentary',
      'prop-coffee-cup'
    ],
    caseFilter: { category: 'product-photography' }
  },
  {
    slug: 'character',
    title: 'Character Design Theme Card',
    shortTitle: 'Character',
    category: 'Character',
    description:
      'Build a character concept card with a recognizable subject, world context, pose and profile layout.',
    thumbnailUrl: themeCardThumbnailUrls.character,
    recommendedModel: 'midjourney-niji-v7',
    recommendedImageSize: '1024x1536',
    seoKeywords: [
      'AI character design prompt',
      'character design style grid',
      'AI character prompt template'
    ],
    defaultAssetIds: [
      'style-game-character-concept',
      'lighting-colored-gel',
      'background-neon-alley',
      'shot-low-angle-hero',
      'character-cyber-courier',
      'layoutDesign-character-profile',
      'lens-anamorphic-cinematic',
      'pose-energetic-jump'
    ],
    caseFilter: { category: 'character-design' }
  },
  {
    slug: 'gpt-image-2',
    title: 'GPT Image 2 Theme Card',
    shortTitle: 'GPT Image 2',
    category: 'Model',
    description:
      'A clean card template for high-control commercial visuals, readable layouts and reusable image prompts.',
    thumbnailUrl: themeCardThumbnailUrls['gpt-image-2'],
    recommendedModel: 'gpt-image-2',
    recommendedImageSize: '1024x1536',
    seoKeywords: [
      'GPT Image 2 prompts',
      'GPT Image 2 prompt template',
      'free GPT Image 2 prompt grid'
    ],
    defaultAssetIds: [
      'style-clean-product-editorial',
      'lighting-large-softbox',
      'background-warm-studio',
      'shot-half-body',
      'character-refined-model',
      'layoutDesign-magazine-cover-grid',
      'lens-85mm-portrait',
      'visualEffect-fine-film-grain'
    ],
    caseFilter: { model: 'gpt-image-2' }
  },
  {
    slug: 'nano-banana',
    title: 'Nano Banana Theme Card',
    shortTitle: 'Nano Banana',
    category: 'Model',
    description:
      'A fast card starter for reference-style iterations, lifestyle portraits and shareable visual ideas.',
    thumbnailUrl: themeCardThumbnailUrls['nano-banana'],
    recommendedModel: 'nano-banana',
    recommendedImageSize: '1024x1536',
    seoKeywords: [
      'Nano Banana prompts gallery',
      'Nano Banana prompt template',
      'Nano Banana AI image prompts'
    ],
    defaultAssetIds: [
      'style-pastel-lookbook-photo',
      'lighting-golden-hour',
      'background-city-corner',
      'shot-over-shoulder',
      'character-music-producer',
      'layoutDesign-vertical-split-title',
      'lens-phone-selfie',
      'prop-smartphone'
    ],
    caseFilter: { model: 'nano-banana' }
  },
  {
    slug: 'seedream',
    title: 'Seedream Scene Theme Card',
    shortTitle: 'Seedream',
    category: 'Model',
    description:
      'A scene card for high-aesthetic realistic images, clean lighting and polished commercial outputs.',
    thumbnailUrl: themeCardThumbnailUrls.seedream,
    recommendedModel: 'seedream-5-lite',
    recommendedImageSize: '1536x1024',
    seoKeywords: [
      'Seedream prompts',
      'Seedream AI image prompt',
      'Seedream style grid'
    ],
    defaultAssetIds: [
      'style-high-end-fashion-photo',
      'lighting-overcast-diffuse',
      'background-garden-path',
      'shot-profile-closeup',
      'character-refined-model',
      'layoutDesign-negative-space-poster',
      'lens-35mm-documentary',
      'visualEffect-dramatic-depth'
    ],
    caseFilter: { model: 'seedream-5-lite' }
  },
  {
    slug: 'midjourney',
    title: 'Cinematic Mood Theme Card',
    shortTitle: 'Midjourney',
    category: 'Cinematic',
    description:
      'A stylized card for cinematic posters, editorial worlds and mood-heavy visual exploration.',
    thumbnailUrl: themeCardThumbnailUrls.midjourney,
    recommendedModel: 'midjourney-v7',
    recommendedImageSize: '1536x1024',
    seoKeywords: [
      'Midjourney style grid',
      'Midjourney prompt template',
      'AI cinematic style prompts'
    ],
    defaultAssetIds: [
      'style-cinematic-rainy-film',
      'lighting-candle-warm',
      'background-rainy-window',
      'shot-dutch-angle',
      'character-raincoat-commuter',
      'layoutDesign-cinematic-subtitle-bar',
      'lens-anamorphic-cinematic',
      'visualEffect-rain-streaks'
    ],
    caseFilter: { tag: 'cinematic' }
  },
  {
    slug: 'social-cover',
    title: 'Social Cover Theme Card',
    shortTitle: 'Social Cover',
    category: 'Social',
    description:
      'A social media cover card for tutorial thumbnails, launch posts, Xiaohongshu covers and creator campaigns.',
    thumbnailUrl: themeCardThumbnailUrls['social-cover'],
    recommendedModel: 'gpt-image-2',
    recommendedImageSize: '864x1536',
    seoKeywords: [
      'AI social media cover prompt',
      'AI thumbnail prompt template',
      'Xiaohongshu cover prompt'
    ],
    defaultAssetIds: [
      'style-retro-pop-album-cover',
      'lighting-window-stripes',
      'background-recording-studio',
      'shot-half-body',
      'character-music-producer',
      'layoutDesign-sticker-label-system',
      'lens-35mm-documentary',
      'prop-white-headphones'
    ],
    caseFilter: { packageSlug: 'ai-image-prompt-examples' }
  },
  {
    slug: 'anime-avatar',
    title: 'Anime Avatar Theme Card',
    shortTitle: 'Anime Avatar',
    category: 'Avatar',
    description:
      'An anime avatar card for profile pictures, character headshots, soft illustration styles and clean portraits.',
    thumbnailUrl: themeCardThumbnailUrls['anime-avatar'],
    recommendedModel: 'midjourney-niji-v7',
    recommendedImageSize: '1024x1024',
    seoKeywords: [
      'AI anime avatar prompt',
      'anime profile picture prompt',
      'AI avatar prompt template'
    ],
    defaultAssetIds: [
      'style-delicate-anime-watercolor',
      'lighting-soft-backlit',
      'background-soft-bedroom',
      'shot-face-closeup',
      'character-violet-anime-girl',
      'layoutDesign-glass-title-bottom',
      'lens-85mm-portrait',
      'makeup-peach-blush'
    ],
    caseFilter: { category: 'ai-portrait' }
  },
  {
    slug: 'sticker',
    title: 'Sticker Pack Theme Card',
    shortTitle: 'Sticker',
    category: 'Sticker',
    description:
      'A compact card for cute 3D mascot stickers, reaction packs and simple shareable characters.',
    thumbnailUrl: themeCardThumbnailUrls.sticker,
    recommendedModel: 'nano-banana',
    recommendedImageSize: '1024x1024',
    seoKeywords: [
      'AI sticker prompt',
      'AI sticker generator prompt',
      'cute 3D sticker prompt'
    ],
    defaultAssetIds: [
      'style-soft-3d-clay',
      'lighting-large-softbox',
      'background-warm-studio',
      'shot-full-body',
      'character-soft-elf-girl',
      'layoutDesign-sticker-label-system',
      'lens-35mm-documentary',
      'pose-victory-hand'
    ],
    caseFilter: { tag: 'sticker' }
  },
  {
    slug: 'cinematic-poster',
    title: 'Movie Poster Theme Card',
    shortTitle: 'Cinematic Poster',
    category: 'Poster',
    description:
      'A cinematic poster card for moody posters, movie-style key visuals and dramatic image examples.',
    thumbnailUrl: themeCardThumbnailUrls['cinematic-poster'],
    recommendedModel: 'midjourney-v7',
    recommendedImageSize: '1536x1024',
    seoKeywords: [
      'AI cinematic poster prompt',
      'movie poster prompt template',
      'AI poster style grid'
    ],
    defaultAssetIds: [
      'style-cinematic-rainy-film',
      'lighting-neon-rim',
      'background-neon-alley',
      'shot-low-angle-hero',
      'character-cyber-courier',
      'layoutDesign-negative-space-poster',
      'lens-anamorphic-cinematic',
      'visualEffect-chromatic-aberration'
    ],
    caseFilter: { category: 'poster' }
  }
];

const templateBySlug = new Map(
  promptStyleGridTemplates.map((template) => [template.slug, template])
);

function titleCase(value: string): string {
  return value
    .replace(/^[^-]+-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isAllowedAssetForSlot(
  asset: ImagePromptAsset | undefined,
  slot: PromptStyleGridSlot
): asset is ImagePromptAsset {
  return Boolean(asset && slot.sourceSlots.includes(asset.slot));
}

export function getPromptStyleGridTemplate(
  slug?: string | null
): PromptStyleGridTemplate {
  if (!slug) return promptStyleGridTemplates[0];
  return (
    templateBySlug.get(slug as PromptStyleGridTemplateSlug) ||
    promptStyleGridTemplates[0]
  );
}

export function getPromptStyleGridAssetsForSlot(
  slot: PromptStyleGridSlot,
  assets: ImagePromptAsset[] = imagePromptAssets
): ImagePromptAsset[] {
  return assets.filter((asset) =>
    slot.sourceSlots.includes(asset.slot)
  );
}

export function getPromptStyleGridAssetTitle(
  asset: ImagePromptAsset,
  locale: PromptLocale = 'en-US'
): string {
  if (locale === 'zh-CN') return asset.title;
  return titleCase(asset.id);
}

export function getPromptStyleGridAssetSubtitle(
  asset: ImagePromptAsset,
  locale: PromptLocale = 'en-US'
): string {
  if (locale === 'zh-CN') return asset.subtitle;
  return asset.prompt.split(',')[0]?.trim() || titleCase(asset.id);
}

export function getPromptStyleGridAssetPrompt(
  asset: ImagePromptAsset,
  locale: PromptLocale = 'en-US'
): string {
  if (locale === 'zh-CN' && asset.promptZh) return asset.promptZh;
  return asset.prompt;
}

export function normalizePromptStyleGridAssetIds(
  templateSlug?: string | null,
  rawAssetIds: Array<string | null | undefined> = [],
  assets: ImagePromptAsset[] = imagePromptAssets
): string[] {
  const template = getPromptStyleGridTemplate(templateSlug);

  return promptStyleGridSlots.map((slot, index) => {
    const rawAsset = getAssetById(rawAssetIds[index], assets);
    if (isAllowedAssetForSlot(rawAsset, slot)) {
      return rawAsset.id;
    }

    const defaultAsset = getAssetById(template.defaultAssetIds[index], assets);
    if (isAllowedAssetForSlot(defaultAsset, slot)) {
      return defaultAsset.id;
    }

    return getPromptStyleGridAssetsForSlot(slot, assets)[0]?.id || '';
  });
}

export function parsePromptStyleGridItems(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function encodePromptStyleGridItems(assetIds: string[]): string {
  return assetIds.filter(Boolean).join(',');
}

export function parsePromptStyleGridSearchParams(
  input: string | URLSearchParams,
  assets: ImagePromptAsset[] = imagePromptAssets
): {
  template: PromptStyleGridTemplate;
  assetIds: string[];
} {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input;
  const template = getPromptStyleGridTemplate(params.get('template'));
  const assetIds = normalizePromptStyleGridAssetIds(
    template.slug,
    parsePromptStyleGridItems(params.get('items')),
    assets
  );
  return { template, assetIds };
}

export function buildPromptStyleGridSharePath(
  templateSlug: PromptStyleGridTemplateSlug,
  assetIds: string[]
): string {
  const params = new URLSearchParams();
  params.set('items', encodePromptStyleGridItems(assetIds));
  return `/ai-image-style-grid/${templateSlug}?${params.toString()}`;
}

export function buildPromptStyleGridParam(
  templateSlug: PromptStyleGridTemplateSlug,
  assetIds: string[]
): string {
  return `${templateSlug}:${encodePromptStyleGridItems(assetIds)}`;
}

export function parsePromptStyleGridParam(
  value?: string | null,
  assets: ImagePromptAsset[] = imagePromptAssets
): {
  template: PromptStyleGridTemplate;
  assetIds: string[];
} | null {
  if (!value) return null;
  const [rawTemplate, rawItems = ''] = value.split(':', 2);
  const template = getPromptStyleGridTemplate(rawTemplate);
  return {
    template,
    assetIds: normalizePromptStyleGridAssetIds(
      template.slug,
      parsePromptStyleGridItems(rawItems),
      assets
    )
  };
}

export function buildPromptStyleGridPrompt(
  templateSlug: PromptStyleGridTemplateSlug,
  assetIds: string[],
  locale: PromptLocale = 'en-US',
  assets: ImagePromptAsset[] = imagePromptAssets
): string {
  const template = getPromptStyleGridTemplate(templateSlug);
  const normalizedAssetIds = normalizePromptStyleGridAssetIds(
    template.slug,
    assetIds,
    assets
  );
  const slotLabelsZh: Record<PromptStyleGridSlotId, string> = {
    style: '风格',
    lighting: '光线',
    background: '背景',
    composition: '构图',
    subject: '主体',
    layout: '版式',
    lens: '镜头',
    detail: '细节'
  };
  const templateCopy = getPromptStyleGridTemplateSeoCopy(
    template.slug,
    locale
  );
  const templateTitle = templateCopy.title || template.title;
  const lines = promptStyleGridSlots
    .map((slot, index) => {
      const asset = getAssetById(normalizedAssetIds[index], assets);
      if (!asset) return null;
      const slotLabel = locale === 'zh-CN' ? slotLabelsZh[slot.id] : slot.label;
      return `- ${slotLabel}: ${getPromptStyleGridAssetPrompt(asset, locale)}`;
    })
    .filter((line): line is string => Boolean(line));

  if (locale === 'zh-CN') {
    return [
      `使用 WebToMind 主题卡片生成图片。卡片：${templateTitle}。`,
      '',
      '视觉方向：',
      ...lines,
      '',
      '保持主体明确、构图干净、风格一致，避免水印、乱码文字、低质量细节和手部畸变。'
    ].join('\n');
  }

  return [
    `Create an image from this WebToMind Theme Card. Card: ${templateTitle}.`,
    '',
    'Visual direction:',
    ...lines,
    '',
    'Keep the subject readable, the composition clean, and the style coherent. Avoid watermarks, garbled text, low-quality details and distorted hands.'
  ].join('\n');
}
