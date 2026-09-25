import { describe, expect, it, vi } from 'vitest';
import { getStaticSitemapPathsForTest } from '../../api/sitemap.xml';
import {
  getPromptCaseSitemapUrlForTest,
  loadPromptCaseSitemapRows,
  isPromptCaseEligibleForSitemap,
  selectPromptCaseRowsForSitemap,
  type PromptSitemapRow
} from '../../api/sitemap-render';
import {
  PROMPT_STYLE_GRID_ALIAS_PATHS,
  PROMPT_STYLE_GRID_CANONICAL_PATH,
  PROMPT_STYLE_GRID_DETAIL_PATHS
} from '../shared/prompt-style-grid-seo';

describe('sitemap URL policy', () => {
  it('reads beyond the PostgREST response cap without losing older cases', async () => {
    const rows = Array.from({ length: 1435 }, (_, i) => ({ id: String(i) }));
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async (from: number, to: number) => ({
        data: rows.slice(from, Math.min(to + 1, from + 1000)),
        error: null,
        count: rows.length
      }))
    };
    const result = await loadPromptCaseSitemapRows(
      { from: () => query } as never,
      'id'
    );
    expect(result.error).toBeNull();
    expect(result.rows).toEqual(rows);
    expect(query.range.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1434]
    ]);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
  });

  it('does not publish a partial result when a later sitemap page fails', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi
        .fn()
        .mockResolvedValueOnce({
          data: Array(500).fill({ id: 'case' }),
          error: null,
          count: 600
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'page unavailable' }
        })
    };
    expect(
      await loadPromptCaseSitemapRows({ from: () => query } as never, 'id')
    ).toEqual({
      rows: [],
      error: { message: 'page unavailable' }
    });
  });

  it('keeps redirected prompt library routes out of the static sitemap', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/prompts');
    expect(paths).toContain('/zh-CN/blog/creator-workflow-30-min');
    expect(paths).toContain('/en-US/blog/creator-workflow-30-min');
    expect(paths).toContain('/zh-CN/blog/video-to-script-storyboard');
    expect(paths).toContain('/zh-CN/blog/wechat-publish-readiness-check');
    expect(paths).toContain('/zh-CN/blog/single-draft-multi-channel-repurpose');
    expect(paths).not.toContain('/zh-CN/blog/ai-workflow-sop');
    expect(paths).not.toContain('/en-US/create/prompts');
    expect(paths).not.toContain('/zh-CN/create/prompts');
    expect(paths).not.toContain('/ai-image-prompts');
    expect(paths).not.toContain('/ai-image-generator');
    expect(paths).not.toContain('/reference-image-to-prompt-generator');
    expect(paths).toContain('/en-US/prompts');
    expect(paths).toContain('/zh-CN/video-prompts');
    expect(paths).toContain(PROMPT_STYLE_GRID_CANONICAL_PATH);
    PROMPT_STYLE_GRID_DETAIL_PATHS.forEach((path) => {
      expect(paths).toContain(path);
    });
    PROMPT_STYLE_GRID_ALIAS_PATHS.forEach((path) => {
      expect(paths).not.toContain(path);
    });
    expect(paths).not.toContain('/ai-image-style-grid?template=portrait');
    expect(paths).toContain('/ai-image-prompt-generator');
    expect(paths).not.toContain('/ai-image-prompts-gallery');
    expect(paths).not.toContain('/free-ai-image-prompts-gallery');
    expect(paths).not.toContain('/free-gpt-image-2-prompts');
    expect(paths).not.toContain('/gpt-image-2-prompts-gallery');
    expect(paths).not.toContain('/nano-banana-prompts-gallery');
    expect(paths).not.toContain('/nano-banana-2-prompts');
    expect(paths).not.toContain('/nano-banana-pro-prompts');
    expect(paths).toContain('/mona-lisa-1-prompts');
    expect(paths).not.toContain('/mona-lisa-prompts');
    expect(paths).toContain('/gpt-image-2-5-prompts');
    expect(paths).toContain('/luna-lisa-alpha-prompts');
    expect(paths).toContain('/astra-prompts');
    expect(paths).not.toContain('/gpt-6-astra-prompts');
    expect(paths).toContain('/zh-CN/prompts/model/mona-lisa-1');
    expect(paths).toContain('/en-US/prompts/model/mona-lisa-1');
    expect(paths).toContain('/zh-CN/prompts/model/luna-lisa-alpha');
    expect(paths).toContain('/en-US/prompts/model/luna-lisa-alpha');
    expect(paths).toContain('/zh-CN/prompts/model/gpt-image-2-5');
    expect(paths).toContain('/en-US/prompts/model/gpt-image-2-5');
    expect(paths).toContain('/zh-CN/prompts/model/gpt-6-astra');
    expect(paths).toContain('/en-US/prompts/model/gpt-6-astra');
    expect(paths).not.toContain('/poster-design-prompts');
    expect(paths).not.toContain('/brand-identity-prompts');
    expect(paths).not.toContain('/3d-figurine-prompts');
    expect(paths).not.toContain('/clay-aesthetic-prompts');
    expect(paths).not.toContain('/boudoir-prompts');
    expect(paths).not.toContain('/glamour-prompts');
    expect(paths).not.toContain('/');
  });

  it('includes the public directory and six localized independent tools', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/apps');
    expect(paths).toContain('/en-US/apps');
    expect(paths).toContain('/zh-CN/tools/image-upscaler');
    expect(paths).toContain('/en-US/tools/image-upscaler');
    expect(paths).toContain('/zh-CN/tools/gpt-image-2-denoiser');
    expect(paths).toContain('/en-US/tools/gpt-image-2-denoiser');
    expect(paths).not.toContain('/zh-CN/create/apps/xiaohongshu-cover');
    expect(paths).not.toContain('/en-US/create/apps/xiaohongshu-cover');
  });

  it('includes localized image-to-prompt tutorial pages', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/blog/image-to-prompt-generator-workflow');
    expect(paths).toContain('/en-US/blog/image-to-prompt-generator-workflow');
    expect(paths).toContain('/zh-CN/blog/ai-image-prompt-examples-guide');
    expect(paths).toContain('/en-US/blog/ai-image-prompt-examples-guide');
    expect(paths).toContain('/zh-CN/blog/gpt-image-2-prompt-structure');
    expect(paths).toContain('/en-US/blog/gpt-image-2-prompt-structure');
    expect(paths).toContain('/zh-CN/blog/ai-product-photography-prompts-guide');
    expect(paths).toContain('/en-US/blog/ai-product-photography-prompts-guide');
    expect(paths).toContain('/zh-CN/blog/nsfw-prompts-guide');
    expect(paths).toContain('/en-US/blog/nsfw-prompts-guide');
  });

  it('includes AI dedicated card budget landing pages', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/blog/ai-zhuanshu-card');
    expect(paths).toContain('/en-US/blog/ai-zhuanshu-card');
    expect(paths).toContain('/zh-CN/blog/ai-tool-credit-budget');
    expect(paths).toContain('/en-US/blog/ai-tool-credit-budget');
  });

  it('includes the spacexai long-tail SEO landing pages', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/blog/spacexai-ai-workflow-guide');
    expect(paths).toContain('/en-US/blog/spacexai-ai-workflow-guide');
  });

  it('includes the DeepSeek Harness use-case and blog pages', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain(
      '/zh-CN/blog/deepseek-harness-agent-workflow-guide'
    );
    expect(paths).toContain(
      '/en-US/blog/deepseek-harness-agent-workflow-guide'
    );
    expect(paths).toContain('/zh-CN/blog/deepseek-harness-what-is-guide');
    expect(paths).toContain('/en-US/blog/deepseek-harness-what-is-guide');
  });

  it('keeps the unified blog hub and article details on blog URLs', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/zh-CN/blog');
    expect(paths).toContain('/en-US/blog');
    expect(paths).not.toContain('/zh-CN/use-cases');
    expect(paths).not.toContain('/en-US/use-cases');
    expect(paths).toContain('/zh-CN/blog/ai-zhuanshu-card');
    expect(paths).toContain('/en-US/blog/ai-zhuanshu-card');
    expect(paths).toContain(
      '/zh-CN/blog/deepseek-harness-agent-workflow-guide'
    );
  });

  it('includes crawlable conversion and utility SEO pages', () => {
    const paths = getStaticSitemapPathsForTest();

    expect(paths).toContain('/imagine-image-2-0-prompts');
    expect(paths).not.toContain('/grok-imagine-image-2-0-prompts');
    expect(paths).toContain('/zh-CN/prompts/model/grok-imagine');
    expect(paths).toContain('/en-US/prompts/model/grok-imagine');
    expect(paths).not.toContain('/pricing');
    expect(paths).toContain('/zh-CN/pricing');
    expect(paths).toContain('/en-US/pricing');
    expect(paths).toContain('/zh-CN/tools/comfyui-workflow-checker');
    expect(paths).toContain('/en-US/tools/comfyui-workflow-checker');
    expect(paths).toContain('/zh-CN/tools/pindou-pattern-maker');
    expect(paths).toContain('/en-US/tools/pindou-pattern-maker');
    expect(paths).not.toContain('/zh-CN/links');
    expect(paths).not.toContain('/en-US/links');
    expect(paths).not.toContain('/privacy');
    expect(paths).not.toContain('/terms');
    expect(paths).toContain('/zh-CN/privacy');
    expect(paths).toContain('/en-US/privacy');
    expect(paths).toContain('/zh-CN/terms');
    expect(paths).toContain('/en-US/terms');
  });

  it('keeps dynamic prompt case sitemap entries on a curated crawl budget', () => {
    expect(
      isPromptCaseEligibleForSitemap({
        slug: 'featured-case',
        locale: 'zh-CN',
        featured: true,
        image_url: 'https://example.com/case.webp'
      })
    ).toBe(true);
    expect(
      isPromptCaseEligibleForSitemap({
        slug: 'commercial-case',
        locale: 'zh-CN',
        featured: false,
        package_slug: 'ai-image-prompt-examples',
        image_urls: ['https://example.com/case.webp']
      })
    ).toBe(true);
    expect(
      isPromptCaseEligibleForSitemap({
        id: 'share-only-case',
        slug: '',
        locale: 'zh-CN',
        featured: true,
        image_url: 'https://example.com/share-only.webp'
      })
    ).toBe(true);
    expect(
      isPromptCaseEligibleForSitemap({
        slug: 'unfinished-case',
        locale: 'zh-CN',
        featured: true
      })
    ).toBe(false);
    expect(
      isPromptCaseEligibleForSitemap({
        slug: 'ordinary-case',
        locale: 'zh-CN',
        featured: false,
        image_url: 'https://example.com/case.webp'
      })
    ).toBe(false);

    const rows: PromptSitemapRow[] = Array.from({ length: 45 }, (_, index) => ({
      id: `zh-case-${index}`,
      slug: `zh-case-${index}`,
      locale: 'zh-CN',
      featured: index < 5,
      package_slug: 'ai-image-prompt-examples',
      image_url: 'https://example.com/case.webp'
    }));
    expect(selectPromptCaseRowsForSitemap(rows)).toHaveLength(45);
    expect(
      selectPromptCaseRowsForSitemap([
        {
          id: 'share-only-case',
          slug: null,
          locale: 'zh-CN',
          featured: true,
          image_url: 'https://example.com/share-only.webp'
        }
      ])
    ).toHaveLength(1);
    expect(
      getPromptCaseSitemapUrlForTest({
        id: 'share-only-case',
        slug: '',
        locale: 'zh-CN'
      })
    ).toBe('https://webtomind.com/zh-CN/create/prompts/share/share-only-case');
  });

  it('tops up verified video cases outside the image case cap', () => {
    const imageRows: PromptSitemapRow[] = Array.from(
      { length: 45 },
      (_, index) => ({
        id: `img-${index}`,
        slug: `img-${index}`,
        locale: 'zh-CN',
        featured: index < 5,
        package_slug: 'ai-image-prompt-examples',
        image_url: 'https://example.com/image.webp'
      })
    );
    const videoRows: PromptSitemapRow[] = Array.from(
      { length: 25 },
      (_, index) => ({
        id: `video-${index}`,
        slug: `video-${index}`,
        locale: 'zh-CN',
        package_slug: 'seedance-video-prompts',
        image_url: 'https://example.com/poster.webp',
        media_type: 'video',
        video_url: 'https://example.com/video.mp4',
        video_duration_seconds: 12,
        video_upload_date: '2026-08-06T00:00:00.000Z'
      })
    );
    const selected = selectPromptCaseRowsForSitemap([
      ...imageRows,
      ...videoRows
    ]);
    const selectedVideos = selected.filter((row) => row.media_type === 'video');

    expect(selected).toHaveLength(70);
    expect(selectedVideos).toHaveLength(25);
    expect(selectedVideos[0]?.slug).toBe('video-0');
  });

  it('does not silently drop eligible Chinese cases after the first thousand', () => {
    const rows = Array.from({ length: 1170 }, (_, index) => ({
      id: `long-tail-${index}`,
      slug: `long-tail-${index}`,
      locale: 'zh-CN',
      featured: true,
      image_url: 'https://example.com/case.webp'
    }));
    expect(selectPromptCaseRowsForSitemap(rows)).toHaveLength(1170);
  });

  it('keeps video rows without complete media inside the image cap', () => {
    const imageRows: PromptSitemapRow[] = Array.from(
      { length: 45 },
      (_, index) => ({
        id: `img-${index}`,
        slug: `img-${index}`,
        locale: 'zh-CN',
        featured: true,
        image_url: 'https://example.com/image.webp'
      })
    );
    const incompleteVideoRows: PromptSitemapRow[] = Array.from(
      { length: 5 },
      (_, index) => ({
        id: `video-incomplete-${index}`,
        slug: `video-incomplete-${index}`,
        locale: 'zh-CN',
        package_slug: 'seedance-video-prompts',
        image_url: 'https://example.com/poster.webp',
        media_type: 'video',
        video_url: 'https://example.com/video.mp4',
        video_duration_seconds: 0,
        video_upload_date: null
      })
    );

    expect(
      selectPromptCaseRowsForSitemap([...imageRows, ...incompleteVideoRows])
    ).toHaveLength(50);
  });

  it('applies the video top-up per locale independently', () => {
    const rows: PromptSitemapRow[] = [
      ...Array.from({ length: 45 }, (_, index) => ({
        id: `zh-img-${index}`,
        slug: `zh-img-${index}`,
        locale: 'zh-CN',
        featured: true,
        image_url: 'https://example.com/image.webp'
      })),
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `zh-video-${index}`,
        slug: `zh-video-${index}`,
        locale: 'zh-CN',
        package_slug: 'seedance-video-prompts',
        image_url: 'https://example.com/poster.webp',
        media_type: 'video',
        video_url: 'https://example.com/video.mp4',
        video_duration_seconds: 12,
        video_upload_date: '2026-08-06T00:00:00.000Z'
      })),
      ...Array.from({ length: 45 }, (_, index) => ({
        id: `en-img-${index}`,
        slug: `en-img-${index}`,
        locale: 'en-US',
        featured: true,
        image_url: 'https://example.com/image.webp'
      })),
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `en-video-${index}`,
        slug: `en-video-${index}`,
        locale: 'en-US',
        package_slug: 'seedance-video-prompts',
        image_url: 'https://example.com/poster.webp',
        media_type: 'video',
        video_url: 'https://example.com/video.mp4',
        video_duration_seconds: 12,
        video_upload_date: '2026-08-06T00:00:00.000Z'
      }))
    ];

    const selected = selectPromptCaseRowsForSitemap(rows);
    expect(selected).toHaveLength(140);
    expect(
      selected.filter(
        (row) => row.locale === 'zh-CN' && row.media_type === 'video'
      )
    ).toHaveLength(25);
    expect(
      selected.filter(
        (row) => row.locale === 'en-US' && row.media_type === 'video'
      )
    ).toHaveLength(25);
  });

  it('requires editorial SEO evidence once the quality status exists', () => {
    const reviewedCase: PromptSitemapRow = {
      id: 'reviewed-case',
      slug: 'reviewed-case',
      locale: 'zh-CN',
      is_published: true,
      deleted_at: null,
      members_only: false,
      title_zh: '已审核商品案例',
      prompt_zh: '主体、构图、镜头与光线完整的公开 Prompt。',
      prompt_preview_zh: '真实商品图生成案例。',
      model: 'gpt-image-2',
      media_type: 'image',
      image_url: 'https://cdn.example.com/reviewed.webp',
      seo_status: 'indexable',
      seo_reviewed_at: '2026-08-06T00:00:00.000Z',
      seo_evidence: {
        source_verified: true,
        media_verified: true
      }
    };

    expect(isPromptCaseEligibleForSitemap(reviewedCase)).toBe(true);
    expect(
      isPromptCaseEligibleForSitemap({
        ...reviewedCase,
        seo_status: 'review'
      })
    ).toBe(false);
    expect(
      isPromptCaseEligibleForSitemap({
        ...reviewedCase,
        members_only: true
      })
    ).toBe(false);
  });
});
