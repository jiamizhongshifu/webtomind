import { describe, expect, it } from 'vitest';
import type { SavedSummary } from '@/services/database';
import { summariesToInsertBlocks } from '../studio-editor-transform';

describe('summariesToInsertBlocks', () => {
  it('builds lightweight preview card blocks', () => {
    const summary = {
      id: 's1',
      title: '素材一',
      url: 'https://example.com/a',
      markdown:
        '正文 ![img](https://cdn.example.com/md.png) <img src="https://cdn.example.com/html.png" />',
      createdAt: Date.now(),
      content: {
        images: ['https://cdn.example.com/images-array.png'],
        imageUrls: ['https://cdn.example.com/image-urls.png'],
        media: [{ url: 'https://cdn.example.com/media-url.png' }]
      }
    } as SavedSummary & Record<string, unknown>;

    const summaries = [summary];

    const blocks = summariesToInsertBlocks(summaries);
    expect(blocks[0].type).toBe('noteBlock');
    expect(blocks.some((b) => b.type === 'noteBlock')).toBe(true);
    expect(blocks.some((b) => b.type === 'image')).toBe(false);
  });
});
