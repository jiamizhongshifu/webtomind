import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { imagePromptAssetCatalog as imagePromptAssets } from '@/web/data/image-prompt-asset-catalog';
import { VisualRecipeSummary } from '../VisualRecipeSummary';

const recipeAssets = imagePromptAssets.slice(0, 2).map((asset) => ({
  slot: asset.slot,
  asset
}));

function renderRecipe(onAssetSelect = vi.fn()) {
  const result = render(
    <VisualRecipeSummary
      assets={recipeAssets}
      getSlotLabel={(slot) => slot}
      label="可视化配方"
      activeAssetId={null}
      onAssetSelect={onAssetSelect}
    />
  );
  const row = result.container.querySelector<HTMLDivElement>(
    '.creator-preview-recipe-row'
  );
  if (!row) throw new Error('Expected the visual recipe row to render');
  Object.defineProperty(row, 'scrollWidth', {
    configurable: true,
    value: 500
  });
  Object.defineProperty(row, 'clientWidth', {
    configurable: true,
    value: 200
  });
  row.scrollLeft = 0;
  const firstCard = screen.getByRole('button', {
    name: new RegExp(recipeAssets[0].asset.title)
  });
  return { ...result, firstCard, onAssetSelect, row };
}

describe('VisualRecipeSummary', () => {
  it('keeps a short card gesture as a selection click', () => {
    const { firstCard, onAssetSelect } = renderRecipe();

    fireEvent.pointerDown(firstCard, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: 160,
      clientY: 20
    });
    fireEvent.pointerUp(firstCard, {
      pointerId: 1,
      clientX: 160,
      clientY: 20
    });
    fireEvent.click(firstCard);

    expect(onAssetSelect).toHaveBeenCalledWith(recipeAssets[0].asset.id);
  });

  it('drags from an interactive card and suppresses the resulting click', () => {
    const { firstCard, onAssetSelect, row } = renderRecipe();

    fireEvent.pointerDown(firstCard, {
      button: 0,
      isPrimary: true,
      pointerId: 2,
      clientX: 160,
      clientY: 20
    });
    fireEvent.pointerMove(firstCard, {
      pointerId: 2,
      clientX: 80,
      clientY: 22
    });

    expect(row).toHaveAttribute('data-dragging', 'true');
    expect(row.scrollLeft).toBe(80);

    fireEvent.pointerCancel(firstCard, {
      pointerId: 2,
      clientX: 80,
      clientY: 22
    });
    fireEvent.click(firstCard);

    expect(row).toHaveAttribute('data-dragging', 'false');
    expect(onAssetSelect).not.toHaveBeenCalled();
  });

  it('does not claim a vertical gesture that begins on a card', () => {
    const { firstCard, onAssetSelect, row } = renderRecipe();

    fireEvent.pointerDown(firstCard, {
      button: 0,
      isPrimary: true,
      pointerId: 3,
      clientX: 100,
      clientY: 20
    });
    fireEvent.pointerMove(firstCard, {
      pointerId: 3,
      clientX: 103,
      clientY: 70
    });

    expect(row).toHaveAttribute('data-dragging', 'false');
    expect(row).toHaveAttribute('data-drag-intent', 'vertical');
    expect(row.scrollLeft).toBe(0);

    fireEvent.pointerCancel(firstCard, {
      pointerId: 3,
      clientX: 103,
      clientY: 70
    });
    fireEvent.click(firstCard);

    expect(onAssetSelect).not.toHaveBeenCalled();
  });
});
