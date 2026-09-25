/**
 * i18next 类型增强
 * 为翻译 key 提供自动补全
 */

import 'i18next';

// 导入资源类型
import type common_zhCN from './locales/zh-CN/common.json';
import type home_zhCN from './locales/zh-CN/home.json';
import type auth_zhCN from './locales/zh-CN/auth.json';
import type workspace_zhCN from './locales/zh-CN/workspace.json';
import type popup_zhCN from './locales/zh-CN/popup.json';
import type floatingCard_zhCN from './locales/zh-CN/floatingCard.json';
import type settings_zhCN from './locales/zh-CN/settings.json';
import type boards_zhCN from './locales/zh-CN/boards.json';
import type sidepanel_zhCN from './locales/zh-CN/sidepanel.json';
import type imageCreate_zhCN from './locales/zh-CN/imageCreate.json';
import type themeCard_zhCN from './locales/zh-CN/themeCard.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common_zhCN;
      home: typeof home_zhCN;
      auth: typeof auth_zhCN;
      workspace: typeof workspace_zhCN;
      popup: typeof popup_zhCN;
      floatingCard: typeof floatingCard_zhCN;
      settings: typeof settings_zhCN;
      boards: typeof boards_zhCN;
      sidepanel: typeof sidepanel_zhCN;
      imageCreate: typeof imageCreate_zhCN;
      themeCard: typeof themeCard_zhCN;
    };
  }
}
