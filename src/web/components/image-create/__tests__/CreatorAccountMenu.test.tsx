import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorAccountMenu } from '../CreatorAccountMenu';

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn()
});

const { changeLanguageMock, changeThemeMock } = vi.hoisted(() => ({
  changeLanguageMock: vi.fn(async () => undefined),
  changeThemeMock: vi.fn()
}));

vi.mock('@/i18n/hooks/useLanguage', () => ({
  useLanguage: () => ({
    language: 'zh-CN',
    changeLanguage: changeLanguageMock,
    isLoading: false
  })
}));

vi.mock('@/utils/theme', () => ({
  getStoredTheme: () => 'dark',
  changeTheme: changeThemeMock
}));

const copy = {
  profileFallback: '个人资料',
  founderMember: '创始成员',
  personalSpace: '个人空间',
  pricing: '升级',
  workspace: '工作台',
  settings: '个人设置',
  trash: '回收站',
  installExtension: '安装插件',
  contact: '联系我们',
  signOut: '退出登录',
  language: '语言',
  languageChinese: '简体中文',
  languageEnglish: 'English',
  theme: '主题',
  themeLight: '浅色',
  themeDark: '深色',
  themeSystem: '跟随系统'
};

function renderMenu(
  placement: 'sidebar' | 'topbar' = 'sidebar',
  compact = false
) {
  return render(
    <MemoryRouter>
      <CreatorAccountMenu
        placement={placement}
        compact={compact}
        user={{
          id: 'account-test',
          email: 'creator@example.com',
          user_metadata: { name: 'Creator' }
        }}
        userName="Creator"
        memberNumber="001"
        accountStatusLabel="1,280 积分"
        creditsTrailingLabel="充值"
        rechargeHref="/zh-CN/recharge?source=creator_account_menu"
        pricingHref="/zh-CN/pricing?source=creator_account_menu"
        workspaceHref="/boards"
        settingsHref="/settings"
        copy={copy}
        onSignOut={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('CreatorAccountMenu', () => {
  afterEach(() => {
    vi.useRealTimers();
    changeLanguageMock.mockClear();
    changeThemeMock.mockClear();
  });

  it('keeps sidebar avatar, identity and trailing menu in separate slots', () => {
    const { container } = renderMenu();
    const trigger = screen.getByRole('button', {
      name: /Creator\s*·\s*1,280 积分/i
    });

    expect(trigger.querySelectorAll(':scope > .ui-button__icon')).toHaveLength(
      2
    );
    expect(
      trigger.querySelector(':scope > .ui-button__label')
    ).toHaveTextContent('Creator1,280 积分');
    expect(container.querySelector('.create-side-nav-avatar')).not.toBeNull();
  });

  it('renders a dedicated avatar-only trigger for the collapsed sidebar', () => {
    const { container } = renderMenu('sidebar', true);
    const trigger = screen.getByRole('button', {
      name: 'Creator · 1,280 积分'
    });

    expect(trigger).toHaveClass('create-side-nav-profile', 'is-compact');
    expect(trigger).toHaveClass('ui-icon-button');
    expect(trigger.querySelector('.create-side-nav-user')).toBeNull();
    expect(trigger.querySelector('.lucide-menu')).toBeNull();
    expect(container.querySelector('.create-side-nav-avatar')).not.toBeNull();
  });

  it('opens on mouse hover and closes after the shared intent delay', async () => {
    vi.useFakeTimers();
    const { container } = renderMenu();
    const wrapper = container.querySelector('.create-side-nav-profile-wrap');
    const trigger = screen.getByRole('button', {
      name: /Creator\s*·\s*1,280 积分/i
    });
    expect(wrapper).not.toBeNull();

    act(() => trigger.focus());
    act(() => {
      fireEvent.pointerEnter(wrapper as Element, { pointerType: 'mouse' });
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('个人空间')).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.pointerLeave(wrapper as Element, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(119));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps focus passive, opens with Enter and returns focus after Escape', async () => {
    renderMenu('topbar');
    const trigger = screen.getByRole('button', {
      name: 'creator@example.com'
    });

    act(() => trigger.focus());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('个人空间')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(
      async () => await new Promise((resolve) => window.setTimeout(resolve, 0))
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('opens with Space and does not steal focus for touch activation', async () => {
    renderMenu('topbar');
    const trigger = screen.getByRole('button', {
      name: 'creator@example.com'
    });

    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: ' ' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('个人空间')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(
      async () => await new Promise((resolve) => window.setTimeout(resolve, 0))
    );

    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('个人空间')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('restores language and theme controls in the shared menu', async () => {
    const { container } = renderMenu('sidebar');
    const wrapper = container.querySelector('.create-side-nav-profile-wrap');
    fireEvent.pointerEnter(wrapper as Element, { pointerType: 'mouse' });

    const languageSelect = await screen.findByRole('combobox', {
      name: '语言'
    });
    const themeSelect = screen.getByRole('combobox', { name: '主题' });
    expect(languageSelect).toHaveTextContent('简体中文');
    expect(themeSelect).toHaveTextContent('深色');

    fireEvent.click(themeSelect);
    const lightOption = await screen.findByRole('option', { name: '浅色' });
    fireEvent.pointerDown(lightOption);
    fireEvent.click(lightOption);
    expect(changeThemeMock).toHaveBeenCalledWith('light');

    fireEvent.click(languageSelect);
    const englishOption = await screen.findByRole('option', {
      name: 'English'
    });
    await act(async () => {
      fireEvent.pointerDown(englishOption);
      fireEvent.click(englishOption);
      await Promise.resolve();
    });
    expect(changeLanguageMock).toHaveBeenCalledWith('en-US');
  });

  it('keeps credits compact and links directly to recharge', async () => {
    const { container } = renderMenu('sidebar');
    const wrapper = container.querySelector('.create-side-nav-profile-wrap');
    fireEvent.pointerEnter(wrapper as Element, { pointerType: 'mouse' });

    const dialog = await screen.findByRole('dialog', {
      name: 'Creator · 1,280 积分'
    });
    expect(within(dialog).getByText('1,280 积分')).toBeInTheDocument();
    expect(screen.queryByTestId('credits-display')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '充值' })).toHaveAttribute(
      'href',
      '/zh-CN/recharge?source=creator_account_menu'
    );
    expect(within(dialog).getByRole('link', { name: '升级' })).toHaveAttribute(
      'href',
      '/zh-CN/pricing?source=creator_account_menu'
    );
    expect(within(dialog).queryByRole('link', { name: '工作台' })).toBeNull();
  });

  it('keeps the upgrade entry visible for member accounts', async () => {
    const { container } = renderMenu('sidebar');
    const wrapper = container.querySelector('.create-side-nav-profile-wrap');
    fireEvent.pointerEnter(wrapper as Element, { pointerType: 'mouse' });

    const dialog = await screen.findByRole('dialog', {
      name: 'Creator · 1,280 积分'
    });
    expect(within(dialog).getByText('创始成员 001')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '升级' })).toHaveAttribute(
      'href',
      '/zh-CN/pricing?source=creator_account_menu'
    );
  });
});
