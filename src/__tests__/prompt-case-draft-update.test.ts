import { beforeEach, describe, expect, it, vi } from 'vitest';

const { assertPromptCaseAdminMock, getSupabaseAdminMock } = vi.hoisted(() => ({
  assertPromptCaseAdminMock: vi.fn(),
  getSupabaseAdminMock: vi.fn()
}));

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' })
}));

vi.mock('../../api/admin/prompt-case-drafts/_shared', () => ({
  assertPromptCaseAdmin: assertPromptCaseAdminMock,
  getMissingPromptDraftsResponse: (headers: Record<string, string>) =>
    new Response(JSON.stringify({ error: 'missing table' }), {
      status: 424,
      headers
    }),
  getSupabaseAdmin: getSupabaseAdminMock,
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
  mapPromptCaseDraftWithFreshImages: (_sb: unknown, item: unknown) =>
    Promise.resolve(item),
  normalizeImageUrls: (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [],
  normalizeTags: (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [],
  PROMPT_CASE_DRAFT_STATUSES: new Set([
    'draft',
    'images_generated',
    'approved',
    'published',
    'rejected'
  ])
}));

import handler from '../../api/admin/prompt-case-drafts/[id]';

function createPatchSupabaseMock() {
  const state: {
    updatedPatch: Record<string, unknown> | null;
  } = { updatedPatch: null };
  const query = {
    update: vi.fn((patch: Record<string, unknown>) => {
      state.updatedPatch = patch;
      return query;
    }),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() =>
      Promise.resolve({
        data: {
          id: 'draft-video-1',
          title: 'Video draft',
          category: 'featured',
          tags: [],
          image_urls: ['https://pbs.twimg.com/amplify_video_thumb/1/case.jpg'],
          selected_image_url:
            'https://pbs.twimg.com/amplify_video_thumb/1/case.jpg',
          status: 'draft',
          member_only: false,
          ...state.updatedPatch
        },
        error: null
      })
    )
  };
  const sb = {
    from: vi.fn(() => query)
  };
  return { sb, state, query };
}

describe('admin prompt case draft update', () => {
  beforeEach(() => {
    assertPromptCaseAdminMock.mockResolvedValue({
      ok: true,
      email: 'admin@example.com'
    });
  });

  it('allows keeping an imported video draft prompt empty while editing metadata', async () => {
    const { sb, state } = createPatchSupabaseMock();
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/draft-video-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: 'Seedance draft to clean up',
            prompt: '',
            generationSettings: {
              mediaType: 'video',
              videoUrls: ['https://video.twimg.com/amplify_video/1/case.mp4']
            }
          })
        }
      )
    );

    expect(response.status).toBe(200);
    expect(state.updatedPatch).toMatchObject({
      title: 'Seedance draft to clean up',
      prompt: '',
      generation_settings: {
        mediaType: 'video',
        videoUrls: ['https://video.twimg.com/amplify_video/1/case.mp4']
      }
    });
  });

  it('still rejects clearing an image-only draft prompt', async () => {
    const { sb, query } = createPatchSupabaseMock();
    getSupabaseAdminMock.mockReturnValue(sb);

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/draft-image-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            prompt: '',
            generationSettings: {
              mediaType: 'image'
            }
          })
        }
      )
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('prompt is required');
    expect(query.update).not.toHaveBeenCalled();
  });
});
