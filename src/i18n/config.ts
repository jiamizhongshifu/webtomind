/**
 * i18n 配置常量和工具函数
 */

// 支持的语言列表
export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// 默认语言（英文优先：无法识别浏览器语言时默认展示英文版）
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en-US';

// 语言显示名称
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English'
};

// 存储 Key
export const STORAGE_KEYS = {
  // Chrome 扩展使用
  CHROME_LANGUAGE: 'ai-mind-mapper-config.language',
  // Web 网站使用
  WEB_LANGUAGE: 'webtomind-language',
  WEB_LANGUAGE_PROMPT_DISMISSED: 'webtomind-language-prompt-dismissed'
} as const;

// Cookie Key（Worker 入口读取，用于无前缀路径上尊重用户的显式语言选择）
export const WEB_LANGUAGE_COOKIE = 'webtomind-language';

// 命名空间列表
export const NAMESPACES = [
  'common',
  'home',
  'auth',
  'workspace',
  'popup',
  'floatingCard',
  'settings',
  'sidepanel',
  'boards'
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/**
 * 检测浏览器语言并返回支持的语言
 * 策略：中文用户使用中文，非中文用户使用英语
 */
export function detectBrowserLanguage(): SupportedLanguage {
  const browserLang = navigator.language || navigator.languages?.[0];

  if (!browserLang) {
    // 无法检测时默认英语
    return 'en-US';
  }

  // 精确匹配
  if (SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)) {
    return browserLang as SupportedLanguage;
  }

  // 前缀匹配 - 只有中文用户返回中文
  const langPrefix = browserLang.split('-')[0].toLowerCase();
  if (langPrefix === 'zh') {
    return 'zh-CN';
  }

  // 其他所有语言（包括英语和其他语言）都使用英语
  return 'en-US';
}

export function getLanguageFromPathname(
  pathname: string
): SupportedLanguage | null {
  if (pathname === '/zh-CN' || pathname.startsWith('/zh-CN/')) {
    return 'zh-CN';
  }

  if (pathname === '/en-US' || pathname.startsWith('/en-US/')) {
    return 'en-US';
  }

  return null;
}

/**
 * 判断是否在 Chrome 扩展环境中
 */
export function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
}

/**
 * 获取存储的语言偏好
 */
export async function getStoredLanguage(): Promise<SupportedLanguage | null> {
  if (isExtensionEnvironment()) {
    try {
      const result = await chrome.storage.sync.get(
        STORAGE_KEYS.CHROME_LANGUAGE
      );
      const lang = result[STORAGE_KEYS.CHROME_LANGUAGE];
      if (lang && SUPPORTED_LANGUAGES.includes(lang)) {
        return lang as SupportedLanguage;
      }
    } catch {
      // 忽略存储访问错误
    }
  } else {
    const lang = localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE);
    if (lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      return lang as SupportedLanguage;
    }
    const cookieLang = getWebLanguageCookie();
    if (cookieLang) {
      return cookieLang;
    }
  }
  return null;
}

/**
 * 写入 Web 语言 Cookie（跨访问保留显式选择，Worker 入口会读取）
 */
export function setWebLanguageCookie(language: SupportedLanguage): void {
  try {
    if (typeof document === 'undefined') return;
    const hostname = window.location.hostname;
    const domain =
      hostname === 'webtomind.com' || hostname.endsWith('.webtomind.com')
        ? 'webtomind.com'
        : '';
    document.cookie = `${WEB_LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
  } catch {
    // 忽略 cookie 不可用
  }
}

/**
 * 读取 Web 语言 Cookie
 */
export function getWebLanguageCookie(): SupportedLanguage | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${WEB_LANGUAGE_COOKIE}=([^;]+)`)
    );
    const value = match?.[1]?.trim();
    if (value && SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)) {
      return value as SupportedLanguage;
    }
  } catch {
    // 忽略 cookie 解析错误
  }
  return null;
}

/**
 * 同步持久化显式语言选择（localStorage + Cookie）
 */
export function persistWebLanguage(language: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WEB_LANGUAGE, language);
  } catch {
    // localStorage 不可用
  }
  setWebLanguageCookie(language);
}

/**
 * 保存语言偏好
 */
export async function saveLanguagePreference(
  language: SupportedLanguage
): Promise<void> {
  if (isExtensionEnvironment()) {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEYS.CHROME_LANGUAGE]: language
      });
      // 广播语言变更消息
      chrome.runtime
        .sendMessage({ type: 'LANGUAGE_CHANGED', language })
        .catch(() => {
          // 忽略发送消息失败（可能没有其他监听者）
        });
    } catch {
      // 忽略存储访问错误
    }
  } else {
    persistWebLanguage(language);
  }
}

/**
 * 获取初始语言（同步版本，用于 i18n 初始化）
 * 优先级：localStorage 缓存 > 浏览器语言 > 默认语言
 */
export function getInitialLanguageSync(): SupportedLanguage {
  const routeLanguage =
    typeof window !== 'undefined'
      ? getLanguageFromPathname(window.location.pathname)
      : null;

  if (routeLanguage) {
    return routeLanguage;
  }

  // 尝试从 localStorage 获取缓存（Web 和扩展都可用）
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.WEB_LANGUAGE);
    if (cached && SUPPORTED_LANGUAGES.includes(cached as SupportedLanguage)) {
      return cached as SupportedLanguage;
    }
  } catch {
    // localStorage 不可用
  }

  const cookieLang = getWebLanguageCookie();
  if (cookieLang) {
    return cookieLang;
  }

  // 未显式选择时按浏览器语言展示；无法识别时默认英文
  return detectBrowserLanguage();
}
