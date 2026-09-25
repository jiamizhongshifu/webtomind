import { describe, expect, it } from 'vitest';
import { localizeQuestActionLink } from '../quest-links';

describe('localizeQuestActionLink', () => {
  it('prefixes app routes with the active locale', () => {
    expect(localizeQuestActionLink('/create/image', 'zh-CN')).toBe(
      '/zh-CN/create/image'
    );
    expect(localizeQuestActionLink('/create/gallery', 'en-US')).toBe(
      '/en-US/create/gallery'
    );
  });

  it('keeps already localized and external links unchanged', () => {
    expect(localizeQuestActionLink('/zh-CN/create/apps', 'en-US')).toBe(
      '/zh-CN/create/apps'
    );
    expect(localizeQuestActionLink('https://x.com/webtomind', 'zh-CN')).toBe(
      'https://x.com/webtomind'
    );
  });
});
