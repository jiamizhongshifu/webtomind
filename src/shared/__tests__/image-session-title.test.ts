import { describe, expect, it } from 'vitest';
import {
  deriveImageSessionTitle,
  IMAGE_SESSION_TITLE_MAX_CHARACTERS
} from '../image-session-title';

describe('deriveImageSessionTitle', () => {
  it('使用首次提示词的开头字符作为 Session 名称', () => {
    expect(
      deriveImageSessionTitle('  雨夜的上海街头\n一位穿红色风衣的成年女性  ')
    ).toBe('雨夜的上海街头 一位穿红色风衣的成年女性');
  });

  it('对长提示词按 Unicode 字符截断', () => {
    const title = deriveImageSessionTitle(`🌙${'电影感夜景'.repeat(20)}`);

    expect(Array.from(title)).toHaveLength(IMAGE_SESSION_TITLE_MAX_CHARACTERS);
    expect(title.startsWith('🌙电影感夜景')).toBe(true);
  });

  it('只有空白时才使用兜底名称', () => {
    expect(deriveImageSessionTitle(' \n ', 'New creation')).toBe(
      'New creation'
    );
  });
});
