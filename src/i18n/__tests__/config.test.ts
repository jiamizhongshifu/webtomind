import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  STORAGE_KEYS,
  detectBrowserLanguage,
  getInitialLanguageSync,
  saveLanguagePreference,
  setWebLanguageCookie
} from '../config';

function setNavigatorLanguage(language: string | undefined) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => language
  });
}

function setPathname(pathname: string) {
  window.history.pushState({}, '', pathname);
}

function clearCookies() {
  document.cookie = 'webtomind-language=; Max-Age=0; Path=/';
}

beforeEach(() => {
  localStorage.clear();
  clearCookies();
  setPathname('/');
});

afterEach(() => {
  localStorage.clear();
  clearCookies();
  setPathname('/');
});

describe('DEFAULT_LANGUAGE', () => {
  it('默认语言是 en-US（英文优先）', () => {
    expect(DEFAULT_LANGUAGE).toBe('en-US');
  });
});

describe('detectBrowserLanguage', () => {
  it('中文浏览器返回 zh-CN', () => {
    setNavigatorLanguage('zh-CN');
    expect(detectBrowserLanguage()).toBe('zh-CN');
    setNavigatorLanguage('zh-TW');
    expect(detectBrowserLanguage()).toBe('zh-CN');
    setNavigatorLanguage('zh');
    expect(detectBrowserLanguage()).toBe('zh-CN');
  });

  it('英文以及其他语言浏览器返回 en-US', () => {
    setNavigatorLanguage('en-US');
    expect(detectBrowserLanguage()).toBe('en-US');
    setNavigatorLanguage('en-GB');
    expect(detectBrowserLanguage()).toBe('en-US');
    setNavigatorLanguage('fr-FR');
    expect(detectBrowserLanguage()).toBe('en-US');
  });

  it('无法检测浏览器语言时默认英文', () => {
    setNavigatorLanguage(undefined);
    expect(detectBrowserLanguage()).toBe('en-US');
  });
});

describe('getInitialLanguageSync', () => {
  it('URL 语言前缀优先级最高', () => {
    localStorage.setItem(STORAGE_KEYS.WEB_LANGUAGE, 'en-US');
    setNavigatorLanguage('zh-CN');

    setPathname('/zh-CN/create');
    expect(getInitialLanguageSync()).toBe('zh-CN');

    setPathname('/en-US/create');
    expect(getInitialLanguageSync()).toBe('en-US');
  });

  it('已存储的语言偏好优先于浏览器检测', () => {
    localStorage.setItem(STORAGE_KEYS.WEB_LANGUAGE, 'en-US');
    setNavigatorLanguage('zh-CN');
    expect(getInitialLanguageSync()).toBe('en-US');
  });

  it('无存储时按浏览器语言检测，但不写入持久化（英文默认由入口层保证）', () => {
    setNavigatorLanguage('zh-CN');
    expect(getInitialLanguageSync()).toBe('zh-CN');
    expect(localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE)).toBeNull();

    setNavigatorLanguage('en-US');
    expect(getInitialLanguageSync()).toBe('en-US');
    expect(localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE)).toBeNull();
  });

  it('无存储、无 Cookie 且无法检测浏览器语言时默认英文', () => {
    setNavigatorLanguage(undefined);
    expect(getInitialLanguageSync()).toBe('en-US');
    expect(localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE)).toBeNull();
  });

  it('显式语言 Cookie 优先于浏览器检测', () => {
    setNavigatorLanguage('zh-CN');
    setWebLanguageCookie('en-US');
    expect(getInitialLanguageSync()).toBe('en-US');
  });

  it('显式语言 Cookie 在 localStorage 缺失时仍生效', () => {
    setNavigatorLanguage('en-US');
    setWebLanguageCookie('zh-CN');
    expect(getInitialLanguageSync()).toBe('zh-CN');
  });

  it('saveLanguagePreference 写入 Cookie 以跨访问保留选择', async () => {
    await saveLanguagePreference('zh-CN');
    expect(document.cookie).toContain('webtomind-language=zh-CN');
  });
});
