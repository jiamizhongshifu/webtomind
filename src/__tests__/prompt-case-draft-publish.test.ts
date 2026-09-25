import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertPromptCaseAdminMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  assertPromptCaseAdminMock: vi.fn(),
  getSupabaseAdminMock: vi.fn()
}));

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' })
}));

vi.mock('../../api/utils/signed-storage-url', () => ({
  refreshSupabaseSignedStorageUrls: (_sb: unknown, urls: string[]) =>
    Promise.resolve(urls)
}));

vi.mock('../../api/admin/prompt-case-drafts/_shared', () => ({
  assertPromptCaseAdmin: assertPromptCaseAdminMock,
  createPromptCaseSlug: (title: string, id: string) =>
    `${title || 'case'}-${id}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  getMissingPromptDraftsResponse: (headers: Record<string, string>) =>
    new Response(JSON.stringify({ error: 'missing table' }), {
      status: 424,
      headers
    }),
  getSupabaseAdmin: getSupabaseAdminMock,
  inferLocaleFromDraft: () => 'zh-CN',
  isMissingPromptCaseDraftsTable: () => false,
  jsonResponse: (
    data: unknown,
    corsHeaders: Record<string, string>,
    status = 200
  ) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    }),
  normalizeImageUrls: (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [],
  normalizeTags: (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [],
  PROMPT_CASE_ADMIN_EMAIL: 'fallback-admin@example.com'
}));

import handler from '../../api/admin/prompt-case-drafts/[id]/publish';

type PromptCaseDraftRow = {
  id: string;
  title: string;
  prompt: string;
  image_urls: string[];
  selected_image_url?: string | null;
  tags?: string[];
  member_only?: boolean;
  generation_settings?: Record<string, unknown>;
  package_slug?: string | null;
  commercial_intent?: string | null;
  review_notes?: string | null;
  [key: string]: unknown;
};

type SupabaseState = {
  draft: PromptCaseDraftRow | null;
  insertedCase: Record<string, unknown> | null;
  deletedDraftId: string | null;
};

class SupabaseQuery {
  private mode: 'select' | 'insert' | 'delete' = 'select';
  private eqId = '';

  constructor(
    private table: string,
    private state: SupabaseState
  ) {}

  select() {
    return this;
  }

  eq(field: string, value: string) {
    if (field === 'id') {
      this.eqId = value;
    }
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.mode = 'insert';
    this.state.insertedCase = {
      id: 'case-1',
      view_count: 0,
      copy_count: 0,
      generate_count: 0,
      created_at: '2026-07-04T00:00:00.000Z',
      updated_at: '2026-07-04T00:00:00.000Z',
      ...values
    };
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  single() {
    if (this.table === 'prompt_case_drafts') {
      return Promise.resolve({
        data: this.state.draft?.id === this.eqId ? this.state.draft : null,
        error:
          this.state.draft?.id === this.eqId ? null : { message: 'not found' }
      });
    }
    if (this.table === 'prompt_cases' && this.mode === 'insert') {
      return Promise.resolve({
        data: this.state.insertedCase,
        error: this.state.insertedCase ? null : { message: 'insert failed' }
      });
    }
    return Promise.resolve({ data: null, error: { message: 'not found' } });
  }

  then(
    resolve: (value: { error: null }) => void,
    reject?: (reason: unknown) => void
  ) {
    if (this.table === 'prompt_case_drafts' && this.mode === 'delete') {
      this.state.deletedDraftId = this.eqId;
      return Promise.resolve({ error: null }).then(resolve, reject);
    }
    return Promise.resolve({ error: null }).then(resolve, reject);
  }
}

function createSupabaseMock(draft: PromptCaseDraftRow) {
  const state: SupabaseState = {
    draft,
    insertedCase: null,
    deletedDraftId: null
  };
  const sb = {
    from: vi.fn((table: string) => new SupabaseQuery(table, state))
  };
  return { sb, state };
}

describe('admin prompt case draft publish', () => {
  beforeEach(() => {
    assertPromptCaseAdminMock.mockResolvedValue({
      ok: true,
      email: 'admin@example.com'
    });
  });

  it('returns the published case in the frontend camelCase shape', async () => {
    const { sb, state } = createSupabaseMock({
      id: 'draft-1',
      title: 'Imported Case',
      prompt: 'A cinematic product hero shot',
      image_urls: ['https://cdn.example.com/cover.png'],
      selected_image_url: 'https://cdn.example.com/cover.png',
      tags: ['ecommerce', '待审核'],
      member_only: true,
      generation_settings: { model: 'gpt-image-2' },
      package_slug: 'prompt-pack',
      commercial_intent: 'Landing page visual',
      review_notes: 'sourceUrl: https://x.com/user/status/1'
    });
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/draft-1/publish',
        { method: 'POST' }
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(state.deletedDraftId).toBe('draft-1');
    expect(state.insertedCase).toMatchObject({
      source_draft_id: 'draft-1'
    });
    expect(result.deletedDraftId).toBe('draft-1');
    expect(result.case).toMatchObject({
      id: 'case-1',
      imageUrl: 'https://cdn.example.com/cover.png',
      imageUrls: ['https://cdn.example.com/cover.png'],
      title: 'Imported Case',
      memberOnly: true,
      packageSlug: 'prompt-pack',
      commercialIntent: 'Landing page visual',
      promptPreview: 'A cinematic product hero shot',
      authorUrl: 'https://x.com/user/status/1',
      isPublished: true,
      createdByEmail: 'admin@example.com'
    });
    expect(result.case.image_url).toBeUndefined();
    expect(result.case.members_only).toBeUndefined();
  });

  it('publishes imported video draft media fields', async () => {
    const { sb, state } = createSupabaseMock({
      id: 'draft-video-1',
      title: 'Seedance Perfume Video',
      prompt: 'A cinematic perfume product video',
      image_urls: ['https://cdn.example.com/video-poster.jpg'],
      selected_image_url: 'https://cdn.example.com/video-poster.jpg',
      tags: ['Seedance', '待审核'],
      generation_settings: {
        model: 'seedance-1-pro',
        mediaType: 'video',
        videoUrl: 'https://example.com/not-a-video-page',
        videoUrls: [
          'https://video.twimg.com/ext_tw_video/1/pu/vid/case.mp4',
          'https://example.com/not-a-video-page'
        ]
      },
      review_notes:
        'sourceUrl: https://x.com/user/status/1\nsourceVideoUrls: https://example.com/not-a-video-page'
    });
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/draft-video-1/publish',
        { method: 'POST' }
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(state.insertedCase).toMatchObject({
      category: 'video',
      media_type: 'video',
      video_url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/case.mp4',
      video_urls: ['https://video.twimg.com/ext_tw_video/1/pu/vid/case.mp4']
    });
    expect(result.case).toMatchObject({
      category: 'video',
      mediaType: 'video',
      videoUrl: 'https://video.twimg.com/ext_tw_video/1/pu/vid/case.mp4',
      videoUrls: ['https://video.twimg.com/ext_tw_video/1/pu/vid/case.mp4']
    });
  });

  it('does not publish invalid external video URLs', async () => {
    const { sb, state } = createSupabaseMock({
      id: 'draft-video-invalid',
      title: 'Invalid Video URL',
      prompt: 'A cinematic perfume product video',
      image_urls: ['https://cdn.example.com/video-poster.jpg'],
      selected_image_url: 'https://cdn.example.com/video-poster.jpg',
      generation_settings: {
        mediaType: 'video',
        videoUrl: 'https://example.com/not-a-video-page',
        videoUrls: ['https://example.com/not-a-video-page']
      }
    });
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/draft-video-invalid/publish',
        { method: 'POST' }
      )
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(state.insertedCase).toMatchObject({
      media_type: 'image',
      video_url: null,
      video_urls: []
    });
    expect(result.case).toMatchObject({
      mediaType: 'image',
      videoUrl: '',
      videoUrls: []
    });
  });
});
