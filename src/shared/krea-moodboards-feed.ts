// Open-source build: the third-party moodboard dataset is not redistributed.
// Populate this feed with images you own or are licensed to publish.
export interface KreaMoodboardFeedImage {
  id: string;
  imageUrl: string;
  originalImageUrl: string;
  width: number;
  height: number;
  assetId: string;
  createdAt: string;
}

export interface KreaMoodboardFeedItem {
  id: string;
  name: string;
  sourceUrl: string;
  dataset: string;
  images: readonly KreaMoodboardFeedImage[];
  imageCount: number;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  analyzedAt: string;
  palette: readonly { hex: string; weight: number }[];
  tasteProfile: string;
  positiveKeywords: readonly string[];
}

export const KREA_PUBLIC_MOODBOARDS_SOURCE = '';
export const KREA_PUBLIC_MOODBOARDS_API_SOURCE = '';
export const KREA_PUBLIC_MOODBOARDS_FETCHED_AT = '';
export const KREA_PUBLIC_MOODBOARDS_FEED: readonly KreaMoodboardFeedItem[] = [];
