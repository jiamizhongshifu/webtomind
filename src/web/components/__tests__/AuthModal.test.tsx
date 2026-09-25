import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModalProvider, AuthRouteModalLauncher } from '../AuthModal';

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithMicrosoft: vi.fn()
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    signInWithEmail: authState.signInWithEmail,
    signUpWithEmail: authState.signUpWithEmail,
    signInWithGoogle: authState.signInWithGoogle,
    signInWithMicrosoft: authState.signInWithMicrosoft
  })
}));

vi.mock('../../lib/analytics', () => ({
  getAuthRedirectContext: () => 'account',
  trackEvent: vi.fn(),
  trackLoginStart: vi.fn(),
  trackSignupStart: vi.fn()
}));

vi.mock('react-i18next', () => {
  const translations: Record<string, string> = {
    'login.title': '欢迎回来',
    'login.subtitle': '继续你的创意工作流',
    'register.title': '创建账户',
    'register.subtitle': '创建 WebToMind 账户',
    'login.extensionSync': '登录后同步插件数据',
    'login.continueWithGoogle': '使用 Google 继续',
    'login.continueWithMicrosoft': '使用 Microsoft 继续',
    'login.continueWithEmail': '继续使用邮箱',
    'login.back': '返回',
    'login.or': '或',
    'login.emailPlaceholder': '邮箱地址',
    'login.passwordPlaceholder': '密码',
    'login.submitting': '提交中',
    'login.submit': '登录',
    'login.noAccount': '还没有账户？',
    'login.signUp': '注册',
    'login.close': '关闭登录弹窗',
    'register.submit': '创建账户',
    'register.hasAccount': '已有账户？',
    'register.signIn': '登录',
    'register.inviteCodePlaceholder': '邀请码',
    'register.agreeTerms': '注册即代表同意',
    'register.termsOfService': '服务条款',
    'register.and': '和',
    'register.privacyPolicy': '隐私政策',
    'success.registerSuccess': '注册成功，请检查邮箱。'
  };

  return {
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) =>
        translations[key] || options?.defaultValue || key
    })
  };
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="current path">
      {location.pathname}
      {location.search}
    </output>
  );
}

function PromptLibraryStub() {
  return (
    <main>
      <h1>AI 图片 Prompt 案例库</h1>
      <a href="/login?redirect=/account&source=prompt_nav">登录</a>
      <LocationProbe />
    </main>
  );
}

function renderAuthModalRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthModalProvider>
        <Routes>
          <Route path="/login" element={<AuthRouteModalLauncher />} />
          <Route path="/zh-CN/login" element={<AuthRouteModalLauncher />} />
          <Route path="/zh-CN/prompts" element={<PromptLibraryStub />} />
          <Route path="/account" element={<div>account page</div>} />
          <Route path="/create" element={<div>create discovery page</div>} />
        </Routes>
      </AuthModalProvider>
    </MemoryRouter>
  );
}

describe('AuthModal login routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.signInWithEmail.mockResolvedValue({ error: null });
    authState.signUpWithEmail.mockResolvedValue({ error: null });
    authState.signInWithGoogle.mockResolvedValue({ error: null });
    authState.signInWithMicrosoft.mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

  it('turns the login route into a modal over the public prompt library', async () => {
    renderAuthModalRoute('/login?redirect=/account');

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector('.auth-modal-layout')).toBeInTheDocument();
    expect(dialog.querySelector('.auth-modal-form-pane')).toBeInTheDocument();
    expect(dialog.querySelector('.auth-modal-art img')).toHaveAttribute(
      'src',
      '/create-apps/character-creator.webp'
    );
    expect(
      screen.getByRole('heading', { name: '欢迎回来' })
    ).toBeInTheDocument();
    expect(screen.getByText('AI 图片 Prompt 案例库')).toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent(
      '/zh-CN/prompts'
    );
  });

  it('intercepts login links and submits email login without leaving the page first', async () => {
    renderAuthModalRoute('/zh-CN/prompts');

    fireEvent.click(screen.getByRole('link', { name: '登录' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent(
      '/zh-CN/prompts'
    );

    fireEvent.click(screen.getByRole('button', { name: '继续使用邮箱' }));
    fireEvent.change(screen.getByLabelText(/邮箱地址/), {
      target: { value: 'creator@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/密码/), {
      target: { value: 'secret123' }
    });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(authState.signInWithEmail).toHaveBeenCalledWith(
        'creator@example.com',
        'secret123'
      );
    });
    expect(await screen.findByText('account page')).toBeInTheDocument();
  });

  it('collapses the email form behind the Continue with Email step', async () => {
    renderAuthModalRoute('/login');

    const dialog = await screen.findByRole('dialog');
    expect(
      dialog.querySelector('.auth-modal-email-toggle')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/邮箱地址/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '继续使用邮箱' }));

    expect(screen.getByLabelText(/邮箱地址/)).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/)).toBeInTheDocument();
    expect(
      dialog.querySelector('.auth-modal-email-toggle')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回' }));

    expect(
      dialog.querySelector('.auth-modal-email-toggle')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/邮箱地址/)).not.toBeInTheDocument();
  });

  it('preserves extension context before starting Google OAuth from the modal', async () => {
    renderAuthModalRoute('/login?from=extension');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '使用 Google 继续' }));

    await waitFor(() => {
      expect(authState.signInWithGoogle).toHaveBeenCalledTimes(1);
    });
    expect(sessionStorage.getItem('webtomind:auth-from-extension')).toBe('1');
  });

  it('starts Microsoft OAuth from the modal', async () => {
    renderAuthModalRoute('/login');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '使用 Microsoft 继续' })
    );

    await waitFor(() => {
      expect(authState.signInWithMicrosoft).toHaveBeenCalledTimes(1);
    });
  });

  it('sends an already authenticated generic login visit to creation discovery', async () => {
    authState.isAuthenticated = true;
    renderAuthModalRoute('/login');

    expect(await screen.findByText('create discovery page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
