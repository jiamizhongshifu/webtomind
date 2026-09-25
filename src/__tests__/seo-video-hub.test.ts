import { describe, expect, it } from 'vitest';
import { renderSeoPageHtmlWithStatus } from '../../api/seo-page-render';

const baseHtml = `<html lang="en"><head>
  <title>old</title>
  <meta name="description" content="old" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="https://webtomind.com/" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="old" />
  <meta property="og:description" content="old" />
  <meta property="og:url" content="https://webtomind.com/" />
  <meta property="og:image" content="old" />
  <meta name="twitter:title" content="old" />
  <meta name="twitter:description" content="old" />
  <meta name="twitter:image" content="old" />
</head><body><div id="root"></div></body></html>`;

function videoItems(count: number) {
  const categories = ['product-video', 'camera-motion', 'story-video'];
  return Array.from({ length: count }, (_, index) => ({
    id: `video-${index}`,
    slug: `verified-video-${index}`,
    title: `已验证视频案例 ${index}`,
    model: 'seedance-2-0',
    category: categories[index % categories.length],
    mediaType: 'video',
    imageUrl: `https://cdn.example.com/video-${index}.webp`,
    posterUrl: `https://cdn.example.com/video-${index}.webp`,
    videoUrl: `https://cdn.example.com/video-${index}.mp4`,
    durationSeconds: 8,
    uploadDate: '2026-08-06T00:00:00.000Z'
  }));
}

describe('Chinese video prompt SEO hub', () => {
  it('indexes only after eight verified cases across three intents', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      baseHtml,
      '/zh-CN/video-prompts',
      { promptLibraryBootstrap: { items: videoItems(8) } }
    );

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      '<meta name="robots" content="index,follow,max-video-preview:-1" />'
    );
    expect(rendered.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/video-prompts" />'
    );
    expect(rendered.html).toContain(
      'href="/zh-CN/video?source=video_hub_ssr"'
    );
    expect(rendered.html).toContain('<h1>AI 视频 Prompt 案例与分镜模板</h1>');
    expect(rendered.html).toContain('/zh-CN/prompts/verified-video-0');
    expect(rendered.html).not.toContain('hreflang="en-US"');
  });

  it('keeps a thin video hub out of the index', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      baseHtml,
      '/zh-CN/video-prompts',
      { promptLibraryBootstrap: { items: videoItems(7) } }
    );

    expect(rendered.html).toContain(
      '<meta name="robots" content="noindex,follow" />'
    );
    expect(rendered.html).toContain('当前合格案例尚未达到公开索引门槛');
  });

  it('keeps unlocalized alias hreflang self-contained', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      baseHtml,
      '/gpt-image-2-prompts'
    );
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      'hreflang="en-US" href="https://webtomind.com/gpt-image-2-prompts"'
    );
    expect(rendered.html).toContain(
      'hreflang="x-default" href="https://webtomind.com/gpt-image-2-prompts"'
    );
    expect(rendered.html).not.toContain('hreflang="zh-CN"');
  });
});
