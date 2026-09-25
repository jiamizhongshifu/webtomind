import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import {
  defaultImagePromptSelection,
  defaultImagePromptSettings,
  type ImagePromptAsset,
  type ImagePromptSettings
} from '@/web/data/image-prompt-core';
import { ImageStudioComposer } from '../ImageStudioComposer';

const asset: ImagePromptAsset = {
  id: 'character-editorial',
  slot: 'character',
  title: '编辑人像',
  subtitle: 'Editorial portrait',
  prompt: 'editorial portrait',
  tags: ['portrait'],
  visual: { tone: '#eee', accent: '#222', shape: 'portrait' }
};

const board = {
  id: 'board-one',
  name: 'Vibrant Surreal Pop',
  itemCount: 4,
  coverImageUrl: '/board.webp'
} as VisualMoodboard;

function renderComposer(
  overrides: Partial<{
    prompt: string;
    settings: ImagePromptSettings;
    skillActive: boolean;
    activeSkillModeId: string;
    onSkillModeChange: (modeId: string) => void;
    onExitSkillMode: () => void;
    onSkillGenerate: () => void;
  }> = {}
) {
  return render(
    <ImageStudioComposer
      prompt={overrides.prompt ?? '原始草稿'}
      onPromptChange={vi.fn()}
      settings={overrides.settings || defaultImagePromptSettings}
      onSettingsChange={vi.fn()}
      conditioningMode="none"
      boards={[board]}
      activeMoodboard={null}
      onSelectMoodboard={vi.fn()}
      onClearMoodboard={vi.fn()}
      onCreateMoodboard={vi.fn()}
      recipeSlots={[{ id: 'character', label: '人物', group: '人物' }]}
      assets={[asset]}
      selection={defaultImagePromptSelection}
      onRandomizeRecipe={vi.fn()}
      onRandomizeSlot={vi.fn()}
      onToggleRecipeAsset={vi.fn()}
      onClearRecipe={vi.fn()}
      onApplyRecipe={vi.fn(() => true)}
      referenceUploadItems={[]}
      referenceMentions={[]}
      selectedReferenceCount={0}
      selectedCharacterCount={0}
      onMentionReference={vi.fn()}
      onRemoveReference={vi.fn()}
      onOpenReferenceUpload={vi.fn()}
      onPasteReferenceImages={vi.fn()}
      onOpenHistoryReferencePicker={vi.fn()}
      onOpenCharacterWorkflow={vi.fn()}
      autoOptimizePrompt={false}
      onAutoOptimizePromptChange={vi.fn()}
      promptLibrary={[]}
      onApplyPromptLibraryItem={vi.fn(() => true)}
      onSavePrompt={vi.fn()}
      onReset={vi.fn()}
      onImageCountChange={vi.fn()}
      onGenerate={vi.fn()}
      estimatedCost={2}
      estimatedUnitCost={2}
      skillActive={overrides.skillActive}
      activeSkillModeId={overrides.activeSkillModeId}
      onSkillModeChange={overrides.onSkillModeChange || vi.fn()}
      onExitSkillMode={overrides.onExitSkillMode || vi.fn()}
      onSkillGenerate={overrides.onSkillGenerate || vi.fn()}
    />
  );
}

describe('ImageStudioComposer 技能入口（先选 skill 再选模式）', () => {
  it('opens the skill panel and first shows the official skill card', () => {
    renderComposer();

    const skillTrigger = screen.getByRole('button', { name: '技能' });
    fireEvent.click(skillTrigger);

    // 第一步：先选官方技能（女性写真视觉导演），模式尚未出现
    expect(
      screen.getByRole('radio', { name: /女性写真视觉导演/ })
    ).toBeInTheDocument();
    // skill 卡片描述里包含“日常写真”字样，改用精确模式名断言
    expect(
      screen.queryByRole('radio', { name: /^日常写真/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /^写真探索/ })
    ).not.toBeInTheDocument();
    // 无技能市场 / 前置配置残留
    expect(screen.queryByLabelText(/创作模式/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/技能前置配置/)).not.toBeInTheDocument();
  });

  it('reveals daily/explore modes only after picking the official skill', () => {
    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: '技能' }));
    fireEvent.click(screen.getByRole('radio', { name: /女性写真视觉导演/ }));

    const daily = screen.getByRole('radio', { name: /^日常写真/ });
    const explore = screen.getByRole('radio', { name: /^写真探索/ });
    expect(daily).toBeInTheDocument();
    expect(explore).toBeInTheDocument();
    expect(daily.textContent).toContain('自然随拍');
    expect(explore.textContent).toContain('风格化探索');
  });

  it('calls onSkillModeChange with free when selecting daily portrait', () => {
    const onSkillModeChange = vi.fn();
    renderComposer({ onSkillModeChange });

    fireEvent.click(screen.getByRole('button', { name: '技能' }));
    fireEvent.click(screen.getByRole('radio', { name: /女性写真视觉导演/ }));
    fireEvent.click(screen.getByRole('radio', { name: /日常写真/ }));

    expect(onSkillModeChange).toHaveBeenCalledWith('free');
  });

  it('calls onSkillModeChange with explore and reflects selected state', () => {
    const onSkillModeChange = vi.fn();
    renderComposer({
      onSkillModeChange,
      skillActive: true,
      activeSkillModeId: 'free'
    });

    fireEvent.click(screen.getByRole('button', { name: '技能' }));
    fireEvent.click(screen.getByRole('radio', { name: /女性写真视觉导演/ }));
    // 当前模式在面板中有选中态
    expect(screen.getByRole('radio', { name: /日常写真/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: /写真探索/ }));

    expect(onSkillModeChange).toHaveBeenCalledWith('explore');
  });

  it('shows the current mode on the skill trigger and the send button', () => {
    const onSkillGenerate = vi.fn();
    renderComposer({
      skillActive: true,
      activeSkillModeId: 'free',
      onSkillGenerate
    });

    // 技能工具按钮激活后显示当前模式名
    expect(screen.getByRole('button', { name: '技能' }).textContent).toContain(
      '日常写真'
    );
    // 发送按钮文案随模式切换
    expect(
      screen.getByRole('button', { name: /用日常写真生成/ })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /用日常写真生成/ }));
    expect(onSkillGenerate).toHaveBeenCalledTimes(1);
  });

  it('supports exiting skill mode from the panel', () => {
    const onExitSkillMode = vi.fn();
    renderComposer({
      skillActive: true,
      activeSkillModeId: 'explore',
      onExitSkillMode
    });

    fireEvent.click(screen.getByRole('button', { name: '技能' }));
    fireEvent.click(screen.getByRole('button', { name: /退出技能模式/ }));

    expect(onExitSkillMode).toHaveBeenCalledTimes(1);
  });
});
