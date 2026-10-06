import { describe, expect, it } from 'vitest';
import enUS from '../locales/en-US';
import zhCN from '../locales/zh-CN';

type Tree = { [key: string]: string | Tree };

function flattenKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : flattenKeys(value, `${prefix}${key}.`)
  );
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

describe('lazy locale resources', () => {
  // fallbackLng is disabled so each visitor downloads one locale only; every
  // English key therefore needs a Chinese counterpart (plural forms may differ).
  it('keeps every en-US key available in zh-CN', () => {
    const missing: string[] = [];
    for (const [namespace, resources] of Object.entries(enUS)) {
      const zhKeys = new Set(
        flattenKeys((zhCN as unknown as Record<string, Tree>)[namespace] || {})
      );
      for (const key of flattenKeys(resources as unknown as Tree)) {
        const base = key.replace(PLURAL_SUFFIX, '');
        if (
          !zhKeys.has(key) &&
          !zhKeys.has(base) &&
          !zhKeys.has(`${base}_other`)
        ) {
          missing.push(`${namespace}:${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('loads only the initial locale and fetches another one on switch', async () => {
    window.history.replaceState(null, '', '/zh-CN/prompts');
    const { default: i18n, i18nReady } = await import('../index');
    await i18nReady;

    expect(i18n.language).toBe('zh-CN');
    expect(i18n.hasResourceBundle('zh-CN', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('en-US', 'common')).toBe(false);
    const zhText = i18n.t('imageCreate:promptDetail.loadFailed');
    expect(zhText).not.toBe('promptDetail.loadFailed');

    await i18n.changeLanguage('en-US');
    expect(i18n.hasResourceBundle('en-US', 'imageCreate')).toBe(true);
    expect(i18n.t('imageCreate:promptDetail.loadFailed')).not.toBe(zhText);
  });
});
