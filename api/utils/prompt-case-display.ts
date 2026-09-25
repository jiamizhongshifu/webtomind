export type PromptCaseDisplayLocale = 'zh-CN' | 'en-US';

export function normalizePromptCaseDisplayLocale(
  value: unknown
): PromptCaseDisplayLocale {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

export function readPromptCaseDisplayString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function pickPromptCaseLocalizedText(
  item: Record<string, unknown>,
  locale: PromptCaseDisplayLocale,
  fields: { zh: string; en: string; fallback: string }
): string {
  const zh = readPromptCaseDisplayString(item[fields.zh]);
  const en = readPromptCaseDisplayString(item[fields.en]);
  const fallback = readPromptCaseDisplayString(item[fields.fallback]);
  return locale === 'en-US' ? en || fallback || zh : zh || fallback || en;
}

export function inferPromptCaseDisplayTitle(
  prompt: unknown,
  fallback = 'Prompt case'
): string {
  if (typeof prompt !== 'string') return fallback;
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return (
    normalized
      .replace(/^\s*\d{1,2}\s*[:：]\s*\d{1,2}\s*[，,、。.\s-]*/u, '')
      .replace(/^生成一?张(?:单张)?\s*/u, '')
      .split(/[，,。.;；\n]/u)[0]
      .trim()
      .slice(0, 48) || fallback
  );
}

function isUsablePromptCaseTitle(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 72 &&
    !value.startsWith('{') &&
    !value.startsWith('[') &&
    !/[\r\n]/u.test(value) &&
    !/(?:提示词|prompt)\s*[:：]/iu.test(value)
  );
}

export function pickPromptCaseDisplayTitle(
  item: Record<string, unknown>,
  locale: PromptCaseDisplayLocale,
  fallbackPrompt?: unknown
): string {
  const preferredTitle = readPromptCaseDisplayString(
    item[locale === 'en-US' ? 'title_en' : 'title_zh']
  );
  if (isUsablePromptCaseTitle(preferredTitle)) return preferredTitle;

  const preferredPrompt = readPromptCaseDisplayString(
    item[locale === 'en-US' ? 'prompt_preview_en' : 'prompt_preview_zh']
  );
  if (preferredPrompt) {
    return inferPromptCaseDisplayTitle(
      preferredPrompt,
      locale === 'en-US' ? 'Prompt case' : '提示词案例'
    );
  }

  const fallbackTitle = readPromptCaseDisplayString(item.title);
  if (isUsablePromptCaseTitle(fallbackTitle)) return fallbackTitle;

  const alternateTitle = readPromptCaseDisplayString(
    item[locale === 'en-US' ? 'title_zh' : 'title_en']
  );
  if (isUsablePromptCaseTitle(alternateTitle)) return alternateTitle;

  const prompt =
    fallbackPrompt ??
    pickPromptCaseLocalizedText(item, locale, {
      zh: 'prompt_preview_zh',
      en: 'prompt_preview_en',
      fallback: 'prompt_preview'
    });
  return inferPromptCaseDisplayTitle(
    prompt,
    locale === 'en-US' ? 'Prompt case' : '提示词案例'
  );
}
