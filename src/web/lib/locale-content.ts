function containsCjk(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/i.test(text);
}

export function shouldUseEnglishFallback<T>(
  locale: 'zh-CN' | 'en-US',
  items: T[],
  pickText: (item: T) => string,
  threshold = 0.6
): boolean {
  if (locale !== 'en-US') return false;
  if (items.length === 0) return true;

  let englishLike = 0;
  for (const item of items) {
    const text = pickText(item).trim();
    if (text.length > 0 && !containsCjk(text)) {
      englishLike += 1;
    }
  }

  return englishLike / items.length < threshold;
}
