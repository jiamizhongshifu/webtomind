import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import i18n, { i18nReady } from '../../../i18n';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null })
}));

vi.mock('../../../services/agent-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/agent-api')>()),
  getPublicPromptCases: vi.fn(async () => []),
  subscribeMarketingEmail: vi.fn()
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

async function renderHome() {
  const { HomePage } = await import('../HomePage');
  return render(
    <MemoryRouter initialEntries={['/zh-CN/overview']}>
      <Routes>
        <Route path="/zh-CN/overview" element={<HomePage />} />
        <Route path="/en-US/overview" element={<HomePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('HomePage language switch', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await i18nReady;
    await i18n.loadLanguages(['zh-CN', 'en-US']);
  });

  beforeEach(async () => {
    window.history.replaceState(null, '', '/zh-CN/overview');
    window.localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    const loopErrors = consoleError.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes('Maximum update depth')
    );
    consoleError.mockRestore();
    expect(loopErrors).toEqual([]);
  });

  // 回归：切换语言后 i18n 包装对象更换，曾让 useLanguage 初始化逻辑与页面的
  // URL 同步互相把语言改回去，触发 React #185（Maximum update depth）。
  it('switches to English from the top-nav language menu', async () => {
    await renderHome();

    fireEvent.click(await screen.findByRole('button', { name: '语言' }));
    fireEvent.click(await screen.findByRole('button', { name: 'English' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/en-US/overview'
      );
      expect(i18n.language).toBe('en-US');
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(i18n.language).toBe('en-US');
  });

  it('switches to English from the language prompt banner', async () => {
    await renderHome();

    const banner = await screen.findByTestId('language-switch-banner');
    fireEvent.change(banner.querySelector('select') as HTMLSelectElement, {
      target: { value: 'en-US' }
    });
    fireEvent.submit(banner.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/en-US/overview'
      );
      expect(i18n.language).toBe('en-US');
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(i18n.language).toBe('en-US');
  });
});
