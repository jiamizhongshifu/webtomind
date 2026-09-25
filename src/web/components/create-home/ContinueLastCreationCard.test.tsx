import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualImageHistoryItem } from '@/services/agent-api';
import { ContinueLastCreationCard } from './ContinueLastCreationCard';

const mocks = vi.hoisted(() => ({
  getVisualImageHistoryResult: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock('@/services/agent-api', () => ({
  getVisualImageHistoryResult: mocks.getVisualImageHistoryResult
}));

vi.mock('../../lib/analytics', () => ({
  trackEvent: mocks.trackEvent
}));

const latestHistoryItem: VisualImageHistoryItem = {
  id: 'generation-latest',
  imageUrl: 'https://example.com/latest.webp',
  thumbnailUrl: 'https://example.com/latest-thumb.webp',
  prompt: 'A reusable product launch image with clean studio lighting',
  modelLabel: 'GPT Image 2',
  provider: 'openai',
  model: 'gpt-image-2',
  aspectRatio: '4:3',
  imageSize: '1536x1152',
  quality: 'high',
  outputFormat: 'png',
  assetIds: ['style-high-end-fashion-photo'],
  referenceImageIds: ['reference-1'],
  characterCardIds: [],
  characterReferenceGroups: [],
  createdAt: '2026-07-14T02:00:00.000Z'
};

function LocationStateDump() {
  const location = useLocation();
  return (
    <pre data-testid="route-state">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state
      })}
    </pre>
  );
}

function renderCard(isEnglish = false) {
  return render(
    <MemoryRouter initialEntries={[isEnglish ? '/en-US/create' : '/zh-CN/create']}>
      <Routes>
        <Route
          path="/:locale/create"
          element={
            <ContinueLastCreationCard
              localePrefix={isEnglish ? '/en-US' : '/zh-CN'}
              isEnglish={isEnglish}
            />
          }
        />
        <Route path="/:locale/image" element={<LocationStateDump />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ContinueLastCreationCard', () => {
  beforeEach(() => {
    mocks.getVisualImageHistoryResult.mockReset();
    mocks.trackEvent.mockReset();
  });

  it('reads only the latest item from the existing generation history', async () => {
    mocks.getVisualImageHistoryResult.mockResolvedValue({
      items: [latestHistoryItem],
      total: 12
    });

    const view = renderCard();

    expect(
      await screen.findByRole('heading', { name: '继续上次创作' })
    ).toBeInTheDocument();
    expect(mocks.getVisualImageHistoryResult).toHaveBeenCalledWith(1);
    expect(screen.getByText(latestHistoryItem.prompt)).toBeInTheDocument();
    expect(view.container.querySelector('img')).toHaveAttribute(
      'src',
      latestHistoryItem.thumbnailUrl
    );
    await waitFor(() => {
      expect(mocks.trackEvent).toHaveBeenCalledWith(
        'continue_last_creation_view',
        expect.objectContaining({ generation_id: 'generation-latest' })
      );
    });

    fireEvent(window, new Event('visual-generation-history-changed'));
    await waitFor(() => {
      expect(mocks.getVisualImageHistoryResult).toHaveBeenCalledTimes(2);
    });
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
  });

  it('restores the latest prompt, settings, references and recipe through route state', async () => {
    mocks.getVisualImageHistoryResult.mockResolvedValue({
      items: [latestHistoryItem],
      total: 1
    });
    renderCard();

    fireEvent.click(
      await screen.findByRole('button', { name: /继续编辑/ })
    );

    const route = JSON.parse(
      screen.getByTestId('route-state').textContent || '{}'
    );
    expect(route.pathname).toBe('/zh-CN/image');
    expect(route.search).toBe('?source=create_home_continue_last');
    expect(route.state).toMatchObject({
      promptCasePrompt: latestHistoryItem.prompt,
      model: 'gpt-image-2',
      aspectRatio: '4:3',
      imageSize: '1536x1152',
      quality: 'high',
      outputFormat: 'png',
      referenceImageIds: ['reference-1'],
      remixSource: {
        id: 'generation-latest',
        source: 'create_home_continue_last'
      }
    });
    expect(route.state.visualRecipeSelection.style).toBe(
      'style-high-end-fashion-photo'
    );
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      'continue_last_creation_click',
      expect.objectContaining({
        generation_id: 'generation-latest',
        cta_source: 'create_home_continue_last'
      })
    );
  });

  it('stays hidden when history is empty or unavailable', async () => {
    mocks.getVisualImageHistoryResult.mockResolvedValue({ items: [], total: 0 });
    const view = renderCard(true);

    await waitFor(() => {
      expect(mocks.getVisualImageHistoryResult).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole('heading', { name: 'Continue your last creation' })
    ).not.toBeInTheDocument();

    view.unmount();
    mocks.getVisualImageHistoryResult.mockClear();
    mocks.getVisualImageHistoryResult.mockRejectedValue(
      new Error('history unavailable')
    );
    renderCard(true);
    await waitFor(() => {
      expect(mocks.getVisualImageHistoryResult).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole('heading', { name: 'Continue your last creation' })
    ).not.toBeInTheDocument();
  });
});
