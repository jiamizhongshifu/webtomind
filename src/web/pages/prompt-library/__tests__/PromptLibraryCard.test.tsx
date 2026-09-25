import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PromptCase } from '@/services/agent-api';
import { PromptLibraryCard } from '../PromptLibraryCard';

const promptCase: PromptCase = {
  id: 'case-1',
  slug: 'case-one',
  title: '案例一',
  imageUrl: 'https://example.com/case.webp',
  prompt: '生成一张海报',
  model: 'GPT Image 2',
  locale: 'zh-CN',
  category: 'poster',
  createdAt: '2026-06-18T10:00:00.000Z'
};

function renderCard(
  overrides: Partial<Parameters<typeof PromptLibraryCard>[0]> = {}
) {
  const onOpen = vi.fn();
  const onUse = vi.fn();
  const onToggleFavorite = vi.fn();
  render(
    <MemoryRouter>
      <PromptLibraryCard
        caseItem={promptCase}
        index={0}
        href="/zh-CN/prompts/case-one"
        createHref="/zh-CN/create/image?caseId=case-1&source=prompt_preview_cta"
        isZh
        caseTitle="案例一"
        previewText="这是一段案例摘要"
        isFavorited={false}
        highPriorityCount={4}
        onOpen={onOpen}
        onUse={onUse}
        onToggleFavorite={onToggleFavorite}
        media={<img alt="案例一" src="https://example.com/case.webp" />}
        {...overrides}
      />
    </MemoryRouter>
  );
  return { onOpen, onUse, onToggleFavorite };
}

describe('PromptLibraryCard', () => {
  it('renders the prompt case card link, schema metadata, and priority class', () => {
    const { onOpen } = renderCard();

    const link = screen.getByRole('link', {
      name: '预览 Prompt 案例：案例一'
    });
    expect(link).toHaveAttribute('href', '/zh-CN/prompts/case-one');
    expect(link).toHaveClass('prompt-browser-case-card-priority');
    expect(link).not.toHaveClass('ui-card');
    expect(link.querySelector('meta[itemprop="url"]')).toHaveAttribute(
      'content',
      '/zh-CN/prompts/case-one'
    );
    expect(link.querySelector('meta[itemprop="name"]')).toHaveAttribute(
      'content',
      '案例一'
    );
    expect(link.querySelector('meta[itemprop="description"]')).toHaveAttribute(
      'content',
      '这是一段案例摘要'
    );

    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith(expect.any(Object), promptCase);
  });

  it('toggles favorite without opening the preview link', () => {
    const { onOpen, onToggleFavorite } = renderCard({
      isFavorited: true
    });

    const favoriteButton = screen.getByRole('button', {
      name: '取消收藏案例：案例一'
    });
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(favoriteButton);
    expect(onToggleFavorite).toHaveBeenCalledWith('case-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders a use idea CTA without opening the preview link', () => {
    const { onOpen, onUse } = renderCard();

    const useIdeaLink = screen.getByRole('link', {
      name: '使用创意：案例一'
    });
    expect(useIdeaLink).toHaveAttribute(
      'href',
      '/zh-CN/create/image?caseId=case-1&source=prompt_preview_cta'
    );

    fireEvent.click(useIdeaLink);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onUse).toHaveBeenCalledWith(promptCase);
  });

  it('uses English accessible labels when rendered in English', () => {
    renderCard({
      isZh: false,
      isFavorited: false
    });

    expect(
      screen.getByRole('link', { name: 'Preview prompt case: 案例一' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save case: 案例一' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Use this idea: 案例一' })
    ).toBeInTheDocument();
  });
});
