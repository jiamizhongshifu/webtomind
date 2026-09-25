/**
 * 服务端/边缘层语言检测工具
 *
 * 优先级：显式语言 Cookie > 浏览器 Accept-Language。
 * 其中 Accept-Language 策略：中文浏览器使用 zh-CN；
 * 其余所有语言以及缺失/无法识别的情况默认英文（英文优先）。
 */

export type DetectableLocale = 'zh-CN' | 'en-US';

// 与 src/i18n/config.ts 的 WEB_LANGUAGE_COOKIE 保持一致
export const WEB_LANGUAGE_COOKIE = 'webtomind-language';

/**
 * 从 Cookie 头解析显式语言选择（用户主动切换过才会存在）
 */
export function detectLocaleFromCookie(
  cookieHeader: string | null | undefined
): DetectableLocale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${WEB_LANGUAGE_COOKIE}=([^;]+)`)
  );
  const value = match?.[1]?.trim();
  if (value === 'zh-CN') return 'zh-CN';
  if (value === 'en-US') return 'en-US';
  return null;
}

/**
 * 根据 Accept-Language 解析首选语言
 */
export function detectLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined
): DetectableLocale {
  if (!acceptLanguage) {
    return 'en-US';
  }

  const first = acceptLanguage.split(',')[0]?.trim().toLowerCase() || '';
  if (first.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en-US';
}
