import { describe, expect, it } from 'vitest';
import {
  getPromptSeoPublicCases,
  promptSeoCaseMatches
} from '../prompt-seo-match';

describe('prompt SEO case matching', () => {
  it('matches GPT Image 2 SEO slug against legacy model names', () => {
    expect(
      promptSeoCaseMatches(
        { title: '夏日海滨约会', model: 'gpt image2', category: 'featured' },
        'model',
        'gpt-image-2'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        { title: '异世界茶屋', model: 'ChatGPT image2', category: 'featured' },
        'model',
        'gpt-image-2'
      )
    ).toBe(true);
  });

  it('matches SEO slugs against localized prompt case fields', () => {
    expect(
      promptSeoCaseMatches(
        {
          title_zh: 'GPT Image 2 商品主图',
          prompt_preview_zh: '电商产品摄影，清晰卖点和商业留白',
          model: 'gemini-image',
          category: 'featured'
        },
        'model',
        'gpt-image-2'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title_en: 'Professional headshot',
          prompt_preview_en: 'A polished personal branding portrait.',
          model: 'custom',
          category: 'featured'
        },
        'category',
        'ai-portrait'
      )
    ).toBe(true);
  });

  it('matches Seedance 2.0 SEO slug against video prompt metadata', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: 'Seedance 2.0 video prompt',
          model: 'seedance-2-0',
          tags: ['AI视频提示词', 'video prompt']
        },
        'model',
        'seedance-2-0'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title: '短视频分镜案例',
          model: 'custom',
          tags: ['Seedance 2.0']
        },
        'model',
        'seedance-2-0'
      )
    ).toBe(true);
  });

  it('matches SEO category slugs against legacy prompt case metadata', () => {
    expect(
      promptSeoCaseMatches(
        { title: '9:16 竖版真实摄影质感女性写真', category: 'featured' },
        'category',
        'ai-portrait'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        { title: '护肤品主图', category: 'featured' },
        'category',
        'product-images'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        { title: 'Vintage poster --sref 1234', category: 'featured' },
        'category',
        'sref-prompts'
      )
    ).toBe(true);
  });

  it('matches scene category slugs against prompt use-case text', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '杂志大片',
          category: 'featured',
          promptPreview: 'Create a studio portrait with cinematic rim light.'
        },
        'category',
        'portrait-photography'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title: '饮料广告主视觉',
          category: 'featured',
          promptPreview: '商业摄影，产品瓶身、卖点和电商留白清晰。'
        },
        'category',
        'product-commercial'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title: '短片分镜',
          category: 'featured',
          promptPreview:
            'Seedance video prompt with camera movement and storyboard beats.'
        },
        'category',
        'video-motion'
      )
    ).toBe(true);
  });

  it('does not let legacy ecommerce metadata override scene intent', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '电影级仙侠女剑客肖像',
          category: 'ecommerce',
          tags: ['GPT Image 2', 'ecommerce'],
          promptPreview:
            'Create a vertical cinematic close-up portrait of a graceful female immortal cultivator.'
        },
        'category',
        'product-commercial'
      )
    ).toBe(false);
  });

  it('does not match short UI terms inside unrelated words', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '红毯花卉束身礼服',
          category: 'featured',
          promptPreview:
            'A beautiful editorial portrait in a tailored suit with soft studio lighting.'
        },
        'category',
        'ui-infographic'
      )
    ).toBe(false);
    expect(
      promptSeoCaseMatches(
        {
          title: '移动端数据看板 UI',
          category: 'featured',
          promptPreview:
            'Design an app UI dashboard mockup with icon grid, cards and data charts.'
        },
        'category',
        'ui-infographic'
      )
    ).toBe(true);
  });

  it('does not let polluted prompt previews pull obvious product or portrait cases into UI', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: 'Neon Lip Balm 新品发布广告',
          category: 'ecommerce',
          tags: ['ecommerce'],
          promptPreview:
            '中国茶信息图海报，包含 UI 面板、数据图、图标网格和说明文字。'
        },
        'category',
        'ui-infographic'
      )
    ).toBe(false);
    expect(
      promptSeoCaseMatches(
        {
          title: 'YouTube 直播发布会演示模板',
          category: 'featured',
          promptPreview: 'YouTube 直播界面演示模板，包含聊天区和直播控制面板。'
        },
        'category',
        'ui-infographic'
      )
    ).toBe(true);
  });

  it('does not pull character cases into UI just because they carry a game UI tag', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '电竞少女',
          category: 'character',
          tags: [
            'character design',
            'character consistency',
            'concept art',
            'phone snapshot',
            'game UI',
            'realistic photo'
          ]
        },
        'category',
        'ui-infographic'
      )
    ).toBe(false);
    expect(
      promptSeoCaseMatches(
        {
          title: '限时登录奖励游戏UI',
          category: 'character',
          tags: ['character design', 'game UI']
        },
        'category',
        'ui-infographic'
      )
    ).toBe(true);
  });

  it('keeps style remix and video motion categories tied to workflow-level signals', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '趣味涂鸦卡通自拍',
          category: 'character',
          promptPreview: 'A playful doodle selfie portrait.'
        },
        'category',
        'style-remix-reference'
      )
    ).toBe(false);
    expect(
      promptSeoCaseMatches(
        {
          title: '角色参考图改写工作流',
          category: 'featured',
          promptPreview: 'Use a reference image to recreate lighting and composition.'
        },
        'category',
        'style-remix-reference'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title: '雨天车内时尚人像摄影',
          category: 'portrait',
          promptPreview: 'Close-up portrait with a 50mm camera lens.'
        },
        'category',
        'video-motion'
      )
    ).toBe(false);
  });

  it('matches commercial package SEO slugs against package metadata', () => {
    expect(
      promptSeoCaseMatches(
        {
          title: '小红书封面视觉导演',
          category: 'cover',
          packageSlug: 'xiaohongshu-cover'
        },
        'package',
        'xiaohongshu-cover'
      )
    ).toBe(true);
    expect(
      promptSeoCaseMatches(
        {
          title: '小红书封面视觉导演',
          category: 'cover',
          packageSlug: 'xiaohongshu-cover'
        },
        'package',
        'ecommerce-product-photo'
      )
    ).toBe(false);
  });

  it('exposes generic game cover cases through poster and model intent', () => {
    const posterCases = getPromptSeoPublicCases({
      kind: 'package',
      slug: 'wechat-cover-poster',
      locale: 'en-US',
      limit: 10
    });
    const modelCases = getPromptSeoPublicCases({
      kind: 'model',
      slug: 'gpt-image-2',
      locale: 'en-US',
      limit: 10
    });
    const expectedSlugs = [
      'open-world-crime-game-cover-art-prompt',
      'female-protagonist-game-cover-art-prompt',
      'neon-open-world-game-key-art-prompt'
    ];

    expect(posterCases.map((item) => item.slug)).toEqual(
      expect.arrayContaining(expectedSlugs)
    );
    expect(modelCases.map((item) => item.slug)).toEqual(
      expect.arrayContaining(expectedSlugs)
    );
    expect(posterCases.map((item) => item.title).join(' ')).not.toMatch(
      /rockstar|gta/i
    );
  });

  it("matches focused GTA 6's cover girls prompt cases by package slug", () => {
    const cases = getPromptSeoPublicCases({
      kind: 'package',
      slug: 'gta-6-cover-girls-prompts',
      locale: 'en-US',
      limit: 5
    });

    expect(cases.map((item) => item.slug)).toEqual([
      'gta-6-cover-girls-sunset-protagonist-prompt',
      'gta-6-cover-girls-neon-duo-prompt',
      'gta-6-cover-girls-ensemble-prompt'
    ]);
    expect(cases.map((item) => item.title).join(' ')).toContain(
      "GTA 6's Cover Girls"
    );
  });
});
