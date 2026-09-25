import type { VisualMoodboard } from './create-workspace-v2';
import { KREA_GALLERY_MOODBOARDS_FEED } from './krea-gallery-moodboards-feed';

const KREA_GALLERY_MOODBOARD_ID_PREFIX = 'demo-krea-gallery-';

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSearchTerms(
  board: (typeof KREA_GALLERY_MOODBOARDS_FEED)[number],
  terms: string[]
): boolean {
  if (!terms.length) return true;
  const haystack = normalizeSearchValue(
    [board.name, board.tasteProfile, ...board.positiveKeywords].join(' ')
  );
  return terms.some((term) => haystack.includes(normalizeSearchValue(term)));
}

export function toKreaGalleryMoodboard(
  board: (typeof KREA_GALLERY_MOODBOARDS_FEED)[number]
): VisualMoodboard {
  const id = `${KREA_GALLERY_MOODBOARD_ID_PREFIX}${board.id}`;
  return {
    id,
    name: board.name,
    description: board.tasteProfile,
    visibility: 'public',
    isOfficial: true,
    isOwner: false,
    coverImageUrl: board.images[0]?.imageUrl,
    itemCount: board.images.length,
    items: board.images.map((image, index) => ({
      id: `${id}-item-${index + 1}`,
      moodboardId: id,
      source: 'preset',
      imageUrl: image.imageUrl,
      title: `${board.name} ${index + 1}`,
      sortOrder: index,
      isRepresentative: true,
      createdAt: image.createdAt || board.createdAt
    })),
    analysisStatus: 'ready',
    tasteProfile: board.tasteProfile,
    keywords: [...board.positiveKeywords],
    avoids: [],
    guidelines: [],
    representativeAssetIds: [],
    analysisVersion: 1,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt
  };
}

export function searchKreaGalleryMoodboards(
  terms: string[] = []
): VisualMoodboard[] {
  return KREA_GALLERY_MOODBOARDS_FEED.filter((board) =>
    matchesSearchTerms(board, terms)
  ).map(toKreaGalleryMoodboard);
}
