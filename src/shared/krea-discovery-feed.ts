// Open-source build: the third-party discovery dataset is not redistributed.
// Populate this feed with images you own or are licensed to publish.
export interface KreaDiscoveryFeedItem {
  id: string;
  imageUrl: string;
  originalImageUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  prompt: string;
  dominantColor: string;
}

export const KREA_DISCOVERY_FEED_SOURCE = '';
export const KREA_DISCOVERY_FEED_API_SOURCE = '';
export const KREA_DISCOVERY_FEED_FETCHED_AT = '';
export const KREA_DISCOVERY_FEED: readonly KreaDiscoveryFeedItem[] = [];
