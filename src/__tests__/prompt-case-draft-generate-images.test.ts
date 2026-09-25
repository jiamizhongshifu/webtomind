import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assertPromptCaseAdminMock,
  executeImageGenerationJobMock,
  getSupabaseAdminMock,
  sanitizeImageGenerateInputMock
} = vi.hoisted(() => ({
  assertPromptCaseAdminMock: vi.fn(),
  executeImageGenerationJobMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
  sanitizeImageGenerateInputMock: vi.fn()
}));

vi.mock('../../api/utils/auth', () => ({
  getCorsHeadersForRequest: () => ({ 'Access-Control-Allow-Origin': '*' })
}));

vi.mock('../../api/image/generate', () => ({
  executeImageGenerationJob: executeImageGenerationJobMock,
  sanitizeImageGenerateInput: sanitizeImageGenerateInputMock
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
  mapPromptCaseDraft: (item: Record<string, unknown>) => ({
    id: item.id,
    imageUrls: item.image_urls,
    selectedImageUrl: item.selected_image_url,
    generationSettings: item.generation_settings
  }),
  mapPromptCaseDraftWithFreshImages: (
    _sb: unknown,
    item: Record<string, unknown>
  ) =>
    Promise.resolve({
      id: item.id,
      imageUrls: item.image_urls,
      selectedImageUrl: item.selected_image_url,
      generationSettings: item.generation_settings
    })
}));

import handler from '../../api/admin/prompt-case-drafts/generate-images';

type PromptCaseDraftRow = {
  id: string;
  prompt: string;
  negative_prompt?: string | null;
  generation_settings?: Record<string, unknown> | null;
  image_urls?: string[] | null;
  selected_image_url?: string | null;
  [key: string]: unknown;
};

class PromptCaseDraftQuery {
  private selected = false;
  private ids: string[] | null = null;
  private eqId: string | null = null;

  constructor(
    private rows: PromptCaseDraftRow[],
    private updateValues?: Record<string, unknown>,
    private updateCalls?: Array<{ id: string; values: Record<string, unknown> }>
  ) {}

  select() {
    this.selected = true;
    return this;
  }

  in(field: string, values: string[]) {
    if (field === 'id') {
      this.ids = values;
    }
    return this;
  }

  update(values: Record<string, unknown>) {
    this.updateValues = values;
    return this;
  }

  eq(field: string, value: string) {
    if (field === 'id') {
      this.eqId = value;
    }
    return this;
  }

  single() {
    const row = this.rows.find((item) => item.id === this.eqId) || null;
    if (!row || !this.updateValues) {
      return Promise.resolve({ data: null, error: { message: 'not found' } });
    }
    Object.assign(row, this.updateValues);
    this.updateCalls?.push({ id: row.id, values: this.updateValues });
    return Promise.resolve({ data: { ...row }, error: null });
  }

  then(
    resolve: (value: { data: PromptCaseDraftRow[]; error: null }) => void,
    reject?: (reason: unknown) => void
  ) {
    void this.selected;
    const data = this.ids
      ? this.rows.filter((row) => this.ids?.includes(row.id))
      : this.rows;
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}

function createSupabaseMock(rows: PromptCaseDraftRow[]) {
  const updateCalls: Array<{ id: string; values: Record<string, unknown> }> =
    [];
  const sb = {
    from: vi.fn(() => new PromptCaseDraftQuery(rows, undefined, updateCalls))
  };
  return { sb, updateCalls };
}

describe('admin prompt case draft image generation', () => {
  beforeEach(() => {
    assertPromptCaseAdminMock.mockReset();
    executeImageGenerationJobMock.mockReset();
    getSupabaseAdminMock.mockReset();
    sanitizeImageGenerateInputMock.mockReset();

    assertPromptCaseAdminMock.mockResolvedValue({
      ok: true,
      status: 200,
      userId: 'admin-user'
    });
    sanitizeImageGenerateInputMock.mockImplementation((input) => ({
      ok: true,
      value: input
    }));
  });

  it('requests native multi-image generation once per draft and preserves image order', async () => {
    const rows: PromptCaseDraftRow[] = [
      {
        id: 'draft-1',
        prompt: 'first prompt',
        generation_settings: { imageSize: '1024x1536', quality: 'high' },
        image_urls: []
      },
      {
        id: 'draft-2',
        prompt: 'second prompt',
        generation_settings: { imageCount: 4 },
        image_urls: []
      }
    ];
    const { sb, updateCalls } = createSupabaseMock(rows);
    getSupabaseAdminMock.mockReturnValue(sb);
    executeImageGenerationJobMock.mockImplementation(
      async ({ sanitizedInput }) => {
        const prefix = sanitizedInput.prompt.includes('second')
          ? 'second'
          : 'first';
        return {
          ok: true,
          status: 200,
          payload: {
            images: [1, 2, 3, 4].map((index) => ({
              generationId: `${prefix}-generation-${index}`,
              imageUrl: `https://cdn.example.com/${prefix}-${index}.png`,
              previewUrl: `https://cdn.example.com/${prefix}-${index}-preview.png`
            }))
          }
        };
      }
    );

    const response = await handler(
      new Request(
        'https://webtomind.com/api/admin/prompt-case-drafts/generate-images',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer admin-token' },
          body: JSON.stringify({
            draftIds: ['draft-1', 'draft-2'],
            imageCount: 3
          })
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failures).toEqual([]);
    expect(sanitizeImageGenerateInputMock).toHaveBeenCalledTimes(2);
    expect(sanitizeImageGenerateInputMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ prompt: 'first prompt', imageCount: 3 })
    );
    expect(sanitizeImageGenerateInputMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ prompt: 'second prompt', imageCount: 3 })
    );
    expect(executeImageGenerationJobMock).toHaveBeenCalledTimes(2);
    expect(executeImageGenerationJobMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 'admin-user',
        sanitizedInput: expect.objectContaining({
          prompt: 'first prompt',
          imageCount: 3
        }),
        options: expect.objectContaining({
          mode: 'sync',
          skipCreditCharge: true,
          creditWaiverReason: 'admin_prompt_case_draft_generation'
        })
      })
    );
    expect(executeImageGenerationJobMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sanitizedInput: expect.objectContaining({
          prompt: 'second prompt',
          imageCount: 3
        }),
        options: expect.objectContaining({
          skipCreditCharge: true
        })
      })
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].values.image_urls).toEqual([
      'https://cdn.example.com/first-1.png',
      'https://cdn.example.com/first-2.png',
      'https://cdn.example.com/first-3.png'
    ]);
    expect(updateCalls[0].values.selected_image_url).toBe(
      'https://cdn.example.com/first-1.png'
    );
    expect(updateCalls[0].values.generation_settings).toMatchObject({
      imageCount: 3,
      model: 'gpt-image-2',
      creditWaiverReason: 'admin_prompt_case_draft_generation',
      candidateImageAssets: [
        expect.objectContaining({
          generationId: 'first-generation-1',
          imageUrl: 'https://cdn.example.com/first-1.png',
          previewUrl: 'https://cdn.example.com/first-1-preview.png'
        }),
        expect.objectContaining({
          generationId: 'first-generation-2'
        }),
        expect.objectContaining({
          generationId: 'first-generation-3'
        })
      ]
    });
    expect(updateCalls[1].values.image_urls).toEqual([
      'https://cdn.example.com/second-1.png',
      'https://cdn.example.com/second-2.png',
      'https://cdn.example.com/second-3.png'
    ]);
    expect(updateCalls[1].values.selected_image_url).toBe(
      'https://cdn.example.com/second-1.png'
    );
  });
});
