import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import { PromptStyleGridPage } from '../PromptStyleGridPage';

const testState = vi.hoisted(() => ({
  getPublicPromptCases: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false
  })
}));

vi.mock('@/services/agent-api', () => ({
  getPublicPromptCases: testState.getPublicPromptCases
}));

vi.mock('../../lib/analytics', () => ({
  trackEvent: testState.trackEvent
}));

vi.mock('../../lib/seo', () => ({
  applySeo: () => () => {}
}));

function renderPage(initialPath = '/ai-image-style-grid') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/ai-image-style-grid" element={<PromptStyleGridPage />} />
        <Route
          path="/zh-CN/ai-image-style-grid"
          element={<PromptStyleGridPage />}
        />
        <Route
          path="/ai-image-style-grid/:templateSlug"
          element={<PromptStyleGridPage />}
        />
        <Route
          path="/zh-CN/ai-image-style-grid/:templateSlug"
          element={<PromptStyleGridPage />}
        />
        <Route
          path="/en-US/image"
          element={<div data-testid="create-target" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function getTemplateButton(label: string): HTMLButtonElement {
  const button = screen
    .getAllByRole('button')
    .find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

describe('PromptStyleGridPage', () => {
  beforeEach(() => {
    testState.getPublicPromptCases.mockReset();
    testState.trackEvent.mockReset();
    testState.getPublicPromptCases.mockReturnValue(new Promise(() => {}));
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('renders the theme card plaza on the canonical page', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Theme Card Plaza', level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Featured Theme Cards', level: 2 })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', {
        name: /Product Photography Theme Card/
      })[0]
    ).toHaveAttribute(
      'href',
      '/ai-image-style-grid/product'
    );
  });

  it('renders the theme card workflow in Chinese on zh-CN routes', () => {
    renderPage('/zh-CN/ai-image-style-grid/product');

    expect(
      screen.getByRole('heading', {
        name: '商品摄影主题卡片',
        level: 1
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加内容' })).toHaveClass(
      'active'
    );
    expect(screen.getAllByText('点击添加')).toHaveLength(9);
    expect(screen.getByRole('link', { name: /^生成$/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/zh-CN/image')
    );
  });

  it('renders the interactive theme card editor on detail pages', async () => {
    const { container } = renderPage('/ai-image-style-grid/taste');

    expect(
      screen.getByRole('heading', {
        name: 'Personal Taste Theme Card',
        level: 1
      })
    ).toBeInTheDocument();
    const titleInput = screen.getByLabelText('Edit theme card title');
    expect(titleInput).toHaveValue('Personal Taste Theme Card');
    fireEvent.change(titleInput, {
      target: { value: 'My Lookbook Direction' }
    });
    expect(
      screen.getByRole('heading', {
        name: 'My Lookbook Direction',
        level: 1
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Items' })).toHaveClass(
      'active'
    );
    expect(screen.getAllByRole('button', { name: /Select / })).toHaveLength(9);
    expect(screen.getAllByText('Click to Add')).toHaveLength(9);
    expect(
      screen.getByText('Select a slot to use assisted generation')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Select Favorite Style/ }));
    expect(
      screen.getByRole('heading', {
        name: 'Use AI only when you need a thumbnail',
        level: 2
      })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Prompt starter generated from this theme card')
    ).toHaveValue();
    expect(
      (
        screen.getByLabelText(
          'Prompt starter generated from this theme card'
        ) as HTMLTextAreaElement
      ).value
    ).toContain('My Lookbook Direction');

    fireEvent.click(screen.getByRole('button', { name: /Clean Product Editorial/ }));
    expect(screen.getAllByText('Clean Product Editorial').length).toBeGreaterThan(
      1
    );
    expect(container.querySelector('.theme-card-card h1')).toBeNull();
    expect(container.querySelector('.theme-card-cell-image')).toBeTruthy();

    const footerNote = screen.getByLabelText('Edit theme card footer note');
    expect(footerNote).toHaveValue(
      'A reusable WebToMind visual direction for the next image.'
    );
    fireEvent.change(footerNote, {
      target: { value: 'Reusable portrait direction for summer lookbooks.' }
    });
    expect(footerNote).toHaveValue(
      'Reusable portrait direction for summer lookbooks.'
    );

    await waitFor(() => {
      expect(testState.getPublicPromptCases).toHaveBeenCalledWith(
        6,
        expect.objectContaining({
          locale: 'en-US',
          requireImage: true
        })
      );
    });
  });

  it('restores query state and copies the canonical share link', async () => {
    renderPage(
      '/ai-image-style-grid/character?items=style-game-character-concept,lighting-colored-gel'
    );

    expect(
      screen.getByRole('heading', {
        name: 'Character Design Theme Card',
        level: 1
      })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/ai-image-style-grid/character?items=')
      );
    });
  });

  it('tracks randomize and create CTA clicks', () => {
    renderPage('/ai-image-style-grid/taste');

    fireEvent.click(screen.getByRole('button', { name: /Fill with examples/ }));
    fireEvent.click(screen.getByRole('link', { name: /^Generate$/ }));

    expect(testState.trackEvent).toHaveBeenCalledWith(
      'style_grid_randomize',
      expect.objectContaining({ template_slug: 'taste' })
    );
    expect(testState.trackEvent).toHaveBeenCalledWith(
      'style_grid_create_click',
      expect.objectContaining({
        cta_source: 'seo_ai_image_style_grid',
        prompt_model: expect.any(String)
      })
    );
  });

  it('switches popular templates into model-aware create links', () => {
    renderPage('/ai-image-style-grid/taste');

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(getTemplateButton('Nano Banana Theme Card'));

    expect(
      screen.getByRole('link', { name: /^Generate$/ })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('model=gpt-image-2')
    );
    expect(
      screen.getByRole('link', { name: /^Generate$/ })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('imageSize=1024x1536')
    );
    expect(
      screen.getByRole('link', { name: /^Generate$/ })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('aspectRatio=2%3A3')
    );
    expect(
      screen.getByRole('link', { name: /^Generate$/ })
    ).toHaveAttribute(
      'href',
      expect.stringContaining('styleGrid=nano-banana%3A')
    );
    expect(
      screen.getAllByText('Nano Banana prompts gallery').length
    ).toBeGreaterThan(0);
  });

  it('keeps detail pages empty until an explicit query state is present', () => {
    const { container } = renderPage('/ai-image-style-grid/anime-avatar');

    expect(screen.getAllByText('Click to Add')).toHaveLength(9);
    expect(
      container.querySelector('.theme-card-cell-caption')
    ).not.toBeInTheDocument();
  });

  it('supports editable slot labels and prompt drafts after selecting a cell', async () => {
    renderPage('/ai-image-style-grid/taste');

    fireEvent.click(
      screen.getByRole('button', { name: 'Select Favorite Style' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Favorite Style' }));
    const labelInput = screen.getByLabelText('Edit Favorite Style label');
    fireEvent.change(labelInput, { target: { value: 'Hero Mood' } });
    fireEvent.blur(labelInput);

    expect(screen.getAllByText('Hero Mood').length).toBeGreaterThan(0);

    const promptInput = screen.getByLabelText(
      'Prompt starter generated from this theme card'
    );
    fireEvent.change(promptInput, { target: { value: 'custom prompt' } });
    expect(promptInput).toHaveValue('custom prompt');

    fireEvent.click(screen.getByRole('button', { name: 'Restore generated prompt' }));
    await waitFor(() => {
      expect((promptInput as HTMLTextAreaElement).value).toContain(
        'Hero Mood'
      );
    });
  });

  it('switches template tabs and upload tabs as real controls', () => {
    renderPage('/ai-image-style-grid/taste');

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    expect(screen.getByRole('tab', { name: 'Community' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(getTemplateButton('Anime Avatar Theme Card')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    fireEvent.click(screen.getByRole('tab', { name: 'My Uploads' }));
    expect(screen.getByRole('tab', { name: 'My Uploads' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByText('No local uploads yet. Uploaded images will appear here.')
    ).toBeInTheDocument();
  });

  it('updates grid dimensions from settings', () => {
    renderPage('/ai-image-style-grid/taste');

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Rows'), {
      target: { value: '2' }
    });
    fireEvent.change(screen.getByLabelText('Columns'), {
      target: { value: '4' }
    });

    expect(screen.getAllByRole('button', { name: /Select / })).toHaveLength(8);
  });
});
