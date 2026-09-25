import { describe, expect, it } from 'vitest';
import {
  getPromptLibraryQueryKey,
  resolvePromptLibraryQuery
} from '../usePromptLibraryQuery';

describe('prompt library query helpers', () => {
  it('defaults the root library to latest cases', () => {
    expect(
      resolvePromptLibraryQuery({ search: '', locale: 'zh-CN' }).sort
    ).toBe('latest');
  });

  it('maps legacy category and featured filter params into v2 query state', () => {
    const query = resolvePromptLibraryQuery({
      search:
        '?category=portrait-photography&filter=featured&q=%E5%86%99%E7%9C%9F&limit=48',
      locale: 'zh-CN',
      modelSlug: 'gpt-image-2'
    });

    expect(query).toEqual({
      locale: 'zh-CN',
      model: 'gpt-image-2',
      label: 'portrait-photography',
      sort: 'featured',
      q: '写真',
      cursor: undefined,
      mediaType: undefined,
      seoOnly: false,
      limit: 48
    });
  });

  it('prefers label and sort params for the v2 URL shape', () => {
    const query = resolvePromptLibraryQuery({
      search:
        '?label=product-commercial&category=portrait-photography&sort=hot&cursor=offset%3A36',
      locale: 'en-US'
    });

    expect(query).toEqual({
      locale: 'en-US',
      model: undefined,
      label: 'product-commercial',
      sort: 'hot',
      q: undefined,
      cursor: 'offset:36',
      mediaType: undefined,
      seoOnly: false,
      limit: 48
    });
    expect(getPromptLibraryQueryKey(query)).toBe(
      'prompt-library-v2:en-US:all-models:product-commercial:all-media:all-statuses:hot:all-search:offset:36:48'
    );
  });

  it('uses the route category as the canonical initial library label', () => {
    expect(
      resolvePromptLibraryQuery({
        search: '',
        locale: 'zh-CN',
        labelSlug: 'ai-portrait'
      })
    ).toMatchObject({
      label: 'portrait-photography',
      sort: 'latest'
    });
  });

  it('keeps video SEO hub queries isolated from image and review caches', () => {
    const query = resolvePromptLibraryQuery({
      search: '?utm_source=campaign',
      locale: 'zh-CN',
      labelSlug: 'video-motion',
      mediaType: 'video',
      seoOnly: true,
      defaultLimit: 100
    });

    expect(query).toMatchObject({
      label: 'video-motion',
      mediaType: 'video',
      seoOnly: true,
      limit: 100
    });
    expect(getPromptLibraryQueryKey(query)).toContain(
      ':video-motion:video:seo-only:'
    );
  });
});
