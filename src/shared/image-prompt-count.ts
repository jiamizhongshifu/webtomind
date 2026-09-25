function parseImageCountToken(token: string | undefined): number | null {
  if (!token) return null;
  const normalized = token.trim().toLowerCase();
  const zhMap: Record<string, number> = {
    二: 2,
    两: 2,
    三: 3,
    四: 4
  };
  if (zhMap[normalized]) return zhMap[normalized];
  if (/^[2-4]$/.test(normalized)) return Number(normalized);
  return null;
}

export function detectPromptImageCount(prompt: string): number {
  const normalized = prompt
    .replace(/[，。！？；、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 1;

  const countToken = '([2-4]|二|两|三|四)';
  const countPatterns = [
    new RegExp(
      `(?:生成|输出|制作|创作|画|create|generate|make|produce)[^\\n]{0,28}${countToken}\\s*(?:张|幅|个|images?|pictures?|variations?|outputs?)`,
      'i'
    ),
    new RegExp(
      `${countToken}\\s*(?:张|幅|个|images?|pictures?|variations?|outputs?)`,
      'i'
    )
  ];

  for (const pattern of countPatterns) {
    const match = normalized.match(pattern);
    const detected = parseImageCountToken(match?.[1]);
    if (detected && detected > 1) return detected;
  }

  if (
    /(?:多张|多幅|多个版本|多个方案|multiple images?|several images?|a few images?|image set|variations?)/i.test(
      normalized
    )
  ) {
    return 2;
  }

  return 1;
}
