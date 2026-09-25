import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { Reference } from '@/types';
import { ChatInputArea, type ChatInputAreaProps } from '../ChatInputArea';

const t = ((key: string, fallback?: string) =>
  fallback || key) as TFunction<'workspace'>;

function createProps(
  overrides: Partial<ChatInputAreaProps> = {}
): ChatInputAreaProps {
  const noop = vi.fn();
  return {
    isInputDragOver: false,
    handleInputDragOver: noop,
    handleInputDragLeave: noop,
    handleInputDrop: noop,
    ENABLE_SKILL_FEATURE: false,
    matchedSkills: [],
    showSkillSelector: false,
    selectedSkill: null,
    selectedSkillCandidate: null,
    setSelectedSkill: noop,
    setSelectedSkillCandidate: noop,
    setShowSkillSelector: noop,
    setMatchedSkills: noop,
    selectedShortcut: null,
    pastedImages: [],
    handleClearShortcut: noop,
    t,
    handleRemovePastedImage: noop,
    textareaRef: React.createRef<HTMLTextAreaElement>(),
    imageMode: false,
    input: '',
    setInput: noop,
    adjustTextareaHeight: noop,
    handleKeyDown: noop,
    handlePaste: noop,
    currentLoading: false,
    showPlusMenu: false,
    plusMenuRef: React.createRef<HTMLDivElement>(),
    setShowPlusMenu: noop,
    setShowSelector: noop,
    imageInputRef: React.createRef<HTMLInputElement>(),
    documentInputRef: React.createRef<HTMLInputElement>(),
    modeMenuRef: React.createRef<HTMLDivElement>(),
    showModeMenu: false,
    setShowModeMenu: noop,
    agentMode: true,
    handleModeChange: noop,
    webSearchEnabled: false,
    setWebSearchEnabled: noop,
    availableSkills: [],
    thinkingModeEnabled: false,
    setThinkingModeEnabled: noop,
    featuresMenuRef: React.createRef<HTMLDivElement>(),
    selectedFeature: null,
    showFeaturesMenu: false,
    setShowFeaturesMenu: noop,
    agentFeatures: [],
    getFeatureLabel: (id) => id,
    handleClearFeature: noop,
    handleSelectFeature: noop,
    imageSettingsRef: React.createRef<HTMLDivElement>(),
    showImageSettings: false,
    setShowImageSettings: noop,
    imageSettings: {
      aspectRatio: '1:1',
      quality: '1K',
      style: null,
      model: 'gpt-image-2'
    },
    setImageSettings: noop,
    slideSettingsRef: React.createRef<HTMLDivElement>(),
    showSlideSettings: false,
    setShowSlideSettings: noop,
    slideSettings: {
      style: 'blueprint',
      slideCount: 8,
      language: 'auto'
    },
    setSlideSettings: noop,
    currentStatus: null,
    references: [],
    wrappedImageUpload: noop,
    wrappedDocumentUpload: noop,
    onAddReferences: noop,
    handleStopGeneration: noop,
    handleSend: noop,
    ...overrides
  };
}

describe('ChatInputArea', () => {
  it('shows selected canvas references as tags in project compact mode', () => {
    const references: Reference[] = [
      {
        id: 'canvas-node-ref-summary-1',
        type: 'summary',
        summaryId: 'summary-1',
        summaryTitle: '品牌手册封面',
        content: '封面内容',
        preview: '品牌手册',
        canvas: {
          nodeId: 'summary-1',
          role: 'selected'
        }
      },
      {
        id: 'canvas-node-ref-holder-1',
        type: 'selection',
        summaryId: 'holder-1',
        summaryTitle: 'AI 图片槽',
        content: '生成意图：封面延展',
        preview: '图片槽',
        canvas: {
          nodeId: 'holder-1',
          role: 'target',
          customNodeType: 'ai_image_holder',
          targetWidth: 1024,
          targetHeight: 576,
          aspectRatio: '16:9'
        }
      },
      {
        id: 'canvas-node-ref-summary-2',
        type: 'summary',
        summaryId: 'summary-2',
        summaryTitle: '品牌手册规范',
        content: '规范内容',
        preview: '品牌规范',
        canvas: {
          nodeId: 'summary-2',
          role: 'active'
        }
      }
    ];

    render(
      <ChatInputArea
        {...createProps({
          variant: 'projectCompact',
          references
        })}
      />
    );

    const inputArea = screen.getByTestId('workspace-chat-input-area');
    expect(within(inputArea).getByText('当前')).toBeInTheDocument();
    expect(within(inputArea).getByText('品牌手册封面')).toBeInTheDocument();
    expect(within(inputArea).getByText('目标')).toBeInTheDocument();
    expect(within(inputArea).getByText('AI 图片槽')).toBeInTheDocument();
    expect(within(inputArea).getByText('引用')).toBeInTheDocument();
    expect(within(inputArea).getByText('品牌手册规范')).toBeInTheDocument();
  });

  it('does not render canvas reference tags in the full chat input variant', () => {
    render(
      <ChatInputArea
        {...createProps({
          variant: 'full',
          references: [
            {
              id: 'canvas-node-ref-summary-1',
              type: 'summary',
              summaryId: 'summary-1',
              summaryTitle: '品牌手册封面',
              content: '封面内容',
              preview: '品牌手册',
              canvas: {
                nodeId: 'summary-1',
                role: 'selected'
              }
            }
          ]
        })}
      />
    );

    expect(screen.queryByText('品牌手册封面')).not.toBeInTheDocument();
  });

  it('exposes the compact mode switch through the shared interaction contract', () => {
    render(
      <ChatInputArea
        {...createProps({
          variant: 'projectCompact'
        })}
      />
    );

    expect(screen.getByTestId('mode-toggle-button')).toHaveAccessibleName(
      '切换模式'
    );
  });
});
