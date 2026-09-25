import { afterEach, describe, expect, it } from 'vitest';
import { readPromptLibraryBootstrap } from '../promptLibraryBootstrap';

function installBootstrap(queryEcho: Record<string, unknown>) {
  const script = document.createElement('script');
  script.id = 'webtomind-prompt-library-bootstrap';
  script.type = 'application/json';
  script.textContent = JSON.stringify({
    items: [
      {
        id: 'case-1',
        imageUrl: 'https://images.example.test/case-1.jpg',
        imageUrls: ['https://images.example.test/case-1.jpg'],
        title: 'Case one',
        prompt: ''
      }
    ],
    total: 1,
    pageInfo: { nextCursor: null, hasMore: false },
    facets: { models: [], labels: [], sorts: [] },
    queryEcho,
    version: 'prompt-library-v2',
    source: 'rpc'
  });
  document.head.appendChild(script);
}

describe('prompt library bootstrap', () => {
  afterEach(() => {
    document
      .querySelectorAll('#webtomind-prompt-library-bootstrap')
      .forEach((element) => element.remove());
  });

  it('returns server data when it matches the active query', () => {
    installBootstrap({ locale: 'zh-CN', sort: 'latest', limit: 48 });

    expect(
      readPromptLibraryBootstrap(document, {
        locale: 'zh-CN',
        sort: 'latest',
        limit: 48
      })?.items[0]
    ).toMatchObject({ id: 'case-1', title: 'Case one' });
  });

  it('ignores a bootstrap generated for another filter', () => {
    installBootstrap({
      locale: 'zh-CN',
      label: 'portrait-photography',
      sort: 'latest',
      limit: 48
    });

    expect(
      readPromptLibraryBootstrap(document, {
        locale: 'zh-CN',
        label: 'product-commercial',
        sort: 'latest',
        limit: 48
      })
    ).toBeNull();
  });

  it.each([false, true])(
    'keeps browser and crawler SEO eligibility scopes distinct: seoOnly=%s',
    (seoOnly) => {
      const query = {
        locale: 'en-US',
        model: 'gpt-image-2',
        label: 'portrait-photography',
        sort: 'latest' as const,
        limit: 48,
        seoOnly: false
      };
      installBootstrap({ ...query, seoOnly });
      const result = readPromptLibraryBootstrap(document, query);
      if (seoOnly) expect(result).toBeNull();
      else expect(result?.items[0].id).toBe('case-1');
    }
  );
});
