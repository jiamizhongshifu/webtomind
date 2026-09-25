import { describe, expect, it } from 'vitest';
import {
  buildPromptCaseStats,
  canViewPromptCasePromptForAccess,
  promptCaseHasDisplayImage
} from '../../api/content/prompt-cases';

describe('prompt case prompt access', () => {
  it('keeps normal cases hidden from anonymous users', () => {
    expect(
      canViewPromptCasePromptForAccess(false, {
        isAuthenticated: false,
        isMember: false
      })
    ).toBe(false);
  });

  it('allows authenticated users to view normal cases', () => {
    expect(
      canViewPromptCasePromptForAccess(false, {
        isAuthenticated: true,
        isMember: false
      })
    ).toBe(true);
  });

  it('keeps member-only cases hidden from non-member users', () => {
    expect(
      canViewPromptCasePromptForAccess(true, {
        isAuthenticated: true,
        isMember: false
      })
    ).toBe(false);
  });

  it('allows active members to view member-only cases', () => {
    expect(
      canViewPromptCasePromptForAccess(true, {
        isAuthenticated: true,
        isMember: true
      })
    ).toBe(true);
  });

  it('identifies records that can be shown in image-first prompt case lists', () => {
    expect(
      promptCaseHasDisplayImage({
        imageUrl: 'https://example.com/cover.webp',
        imageUrls: []
      })
    ).toBe(true);
    expect(
      promptCaseHasDisplayImage({
        imageUrl: '',
        imageUrls: ['https://example.com/extra.webp']
      })
    ).toBe(true);
    expect(
      promptCaseHasDisplayImage({
        imageUrl: '  ',
        imageUrls: []
      })
    ).toBe(false);
  });

  it('counts prompt case models with SEO aliases instead of raw model equality only', () => {
    const stats = buildPromptCaseStats(
      [
        {
          id: 'case-1',
          locale: 'zh-CN',
          title: 'GPT Image 2 商品主图',
          model: 'GPT Image 2',
          category: 'ecommerce',
          tags: ['product-images'],
          image_url: 'https://example.com/case-1.webp'
        },
        {
          id: 'case-2',
          locale: 'zh-CN',
          title: 'Seedance 2.0 视频分镜',
          model: 'Seedance 2.0',
          category: 'video',
          tags: ['video-prompt'],
          image_url: 'https://example.com/case-2.webp'
        }
      ],
      {
        locale: 'zh-CN',
        requireImage: true
      }
    );

    expect(stats.navigationTotal).toBe(2);
    expect(stats.modelCounts['gpt-image-2']).toBe(1);
    expect(stats.modelCounts['seedance-2-0']).toBe(1);
  });

  it('counts localized prompt case fields when filtering SEO model slugs', () => {
    const stats = buildPromptCaseStats(
      [
        {
          id: 'case-1',
          locale: 'zh-CN',
          title_zh: 'GPT Image 2 商品主图',
          model: 'gemini-image',
          category: 'featured',
          prompt_preview_zh: '电商产品摄影，卖点清晰，商业留白',
          image_url: 'https://example.com/case-1.webp'
        },
        {
          id: 'case-2',
          locale: 'zh-CN',
          title_zh: 'Nano Banana 商品组合',
          model: 'nano-banana',
          category: 'featured',
          image_url: 'https://example.com/case-2.webp'
        }
      ],
      {
        locale: 'zh-CN',
        model: 'gpt-image-2',
        requireImage: true
      }
    );

    expect(stats.navigationTotal).toBe(2);
    expect(stats.total).toBe(1);
    expect(stats.modelCounts['gpt-image-2']).toBe(1);
    expect(stats.categoryCounts['product-images']).toBe(1);
    expect(stats.categoryCounts['product-commercial']).toBe(1);
  });

  it('does not double-count canonical prompt case model matches', () => {
    const stats = buildPromptCaseStats(
      [
        {
          id: 'case-1',
          locale: 'zh-CN',
          title: 'GPT Image 2 写真人像',
          model: 'gpt-image-2',
          category: 'portrait',
          tags: ['ai-portrait'],
          image_url: 'https://example.com/case-1.webp'
        }
      ],
      {
        locale: 'zh-CN',
        requireImage: true
      }
    );

    expect(stats.navigationTotal).toBe(1);
    expect(stats.modelCounts['gpt-image-2']).toBe(1);
  });

  it('counts SEO prompt categories using matcher tags and terms', () => {
    const stats = buildPromptCaseStats(
      [
        {
          id: 'case-1',
          locale: 'zh-CN',
          title: '高端护肤品电商主图',
          model: 'gpt-image-2',
          category: 'poster',
          tags: ['product-photography'],
          prompt_preview: '商品包装、卖点、商业摄影',
          image_url: 'https://example.com/case-1.webp'
        },
        {
          id: 'case-2',
          locale: 'zh-CN',
          title: '角色三视图设定集',
          model: 'gpt-image-2',
          category: 'poster',
          tags: ['character-design'],
          prompt_preview: '角色设定，turnaround model sheet',
          image_url: 'https://example.com/case-2.webp'
        }
      ],
      {
        locale: 'zh-CN',
        model: 'gpt-image-2',
        requireImage: true
      }
    );

    expect(stats.total).toBe(2);
    expect(stats.categoryCounts['product-images']).toBe(1);
    expect(stats.categoryCounts['product-commercial']).toBe(1);
    expect(stats.categoryCounts['character-design']).toBe(1);
  });
});
