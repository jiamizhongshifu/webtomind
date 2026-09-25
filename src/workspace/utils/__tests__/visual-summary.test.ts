import { describe, expect, it, vi } from 'vitest';
import type { SavedSummary } from '@/services/database';
import {
  compareSummariesByCreatedAtDescIdAsc,
  deriveVisualSummaryDisplay,
  extractVisualSummaryFallbackImageUrl,
  getVisualSummaryDisplayMeta,
  getVisualSummaryMediaCandidates
} from '../visual-summary';

function makeSummary(summary: Partial<SavedSummary>): SavedSummary {
  return {
    id: 'summary-1',
    userId: 'user-1',
    projectId: 'project-1',
    title: 'Visual summary',
    url: '',
    markdown: '',
    contentType: 'text',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isSaving: false,
    ...summary
  } as SavedSummary;
}

describe('visual summary display meta', () => {
  it('prefers metadata preview over thumbnail and markdown fallback', () => {
    const summary = makeSummary({
      markdown: '![old](https://example.com/old.png)',
      metadata: {
        generationId: 'gen-1',
        thumbnailUrl: 'https://example.com/thumb.png',
        previewUrl: 'https://example.com/preview.png',
        imageUrl: 'https://example.com/original.png',
        modelLabel: 'GPT Image 2',
        aspectRatio: '9:16'
      }
    });

    const meta = getVisualSummaryDisplayMeta(summary);

    expect(meta.displayUrl).toBe('https://example.com/preview.png');
    expect(meta.originalUrl).toBe('https://example.com/original.png');
    expect(meta.generationId).toBe('gen-1');
    expect(meta.modelLabel).toBe('GPT Image 2');
    expect(meta.isVisual).toBe(true);
  });

  it('uses markdown media as fallback for old summaries', () => {
    const summary = makeSummary({
      markdown: 'before ![image](https://example.com/fallback.webp) after'
    });

    expect(getVisualSummaryDisplayMeta(summary).displayUrl).toBe(
      'https://example.com/fallback.webp'
    );
  });

  it('builds display candidates from storage metadata when urls are absent', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    const summary = makeSummary({
      contentType: 'image',
      metadata: {
        storageBucket: 'generated-images',
        thumbnailStoragePath: 'prompt-case-covers/thumb image.webp',
        previewStoragePath: 'prompt-case-covers/preview image.webp',
        storagePath: 'prompt-case-covers/original image.webp'
      }
    });

    const meta = getVisualSummaryDisplayMeta(summary);

    expect(meta.thumbnailUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/thumb%20image.webp'
    );
    expect(meta.displayUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/preview%20image.webp'
    );
    expect(meta.refreshUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/original%20image.webp'
    );
    expect(getVisualSummaryMediaCandidates(meta)).toEqual([
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/preview%20image.webp',
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/original%20image.webp',
      'https://example.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/thumb%20image.webp'
    ]);
  });

  it('keeps private storage paths out of display candidates but preserves refresh url', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    const summary = makeSummary({
      contentType: 'image',
      metadata: {
        storageBucket: 'user-generated-images',
        thumbnailStoragePath: 'user-1/202606/thumb.webp',
        previewStoragePath: 'user-1/202606/preview.webp',
        storagePath: 'user-1/202606/original.webp'
      }
    });

    const meta = getVisualSummaryDisplayMeta(summary);

    expect(meta.thumbnailUrl).toBeNull();
    expect(meta.displayUrl).toBeNull();
    expect(meta.refreshUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/user-generated-images/user-1/202606/original.webp'
    );
    expect(getVisualSummaryMediaCandidates(meta)).toEqual([]);
    expect(meta.isVisual).toBe(true);
  });

  it('ignores avatar images when extracting fallback media', () => {
    const content = `
      <img class="rounded-full w-8" src="https://example.com/avatar.jpg">
      <img src="https://example.com/work.png">
    `;

    expect(extractVisualSummaryFallbackImageUrl(content)).toBe(
      'https://example.com/work.png'
    );
  });

  it('derives stable visual display candidates, aspect ratio, and sort key', () => {
    const summary = makeSummary({
      id: 'summary-2',
      createdAt: Date.parse('2026-06-15T01:00:00.000Z'),
      metadata: {
        thumbnailUrl: 'https://example.com/thumb.webp',
        previewUrl: 'https://example.com/preview.webp',
        imageUrl: 'https://example.com/original.webp',
        width: 800,
        height: 1000
      }
    });

    const display = deriveVisualSummaryDisplay(summary);

    expect(display.displayUrl).toBe('https://example.com/preview.webp');
    expect(display.candidates).toEqual([
      'https://example.com/preview.webp',
      'https://example.com/original.webp',
      'https://example.com/thumb.webp'
    ]);
    expect(display.aspectRatio).toBe('800 / 1000');
    expect(display.sortKey).toBe('2026-06-15T01:00:00.000Z:summary-2');
  });

  it('derives visual display from nested media metadata', () => {
    const summary = makeSummary({
      metadata: {
        media: {
          thumbnail: {
            publicUrl: 'https://example.com/media-thumb.webp'
          },
          preview: {
            publicUrl: 'https://example.com/media-preview.webp'
          },
          original: {
            publicUrl: 'https://example.com/media-original.webp',
            width: 1200,
            height: 1500
          }
        }
      }
    });

    const display = deriveVisualSummaryDisplay(summary);

    expect(display.displayUrl).toBe('https://example.com/media-preview.webp');
    expect(display.originalUrl).toBe('https://example.com/media-original.webp');
    expect(display.candidates).toEqual([
      'https://example.com/media-preview.webp',
      'https://example.com/media-original.webp',
      'https://example.com/media-thumb.webp'
    ]);
    expect(display.aspectRatio).toBe('1200 / 1500');
    expect(display.isVisual).toBe(true);
  });

  it('uses a 4 / 5 default aspect ratio for visual summaries without dimensions', () => {
    const summary = makeSummary({
      contentType: 'image',
      metadata: {
        imageUrl: 'https://example.com/original.webp'
      }
    });

    expect(deriveVisualSummaryDisplay(summary).aspectRatio).toBe('4 / 5');
  });

  it('sorts visual summaries by createdAt desc and id asc for stable recent and thumbnail caches', () => {
    const newest = makeSummary({
      id: 'summary-c',
      createdAt: 3000
    });
    const sameTimeA = makeSummary({
      id: 'summary-a',
      createdAt: 2000
    });
    const sameTimeB = makeSummary({
      id: 'summary-b',
      createdAt: 2000
    });

    expect(
      [sameTimeB, newest, sameTimeA]
        .sort(compareSummariesByCreatedAtDescIdAsc)
        .map((summary) => summary.id)
    ).toEqual(['summary-c', 'summary-a', 'summary-b']);
  });
});
