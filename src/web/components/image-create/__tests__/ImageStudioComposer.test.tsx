import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import {
  defaultImagePromptSelection,
  defaultImagePromptSettings,
  type ImagePromptAsset,
  type ImagePromptSettings
} from '@/web/data/image-prompt-core';
import {
  ImageStudioComposer,
  type ImageStudioRecipeSlot
} from '../ImageStudioComposer';
import type { ReferenceUploadPreviewItem } from '../PromptCompilerPanel';

const asset: ImagePromptAsset = {
  id: 'character-editorial',
  slot: 'character',
  title: '编辑人像',
  subtitle: 'Editorial portrait',
  prompt: 'editorial portrait',
  tags: ['portrait'],
  visual: { tone: '#eee', accent: '#222', shape: 'portrait' }
};

const expressionAsset: ImagePromptAsset = {
  id: 'expression-soft-smile',
  slot: 'expression',
  title: '轻柔微笑',
  subtitle: 'Soft smile',
  prompt: 'soft smile',
  tags: ['portrait'],
  visual: { tone: '#ddd', accent: '#333', shape: 'portrait' }
};

const board = {
  id: 'board-one',
  name: 'Vibrant Surreal Pop',
  itemCount: 4,
  coverImageUrl: '/board.webp'
} as VisualMoodboard;

function renderComposer(
  overrides: Partial<{
    conditioningMode: 'none' | 'moodboard' | 'recipe';
    activeMoodboard: VisualMoodboard | null;
    prompt: string;
    promptPreviewActive: boolean;
    settings: ImagePromptSettings;
    recipeSlots: ImageStudioRecipeSlot[];
    assets: ImagePromptAsset[];
    recipeOpenSignal: number;
    withReference: boolean;
    referenceUploadItems: ReferenceUploadPreviewItem[];
    generationDisabled: boolean;
    firstCreationMode: boolean;
    isMember: boolean;
    membershipLoading: boolean;
  }> = {}
) {
  const callbacks = {
    onSelectMoodboard: vi.fn(),
    onClearMoodboard: vi.fn(),
    onRandomizeRecipe: vi.fn(),
    onRandomizeSlot: vi.fn(),
    onToggleRecipeAsset: vi.fn(),
    onRequestRecipeAssets: vi.fn(),
    onPrefetchRecipeAssets: vi.fn(),
    onClearRecipe: vi.fn(),
    onApplyRecipe: vi.fn(() => true),
    onPasteReferenceImages: vi.fn(),
    onGenerate: vi.fn(),
    onImageCountChange: vi.fn(),
    onSettingsChange: vi.fn(),
    onRequestMembership: vi.fn()
  };
  const result = render(
    <ImageStudioComposer
      prompt={overrides.prompt ?? '原始草稿'}
      promptPreviewActive={overrides.promptPreviewActive || false}
      onPromptChange={vi.fn()}
      settings={overrides.settings || defaultImagePromptSettings}
      onSettingsChange={callbacks.onSettingsChange}
      conditioningMode={overrides.conditioningMode || 'none'}
      boards={[board]}
      activeMoodboard={overrides.activeMoodboard ?? null}
      onSelectMoodboard={callbacks.onSelectMoodboard}
      onClearMoodboard={callbacks.onClearMoodboard}
      onCreateMoodboard={vi.fn()}
      recipeSlots={
        overrides.recipeSlots || [
          { id: 'character', label: '人物', group: '人物' }
        ]
      }
      assets={overrides.assets || [asset]}
      selection={defaultImagePromptSelection}
      recipeOpenSignal={overrides.recipeOpenSignal}
      onRandomizeRecipe={callbacks.onRandomizeRecipe}
      onRandomizeSlot={callbacks.onRandomizeSlot}
      onToggleRecipeAsset={callbacks.onToggleRecipeAsset}
      onRequestRecipeAssets={callbacks.onRequestRecipeAssets}
      onPrefetchRecipeAssets={callbacks.onPrefetchRecipeAssets}
      onClearRecipe={callbacks.onClearRecipe}
      onApplyRecipe={callbacks.onApplyRecipe}
      referenceUploadItems={overrides.referenceUploadItems || []}
      referenceMentions={
        overrides.withReference
          ? [
              {
                id: 'reference-one',
                token: 'image1',
                label: '图片 1',
                previewUrl: '/reference.webp',
                kind: 'image'
              }
            ]
          : []
      }
      selectedReferenceCount={overrides.withReference ? 1 : 0}
      selectedCharacterCount={0}
      onMentionReference={vi.fn()}
      onRemoveReference={vi.fn()}
      onOpenReferenceUpload={vi.fn()}
      onPasteReferenceImages={callbacks.onPasteReferenceImages}
      onOpenHistoryReferencePicker={vi.fn()}
      onOpenCharacterWorkflow={vi.fn()}
      autoOptimizePrompt={false}
      onAutoOptimizePromptChange={vi.fn()}
      promptLibrary={[]}
      onApplyPromptLibraryItem={vi.fn(() => true)}
      onSavePrompt={vi.fn()}
      onReset={vi.fn()}
      onImageCountChange={callbacks.onImageCountChange}
      isMember={overrides.isMember ?? false}
      membershipLoading={overrides.membershipLoading ?? false}
      onRequestMembership={callbacks.onRequestMembership}
      onGenerate={callbacks.onGenerate}
      generationDisabled={overrides.generationDisabled}
      firstCreationMode={overrides.firstCreationMode}
      estimatedCost={2}
      estimatedUnitCost={2}
    />
  );
  return { ...result, callbacks };
}

describe('ImageStudioComposer', () => {
  it('uploads pasted clipboard images without intercepting text-only paste', () => {
    const { callbacks } = renderComposer();
    const textarea = screen.getByRole('textbox', { name: '图像提示词' });
    const itemImage = new File(['image'], 'reference.png', {
      type: 'image/png',
      lastModified: 1
    });
    const fileImage = new File(['image'], 'reference.png', {
      type: 'image/png',
      lastModified: 2
    });
    const imagePaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', {
      value: {
        items: [
          { kind: 'file', type: 'image/png', getAsFile: () => itemImage }
        ],
        files: [fileImage]
      }
    });

    fireEvent(textarea, imagePaste);

    expect(imagePaste.defaultPrevented).toBe(true);
    expect(callbacks.onPasteReferenceImages).toHaveBeenCalledTimes(1);
    expect(callbacks.onPasteReferenceImages).toHaveBeenCalledWith([fileImage]);

    const textPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', {
      value: {
        items: [{ kind: 'string', type: 'text/plain' }],
        files: []
      }
    });
    fireEvent(textarea, textPaste);

    expect(textPaste.defaultPrevented).toBe(false);
    expect(callbacks.onPasteReferenceImages).toHaveBeenCalledTimes(1);
  });

  it('shows the total credit estimate merged into the generate button', () => {
    renderComposer();

    const generate = screen.getByRole('button', {
      name: '生成，预计每张消耗 2 积分'
    });
    const estimate = generate.querySelector(
      '.creation-generate-button-estimate'
    );
    expect(estimate).not.toBeNull();
    expect(estimate?.textContent).toContain('2 积分');
    expect(
      generate.querySelector('.creation-generate-button-surface')
    ).not.toBeNull();
    expect(generate).toBeEnabled();
  });

  it('offers every supported aspect ratio, including 16:9 and 3:2', () => {
    renderComposer();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '比例' }));
    const dialog = screen.getByRole('dialog', { name: '比例设置' });
    for (const ratio of [
      'Auto',
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9'
    ]) {
      expect(
        within(dialog).getByRole('button', { name: ratio })
      ).toBeInTheDocument();
    }
  });

  it('offers batch counts up to the model max, including 6/8/10', () => {
    renderComposer();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '生成张数' }));
    const dialog = screen.getByRole('dialog', { name: '生成张数设置' });
    for (const count of [1, 2, 4, 6, 8, 10]) {
      expect(
        within(dialog).getByRole('button', {
          name: `生成 ${count} 张${count >= 4 ? '（会员专属）' : ''}`
        })
      ).toBeInTheDocument();
    }
  });

  it('marks 4+ count options as member-only and routes free users to the upgrade prompt', () => {
    const { callbacks } = renderComposer();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '生成张数' }));
    const dialog = screen.getByRole('dialog', { name: '生成张数设置' });
    const fourImages = within(dialog).getByRole('button', {
      name: '生成 4 张（会员专属）'
    });
    expect(within(fourImages).getByText('会员')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: '生成 1 张' })
    ).not.toHaveTextContent('会员');

    fireEvent.click(fourImages);
    expect(callbacks.onRequestMembership).toHaveBeenCalledWith(
      'image_batch_count'
    );
    expect(callbacks.onImageCountChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: '生成张数设置' })
    ).toBeInTheDocument();
  });

  it('lets members select 4+ image counts without an upgrade prompt', () => {
    const { callbacks } = renderComposer({ isMember: true });

    fireEvent.mouseEnter(screen.getByRole('button', { name: '生成张数' }));
    const dialog = screen.getByRole('dialog', { name: '生成张数设置' });
    const fourImages = within(dialog).getByRole('button', {
      name: '生成 4 张（会员专属）'
    });
    expect(within(fourImages).getByText('会员')).toBeInTheDocument();

    fireEvent.click(fourImages);
    expect(callbacks.onImageCountChange).toHaveBeenCalledWith(4);
    expect(callbacks.onRequestMembership).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: '生成张数设置' })
    ).not.toBeInTheDocument();
  });

  it('shows 2K as the default selected resolution for new sessions', () => {
    renderComposer({
      settings: {
        ...defaultImagePromptSettings,
        aspectRatio: '1:1',
        imageSize: '2048x2048'
      }
    });
    expect(screen.getByRole('button', { name: '分辨率' })).toHaveTextContent(
      '2K'
    );
  });

  it('keeps resolution editable while ratio is Auto (picks 1:1 when selected)', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: '比例' })).toHaveTextContent(
      'Auto'
    );
    const resolutionTrigger = screen.getByRole('button', { name: '分辨率' });
    expect(resolutionTrigger).toHaveTextContent('自动');
    expect(resolutionTrigger).toBeEnabled();
  });

  it('selecting Auto ratio resets imageSize to auto', () => {
    const currentSettings: ImagePromptSettings = {
      ...defaultImagePromptSettings,
      aspectRatio: '9:16',
      imageSize: '2160x3840'
    };
    const { callbacks } = renderComposer({ settings: currentSettings });

    fireEvent.mouseEnter(screen.getByRole('button', { name: '比例' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '比例设置' })).getByRole(
        'button',
        { name: 'Auto' }
      )
    );

    const ratioUpdate = callbacks.onSettingsChange.mock.calls[0]?.[0] as (
      current: ImagePromptSettings
    ) => ImagePromptSettings;
    expect(ratioUpdate(currentSettings)).toMatchObject({
      aspectRatio: 'auto',
      imageSize: 'auto'
    });
  });

  it('switching from Auto to a concrete ratio defaults to 2K resolution', () => {
    const { callbacks } = renderComposer(); // default: aspectRatio auto, imageSize auto

    fireEvent.mouseEnter(screen.getByRole('button', { name: '比例' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '比例设置' })).getByRole(
        'button',
        { name: '3:4' }
      )
    );

    const ratioUpdate = callbacks.onSettingsChange.mock.calls[0]?.[0] as (
      current: ImagePromptSettings
    ) => ImagePromptSettings;
    expect(
      ratioUpdate({
        ...defaultImagePromptSettings,
        aspectRatio: 'auto',
        imageSize: 'auto'
      })
    ).toMatchObject({
      aspectRatio: '3:4',
      imageSize: '1536x2048'
    });
  });

  it('blocks generation while no runtime model is selectable', () => {
    const { callbacks } = renderComposer({ generationDisabled: true });
    const generate = screen.getByRole('button', {
      name: '生成，预计每张消耗 2 积分'
    });

    expect(generate).toBeDisabled();
    fireEvent.click(generate);
    expect(callbacks.onGenerate).not.toHaveBeenCalled();
  });

  it('makes the first-value CTA and free-plan boundary visible in context', () => {
    renderComposer({ firstCreationMode: true });

    expect(screen.getByText('生成第一张')).toBeVisible();
    const generate = screen.getByRole('button', {
      name: '生成，预计每张消耗 2 积分'
    });
    expect(
      generate.querySelector('.creation-generate-button-estimate')
    ).toHaveTextContent('2 积分');
    expect(
      screen.getByText('免费版每日 100 积分 · 最多生成 1 次')
    ).toBeVisible();
  });

  it('shows selected references above the prompt with mention and remove actions', () => {
    renderComposer({ withReference: true });

    expect(screen.getByLabelText('已引用的参考图')).toBeInTheDocument();
    expect(screen.getByAltText('图片 1')).toHaveAttribute(
      'src',
      '/reference.webp'
    );
    expect(screen.getByRole('button', { name: '@图片 1' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '取消图片 1' })
    ).toBeInTheDocument();
  });

  it('shows upload skeletons above the prompt while reference images upload', () => {
    renderComposer({
      referenceUploadItems: [
        {
          clientId: 'upload-one',
          fileName: 'portrait.png',
          previewUrl: 'blob:portrait',
          status: 'uploading'
        },
        {
          clientId: 'upload-two',
          fileName: 'product.png',
          previewUrl: 'blob:product',
          status: 'uploading'
        }
      ]
    });

    expect(screen.getByLabelText('已引用的参考图')).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: '参考图 1 上传中' })
    ).toBeVisible();
    expect(
      screen.getByRole('status', { name: '参考图 2 上传中' })
    ).toBeVisible();
  });

  it('keeps only one hover popover open and closes it with Escape', () => {
    renderComposer();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '模型' }));
    expect(
      screen.getByRole('dialog', { name: '模型设置' })
    ).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));
    expect(
      screen.queryByRole('dialog', { name: '模型设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '可视化配方设置' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects a moodboard from the list and exposes its active state', () => {
    const { callbacks } = renderComposer({
      conditioningMode: 'moodboard',
      activeMoodboard: board
    });
    const trigger = screen.getByRole('button', { name: '情绪板' });
    expect(trigger).toHaveAttribute('data-active', 'true');
    expect(trigger.querySelector('img')).toHaveAttribute('src', '/board.webp');
    expect(trigger).toHaveTextContent('Vibrant Surreal Pop');

    fireEvent.mouseEnter(trigger);
    fireEvent.click(
      screen.getByRole('button', { name: /Vibrant Surreal Pop/ })
    );
    expect(callbacks.onSelectMoodboard).toHaveBeenCalledWith(board);
  });

  it('supports whole-recipe randomization, category randomization and asset selection', () => {
    const { callbacks } = renderComposer({ conditioningMode: 'recipe' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));

    expect(callbacks.onRequestRecipeAssets).toHaveBeenCalledWith('character');

    fireEvent.click(screen.getByRole('button', { name: /随机整套配方/ }));
    fireEvent.click(screen.getByRole('button', { name: /随机该类别/ }));
    fireEvent.click(screen.getByRole('button', { name: /编辑人像/ }));

    expect(callbacks.onRandomizeRecipe).toHaveBeenCalledOnce();
    expect(callbacks.onRandomizeSlot).toHaveBeenCalledWith('character');
    expect(callbacks.onToggleRecipeAsset).toHaveBeenCalledWith(asset);
  });

  it('keeps recipe changes as a draft and confirms before replacing an existing prompt', () => {
    const { callbacks } = renderComposer({ prompt: '用户已有提示词' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));

    fireEvent.click(screen.getByRole('button', { name: '应用配方' }));

    expect(callbacks.onApplyRecipe).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '应用配方会替换现有提示词'
    );

    fireEvent.click(screen.getByRole('button', { name: '确认替换' }));
    expect(callbacks.onApplyRecipe).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('dialog', { name: '可视化配方设置' })
    ).not.toBeInTheDocument();
  });

  it('applies a recipe directly when the prompt input is empty', () => {
    const { callbacks } = renderComposer({ prompt: '' });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));

    fireEvent.click(screen.getByRole('button', { name: '应用配方' }));

    expect(callbacks.onApplyRecipe).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens the latest visual recipe popover from an external route signal', () => {
    const { callbacks } = renderComposer({ recipeOpenSignal: 1 });

    expect(
      screen.getByRole('dialog', { name: '可视化配方设置' })
    ).toBeInTheDocument();
    expect(callbacks.onRequestRecipeAssets).toHaveBeenCalledWith('character');
  });

  it('prioritizes the visible recipe rows without eagerly loading the full category', () => {
    const thumbnailAssets = Array.from({ length: 12 }, (_, index) => ({
      ...asset,
      id: `character-priority-${index}`,
      title: `人物 ${index + 1}`,
      thumbnailUrl: `https://example.supabase.co/storage/v1/object/public/studio-assets/character-${index}.webp?v=test`
    }));
    renderComposer({
      conditioningMode: 'recipe',
      assets: thumbnailAssets
    });

    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        '.image-studio-recipe-asset-grid img'
      )
    );

    expect(images).toHaveLength(12);
    expect(
      images
        .slice(0, 3)
        .every((image) => image.getAttribute('fetchpriority') === 'high')
    ).toBe(true);
    expect(
      images
        .slice(0, 9)
        .every((image) => image.getAttribute('loading') === 'eager')
    ).toBe(true);
    expect(
      images.slice(9).every((image) => image.getAttribute('loading') === 'lazy')
    ).toBe(true);
    expect(
      images
        .slice(3)
        .every((image) => image.getAttribute('fetchpriority') === 'auto')
    ).toBe(true);
    expect(images[0]).toHaveAttribute(
      'src',
      'https://example.supabase.co/storage/v1/render/image/public/studio-assets/character-0.webp?v=test&width=320&quality=72&resize=contain&format=webp'
    );
  });

  it('keeps mobile conditioning tools reachable from the more panel', () => {
    renderComposer();
    fireEvent.mouseEnter(screen.getByRole('button', { name: '更多' }));

    const morePanel = screen.getByRole('dialog', { name: '更多设置' });
    fireEvent.click(within(morePanel).getByRole('button', { name: '情绪板' }));

    expect(
      screen.getByRole('dialog', { name: '情绪板设置' })
    ).toBeInTheDocument();
  });

  it('reveals resolution and image count options from matching toolbar controls', () => {
    const currentSettings: ImagePromptSettings = {
      ...defaultImagePromptSettings,
      aspectRatio: '9:16',
      imageSize: '1152x2048',
      imageCount: 1
    };
    const { callbacks } = renderComposer({ settings: currentSettings });
    const resolutionTrigger = screen.getByRole('button', { name: '分辨率' });
    const countTrigger = screen.getByRole('button', { name: '生成张数' });

    expect(resolutionTrigger).toHaveTextContent('2K');
    expect(countTrigger).toHaveTextContent('1张');
    expect(
      screen.queryByRole('group', { name: '输出设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: '分辨率设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: '生成张数设置' })
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(resolutionTrigger);
    const resolutionPanel = screen.getByRole('dialog', {
      name: '分辨率设置'
    });
    fireEvent.click(
      within(resolutionPanel).getByRole('button', { name: '分辨率 4K' })
    );
    const resolutionUpdate = callbacks.onSettingsChange.mock.calls[0]?.[0] as (
      current: ImagePromptSettings
    ) => ImagePromptSettings;
    expect(resolutionUpdate(currentSettings)).toMatchObject({
      aspectRatio: '9:16',
      imageSize: '2160x3840'
    });
    expect(
      screen.queryByRole('dialog', { name: '分辨率设置' })
    ).not.toBeInTheDocument();

    fireEvent.click(countTrigger);
    const countPanel = screen.getByRole('dialog', {
      name: '生成张数设置'
    });
    fireEvent.click(
      within(countPanel).getByRole('button', { name: '生成 2 张' })
    );
    expect(callbacks.onImageCountChange).toHaveBeenCalledWith(2);

    fireEvent.mouseEnter(resolutionTrigger);
    expect(
      screen.getByRole('dialog', { name: '分辨率设置' })
    ).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole('button', { name: '比例' }));
    expect(
      screen.queryByRole('dialog', { name: '分辨率设置' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: '比例设置' })
    ).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '更多' }));
    const morePanel = screen.getByRole('dialog', { name: '更多设置' });
    expect(
      within(morePanel).queryByRole('group', { name: '分辨率' })
    ).not.toBeInTheDocument();
    expect(
      within(morePanel).queryByRole('group', { name: '生成张数' })
    ).not.toBeInTheDocument();
  });

  it('preserves the selected resolution when the aspect ratio changes', () => {
    const currentSettings: ImagePromptSettings = {
      ...defaultImagePromptSettings,
      aspectRatio: '9:16',
      imageSize: '2160x3840'
    };
    const { callbacks } = renderComposer({ settings: currentSettings });

    fireEvent.mouseEnter(screen.getByRole('button', { name: '比例' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '比例设置' })).getByRole(
        'button',
        { name: '1:1' }
      )
    );

    const ratioUpdate = callbacks.onSettingsChange.mock.calls[0]?.[0] as (
      current: ImagePromptSettings
    ) => ImagePromptSettings;
    expect(ratioUpdate(currentSettings)).toMatchObject({
      aspectRatio: '1:1',
      imageSize: '2880x2880'
    });
  });

  it('does not switch recipe categories merely because scrolling moves one under the pointer', () => {
    const { callbacks } = renderComposer({
      conditioningMode: 'recipe',
      recipeSlots: [
        { id: 'character', label: '人设', group: '人物' },
        { id: 'expression', label: '表情', group: '人物' }
      ],
      assets: [asset, expressionAsset]
    });
    fireEvent.mouseEnter(screen.getByRole('button', { name: '可视化配方' }));
    const expressionSlot = screen.getByRole('button', { name: /表情.*未选择/ });

    fireEvent.mouseEnter(expressionSlot);
    expect(
      screen.queryByRole('button', { name: /轻柔微笑/ })
    ).not.toBeInTheDocument();

    fireEvent.pointerEnter(expressionSlot, { pointerType: 'mouse' });
    expect(callbacks.onPrefetchRecipeAssets).toHaveBeenCalledWith('expression');
    expect(callbacks.onRequestRecipeAssets).not.toHaveBeenCalledWith(
      'expression'
    );

    fireEvent.click(expressionSlot);
    expect(callbacks.onRequestRecipeAssets).toHaveBeenCalledWith('expression');
    expect(
      screen.getByRole('button', { name: /轻柔微笑/ })
    ).toBeInTheDocument();
  });

  it('keeps the primary CTA action-oriented instead of exposing auth state', () => {
    const { container } = renderComposer();

    const generateButton = screen.getByRole('button', {
      name: '生成，预计每张消耗 2 积分'
    });
    expect(generateButton).toBeEnabled();
    expect(
      container.querySelector(
        '.image-studio-generate-surface path[d^="M7.45284"]'
      )
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '.image-studio-generate-surface path[d^="M16.9245"]'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('登录后生成')).not.toBeInTheDocument();
  });

  it('caps long prompts at three times the default height while keeping the text editable and selectable', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'scrollHeight'
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.value.length > 40 ? 260 : 58;
      }
    });

    try {
      renderComposer({ prompt: '一段足够长的提示词'.repeat(20) });
      const textarea = screen.getByRole('textbox', { name: '图像提示词' });
      expect(textarea).toHaveStyle({ height: '174px', overflowY: 'auto' });

      textarea.focus();
      (textarea as HTMLTextAreaElement).setSelectionRange(0, 8);
      fireEvent.select(textarea);
      expect((textarea as HTMLTextAreaElement).selectionStart).toBe(0);
      expect((textarea as HTMLTextAreaElement).selectionEnd).toBe(8);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          'scrollHeight',
          originalDescriptor
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it('keeps the composer height fixed for hover previews and grows after commit', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'scrollHeight'
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.value.length > 40 ? 260 : 58;
      }
    });

    try {
      const longPrompt = '公开案例的长提示词'.repeat(20);
      const preview = renderComposer({
        prompt: longPrompt,
        promptPreviewActive: true
      });
      expect(
        screen.getByRole('textbox', { name: '图像提示词' })
      ).not.toHaveStyle({ height: '174px' });

      preview.unmount();
      renderComposer({ prompt: longPrompt, promptPreviewActive: false });
      expect(screen.getByRole('textbox', { name: '图像提示词' })).toHaveStyle({
        height: '174px'
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(
          HTMLTextAreaElement.prototype,
          'scrollHeight',
          originalDescriptor
        );
      } else {
        delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
          .scrollHeight;
      }
    }
  });

  it('shows immediate processing feedback after generate is clicked', () => {
    vi.useFakeTimers();
    try {
      const { callbacks } = renderComposer();
      fireEvent.click(
        screen.getByRole('button', { name: '生成，预计每张消耗 2 积分' })
      );

      expect(callbacks.onGenerate).toHaveBeenCalledOnce();
      expect(
        screen.getByRole('button', { name: '正在处理生成请求' })
      ).toHaveAttribute('aria-busy', 'true');

      act(() => vi.advanceTimersByTime(720));
      expect(
        screen.getByRole('button', { name: '生成，预计每张消耗 2 积分' })
      ).toHaveAttribute('aria-busy', 'false');
    } finally {
      vi.useRealTimers();
    }
  });
});
