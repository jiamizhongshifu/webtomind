import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptCase } from '@/services/agent-api';

const { authState, getPublicPromptCaseMock, trackPromptCaseEventMock } =
  vi.hoisted(() => ({
    authState: { isAuthenticated: false, isLoading: true },
    getPublicPromptCaseMock: vi.fn(),
    trackPromptCaseEventMock: vi.fn()
  }));

vi.mock('@/services/agent-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/agent-api')>()),
  getPublicPromptCase: getPublicPromptCaseMock,
  getPublicPromptCases: vi.fn(async () => []),
  trackPromptCaseEvent: trackPromptCaseEventMock
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessToken: () => null,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading
  })
}));

vi.mock('../../components/image-create/CreateWorkspaceFrame', () => ({
  CreateWorkspaceFrame: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  )
}));

const publicCase: PromptCase = {
  id: 'case-1',
  slug: 'case-1',
  title: 'Editorial portrait',
  imageUrl: 'https://example.com/case-1.png',
  imageUrls: ['https://example.com/case-1.png'],
  prompt: 'Portrait prompt',
  model: 'GPT Image 2',
  locale: 'zh-CN',
  category: 'portrait-photography'
};

async function renderDetail() {
  const { PromptDetailPage } = await import('../PromptDetailPage');
  const view = render(
    <MemoryRouter initialEntries={['/zh-CN/prompts/case-1']}>
      <Routes>
        <Route path="/zh-CN/prompts/:slug" element={<PromptDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
  return { ...view, PromptDetailPage };
}

describe('PromptDetailPage loading', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    getPublicPromptCaseMock.mockReset();
    trackPromptCaseEventMock.mockReset();
    trackPromptCaseEventMock.mockResolvedValue(undefined);
  });

  it('fetches the public case before auth settles and keeps it after auth resolves anonymous', async () => {
    let resolveCase: (value: PromptCase) => void = () => undefined;
    getPublicPromptCaseMock.mockReturnValueOnce(
      new Promise<PromptCase>((resolve) => {
        resolveCase = resolve;
      })
    );
    const { rerender, PromptDetailPage } = await renderDetail();
    expect(getPublicPromptCaseMock).toHaveBeenCalledTimes(1);

    // Auth settles as anonymous while the first request is still in flight.
    authState.isLoading = false;
    rerender(
      <MemoryRouter initialEntries={['/zh-CN/prompts/case-1']}>
        <Routes>
          <Route path="/zh-CN/prompts/:slug" element={<PromptDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    resolveCase(publicCase);

    expect(
      await screen.findAllByText('Editorial portrait')
    ).not.toHaveLength(0);
    expect(getPublicPromptCaseMock).toHaveBeenCalledTimes(1);
    expect(trackPromptCaseEventMock).toHaveBeenCalledTimes(1);
  });

  it('shows and copies the entire shared original once without language claims', async () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    const original =
      'アップロードした写真の特徴を保持する。\n' +
      '完全な原文を省略しない。'.repeat(50);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    getPublicPromptCaseMock.mockResolvedValue({
      ...publicCase,
      prompt: original,
      promptZh: original,
      promptEn: original,
      promptPreview: 'A shortened preview'
    });
    await renderDetail();
    expect(await screen.findByText('原文 Prompt')).toBeInTheDocument();
    expect(screen.queryByText('中文 Prompt')).not.toBeInTheDocument();
    expect(screen.queryByText('英文 Prompt')).not.toBeInTheDocument();
    expect(
      document.querySelectorAll('.prompt-detail-prompt-stack pre')
    ).toHaveLength(1);
    expect(
      document.querySelector('.prompt-detail-prompt-stack pre')?.textContent
    ).toBe(original);
    const section = document.querySelector(
      '.prompt-detail-prompt-stack'
    )?.parentElement;
    fireEvent.click(section!.querySelector('button')!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(original));
  });

  it('keeps both sections for distinct translations', async () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    getPublicPromptCaseMock.mockResolvedValue({
      ...publicCase,
      promptZh: '绘制房间',
      promptEn: 'Draw a room'
    });
    await renderDetail();
    expect(await screen.findByText('中文 Prompt')).toBeInTheDocument();
    expect(screen.getByText('英文 Prompt')).toBeInTheDocument();
    expect(screen.getByText('绘制房间')).toBeInTheDocument();
    expect(screen.getByText('Draw a room')).toBeInTheDocument();
    expect(screen.queryByText('原文 Prompt')).not.toBeInTheDocument();
  });

  it('finishes loading when StrictMode replays mount effects', async () => {
    authState.isLoading = false;
    getPublicPromptCaseMock.mockResolvedValue(publicCase);
    const { PromptDetailPage } = await import('../PromptDetailPage');
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/zh-CN/prompts/case-1']}>
          <Routes>
            <Route path="/zh-CN/prompts/:slug" element={<PromptDetailPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );
    expect(await screen.findAllByText('Editorial portrait')).not.toHaveLength(0);
    expect(trackPromptCaseEventMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes once after auth resolves signed in without double-counting the view', async () => {
    getPublicPromptCaseMock.mockResolvedValue(publicCase);
    const { rerender, PromptDetailPage } = await renderDetail();
    await waitFor(() => expect(trackPromptCaseEventMock).toHaveBeenCalled());

    authState.isLoading = false;
    authState.isAuthenticated = true;
    rerender(
      <MemoryRouter initialEntries={['/zh-CN/prompts/case-1']}>
        <Routes>
          <Route path="/zh-CN/prompts/:slug" element={<PromptDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(getPublicPromptCaseMock).toHaveBeenCalledTimes(2)
    );
    expect(trackPromptCaseEventMock).toHaveBeenCalledTimes(1);
  });
});
