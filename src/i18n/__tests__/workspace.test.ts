/**
 * 国际化文件单元测试
 * 验证中英文翻译文件包含所有必需的 key
 */

import { describe, it, expect } from 'vitest';
import zhCN from '../locales/zh-CN/workspace.json';
import enUS from '../locales/en-US/workspace.json';

describe('国际化文件完整性', () => {
  // 聊天模式相关的必需 key
  const requiredChatModeKeys = [
    'chat.agentMode',
    'chat.askMode',
    'chat.agentModeDesc',
    'chat.askModeDesc',
    'chat.modeLocked',
    'chat.modeLockedTip'
  ];

  // 错误处理相关的必需 key
  const requiredErrorKeys = [
    'chat.error.network',
    'chat.error.auth',
    'chat.error.credits',
    'chat.error.quota',
    'chat.error.unknown',
    'chat.error.retry',
    'chat.error.upgrade',
    'chat.error.login',
    'chat.error.showDetails',
    'chat.error.hideDetails'
  ];

  // 功能菜单相关的必需 key
  const requiredFeatureKeys = [
    'chat.features.image',
    'chat.features.slide_deck'
  ];

  /**
   * 辅助函数：获取嵌套对象的值
   */
  function getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (typeof current === 'object' && current !== null && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  describe('中文翻译文件 (zh-CN)', () => {
    it('应该包含所有聊天模式相关的 key', () => {
      requiredChatModeKeys.forEach((key) => {
        const value = getNestedValue(zhCN, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
        const stringValue = typeof value === 'string' ? value : '';
        expect(stringValue.length, `${key} 不应该为空`).toBeGreaterThan(0);
      });
    });

    it('应该包含所有错误处理相关的 key', () => {
      requiredErrorKeys.forEach((key) => {
        const value = getNestedValue(zhCN, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
      });
    });

    it('应该包含所有功能菜单相关的 key', () => {
      requiredFeatureKeys.forEach((key) => {
        const value = getNestedValue(zhCN, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
      });
    });

    it('askMode 应该翻译为 "快捷问答"', () => {
      expect(zhCN.chat.askMode).toBe('快捷问答');
    });

    it('askModeDesc 应该翻译为 "快速获取答案"', () => {
      expect(zhCN.chat.askModeDesc).toBe('快速获取答案');
    });
  });

  describe('英文翻译文件 (en-US)', () => {
    it('应该包含所有聊天模式相关的 key', () => {
      requiredChatModeKeys.forEach((key) => {
        const value = getNestedValue(enUS, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
        const stringValue = typeof value === 'string' ? value : '';
        expect(stringValue.length, `${key} 不应该为空`).toBeGreaterThan(0);
      });
    });

    it('应该包含所有错误处理相关的 key', () => {
      requiredErrorKeys.forEach((key) => {
        const value = getNestedValue(enUS, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
      });
    });

    it('应该包含所有功能菜单相关的 key', () => {
      requiredFeatureKeys.forEach((key) => {
        const value = getNestedValue(enUS, key);
        expect(value, `缺少 key: ${key}`).toBeDefined();
        expect(typeof value, `${key} 应该是字符串`).toBe('string');
      });
    });

    it('askMode 应该翻译为 "Quick Ask"', () => {
      expect(enUS.chat.askMode).toBe('Quick Ask');
    });

    it('askModeDesc 应该翻译为 "Get quick answers"', () => {
      expect(enUS.chat.askModeDesc).toBe('Get quick answers');
    });
  });

  describe('中英文翻译一致性', () => {
    it('中英文文件应该有相同的顶级 key 结构', () => {
      const zhKeys = Object.keys(zhCN);
      const enKeys = Object.keys(enUS);

      // 检查中文有的 key 英文也应该有
      zhKeys.forEach((key) => {
        expect(enKeys, `英文缺少顶级 key: ${key}`).toContain(key);
      });
    });

    it('chat 对象应该有相同的 key 结构', () => {
      const zhChatKeys = Object.keys(zhCN.chat);
      const enChatKeys = Object.keys(enUS.chat);

      // 检查关键的 chat key
      const criticalKeys = [
        'askMode',
        'askModeDesc',
        'agentMode',
        'agentModeDesc',
        'error',
        'features'
      ];

      criticalKeys.forEach((key) => {
        expect(zhChatKeys, `中文 chat 缺少 key: ${key}`).toContain(key);
        expect(enChatKeys, `英文 chat 缺少 key: ${key}`).toContain(key);
      });
    });
  });
});
