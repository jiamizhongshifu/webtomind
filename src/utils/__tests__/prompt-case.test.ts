import { describe, expect, it } from 'vitest';
import {
  getOptimizedPromptCaseImageUrl,
  getPromptCaseResponsiveImageSet,
  inferPromptCaseTitle,
  isValidPromptCaseSlug,
  normalizePromptCase
} from '../prompt-case';

describe('prompt case normalization', () => {
  it('infers a stable title from old prompt-only records', () => {
    expect(
      inferPromptCaseTitle('生成一张电影感人像，暖光，浅景深，真实皮肤质感')
    ).toBe('电影感人像');
  });

  it('normalizes legacy prompt cases with fallback metadata', () => {
    const normalized = normalizePromptCase({
      id: 'case-1',
      imageUrl: 'https://example.com/a.png',
      prompt: '9:16 高级杂志封面，人物居中，干净排版'
    });

    expect(normalized.title).toBe('高级杂志封面');
    expect(normalized.category).toBe('featured');
    expect(normalized.tags).toEqual([]);
    expect(normalized.model).toBe('gemini-image');
    expect(normalized.imageUrls).toEqual(['https://example.com/a.png']);
    expect(normalized.memberOnly).toBe(false);
  });

  it('preserves member-only prompt visibility settings', () => {
    const normalized = normalizePromptCase({
      id: 'case-2',
      imageUrl: 'https://example.com/b.png',
      prompt: 'cinematic product poster',
      memberOnly: true
    });

    expect(normalized.memberOnly).toBe(true);
  });

  it('preserves commercial attribution fields', () => {
    const normalized = normalizePromptCase({
      id: 'case-3',
      imageUrl: 'https://example.com/c.png',
      prompt: '',
      promptLocked: true,
      packageSlug: 'xiaohongshu-cover',
      commercialIntent: '商业场景：课程封面；精准受众：知识博主。',
      promptPreview: '公开可见的 Prompt 摘要',
      sourceDraftId: 'draft-1'
    });

    expect(normalized.packageSlug).toBe('xiaohongshu-cover');
    expect(normalized.commercialIntent).toContain('知识博主');
    expect(normalized.promptPreview).toBe('公开可见的 Prompt 摘要');
    expect(normalized.sourceDraftId).toBe('draft-1');
    expect(normalized.promptLocked).toBe(true);
  });

  it('preserves visual recipe objects for editable prompt cases', () => {
    const normalized = normalizePromptCase({
      id: 'case-visual-recipe',
      imageUrl: 'https://example.com/recipe.png',
      prompt: 'cinematic portrait',
      visualRecipe: {
        character: 'solo creator',
        lighting: 'softbox',
        visualEffect: 'subtle grain'
      }
    });

    expect(normalized.visualRecipe).toEqual({
      character: 'solo creator',
      lighting: 'softbox',
      visualEffect: 'subtle grain'
    });
  });

  it('validates SEO slugs', () => {
    expect(isValidPromptCaseSlug('portrait-cover-01')).toBe(true);
    expect(isValidPromptCaseSlug('Portrait Cover')).toBe(false);
    expect(isValidPromptCaseSlug('portrait--cover')).toBe(false);
  });

  it('builds optimized Supabase Storage render URLs for case covers', () => {
    const optimized = getOptimizedPromptCaseImageUrl(
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/a.png',
      { width: 520, quality: 70 }
    );

    expect(optimized).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/generated-images/prompt-case-covers/a.png?width=520&quality=70&resize=contain&format=webp'
    );
  });

  it('keeps non-Supabase image URLs untouched in responsive sets', () => {
    expect(
      getPromptCaseResponsiveImageSet(
        'https://cdn.example.com/case.png',
        [320, 640]
      )
    ).toBe(
      'https://cdn.example.com/case.png 320w, https://cdn.example.com/case.png 640w'
    );
  });

  it('requests a small Twitter CDN variant for prompt library thumbnails', () => {
    expect(
      getOptimizedPromptCaseImageUrl(
        'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg',
        { width: 520 }
      )
    ).toBe(
      'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg?format=jpg&name=small'
    );
  });

  it('uses responsive Twitter CDN variants instead of repeating the original', () => {
    expect(
      getPromptCaseResponsiveImageSet(
        'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg',
        [320, 960, 1600]
      )
    ).toBe(
      [
        'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg?format=jpg&name=small 320w',
        'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg?format=jpg&name=medium 960w',
        'https://pbs.twimg.com/media/HNq0KCta4AAuhsk.jpg?format=jpg&name=large 1600w'
      ].join(', ')
    );
  });
});
