import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptCasesAdminHarnessPage } from '../PromptCasesAdminHarnessPage';

describe('PromptCasesAdminHarnessPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  it('renders the shadcn-backed prompt case admin harness with sample data', async () => {
    render(
      <MemoryRouter initialEntries={['/__dev/prompt-cases-admin-harness']}>
        <PromptCasesAdminHarnessPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Prompt Cases Admin' })
    ).toBeInTheDocument();

    expect(await screen.findByText('品牌海报 Prompt')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /草稿箱|Drafts/i })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/Status: ready/i)).toBeInTheDocument();
    });
  });

  it('can render the prompt case card grid mode for visual checks', async () => {
    render(
      <MemoryRouter
        initialEntries={['/__dev/prompt-cases-admin-harness?mode=cards']}
      >
        <PromptCasesAdminHarnessPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Prompt Cases Admin' })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Status: ready/i)).toBeInTheDocument();
    });

    expect(screen.getByText('品牌海报 Prompt')).toBeInTheDocument();
  });

  it('can render managed rail cards with card action buttons', async () => {
    render(
      <MemoryRouter
        initialEntries={['/__dev/prompt-cases-admin-harness?mode=card-actions']}
      >
        <PromptCasesAdminHarnessPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Status: ready/i)).toBeInTheDocument();
    });

    expect(
      (await screen.findAllByText('品牌海报 Prompt')).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /promptCases\.edit|编辑/i }).length
    ).toBeGreaterThan(0);
  });

  it('can render the empty drafts state for theme and contrast checks', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          '/__dev/prompt-cases-admin-harness?mode=empty&tab=drafts'
        ]}
      >
        <PromptCasesAdminHarnessPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Status: ready/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/暂无草稿|No drafts|promptCases\.draftsEmpty/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /导入案例|Import case|promptCases\.importDraft/i
      })
    ).toBeInTheDocument();
  });

  it('does not treat legacy featured categories as admin featured status', async () => {
    render(
      <MemoryRouter initialEntries={['/__dev/prompt-cases-admin-harness']}>
        <PromptCasesAdminHarnessPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('旧导入视频分类污染样本')
    ).toBeInTheDocument();

    const adminFilterTabs = screen.getByLabelText(
      /Case filters|案例筛选|promptCases\.adminFilterLabel/i
    );
    const featuredTab = within(adminFilterTabs).getByRole('tab', {
      name: /精选案例|Featured|promptCases\.adminFeaturedOnly/i
    });
    fireEvent.mouseDown(featuredTab, { button: 0, ctrlKey: false });
    fireEvent.click(featuredTab);

    await waitFor(() => {
      expect(
        screen.queryByText('旧导入视频分类污染样本')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('品牌海报 Prompt')).toBeInTheDocument();
  });
});
