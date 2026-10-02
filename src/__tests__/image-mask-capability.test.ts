import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  getImageMaskEditFailure,
  handleImageGenerateRequest,
  sanitizeImageGenerateInput,
  supportsImageMaskEditing
} from '../../api/image/generate';
import { handleRetryImageTaskRequest } from '../../api/image/task';
import modelsHandler from '../../api/image/models';
import { IMAGE_MASK_EDIT_UNSUPPORTED } from '../shared/image-mask-edit';

vi.mock('../../api/utils/auth.js', () => ({
  getUserIdFromRequest: vi.fn(async () => 'fictional-user'),
  getCorsHeadersForRequest: () => ({}),
  getSupabaseAdmin: () => null
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const originalEnv = { ...process.env };
const body = {
  prompt: 'Make the fictional door blue',
  model: 'gpt-image-2.5',
  referenceImageIds: ['fictional-source'],
  maskImageId: 'fictional-mask'
};

beforeEach(() => {
  // Fixtures deliberately never inherit connected provider configuration.
  for (const key of Object.keys(process.env)) {
    if (/^(TUZI_|OPENAI_|KRILL_|GPT_IMAGE_|GEMINI_|GOOGLE_)/.test(key))
      delete process.env[key];
  }
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request');
    })
  );
});
afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

function requestInput(model = 'gpt-image-2.5') {
  const input = sanitizeImageGenerateInput(
    { ...body, model },
    { preserveLegacyGptImage2: true }
  );
  if (!input.ok) throw new Error('Invalid test fixture');
  return input.value;
}
function enableNativeEdit() {
  process.env.OPENAI_COMPAT_IMAGE_ENABLED = 'true';
  process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://mock-provider.test/v1';
  process.env.OPENAI_COMPAT_IMAGE_API_KEY = 'fictional-key';
  process.env.OPENAI_COMPAT_IMAGE_MODEL = 'gpt-image-2';
  process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS = 'true';
}

describe('mask edit route capability', () => {
  it('only accepts the existing native multipart edit adapter when edits are enabled', () => {
    enableNativeEdit();
    const input = { ...requestInput(), provider: 'openai' as const };
    expect(supportsImageMaskEditing(input, true)).toBe(true);
    expect(getImageMaskEditFailure(input, true)).toBeNull();
    process.env.OPENAI_COMPAT_IMAGE_SUPPORTS_EDITS = 'false';
    expect(supportsImageMaskEditing(input, true)).toBe(false);
  });
  it('rejects the Chao async route even when general reference editing is enabled', () => {
    enableNativeEdit();
    process.env.OPENAI_COMPAT_IMAGE_BASE_URL = 'https://api.chaojitudou.com/v1';
    expect(
      supportsImageMaskEditing({ ...requestInput(), provider: 'openai' }, true)
    ).toBe(false);
  });
  it('requires every Tuzi channel attempt to carry masks', () => {
    process.env.TUZI_OFFICIAL_API_KEY = 'fictional-key';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'official';
    process.env.GPT_IMAGE_2_ENABLE_SLOW_FALLBACKS = 'true';
    const input = { ...requestInput('gpt-image-2'), provider: 'tuzi' as const };
    expect(supportsImageMaskEditing(input, true)).toBe(true);
    process.env.TUZI_API_KEY = 'fictional-default-key';
    process.env.TUZI_IMAGE_CHANNEL_ORDER = 'default,official';
    expect(supportsImageMaskEditing(input, true)).toBe(false);
  });
  it.each(['krill', 'gemini', 'z-image'] as const)(
    'rejects %s without changing its protocol',
    (provider) => {
      expect(
        supportsImageMaskEditing(
          { ...requestInput(), provider } as Parameters<
            typeof supportsImageMaskEditing
          >[0],
          true
        )
      ).toBe(false);
    }
  );
  it('rejects an otherwise supported primary when its existing fallback drops masks', () => {
    enableNativeEdit();
    process.env.OPENAI_COMPAT_IMAGE_TUZI_FALLBACK_MODE = 'all';
    process.env.TUZI_API_KEY = 'fictional-key';
    const input = {
      ...requestInput('gpt-image-2'),
      provider: 'openai' as const
    };
    expect(supportsImageMaskEditing(input, true)).toBe(true);
    expect(supportsImageMaskEditing(input)).toBe(false);
  });
  it('leaves maskless requests unchanged and rejects masks without a source', () => {
    enableNativeEdit();
    expect(
      getImageMaskEditFailure({ ...requestInput(), maskImageId: undefined })
    ).toBeNull();
    expect(
      getImageMaskEditFailure(
        { ...requestInput(), provider: 'openai', referenceImageIds: [] },
        true
      )
    ).toMatchObject({ errorCode: IMAGE_MASK_EDIT_UNSUPPORTED });
  });
  it.each([false, true])(
    'rejects async=%s before billing, queue insertion or provider fetch',
    async (async) => {
      process.env.TUZI_GPT_IMAGE_25_ENABLED = 'true';
      process.env.TUZI_API_KEY = 'fictional-key';
      const response = await handleImageGenerateRequest(
        new Request('https://app.test/api/image/generate', {
          method: 'POST',
          body: JSON.stringify({ ...body, async })
        })
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining('不支持选区编辑'),
        errorCode: IMAGE_MASK_EDIT_UNSUPPORTED,
        errorCategory: 'invalid_request',
        retryable: false
      });
      expect(createClient).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('rejects retry before creating another task', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(async () => ({
        data: { id: 'fictional-task', status: 'failed', request_payload: body },
        error: null
      }))
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const sb = { from: vi.fn(() => query), rpc: vi.fn() };
    const response = await handleRetryImageTaskRequest({
      sb: sb as never,
      userId: 'fictional-user',
      taskId: 'fictional-task',
      corsHeaders: {}
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errorCode: IMAGE_MASK_EDIT_UNSUPPORTED
    });
    expect(sb.from).toHaveBeenCalledTimes(1);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('publishes an explicit unsupported selection capability for current GPT 2.5 default routes', async () => {
    process.env.TUZI_GPT_IMAGE_25_ENABLED = 'true';
    process.env.TUZI_API_KEY = 'fictional-key';
    const response = await modelsHandler(
      new Request('https://app.test/api/image/models')
    );
    const result = await response.json();
    expect(
      result.models.find(
        (model: { id: string }) => model.id === 'gpt-image-2.5'
      )
    ).toMatchObject({ supportsMaskEditing: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
