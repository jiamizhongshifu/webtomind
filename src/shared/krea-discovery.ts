import { KREA_DISCOVERY_FEED } from './krea-discovery-feed';

const DEFAULT_LIMIT = 18;

export interface KreaDiscoveryImageRecord {
  id: string;
  imageUrl: string;
  originalImageUrl?: string;
  sourceUrl: string;
  width: number;
  height: number;
  prompt: string;
  dominantColor: string;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

function titleFromPrompt(prompt: string): string {
  const sentence = prompt.split(/(?<=[.!?])\s+/u)[0] || prompt;
  return sentence.length > 92 ? `${sentence.slice(0, 89).trim()}…` : sentence;
}

function colorDistance(left: string, right: string): number {
  const channels = (value: string) => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  ];
  const [leftRed, leftGreen, leftBlue] = channels(left);
  const [rightRed, rightGreen, rightBlue] = channels(right);
  return Math.sqrt(
    (leftRed - rightRed) ** 2 +
      (leftGreen - rightGreen) ** 2 +
      (leftBlue - rightBlue) ** 2
  );
}

function scoreRecord(
  record: KreaDiscoveryImageRecord,
  terms: string[]
): number {
  if (!terms.length) return 1;
  const prompt = normalizeSearchValue(record.prompt);
  let score = 0;
  terms.forEach((term) => {
    if (/^#[0-9a-f]{6}$/i.test(term)) {
      score += Math.max(0, 4 - colorDistance(record.dominantColor, term) / 64);
      return;
    }
    if (prompt.includes(term)) score += term.length >= 6 ? 4 : 2;
  });
  return score;
}

export function searchKreaDiscoveryFeed(
  terms: string[],
  limit = DEFAULT_LIMIT,
  offset = 0
): Array<KreaDiscoveryImageRecord & { title: string }> {
  const normalizedTerms = terms.map(normalizeSearchValue).filter(Boolean);
  const scored = (KREA_DISCOVERY_FEED as readonly KreaDiscoveryImageRecord[])
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
      score: scoreRecord(record, normalizedTerms)
    }))
    .filter((entry) => !normalizedTerms.length || entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.sourceIndex - right.sourceIndex
    );

  // Chinese image-analysis terms and English Krea prompts may not overlap. In
  // that case keep the visual feed useful instead of falling back to case art.
  const candidates = scored.length
    ? scored
    : (KREA_DISCOVERY_FEED as readonly KreaDiscoveryImageRecord[]).map(
        (record, sourceIndex) => ({ record, sourceIndex, score: 0 })
      );
  const safeOffset = Math.max(0, offset);
  return candidates
    .slice(safeOffset, safeOffset + Math.max(0, limit))
    .map(({ record }) => ({
      ...record,
      title: titleFromPrompt(record.prompt)
    }));
}
