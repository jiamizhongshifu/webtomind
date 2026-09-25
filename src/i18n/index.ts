/**
 * i18next 初始化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, getInitialLanguageSync } from './config';

// 导入类型增强
import './types';

// 静态导入所有语言文件（Chrome 扩展要求）
import common_zhCN from './locales/zh-CN/common.json';
import home_zhCN from './locales/zh-CN/home.json';
import auth_zhCN from './locales/zh-CN/auth.json';
import workspace_zhCN from './locales/zh-CN/workspace.json';
import popup_zhCN from './locales/zh-CN/popup.json';
import floatingCard_zhCN from './locales/zh-CN/floatingCard.json';
import settings_zhCN from './locales/zh-CN/settings.json';
import boards_zhCN from './locales/zh-CN/boards.json';
import sidepanel_zhCN from './locales/zh-CN/sidepanel.json';
import imageCreate_zhCN from './locales/zh-CN/imageCreate.json';
import themeCard_zhCN from './locales/zh-CN/themeCard.json';

import common_enUS from './locales/en-US/common.json';
import home_enUS from './locales/en-US/home.json';
import auth_enUS from './locales/en-US/auth.json';
import workspace_enUS from './locales/en-US/workspace.json';
import popup_enUS from './locales/en-US/popup.json';
import floatingCard_enUS from './locales/en-US/floatingCard.json';
import settings_enUS from './locales/en-US/settings.json';
import boards_enUS from './locales/en-US/boards.json';
import sidepanel_enUS from './locales/en-US/sidepanel.json';
import imageCreate_enUS from './locales/en-US/imageCreate.json';
import themeCard_enUS from './locales/en-US/themeCard.json';

// 资源配置
const resources = {
  'zh-CN': {
    common: common_zhCN,
    home: home_zhCN,
    auth: auth_zhCN,
    workspace: workspace_zhCN,
    popup: popup_zhCN,
    floatingCard: floatingCard_zhCN,
    settings: settings_zhCN,
    boards: boards_zhCN,
    sidepanel: sidepanel_zhCN,
    imageCreate: imageCreate_zhCN,
    themeCard: themeCard_zhCN
  },
  'en-US': {
    common: common_enUS,
    home: home_enUS,
    auth: auth_enUS,
    workspace: workspace_enUS,
    popup: popup_enUS,
    floatingCard: floatingCard_enUS,
    settings: settings_enUS,
    boards: boards_enUS,
    sidepanel: sidepanel_enUS,
    imageCreate: imageCreate_enUS,
    themeCard: themeCard_enUS
  }
};

// 初始化 i18next
i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguageSync(),
  fallbackLng: DEFAULT_LANGUAGE,
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
