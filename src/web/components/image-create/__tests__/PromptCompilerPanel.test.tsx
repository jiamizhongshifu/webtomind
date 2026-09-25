import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState, type ComponentProps } from 'react';
import {
  defaultImagePromptSettings
} from '../../../data/image-prompt-core';
import { imagePromptAssetCatalog as imagePromptAssets } from '../../../data/image-prompt-asset-catalog';
import { modelOptions } from '../../../data/image-creator-options';
import { PromptCompilerPanel } from '../PromptCompilerPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options?.defaultValue) return options.defaultValue;
      const messages: Record<string, string> = {
        'controls.savePreset': 'Save preset',
        'controls.reset': 'Reset',
        'controls.copyPrompt': 'Copy prompt',
        'controls.copied': 'Copied',
        'controls.expandPrompt': 'Expand prompt',
        'controls.minimizePrompt': 'Minimize prompt',
        'controls.generate': 'Generate image',
        'controls.title': 'Settings',
        'controls.subtitle': 'Generation settings',
        'controls.loginToGenerate': 'Sign in to generate',
        'controls.estimatedCostShort': `${options?.credits ?? 0} credits`,
        'controls.estimatedCostTooltip':
          'Final charge is settled by the backend; failed generations refund automatically.',
        'controls.model': 'AI model',
        'controls.aspect': 'Aspect',
        'controls.resolution': 'Resolution',
        'controls.model.label': 'AI model',
        'controls.size.label': 'Size',
        'controls.quality.label': 'Quality',
        'controls.outputFormat.label': 'Format',
        'controls.imageCount.label': 'Images',
        'controls.imageCount.memberHint':
          '4+ images are available for members.',
        'controls.customPrompt.label': 'Extra description',
        'controls.customNegativePrompt.label': 'Negative prompt',
        'controls.customNegativePrompt.placeholder': 'Avoid',
        'controls.characterWorkflow.entry': 'Character workflow',
        'controls.characterWorkflow.entryDetail': 'References',
        'controls.characterWorkflow.entryShort': 'Character',
        'promptLibrary.entry': 'Prompt library',
        'prompt.tasks.open': 'Open AI tasks',
        'prompt.tasks.label': 'AI tasks',
        'prompt.inputTitle': 'Prompt',
        'prompt.combinationSuggestion.label': 'Updated combination prompt',
        'prompt.combinationSuggestion.title': 'Your combination changed',
        'prompt.combinationSuggestion.description':
          'Replace the prompt with the latest combination?',
        'prompt.combinationSuggestion.apply': 'Apply combination prompt',
        'prompt.combinationSuggestion.dismiss': 'Not now',
        'prompt.random': 'Random idea',
        'prompt.autoOptimize.label': 'Auto optimize',
        'prompt.customPlaceholder':
          'Write your own prompt here to override the auto-compiled version.',
        'prompt.empty': 'Prompt is generated from selected assets.',
        'prompt.autoHint':
          'Prompt is generated from selected assets; switch to Custom to edit manually',
        'prompt.customHint': 'Custom prompt mode',
        'prompt.referencePlaceholder': 'Write a prompt. Type @ to reference.',
        'prompt.references.activeLabel': 'Referenced materials',
        'prompt.negativePrompt': 'Negative prompt',
        'prompt.noNegativePrompt': 'No negative prompt',
        'prompt.diagnostics.button': 'Structure check',
        'prompt.diagnostics.close': 'Close structure check',
        'prompt.diagnostics.status.excellent': 'Excellent',
        'prompt.diagnostics.status.good': 'Good',
        'prompt.diagnostics.status.needsWork': 'Needs work',
        'prompt.optimize.button': 'Improve prompt',
        'prompt.optimize.error': 'Prompt improvement failed',
        'prompt.optimize.resultTitle': 'Improved prompt',
        'prompt.optimize.copy': 'Copy improved prompt',
        'prompt.optimize.copied': 'Copied',
        'prompt.optimize.apply': 'Apply',
        'references.title': 'References',
        'references.optional': 'Optional',
        'references.character.entry': 'Character',
        'references.gallery.entry': 'Gallery',
        'references.upload.entry': 'Upload',
        'references.upload.previewLabel': 'Uploaded references',
        'references.upload.previewLimit': 'Up to 4 images',
        'references.upload.previewSummary': `Ready ${options?.uploaded ?? 0} · Uploading ${options?.uploading ?? 0} · Failed ${options?.failed ?? 0}`,
        'references.upload.remove': 'Remove this reference image',
        'references.upload.status.uploading': 'Uploading',
        'references.upload.status.uploaded': 'Ready',
        'references.upload.status.failed': 'Failed',
        'upload.button': 'Image reverse',
        'upload.processingShort': 'Processing'
      };
      return messages[key] || key;
    }
  })
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
});

function renderPanel({
  compiled = {
    prompt: 'Sample composed prompt',
    negativePrompt: '',
    selectedAssets: [],
    warnings: []
  },
  settings = defaultImagePromptSettings,
  imageCount = 1,
  onAutoOptimizePromptChange = vi.fn(),
  onOpenCharacterWorkflow = vi.fn(),
  onOpenHistoryReferencePicker = vi.fn(),
  onOpenReferenceUpload = vi.fn(),
  onRandomPrompt = vi.fn(),
  selectedCharacterCount = 0,
  selectedGalleryReferenceCount = 0,
  referenceUploadItems = [],
  onRemoveReferenceUpload = vi.fn(),
  isMember = false,
  onRequestMembership = vi.fn(),
  onImageCountChange = vi.fn(),
  referenceMentions = [],
  customPromptText = '',
  onCustomPromptChange = vi.fn(),
  statefulPrompt = false,
  generationError = '',
  generationStatusText = ''
}: {
  compiled?: ComponentProps<typeof PromptCompilerPanel>['compiled'];
  settings?: typeof defaultImagePromptSettings;
  imageCount?: number;
  onAutoOptimizePromptChange?: (enabled: boolean) => void;
  onOpenCharacterWorkflow?: () => void;
  onOpenHistoryReferencePicker?: () => void;
  onOpenReferenceUpload?: () => void;
  onRandomPrompt?: () => void;
  selectedCharacterCount?: number;
  selectedGalleryReferenceCount?: number;
  referenceUploadItems?: ComponentProps<
    typeof PromptCompilerPanel
  >['referenceUploadItems'];
  onRemoveReferenceUpload?: (clientId: string) => void;
  isMember?: boolean;
  onRequestMembership?: (source: string) => void;
  onImageCountChange?: (count: number) => void;
  referenceMentions?: ComponentProps<
    typeof PromptCompilerPanel
  >['referenceMentions'];
  customPromptText?: string;
  onCustomPromptChange?: (value: string) => void;
  statefulPrompt?: boolean;
  generationError?: string;
  generationStatusText?: string;
} = {}) {
  function PanelUnderTest() {
    const [promptText, setPromptText] = useState(customPromptText);
    const handleCustomPromptChange = (value: string) => {
      onCustomPromptChange(value);
      if (statefulPrompt) {
        setPromptText(value);
      }
    };

    return (
      <PromptCompilerPanel
        compiled={compiled}
        copied={false}
        onCopyPrompt={vi.fn()}
        autoOptimizePrompt={false}
        autoOptimizePending={false}
        onAutoOptimizePromptChange={onAutoOptimizePromptChange}
        customPromptText={statefulPrompt ? promptText : customPromptText}
        customNegativePromptText=""
        onCustomPromptChange={handleCustomPromptChange}
        onCustomNegativePromptChange={vi.fn()}
        isPromptExpanded={false}
        onToggleExpand={vi.fn()}
        isAuthenticated
        settings={settings}
        onSettingsChange={vi.fn()}
        imageCount={imageCount}
        onImageCountChange={onImageCountChange}
        estimatedCost={100}
        insufficientCredits={false}
        onGenerate={vi.fn()}
        uploadStage="idle"
        uploadError=""
        generationError={generationError}
        generationStatusText={generationStatusText}
        onOpenReverseUpload={vi.fn()}
        onOpenReferenceUpload={onOpenReferenceUpload}
        referenceUploadItems={referenceUploadItems}
        referenceMentions={referenceMentions}
        onRemoveReferenceUpload={onRemoveReferenceUpload}
        selectedCharacterCount={selectedCharacterCount}
        selectedGalleryReferenceCount={selectedGalleryReferenceCount}
        onOpenCharacterWorkflow={onOpenCharacterWorkflow}
        onOpenHistoryReferencePicker={onOpenHistoryReferencePicker}
        onRandomPrompt={onRandomPrompt}
        showReverseImport={false}
        reverseImporting={false}
        reverseImportDisabled={false}
        reverseImported={false}
        onImportReverseSession={vi.fn()}
        presetSaved={false}
        onSavePreset={vi.fn()}
        onReset={vi.fn()}
        presets={[]}
        promptLibrary={[]}
        progressTasks={[]}
        progressTaskCount={0}
        isMember={isMember}
        onRequestMembership={onRequestMembership}
        onApplyPreset={vi.fn()}
        onDeletePreset={vi.fn()}
        onApplyPromptLibraryItem={vi.fn()}
        onRenamePromptLibraryItem={vi.fn()}
        onDeletePromptLibraryItem={vi.fn()}
        onCopyPromptLibraryItem={vi.fn()}
        dateLocale="en-US"
        promptLocale="en-US"
      />
    );
  }

  return render(<PanelUnderTest />);
}

describe('PromptCompilerPanel', () => {
  it('keeps bill details on the generate button without a separate help button', () => {
    renderPanel();

    expect(
      screen.queryByRole('button', { name: 'View bill details' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate image/ })
    ).toHaveAttribute(
      'title',
      expect.stringContaining('Final charge is settled by the backend')
    );
  });

  it('shows generation failures beside the generate controls', () => {
    renderPanel({ generationError: '参考图不存在或无权访问' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '参考图不存在或无权访问'
    );
  });

  it('renders core generation settings as accessible shadcn selects', () => {
    renderPanel();

    const defaultModel = modelOptions.find(
      (model) => model.value === defaultImagePromptSettings.model
    );

    expect(screen.getByRole('combobox', { name: 'AI model' })).toHaveTextContent(
      defaultModel?.label ?? ''
    );
    expect(screen.getByRole('combobox', { name: 'Aspect' })).toHaveTextContent(
      'Auto'
    );
    expect(
      screen.getByRole('combobox', { name: 'Resolution' })
    ).toHaveTextContent('1K');
  });

  it('does not show the member-unlocked batch generation hint', () => {
    renderPanel({ isMember: true });

    expect(
      screen.queryByText('Batch generation is unlocked.')
    ).not.toBeInTheDocument();
  });

  it('renders image count select options from the selected model capability', () => {
    const gptImage25 = modelOptions.find(
      (model) => model.value === 'gpt-image-2.5'
    );
    expect(gptImage25).toBeDefined();
    if (!gptImage25) return;

    const originalMax = gptImage25.maxImageCount;
    try {
      gptImage25.maxImageCount = 2;

      renderPanel({ imageCount: 4 });

      fireEvent.click(screen.getByRole('combobox', { name: 'Images' }));
      const choices = screen.getAllByRole('option');
      expect(choices.map((choice) => choice.textContent)).toEqual(['1', '2']);
    } finally {
      gptImage25.maxImageCount = originalMax;
    }
  });

  it('requires membership for selecting 4 or more images', () => {
    const onImageCountChange = vi.fn();
    const onRequestMembership = vi.fn();

    renderPanel({
      imageCount: 2,
      isMember: false,
      onImageCountChange,
      onRequestMembership
    });

    fireEvent.click(screen.getByRole('combobox', { name: 'Images' }));
    fireEvent.click(screen.getByRole('option', { name: /4/ }));

    expect(onImageCountChange).not.toHaveBeenCalled();
    expect(onRequestMembership).toHaveBeenCalledWith('image_batch_count');
  });

  it('lets members select extended batch image counts', () => {
    const onImageCountChange = vi.fn();

    renderPanel({
      imageCount: 2,
      isMember: true,
      onImageCountChange
    });

    fireEvent.click(screen.getByRole('combobox', { name: 'Images' }));
    fireEvent.click(screen.getByRole('option', { name: /10/ }));

    expect(onImageCountChange).toHaveBeenCalledWith(10);
  });

  it('inserts a reference mention from the prompt menu', () => {
    const onCustomPromptChange = vi.fn();

    renderPanel({
      customPromptText: '',
      statefulPrompt: true,
      onCustomPromptChange,
      referenceMentions: [
        {
          id: 'ref-1',
          token: 'image1',
          label: 'Image 1',
          detail: 'first.png',
          kind: 'image'
        }
      ]
    });

    const editor = screen.getByLabelText(
      'Write your own prompt here to override the auto-compiled version.'
    ) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: { value: '@', selectionStart: 1, selectionEnd: 1 }
    });
    fireEvent.keyUp(editor);
    fireEvent.click(screen.getByRole('option', { name: /Image 1/ }));

    expect(onCustomPromptChange).toHaveBeenLastCalledWith('@image1 ');
  });

  it('routes reference and prompt helper controls to their callbacks', () => {
    const onAutoOptimizePromptChange = vi.fn();
    const onOpenCharacterWorkflow = vi.fn();
    const onOpenHistoryReferencePicker = vi.fn();
    const onOpenReferenceUpload = vi.fn();
    const onRandomPrompt = vi.fn();

    renderPanel({
      onAutoOptimizePromptChange,
      onOpenCharacterWorkflow,
      onOpenHistoryReferencePicker,
      onOpenReferenceUpload,
      onRandomPrompt
    });

    fireEvent.click(screen.getByRole('button', { name: 'References' }));
    fireEvent.click(screen.getByRole('button', { name: 'Character' }));
    expect(
      screen.getByRole('dialog', { name: 'References' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));
    expect(
      screen.getByRole('dialog', { name: 'References' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Random idea' }));
    fireEvent.click(screen.getByLabelText('Auto optimize'));

    expect(onOpenCharacterWorkflow).toHaveBeenCalledTimes(1);
    expect(onOpenHistoryReferencePicker).toHaveBeenCalledTimes(1);
    expect(onOpenReferenceUpload).toHaveBeenCalledTimes(1);
    expect(onRandomPrompt).toHaveBeenCalledTimes(1);
    expect(onAutoOptimizePromptChange).toHaveBeenCalledWith(true);
  });

  it('offers to replace a stale prompt after the current combination changes', () => {
    const onCustomPromptChange = vi.fn();
    renderPanel({
      compiled: {
        prompt: 'Latest combination prompt',
        negativePrompt: '',
        selectedAssets: [imagePromptAssets[0]],
        warnings: []
      },
      customPromptText: 'Older prompt',
      onCustomPromptChange
    });

    expect(
      screen.getByLabelText('Updated combination prompt')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply combination prompt' })
    );

    expect(onCustomPromptChange).toHaveBeenCalledWith(
      'Latest combination prompt'
    );
  });

  it('uses shared overlay behavior for the prompt library modal', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Prompt library' }));

    expect(
      screen.getByRole('dialog', { name: 'promptLibrary.title' })
    ).toHaveAttribute('tabindex', '-1');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'promptLibrary.title' })
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps character and gallery reference badges separate', () => {
    renderPanel({
      selectedCharacterCount: 1,
      selectedGalleryReferenceCount: 0
    });

    fireEvent.click(screen.getByRole('button', { name: /References/ }));
    const characterButton = screen.getByRole('button', { name: /Character/ });
    const galleryButton = screen.getByRole('button', { name: 'Gallery' });

    expect(characterButton).toHaveTextContent('1');
    expect(galleryButton).not.toHaveTextContent('1');
  });

  it('shows multi-image upload status cards and supports removing them', () => {
    const onRemoveReferenceUpload = vi.fn();

    renderPanel({
      onRemoveReferenceUpload,
      referenceUploadItems: [
        {
          clientId: 'uploading-1',
          fileName: 'first.png',
          previewUrl: 'blob:first',
          status: 'uploading'
        },
        {
          clientId: 'uploaded-1',
          referenceId: 'ref-1',
          fileName: 'second.png',
          previewUrl: '/second.webp',
          status: 'uploaded'
        },
        {
          clientId: 'failed-1',
          fileName: 'third.png',
          previewUrl: 'blob:third',
          status: 'failed',
          error: 'network timeout'
        }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: /References/ }));
    expect(
      screen.getByText('Ready 1 · Uploading 1 · Failed 1')
    ).toBeInTheDocument();
    expect(screen.getByText('first.png')).toBeInTheDocument();
    expect(screen.getByText('second.png')).toBeInTheDocument();
    expect(screen.getByText('third.png')).toBeInTheDocument();
    expect(screen.getByText('network timeout')).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText('Remove this reference image')[1]);

    expect(onRemoveReferenceUpload).toHaveBeenCalledWith('uploaded-1');
  });
});
