export type AiMarksServiceMode = 'container' | 'http';

export function normalizeAiMarksServiceMode(
  value: unknown
): AiMarksServiceMode | null {
  const mode = String(value ?? 'http').trim().toLowerCase();
  if (mode === 'container' || mode === 'http') return mode;
  return null;
}

export function isAiMarksContainerMode(value: unknown): boolean {
  return normalizeAiMarksServiceMode(value) === 'container';
}
