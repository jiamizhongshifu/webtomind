import { describe, expect, it } from 'vitest';
import {
  injectPromptSeo,
  renderPromptPageHtml
} from '../../api/prompt-page-render';

const baseHtml = `
  <html lang="en">
    <head>
      <title>WebToMind</title>
      <meta name="description" content="old" />
      <meta name="robots" content="noindex" />
      <link rel="canonical" href="https://webtomind.com/" />
      <meta property="og:title" content="old" />
      <meta property="og:description" content="old" />
      <meta property="og:url" content="https://webtomind.com/" />
      <meta property="og:image" content="old.png" />
      <meta name="twitter:title" content="old" />
      <meta name="twitter:description" content="old" />
      <meta name="twitter:image" content="old.png" />
    </head>
    <body><div id="root"></div></body>
  </html>
`;

const promptCase = {
  id: 'case-1',
  title: '小红书咖啡封面案例',
  prompt:
    '生成一张小红书咖啡封面，暖色自然光，桌面有拿铁、手帐和植物，标题留白明确。',
  slug: 'xiaohongshu-coffee-cover',
  locale: 'zh-CN' as const,
  sourceCaseId: null,
  category: 'xiaohongshu',
  model: 'gpt-image-2',
  packageSlug: 'xiaohongshu-cover',
  commercialIntent: '适合本地咖啡店快速测试小红书封面视觉。',
  promptPreview: '咖啡店封面、暖色自然光、标题留白',
  memberOnly: false,
  tags: ['小红书封面', '咖啡店', '商业素材'],
  imageUrls: ['https://cdn.example.com/case-cover.webp'],
  mediaType: 'image' as const,
  videoUrls: [],
  posterUrl: 'https://cdn.example.com/case-cover.webp',
  durationSeconds: null,
  uploadDate: null,
  seoIndexable: true,
  generationVerified: true
};

describe('prompt page SEO injection', () => {
  it('renders trusted static SEO prompt cases when no database row exists', async () => {
    const rendered = await renderPromptPageHtml({
      html: baseHtml,
      locale: 'en-US',
      slug: 'gta-6-cover-girls-neon-duo-prompt'
    });

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain(
      '<meta name="robots" content="index,follow" />'
    );
    expect(rendered.html).toContain(
      '<link rel="canonical" href="https://webtomind.com/en-US/prompts/gta-6-cover-girls-neon-duo-prompt" />'
    );
    expect(rendered.html).toContain('GTA 6&#39;s Cover Girls Neon Duo Prompt');
    expect(rendered.html).toContain(
      'https://webtomind.com/prompt-cases/2026-06-25-gta-6-cover-girls/neon-duo-cover-girls-game-key-art.webp'
    );
  });

  it('keeps unknown prompt slugs as a noindex 404', async () => {
    const rendered = await renderPromptPageHtml({
      html: baseHtml,
      locale: 'en-US',
      slug: 'missing-static-and-database-case'
    });

    expect(rendered.status).toBe(404);
    expect(rendered.html).toContain(
      '<meta name="robots" content="noindex,nofollow" />'
    );
    expect(rendered.html).not.toContain('<main id="prompt-detail-seo"');
  });

  it('injects crawlable prompt detail body content for published prompt cases', () => {
    const html = injectPromptSeo(
      baseHtml,
      promptCase,
      'zh-CN',
      'xiaohongshu-coffee-cover',
      'slug',
      [
        {
          hreflang: 'zh-CN',
          href: 'https://webtomind.com/zh-CN/prompts/xiaohongshu-coffee-cover'
        }
      ],
      [
        {
          ...promptCase,
          id: 'case-2',
          title: '咖啡新品海报案例',
          slug: 'coffee-poster',
          imageUrls: ['https://cdn.example.com/related.webp']
        }
      ]
    );

    expect(html).toContain('<main id="prompt-detail-seo"');
    expect(html).toContain('<style id="prompt-detail-ssr-style">');
    expect(html).toContain('小红书咖啡封面案例 | WebToMind Prompts');
    expect(html).toContain('https://cdn.example.com/case-cover.webp');
    expect(html).toContain(
      '<link rel="preload" as="image" href="https://cdn.example.com/case-cover.webp"'
    );
    expect(html).toContain('id="webtomind-prompt-bootstrap"');
    expect(html).toContain('"slug":"xiaohongshu-coffee-cover"');
    expect(html).toContain(
      'loading="eager" decoding="async" fetchpriority="high"'
    );
    expect(html).toContain('width="1200" height="825"');
    expect(html).toContain('<h1>小红书咖啡封面案例</h1>');
    expect(html).toContain('适合本地咖啡店快速测试小红书封面视觉。');
    expect(html).toContain('<span>gpt-image-2</span>');
    expect(html).toContain('<span>小红书封面</span>');
    expect(html).toContain('<h2>公开 Prompt</h2>');
    expect(html).toContain(promptCase.prompt);
    expect(html).toContain('<h2>如何复用这个 Prompt</h2>');
    expect(html).toContain('主体、场景、光线、构图、输出用途和负面约束');
    expect(html).toContain('GPT Image 2 prompts');
    expect(html).toContain('/zh-CN/prompts/coffee-poster');
    expect(html).toContain('用这个 Prompt 生成图片');
    expect(html).toContain(
      '/zh-CN/image?source=prompt_detail_ssr&amp;caseId=case-1&amp;packageSlug=xiaohongshu-cover'
    );
  });

  it('uses the same optimized Supabase image for preload and SSR detail media', () => {
    const html = injectPromptSeo(
      baseHtml,
      {
        ...promptCase,
        imageUrls: [
          'https://example.supabase.co/storage/v1/object/public/generated-images/case.png'
        ]
      },
      'zh-CN',
      'xiaohongshu-coffee-cover',
      'slug'
    );
    const optimized =
      'https://example.supabase.co/storage/v1/render/image/public/generated-images/case.png?width=960&amp;quality=78&amp;resize=contain&amp;format=webp';

    expect(html).toContain(`rel="preload" as="image" href="${optimized}"`);
    expect(html).toContain(`<img src="${optimized}"`);
    expect(html).not.toContain(
      '<img src="https://example.supabase.co/storage/v1/object/public/generated-images/case.png"'
    );
  });

  it('does not expose member-only prompt text in the client bootstrap', () => {
    const html = injectPromptSeo(
      baseHtml,
      {
        ...promptCase,
        memberOnly: true,
        prompt: 'private member prompt'
      },
      'zh-CN',
      'xiaohongshu-coffee-cover',
      'slug'
    );
    const bootstrap =
      html.match(
        /<script id="webtomind-prompt-bootstrap"[^>]*>([\s\S]*?)<\/script>/
      )?.[1] || '';

    expect(bootstrap).toContain('"promptLocked":true');
    expect(bootstrap).toContain('"prompt":""');
    expect(bootstrap).not.toContain('private member prompt');
    expect(html).not.toContain(
      '<pre class="prompt-detail-ssr-prompt">private member prompt</pre>'
    );
    expect(html).toContain('该会员案例不会在公开页面暴露完整 Prompt');
  });

  it('renders a crawlable video watch page and verified video CTA', () => {
    const videoCase = {
      ...promptCase,
      id: 'video-1',
      title: '商品旋转视频 Prompt',
      slug: 'product-rotation-video-prompt',
      model: 'seedance-2-0',
      category: 'product-video',
      mediaType: 'video' as const,
      videoUrls: ['https://cdn.example.com/product-rotation.mp4'],
      durationSeconds: 8,
      uploadDate: '2026-08-06T00:00:00.000Z',
      generationVerified: true
    };
    const html = injectPromptSeo(
      baseHtml,
      videoCase,
      'zh-CN',
      videoCase.slug,
      'slug'
    );

    expect(html).toContain(
      '<meta name="robots" content="index,follow,max-video-preview:-1" />'
    );
    expect(html).toContain(
      '<video controls playsinline preload="metadata" poster="https://cdn.example.com/case-cover.webp"'
    );
    expect(html).toContain(
      '<source src="https://cdn.example.com/product-rotation.mp4" type="video/mp4" />'
    );
    expect(html).toContain('"@type":"VideoObject"');
    expect(html).toContain('"duration":"PT8S"');
    expect(html).toContain('"contentUrl":"https://cdn.example.com/product-rotation.mp4"');
    expect(html).toContain('用这个 Prompt 生成视频');
    expect(html).toContain('/zh-CN/video?source=prompt_detail_ssr');
    expect(html).toContain('/zh-CN/video-prompts');
  });

  it('keeps an honest primary CTA but carries the video handoff for unverified cases', () => {
    const html = injectPromptSeo(
      baseHtml,
      {
        ...promptCase,
        mediaType: 'video',
        videoUrls: ['https://cdn.example.com/video.mp4'],
        durationSeconds: 6,
        uploadDate: '2026-08-06T00:00:00.000Z',
        generationVerified: false
      },
      'zh-CN',
      'video-case',
      'slug'
    );

    expect(html).toContain('查看公开的视频 Prompt');
    expect(html).not.toContain('用这个 Prompt 生成视频');
    expect(html).toContain('在视频工作台继续创作');
    expect(html).toContain('/zh-CN/video?source=prompt_detail_ssr');
  });

  it('uses the prompt case thumbnail for id-only prompt case share pages', () => {
    const html = injectPromptSeo(
      baseHtml,
      {
        ...promptCase,
        slug: null
      },
      'zh-CN',
      'case-1',
      'id'
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/create/prompts/share/case-1" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn.example.com/case-cover.webp" />'
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://cdn.example.com/case-cover.webp" />'
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />'
    );
  });

  it('uses the prompt case thumbnail for slug prompt case share pages', () => {
    const html = injectPromptSeo(
      baseHtml,
      promptCase,
      'zh-CN',
      'xiaohongshu-coffee-cover',
      'slug'
    );

    expect(html).toContain(
      '<link rel="canonical" href="https://webtomind.com/zh-CN/prompts/xiaohongshu-coffee-cover" />'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn.example.com/case-cover.webp" />'
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://cdn.example.com/case-cover.webp" />'
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />'
    );
  });

  it('does not put Chinese fallback prompt text into English descriptions', () => {
    const html = injectPromptSeo(
      baseHtml,
      {
        ...promptCase,
        title: 'Frieren Close-up Selfie with Kiss Face',
        prompt: '指定角色：芙莉莲。生成一张近距离自拍。',
        promptPreview: '近距离自拍、亲吻表情、手机镜头',
        commercialIntent: null,
        locale: 'en-US',
        category: 'portrait',
        model: 'gpt-image-2',
        slug: 'en-case-9fb597ed597c'
      },
      'en-US',
      'en-case-9fb597ed597c',
      'slug'
    );

    expect(html).toContain(
      'Copy and adapt this portrait prompt for gpt-image-2.'
    );
    expect(html).not.toContain(
      'content="Frieren Close-up Selfie with Kiss Face · 近距离自拍'
    );
  });

  it('keeps missing prompt cases noindexed without injecting fallback body', () => {
    const html = injectPromptSeo(
      baseHtml,
      null,
      'zh-CN',
      'missing-case',
      'slug'
    );

    expect(html).toContain('<meta name="robots" content="noindex,nofollow" />');
    expect(html).toContain('未找到 Prompt | WebToMind');
    expect(html).toContain(
      '<meta property="og:image" content="https://webtomind.com/icons/icon128.png" />'
    );
    expect(html).not.toContain('<main id="prompt-detail-seo"');
    expect(html).not.toContain('prompt-detail-ssr-style');
  });
});
