import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { Reference } from '@/types';
import { useChatSend, selectCanvasTargetImageUrl } from '../useChatSend';
import type { UseChatSendProps } from '../useChatSend';

vi.mock('@/services/credits-api', () => ({
  consumeCredits: vi.fn().mockResolvedValue(undefined),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    required = 1;
    current = 0;
  },
  QuotaExceededError: class QuotaExceededError extends Error {
    feature = 'test';
  }
}));

vi.mock('@/services/workspace-api', () => ({
  getSummaryById: vi.fn()
}));

vi.mock('@/utils/env', () => ({
  isExtensionEnv: () => false,
  getApiBaseUrl: () => 'https://webtomind.test'
}));

const t = ((key: string) => key) as TFunction<'workspace'>;

function makeProps(overrides: Partial<UseChatSendProps> = {}): UseChatSendProps {
  const noop = vi.fn();
  return {
    extractImagesFromReferences: vi.fn().mockResolvedValue([]),
    compressPastedImages: vi.fn().mockResolvedValue([]),
    resolveEditImageContext: vi.fn().mockResolvedValue({ referenceImages: [] }),
    clearAttachments: noop,
    getInput: () => '继续基于当前图片槽做一版',
    setInput: noop,
    selectedShortcut: null,
    setSelectedShortcut: noop,
    ENABLE_SKILL_FEATURE: false,
    selectedSkill: null,
    setPendingSkillPrompt: noop,
    setShowSkillConfirm: noop,
    isSendingRef: { current: false },
    pendingImageReadsRef: { current: [] },
    pastedImagesRef: { current: [] },
    references: [],
    onRemoveReference: noop,
    selectedFeature: null,
    setSelectedFeature: noop,
    agentMode: true,
    imageMode: false,
    setImageMode: noop,
    chatMode: 'agent',
    setChatMode: noop,
    thinkingModeEnabled: false,
    imageSettings: {
      aspectRatio: '1:1',
      quality: '1K',
      style: null,
      model: 'gpt-image-2'
    },
    imageSettingsToPromptSuffix: () => '',
    slideSettings: {
      style: 'blueprint',
      slideCount: 8,
      language: 'auto'
    },
    slideSettingsToPromptSuffix: () => '',
    t,
    setCreditError: noop,
    summaries: [],
    currentProjectId: 'project-1',
    saveCurrentConversation: vi.fn().mockResolvedValue(undefined),
    unifiedMessages: [],
    setUnifiedMessages: noop,
    updateMessage: noop,
    sendUnifiedMessage: vi.fn().mockResolvedValue(undefined),
    streamingMessageIdRef: { current: null },
    batchStateRef: { current: null },
    showToast: noop,
    ...overrides
  };
}

describe('useChatSend canvas Agent context', () => {
  it('prefers selected target holder images over other canvas image refs', () => {
    const refs: Reference[] = [
      {
        id: 'canvas-node-ref-summary-1',
        type: 'summary',
        summaryId: 'summary-1',
        summaryTitle: '普通图片',
        content: '普通图片内容',
        preview: '普通图片',
        canvas: {
          nodeId: 'summary-1',
          role: 'selected',
          imageUrl: 'https://example.com/summary.png'
        }
      },
      {
        id: 'canvas-node-ref-holder-1',
        type: 'selection',
        summaryId: 'holder-1',
        summaryTitle: 'AI 图片槽',
        content: 'AI 图片槽',
        preview: '图片槽',
        canvas: {
          nodeId: 'holder-1',
          role: 'target',
          customNodeType: 'ai_image_holder',
          imageUrl: 'https://example.com/holder.png'
        }
      }
    ];

    expect(selectCanvasTargetImageUrl(refs)).toBe('https://example.com/holder.png');
  });

  it('sends selected canvas holder output as Agent targetImageUrl', async () => {
    const sendUnifiedMessage = vi.fn().mockResolvedValue(undefined);
    const onRemoveReference = vi.fn();
    const references: Reference[] = [
      {
        id: 'canvas-node-ref-holder-1',
        type: 'selection',
        summaryId: 'holder-1',
        summaryTitle: 'AI 图片槽',
        content: '画布节点类型：AI 图片槽\n已生成图片：https://example.com/holder.png',
        preview: '图片槽',
        canvas: {
          nodeId: 'holder-1',
          role: 'target',
          customNodeType: 'ai_image_holder',
          imageUrl: 'https://example.com/holder.png',
          targetWidth: 1024,
          targetHeight: 1024,
          aspectRatio: '1:1'
        }
      }
    ];

    const { result } = renderHook(() =>
      useChatSend(makeProps({ references, sendUnifiedMessage, onRemoveReference }))
    );

    await act(async () => {
      await result.current.handleSend();
    });

    expect(sendUnifiedMessage).toHaveBeenCalledWith(
      '继续基于当前图片槽做一版',
      expect.objectContaining({
        feature: 'image',
        context: expect.objectContaining({
          targetImageUrl: 'https://example.com/holder.png',
          projectId: 'project-1'
        }),
        references: expect.arrayContaining([
          expect.objectContaining({ summaryId: 'holder-1' })
        ])
      })
    );
    expect(onRemoveReference).toHaveBeenCalledWith('canvas-node-ref-holder-1');
  });
});
