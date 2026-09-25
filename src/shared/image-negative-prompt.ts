export type NegativePromptSource = 'user' | 'system' | 'none' | undefined;

const LEGACY_COMPILED_NEGATIVE_PROMPT_FRAGMENT_SETS = [
  ['画质低', '多余手指', '手部变形', '解剖错误', '水印文字'],
  [
    'low quality',
    'extra fingers',
    'distorted hands',
    'bad anatomy',
    'text watermark'
  ],
  ['透明浴巾', '浴巾接触不良', '浴巾漂浮', '男性表情不可辨识'],
  ['透明浴巾', '浴巾接触不良', '浴巾漂浮', '完全正面站姿']
] as const;

export function normalizeNegativePromptText(value: string): string {
  return value
    .trim()
    .replace(/[，、]/g, ',')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isLikelyLegacyCompiledNegativePrompt(value: string): boolean {
  const normalized = normalizeNegativePromptText(value);
  if (!normalized) return false;

  return LEGACY_COMPILED_NEGATIVE_PROMPT_FRAGMENT_SETS.some((fragments) =>
    fragments.every((fragment) =>
      normalized.includes(normalizeNegativePromptText(fragment))
    )
  );
}

export function sanitizeLegacyAutoNegativePrompt(
  value: string | null | undefined,
  source?: NegativePromptSource
): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return undefined;
  if (source === 'user') return trimmed;
  if (source === 'system') return undefined;
  if (isLikelyLegacyCompiledNegativePrompt(trimmed)) return undefined;
  return trimmed;
}
