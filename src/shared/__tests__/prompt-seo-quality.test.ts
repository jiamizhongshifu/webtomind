import { describe, expect, it } from 'vitest';
import {
  evaluatePromptCaseSeoQuality,
  getPromptCaseSeoMedia,
  hasVideoPromptHubPublishingThreshold,
  isStablePublicSeoMediaUrl
} from '../prompt-seo-quality';

const baseCase = {
  is_published: true,
  deleted_at: null,
  members_only: false,
  slug: 'verified-prompt-case',
  title_zh: '已验证案例',
  prompt_zh: '主体、动作、镜头和光线完整的公开提示词。',
  prompt_preview_zh: '可复用的公开案例摘要。',
  model: 'gpt-image-2',
  media_type: 'image',
  image_url: 'https://cdn.example.com/case.webp',
  seo_status: 'indexable',
  seo_reviewed_at: '2026-08-06T00:00:00.000Z',
  seo_evidence: {
    source_verified: true,
    media_verified: true
  }
};

describe('prompt SEO quality gate', () => {
  it('accepts a reviewed public image case with stable media', () => {
    expect(evaluatePromptCaseSeoQuality(baseCase)).toMatchObject({
      indexable: true,
      reasons: [],
      media: { mediaType: 'image' }
    });
  });

  it('rejects signed or expiring media URLs', () => {
    expect(
      isStablePublicSeoMediaUrl(
        'https://example.supabase.co/storage/v1/object/sign/a.webp?token=secret'
      )
    ).toBe(false);
    expect(
      evaluatePromptCaseSeoQuality({
        ...baseCase,
        image_url: 'https://cdn.example.com/a.webp?X-Amz-Expires=300'
      }).reasons
    ).toContain('invalid-or-unstable-media');
  });

  it('requires poster, video, duration and upload date for video cases', () => {
    const video = {
      ...baseCase,
      model: 'seedance-2-0',
      media_type: 'video',
      video_url: 'https://cdn.example.com/case.mp4',
      video_duration_seconds: 8,
      video_upload_date: '2026-08-06T00:00:00.000Z'
    };
    expect(getPromptCaseSeoMedia(video)).toMatchObject({
      mediaType: 'video',
      durationSeconds: 8
    });
    expect(evaluatePromptCaseSeoQuality(video).indexable).toBe(true);
    expect(
      evaluatePromptCaseSeoQuality({
        ...video,
        video_duration_seconds: null
      }).reasons
    ).toContain('invalid-or-unstable-media');
  });

  it('rejects member-only and unreviewed cases', () => {
    const result = evaluatePromptCaseSeoQuality({
      ...baseCase,
      members_only: true,
      seo_status: 'review'
    });
    expect(result.indexable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(['member-only', 'not-indexable-status'])
    );
  });

  it('rejects imported placeholder summaries', () => {
    const result = evaluatePromptCaseSeoQuality({
      ...baseCase,
      commercial_intent:
        'X/Twitter 图片生成案例导入，待人工整理为可复用 Prompt Case。'
    });

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('placeholder-summary');
  });

  it('rejects unknown model labels', () => {
    const result = evaluatePromptCaseSeoQuality({
      ...baseCase,
      model: 'unknown'
    });

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('unknown-model');
  });

  it('requires eight video cases across three intents for the video hub', () => {
    const videos = Array.from({ length: 8 }, (_, index) => ({
      mediaType: 'video',
      category: ['product', 'portrait', 'short-video'][index % 3]
    }));

    expect(hasVideoPromptHubPublishingThreshold(videos)).toBe(true);
    expect(hasVideoPromptHubPublishingThreshold(videos.slice(0, 7))).toBe(
      false
    );
    expect(
      hasVideoPromptHubPublishingThreshold(
        videos.map((item) => ({ ...item, category: 'product' }))
      )
    ).toBe(false);
  });
});
