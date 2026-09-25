import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultImagePromptSelection,
  setImagePromptAssetSelection,
  type ImagePromptAsset
} from '@/web/data/image-prompt-core';
import { CreatorCanvas } from '../CreatorCanvas';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, values?: Record<string, unknown>) =>
      key === 'canvas.randomizeSlot'
        ? `Randomize ${String(values?.slot)}`
        : key === 'canvas.randomizeSlotHint'
          ? `Replace ${String(values?.slot)}`
          : key === 'canvas.materialButton'
            ? `改变${String(values?.slot)}材质`
            : key === 'canvas.materialTitle'
              ? `选择${String(values?.slot)}材质`
              : key
  })
}));

const background: ImagePromptAsset = {
  id: 'background-test',
  slot: 'background',
  title: 'Test scene',
  subtitle: 'Test subtitle',
  prompt: 'test scene',
  tags: ['portrait'],
  visual: { tone: '#fff', accent: '#111', shape: 'landscape' }
};

const top: ImagePromptAsset = {
  id: 'top-test',
  slot: 'top',
  title: 'Test top',
  subtitle: 'Test top subtitle',
  prompt: 'black tailored top',
  tags: ['portrait'],
  visual: { tone: '#fff', accent: '#111', shape: 'outfit' }
};

describe('CreatorCanvas slot random action', () => {
  it('randomizes the category without opening its picker', () => {
    const onRandomizeSlot = vi.fn();
    const onOpenPicker = vi.fn();
    render(
      <CreatorCanvas
        compiled={{
          prompt: '',
          negativePrompt: '',
          selectedAssets: [background],
          warnings: []
        }}
        selection={setImagePromptAssetSelection(
          defaultImagePromptSelection,
          background
        )}
        mergedAssets={[background]}
        activeSlot="background"
        onActiveSlotChange={vi.fn()}
        getSlotLabel={(slot) => slot}
        onClearSlot={vi.fn()}
        onOpenPicker={onOpenPicker}
        onRandomizeSlot={onRandomizeSlot}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Randomize background' })
    );

    expect(onRandomizeSlot).toHaveBeenCalledWith('background');
    expect(onOpenPicker).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Randomize character' })
    ).toBeDisabled();
    expect(document.querySelector('button button')).toBeNull();
  });

  it('opens material presets to the left-side clothing control without opening the asset picker', () => {
    const onMaterialChange = vi.fn();
    const onOpenPicker = vi.fn();
    render(
      <CreatorCanvas
        compiled={{
          prompt: '',
          negativePrompt: '',
          selectedAssets: [top],
          warnings: []
        }}
        selection={setImagePromptAssetSelection(
          defaultImagePromptSelection,
          top
        )}
        mergedAssets={[top]}
        activeSlot="top"
        onActiveSlotChange={vi.fn()}
        getSlotLabel={(slot) => slot}
        onClearSlot={vi.fn()}
        onOpenPicker={onOpenPicker}
        onMaterialChange={onMaterialChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '改变top材质' }));
    expect(screen.getByLabelText('选择top材质')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(25);
    expect(
      screen.getByRole('group', { name: '天然与裁剪' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: '科技与实验' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /半透明柔性 TPU/ })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /丝光缎面/ }));

    expect(onMaterialChange).toHaveBeenCalledWith('top', 'silk-satin');
    expect(onOpenPicker).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: '改变bottom材质' })
    ).toBeDisabled();
    expect(document.querySelector('button button')).toBeNull();
  });
});
