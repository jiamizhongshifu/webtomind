import { describe, expect, it } from 'vitest';
import {
  detectLocaleFromAcceptLanguage,
  detectLocaleFromCookie
} from '../locale-detect';

describe('detectLocaleFromCookie', () => {
  it('读取显式语言 Cookie', () => {
    expect(detectLocaleFromCookie('webtomind-language=zh-CN')).toBe('zh-CN');
    expect(detectLocaleFromCookie('webtomind-language=en-US')).toBe('en-US');
  });

  it('从多个 Cookie 中解析', () => {
    expect(
      detectLocaleFromCookie(
        'theme=dark; webtomind-language=zh-CN; session=abc'
      )
    ).toBe('zh-CN');
  });

  it('缺失、空值或非法值返回 null', () => {
    expect(detectLocaleFromCookie(null)).toBeNull();
    expect(detectLocaleFromCookie(undefined)).toBeNull();
    expect(detectLocaleFromCookie('')).toBeNull();
    expect(detectLocaleFromCookie('webtomind-language=fr-FR')).toBeNull();
    expect(detectLocaleFromCookie('theme=dark')).toBeNull();
  });
});

describe('detectLocaleFromAcceptLanguage', () => {
  it('中文 Accept-Language 返回 zh-CN', () => {
    expect(detectLocaleFromAcceptLanguage('zh-CN,zh;q=0.9')).toBe('zh-CN');
    expect(detectLocaleFromAcceptLanguage('zh-TW,zh;q=0.9')).toBe('zh-CN');
    expect(detectLocaleFromAcceptLanguage('zh;q=0.9,en;q=0.8')).toBe('zh-CN');
  });

  it('英文以及其他语言返回 en-US', () => {
    expect(detectLocaleFromAcceptLanguage('en-US,en;q=0.9')).toBe('en-US');
    expect(detectLocaleFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en-US');
    expect(detectLocaleFromAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en-US');
    expect(detectLocaleFromAcceptLanguage('ja-JP,ja;q=0.9')).toBe('en-US');
  });

  it('缺失或空 Accept-Language 默认英文（英文优先）', () => {
    expect(detectLocaleFromAcceptLanguage(null)).toBe('en-US');
    expect(detectLocaleFromAcceptLanguage(undefined)).toBe('en-US');
    expect(detectLocaleFromAcceptLanguage('')).toBe('en-US');
  });
});
