import { describe, expect, it } from 'vitest';
import { parsePromptDetailBootstrap } from '../promptDetailBootstrap';

describe('prompt detail bootstrap', () => {
  it('hydrates the visible prompt case from matching server data', () => {
    const result = parsePromptDetailBootstrap(
      JSON.stringify({
        id: 'case-1',
        slug: 'case-one',
        title: 'Case one',
        imageUrl: 'https://example.com/case.png',
        imageUrls: ['https://example.com/case.png'],
        prompt: 'public prompt',
        promptLocked: false
      }),
      'case-one',
      'en-US'
    );

    expect(result).toMatchObject({
      id: 'case-1',
      slug: 'case-one',
      title: 'Case one',
      imageUrl: 'https://example.com/case.png',
      prompt: 'public prompt',
      locale: 'en-US'
    });
  });

  it('rejects stale or malformed bootstrap data', () => {
    expect(
      parsePromptDetailBootstrap(
        JSON.stringify({ id: 'case-1', slug: 'old-case' }),
        'new-case',
        'zh-CN'
      )
    ).toBeNull();
    expect(
      parsePromptDetailBootstrap('{broken', 'new-case', 'zh-CN')
    ).toBeNull();
  });
});
