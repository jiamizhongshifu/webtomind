export interface TwitterEmbedMedia {
  type: 'photo' | 'video' | 'gif' | 'unknown';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface TwitterEmbedAuthor {
  id?: string;
  name: string;
  screenName: string;
  avatarUrl?: string;
}

export interface TwitterEmbedStats {
  likes?: number;
  replies?: number;
  retweets?: number;
  bookmarks?: number;
  views?: number;
}

export interface TwitterEmbedQuote {
  id?: string;
  text?: string;
  author?: TwitterEmbedAuthor;
}

export interface TwitterEmbedArticle {
  title?: string;
  text?: string;
  wordCount?: number;
}

export interface TwitterThreadPost {
  id?: string;
  text: string;
  author?: TwitterEmbedAuthor;
  createdAt?: string;
}

export interface TwitterMetadata {
  source: 'fxembed' | 'bookmark-monitor';
  fetchMode?: 'status' | 'thread';
  fetchTrace?: {
    threadAttempted: boolean;
    threadSuccess: boolean;
    statusFallbackUsed: boolean;
  };
  tweetId: string;
  url: string;
  text: string;
  lang?: string;
  createdAt?: string;
  createdTimestamp?: number;
  author: TwitterEmbedAuthor;
  stats?: TwitterEmbedStats;
  media?: TwitterEmbedMedia[];
  quote?: TwitterEmbedQuote;
  article?: TwitterEmbedArticle;
  thread?: TwitterThreadPost[];
}

const TWITTER_METADATA_PATTERN = /<!--\s*twitter-metadata:\s*([\s\S]*?)\s*-->/g;

export function parseTwitterMetadata(markdown: string): TwitterMetadata | null {
  if (!markdown) return null;
  const match = markdown.match(TWITTER_METADATA_PATTERN);
  if (!match || match.length === 0) return null;

  const latest = match[match.length - 1];
  const payload = latest
    .replace(/^<!--\s*twitter-metadata:\s*/i, '')
    .replace(/\s*-->$/, '')
    .trim();

  try {
    const parsed = JSON.parse(payload) as TwitterMetadata;
    const sourceValid =
      parsed?.source === 'fxembed' || parsed?.source === 'bookmark-monitor';
    if (!parsed || !sourceValid || !parsed.tweetId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function stripTwitterMetadata(markdown: string): string {
  if (!markdown) return '';
  return markdown.replace(TWITTER_METADATA_PATTERN, '').trim();
}

export function appendTwitterMetadata(
  markdown: string,
  metadata: TwitterMetadata
): string {
  const cleanMarkdown = stripTwitterMetadata(markdown);
  const serialized = JSON.stringify(metadata);
  return `${cleanMarkdown}\n\n<!-- twitter-metadata: ${serialized} -->`;
}
