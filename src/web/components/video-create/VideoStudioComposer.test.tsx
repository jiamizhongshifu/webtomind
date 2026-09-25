import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getSeedanceVideoModelConfig } from '@/shared/seedance-video-models';
import { VideoStudioComposer } from './VideoStudioComposer';

function renderComposer(
  overrides: Partial<{
    prompt: string;
    referenceUploading: 'image' | 'video' | 'audio' | null;
    frameUploadSlot: 'first' | 'last' | null;
    error: string;
    onPasteReferenceImages: (files: File[]) => void;
  }> = {}
) {
  const model = getSeedanceVideoModelConfig('seedance-2-0-fast');
  return render(
    <VideoStudioComposer
      isEnglish={false}
      prompt={overrides.prompt || ''}
      onPromptChange={vi.fn()}
      model={model}
      models={[model]}
      onModelChange={vi.fn()}
      creationMode="auto"
      referenceImageUrls={[]}
      referenceVideoUrls={[]}
      referenceAudioUrls={[]}
      referenceUploading={overrides.referenceUploading ?? null}
      onOpenReferenceGallery={vi.fn()}
      onOpenReferenceUpload={vi.fn()}
      onPasteReferenceImages={overrides.onPasteReferenceImages || vi.fn()}
      onMentionReference={vi.fn()}
      onClearReference={vi.fn()}
      firstFrameUrl=""
      lastFrameUrl=""
      frameUploadSlot={overrides.frameUploadSlot ?? null}
      onOpenFrameGallery={vi.fn()}
      onOpenFrameUpload={vi.fn()}
      onMentionFrame={vi.fn()}
      onClearFrame={vi.fn()}
      aspectRatio="16:9"
      onAspectRatioChange={vi.fn()}
      duration={8}
      onDurationChange={vi.fn()}
      resolution="720p"
      onResolutionChange={vi.fn()}
      generateAudio
      onGenerateAudioChange={vi.fn()}
      watermark={false}
      onWatermarkChange={vi.fn()}
      webSearch={false}
      onWebSearchChange={vi.fn()}
      quantity={1}
      onQuantityChange={vi.fn()}
      autoOptimize
      onAutoOptimizeChange={vi.fn()}
      optimizingPrompt={false}
      onOptimizePrompt={vi.fn()}
      estimatedCost={80}
      estimatedCostPerSecond={10}
      pendingTaskCount={0}
      submitting={false}
      availabilityLoading={false}
      available
      isAuthenticated
      authLoading={false}
      error={overrides.error}
      onRandomPrompt={vi.fn()}
      onGenerate={vi.fn()}
      onLogin={vi.fn()}
    />
  );
}

describe('VideoStudioComposer upload feedback', () => {
  it('routes pasted clipboard images to the reference upload callback', () => {
    const onPasteReferenceImages = vi.fn();
    renderComposer({ onPasteReferenceImages });
    const textarea = screen.getByRole('textbox');
    const itemImage = new File(['image'], 'reference.webp', {
      type: 'image/webp',
      lastModified: 1
    });
    const fileImage = new File(['image'], 'reference.webp', {
      type: 'image/webp',
      lastModified: 2
    });
    const pasteEvent = new Event('paste', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          { kind: 'file', type: 'image/webp', getAsFile: () => itemImage }
        ],
        files: [fileImage]
      }
    });

    fireEvent(textarea, pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(onPasteReferenceImages).toHaveBeenCalledTimes(1);
    expect(onPasteReferenceImages).toHaveBeenCalledWith([fileImage]);
  });

  it('shows the total credit estimate merged into the generate button', () => {
    renderComposer();

    const generate = screen.getByRole('button', {
      name: '生成 · 约每秒 10 积分 · 本次共 80 积分'
    });
    const estimate = generate.querySelector('.creation-generate-button-estimate');
    expect(estimate).not.toBeNull();
    expect(estimate?.textContent).toContain('80 积分');
    expect(
      generate.querySelector('.creation-generate-button-surface')
    ).not.toBeNull();
    expect(generate).toBeEnabled();
  });

  it('shows a media upload skeleton above the prompt', () => {
    renderComposer({ referenceUploading: 'video' });

    expect(screen.getByLabelText('已引用图片')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '视频1 上传中' })).toBeVisible();
  });

  it('shows a frame upload skeleton above the prompt', () => {
    renderComposer({ frameUploadSlot: 'first' });

    expect(screen.getByRole('status', { name: '首帧 上传中' })).toBeVisible();
  });

  it('renders the measured failure reason in the shared error notice', () => {
    renderComposer({
      error:
        '参考视频时长为 44.37 秒，允许范围为 2–15 秒；文件大小 84.9 MB 符合上限。请裁剪到 15 秒以内后重试。'
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('操作失败');
    expect(alert).toHaveTextContent('参考视频时长为 44.37 秒');
    expect(alert).toHaveTextContent('文件大小 84.9 MB 符合上限');
    expect(alert).toHaveTextContent('请裁剪到 15 秒以内后重试');
  });

  it('caps long prompts at the expanded 198px editing height', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'scrollHeight'
    );
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.value.length > 40 ? 320 : 64;
      }
    });

    try {
      renderComposer({ prompt: '一段足够长的视频提示词'.repeat(20) });
      expect(screen.getByRole('textbox')).toHaveStyle({
        height: '198px',
        overflowY: 'auto'
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
});
