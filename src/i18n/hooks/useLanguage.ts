/**
 * 语言管理 Hook
 * 提供语言切换、检测和持久化功能
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  getLanguageFromPathname,
  getStoredLanguage,
  saveLanguagePreference,
  isExtensionEnvironment,
  persistWebLanguage
} from '../config';

export interface UseLanguageReturn {
  /** 当前语言 */
  language: SupportedLanguage;
  /** 语言显示名称 */
  languageName: string;
  /** 支持的语言列表 */
  supportedLanguages: readonly SupportedLanguage[];
  /** 语言名称映射 */
  languageNames: Record<SupportedLanguage, string>;
  /** 切换语言 */
  changeLanguage: (lang: SupportedLanguage) => Promise<void>;
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * 语言管理 Hook
 *
 * @example
 * ```tsx
 * const { language, changeLanguage, languageNames } = useLanguage();
 *
 * return (
 *   <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
 *     {Object.entries(languageNames).map(([code, name]) => (
 *       <option key={code} value={code}>{name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export function useLanguage(): UseLanguageReturn {
  const { i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const language = i18n.language as SupportedLanguage;
  const languageName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES['zh-CN'];

  // 初始化时从存储加载语言偏好
  useEffect(() => {
    const initLanguage = async () => {
      const routeLang =
        typeof window !== 'undefined'
          ? getLanguageFromPathname(window.location.pathname)
          : null;

      if (routeLang) {
        if (routeLang !== i18n.language) {
          await i18n.changeLanguage(routeLang);
        }
        persistWebLanguage(routeLang);
        return;
      }

      const storedLang = await getStoredLanguage();
      if (storedLang && storedLang !== i18n.language) {
        await i18n.changeLanguage(storedLang);
      }
    };

    initLanguage();
  }, [i18n]);

  // 监听扩展环境中的语言变更消息
  useEffect(() => {
    if (!isExtensionEnvironment()) return;

    const handleMessage = (message: {
      type: string;
      language: SupportedLanguage;
    }) => {
      if (
        message.type === 'LANGUAGE_CHANGED' &&
        message.language !== i18n.language
      ) {
        i18n.changeLanguage(message.language);
        // 同时更新 localStorage 缓存
        persistWebLanguage(message.language);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [i18n]);

  const changeLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      if (!SUPPORTED_LANGUAGES.includes(lang)) {
        return;
      }

      if (lang === i18n.language) {
        return;
      }

      setIsLoading(true);
      try {
        // 先持久化语言选择，确保组件重新挂载或下次访问时读取到正确值
        // 这可以避免 initLanguage effect 读取到旧值导致语言被还原
        persistWebLanguage(lang);

        await i18n.changeLanguage(lang);
        await saveLanguagePreference(lang);
      } catch (error) {
        console.error('[useLanguage] Failed to change language:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [i18n]
  );

  return {
    language,
    languageName,
    supportedLanguages: SUPPORTED_LANGUAGES,
    languageNames: LANGUAGE_NAMES,
    changeLanguage,
    isLoading
  };
}

export default useLanguage;
