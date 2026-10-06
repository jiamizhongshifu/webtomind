/**
 * i18next 初始化配置
 */

import i18n, { type BackendModule, type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
  getInitialLanguageSync
} from './config';

// 导入类型增强
import './types';

type LocaleResources = Record<string, ResourceLanguage[string]>;

// 每种语言一个 chunk：访客只下载当前语言的文案，切换语言时
// i18next 先经由下方 backend 加载目标语言，再完成切换。
const LOCALE_LOADERS: Record<
  SupportedLanguage,
  () => Promise<{ default: LocaleResources }>
> = {
  'zh-CN': () => import('./locales/zh-CN'),
  'en-US': () => import('./locales/en-US')
};

const localeRequests = new Map<SupportedLanguage, Promise<LocaleResources>>();

function isSupportedLanguage(language: string): language is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

function loadLocale(language: SupportedLanguage): Promise<LocaleResources> {
  let request = localeRequests.get(language);
  if (!request) {
    request = LOCALE_LOADERS[language]().then((module) => module.default);
    // 失败后允许下次切换时重试。
    request.catch(() => localeRequests.delete(language));
    localeRequests.set(language, request);
  }
  return request;
}

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {
    // 无需配置
  },
  read(language, namespace, callback) {
    if (!isSupportedLanguage(language)) {
      callback(null, {});
      return;
    }
    loadLocale(language).then(
      (resources) => callback(null, resources[namespace] ?? {}),
      (error: unknown) =>
        callback(error instanceof Error ? error : new Error(String(error)), false)
    );
  }
};

const initialLanguage = getInitialLanguageSync();
// 尽早发起当前语言的请求，与路由 chunk 并行下载。
void loadLocale(initialLanguage).catch(() => undefined);

// 初始化 i18next；应用在 i18nReady 之后再挂载，首屏不会出现原始 key。
export const i18nReady: Promise<unknown> = i18n
  .use(lazyLocaleBackend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    // 两种语言的 key 保持一致（见 locale parity 测试），不再额外下载回退语言。
    fallbackLng: false,
    load: 'currentOnly',
    defaultNS: 'common',
    ns: [
      'common',
      'home',
      'auth',
      'workspace',
      'popup',
      'floatingCard',
      'settings',
      'boards',
      'sidepanel',
      'imageCreate',
      'themeCard'
    ],

    interpolation: {
      escapeValue: false // React 已经处理了 XSS
    },

    react: {
      useSuspense: false // Chrome 扩展中禁用 Suspense
    }
  });

export default i18n;
