import { describe, expect, it, vi } from 'vitest';
import { defaultImagePromptSettings } from '../../data/image-prompt-core';
import {
  buildPromptCaseRouteImportPayload,
  derivePromptCaseRouteImport,
  getImageGenerateGateDecision,
  resolvePromptCaseRouteImport
} from '../image-create-route-import';

describe('ImageCreatePage route import and generation gates', () => {
  it('blocks generation for insufficient credits before calling the generator', () => {
    expect(
      getImageGenerateGateDecision({
        hasApiAuth: true,
        imageCount: 1,
        isMember: false,
        insufficientCredits: true
      })
    ).toBe('insufficient_credits');
  });

  it('keeps membership batch gating ahead of the credit gate', () => {
    expect(
      getImageGenerateGateDecision({
        hasApiAuth: true,
        imageCount: 4,
        isMember: false,
        insufficientCredits: true
      })
    ).toBe('membership_required');
  });

  it('initializes imageCount once when importing an old prompt case', () => {
    const routeImport = derivePromptCaseRouteImport(
      defaultImagePromptSettings,
      {
        prompt: 'create 4 images for a launch campaign'
      }
    );

    expect(routeImport.settings.imageCount).toBe(4);
  });

  it('keeps route image size when importing a prompt case with reference images', () => {
    const routeImport = derivePromptCaseRouteImport(
      defaultImagePromptSettings,
      {
        prompt: 'generate one character reference image',
        imageSize: '2160x3840',
        aspectRatio: '9:16'
      }
    );

    expect(routeImport.settings.imageSize).toBe('2160x3840');
    expect(routeImport.settings.aspectRatio).toBe('9:16');
  });

  it('builds a complete prompt case import payload from a case id lookup result', () => {
    const payload = buildPromptCaseRouteImportPayload(
      {
        id: 'case-1',
        slug: 'case-one',
        title: 'Beach campaign',
        imageUrl: 'https://example.com/case.webp',
        prompt: 'fallback prompt',
        promptZh: '完整中文提示词',
        promptEn: 'complete English prompt',
        model: 'gpt-image-2',
        visualRecipe: {
          selection: {
            character: ['character-idol-trainee'],
            pose: ['pose-mirror-selfie']
          }
        }
      },
      'zh-CN',
      'prompt_preview_cta'
    );

    expect(payload).toEqual(
      expect.objectContaining({
        prompt: '完整中文提示词',
        promptSource: 'full',
        model: 'gpt-image-2',
        remixSource: {
          id: 'case-1',
          title: 'Beach campaign',
          slug: 'case-one',
          source: 'prompt_preview_cta'
        },
        visualRecipeSelection: expect.objectContaining({
          character: 'character-idol-trainee',
          pose: 'pose-mirror-selfie'
        })
      })
    );
  });

  it('falls back to the public prompt preview for locked prompt cases', () => {
    const payload = buildPromptCaseRouteImportPayload(
      {
        id: 'locked-case',
        title: 'Locked beach case',
        imageUrl: 'https://example.com/locked.webp',
        prompt: '',
        promptPreview: '公开预览提示词',
        promptLocked: true,
        model: 'gpt-image-2',
        visualRecipe: {
          selection: {
            character: ['character-idol-trainee']
          }
        }
      },
      'zh-CN',
      'prompt_preview_cta'
    );

    expect(payload).toEqual(
      expect.objectContaining({
        prompt: '公开预览提示词',
        promptSource: 'preview',
        model: 'gpt-image-2',
        visualRecipeSelection: expect.objectContaining({
          character: 'character-idol-trainee'
        })
      })
    );
  });

  it('resolves prompt case route imports with a locale fallback', async () => {
    const getCase = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'case-1',
      slug: 'case-one',
      title: 'Fallback case',
      imageUrl: 'https://example.com/case.webp',
      prompt: 'fallback full prompt',
      model: 'gpt-image-2'
    });

    const result = await resolvePromptCaseRouteImport({
      lookup: 'case-one',
      lookupMode: 'slug',
      locale: 'zh-CN',
      source: 'prompt_preview_cta',
      getCase
    });

    expect(getCase).toHaveBeenNthCalledWith(1, 'case-one', {
      by: 'slug',
      locale: 'zh-CN'
    });
    expect(getCase).toHaveBeenNthCalledWith(2, 'case-one', {
      by: 'slug'
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ready',
        payload: expect.objectContaining({
          prompt: 'fallback full prompt',
          promptSource: 'full',
          remixSource: expect.objectContaining({
            slug: 'case-one',
            source: 'prompt_preview_cta'
          })
        })
      })
    );
  });

  it('returns empty when a route case has neither prompt nor visual recipe', async () => {
    const getCase = vi.fn().mockResolvedValue({
      id: 'empty-case',
      title: 'Empty case',
      imageUrl: 'https://example.com/empty.webp',
      prompt: ''
    });

    await expect(
      resolvePromptCaseRouteImport({
        lookup: 'empty-case',
        lookupMode: 'id',
        locale: 'zh-CN',
        source: 'prompt_preview_cta',
        getCase
      })
    ).resolves.toEqual({ status: 'empty' });
  });
});
