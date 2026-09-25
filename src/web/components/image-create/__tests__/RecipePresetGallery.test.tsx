import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultImagePromptSelection,
  setImagePromptAssetSelection
} from '@/web/data/image-prompt-core';
import type { ImageStudioStarterCase } from '../useImageStudioStarterCases';
import { RecipePresetGallery } from '../RecipePresetGallery';
import type { ImagePromptAsset } from '@/web/data/image-prompt-core';

const styleAsset: ImagePromptAsset = {
  id: 'style-recipe-test',
  slot: 'style',
  title: 'Editorial film',
  subtitle: 'Muted and tactile',
  prompt: 'muted editorial film texture',
  tags: ['editorial'],
  thumbnailUrl: '/recipe-test.webp',
  visual: { tone: '#eee', accent: '#333', shape: 'style' }
};

const recipe: ImageStudioStarterCase = {
  id: 'recipe-test',
  sourceCaseId: 'public-case-test',
  title: 'Editorial film',
  subtitle: 'Quiet studio',
  prompt: 'A restrained editorial portrait',
  selection: setImagePromptAssetSelection(
    defaultImagePromptSelection,
    styleAsset
  ),
  imageUrls: ['/public-case-test.webp']
};

describe('RecipePresetGallery', () => {
  it('explains the first creation task before offering examples', () => {
    render(
      <RecipePresetGallery
        cases={[recipe]}
        onPreview={vi.fn()}
        onCommit={vi.fn()}
      />
    );

    expect(
      screen.getByRole('heading', { name: '创作你的第一张图' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('在下方描述画面，或先选一个示例作为起点。')
    ).toBeInTheDocument();
  });

  it('keeps the first creation task visible when starter cases are unavailable', () => {
    render(
      <RecipePresetGallery cases={[]} onPreview={vi.fn()} onCommit={vi.fn()} />
    );

    expect(
      screen.getByRole('heading', { name: '创作你的第一张图' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('在下方描述画面，我们会把它变成可继续修改的商业图。')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('创作示例')).not.toBeInTheDocument();
  });

  it('previews without committing and restores the draft on leave', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    render(
      <RecipePresetGallery
        cases={[recipe]}
        onPreview={onPreview}
        onCommit={onCommit}
      />
    );

    const button = screen.getByRole('button', {
      name: '应用案例：Editorial film'
    });
    fireEvent.mouseEnter(button);
    expect(onPreview).toHaveBeenLastCalledWith(recipe.prompt);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.mouseLeave(button);
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('commits only after click, which also covers touch activation', () => {
    const onCommit = vi.fn();
    render(
      <RecipePresetGallery
        cases={[recipe]}
        onPreview={vi.fn()}
        onCommit={onCommit}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: '应用案例：Editorial film' })
    );
    expect(onCommit).toHaveBeenCalledWith(recipe);
  });

  it('renders the collected case cover instead of recipe asset thumbnails', () => {
    render(
      <RecipePresetGallery
        cases={[recipe]}
        onPreview={vi.fn()}
        onCommit={vi.fn()}
      />
    );

    const cover = document.querySelector('.recipe-preset-media img');
    expect(cover).toHaveAttribute('src', '/public-case-test.webp');
    expect(cover).toHaveAttribute('loading', 'eager');
    expect(cover).toHaveAttribute('fetchpriority', 'high');
    expect(cover).not.toHaveAttribute('src', styleAsset.thumbnailUrl);
  });
});
