import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';
import { CreateSideNav } from '../CreateSideNav';

const authState = vi.hoisted(() => ({
  user: null as null | {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  },
  isAuthenticated: false
}));

const imageSessionState = vi.hoisted(() => ({
  lastArgs: [] as unknown[],
  sessions: [] as Array<{
    id: string;
    title: string;
    status: 'active' | 'archived';
    coverGenerationId?: string;
    coverImageUrl?: string;
    createdAt: string;
    updatedAt: string;
  }>
}));

const workspaceUserState = vi.hoisted(() => ({
  profile: null as null | { member_number_formatted?: string },
  credits: null as null | { total: number },
  subscription: null as null | { planName: string; status: string }
}));

const deleteImageSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    signOut: vi.fn()
  })
}));

vi.mock('@/workspace/hooks/useWorkspaceUser', () => ({
  useWorkspaceUser: () => workspaceUserState
}));

vi.mock('@/workspace/components/CreditsDisplay', () => ({
  CreditsDisplay: ({
    compact,
    className,
    totalCredits
  }: {
    compact?: boolean;
    className?: string;
    totalCredits?: number | null;
  }) => (
    <div
      data-testid="credits-display"
      data-compact={String(Boolean(compact))}
      data-total={totalCredits ?? ''}
      className={className}
    />
  )
}));

vi.mock('@/i18n/hooks/useLanguage', () => ({
  useLanguage: () => ({
    language: 'zh-CN',
    changeLanguage: vi.fn(),
    isLoading: false
  })
}));

vi.mock('../useImageCreationSessions', () => ({
  useImageCreationSessions: (...args: unknown[]) => {
    imageSessionState.lastArgs = args;
    return imageSessionState.sessions;
  }
}));

vi.mock('@/services/create-workspace-v2-api', () => ({
  deleteImageSession: deleteImageSessionMock
}));

function getTopLevelNavLabels(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('.create-side-nav-scroll .ui-navigation-link')
  ).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '');
}

function getTopLevelNavEntry(container: HTMLElement, label: string) {
  return Array.from(
    container.querySelectorAll('.create-side-nav-scroll .ui-navigation-link')
  ).find((node) => node.textContent?.replace(/\s+/g, ' ').trim() === label);
}

describe('CreateSideNav prompt library entry hierarchy', () => {
  beforeEach(() => {
    authState.user = null;
    authState.isAuthenticated = false;
    imageSessionState.sessions = [];
    imageSessionState.lastArgs = [];
    workspaceUserState.profile = null;
    workspaceUserState.credits = null;
    workspaceUserState.subscription = null;
    deleteImageSessionMock.mockReset();
    deleteImageSessionMock.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps pricing returnTo stable instead of nesting the paywall URL', () => {
    expect(
      collapsePaywallReturnTo(
        '/zh-CN/create/pricing',
        '?source=creator_sidebar&returnTo=%2Fzh-CN%2Fimage',
        '',
        '/zh-CN/image'
      )
    ).toBe('/zh-CN/image');

    expect(
      collapsePaywallReturnTo(
        '/zh-CN/create/pricing',
        '?source=creator_sidebar&returnTo=%2Fzh-CN%2Fcreate%2Fpricing%3Fsource%3Dcreator_sidebar',
        '',
        '/zh-CN/image'
      )
    ).toBe('/zh-CN/image');
  });

  it('keeps the collapsed account rail compact and exposes a lightweight recharge link', async () => {
    authState.user = {
      email: 'admin@example.com',
      user_metadata: { name: 'Zhong' }
    };
    authState.isAuthenticated = true;
    workspaceUserState.credits = { total: 1280 };
    workspaceUserState.subscription = { planName: 'free', status: 'active' };

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '收起左侧导航' }));

    expect(screen.queryByTestId('credits-display')).toBeNull();
    expect(container.querySelector('.create-side-nav-upgrade')).not.toBeNull();
    expect(container.querySelector('.create-side-nav-profile')).toHaveClass(
      'is-compact'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zhong · Free' }));
    expect(screen.queryByTestId('credits-display')).toBeNull();
    expect(await screen.findByRole('link', { name: '充值' })).toHaveAttribute(
      'href',
      '/zh-CN/recharge?source=creator_account_menu&returnTo=%2Fzh-CN%2Fimage'
    );
    expect(screen.queryByRole('link', { name: '工作台' })).toBeNull();
  });

  it('keeps session thumbnails visible when the desktop navigation collapses', () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    imageSessionState.sessions = [
      {
        id: 'session-1',
        title: 'Untitled',
        status: 'active',
        coverGenerationId: 'generation-1',
        coverImageUrl: 'https://example.com/session-1.jpg',
        createdAt: '2026-07-17T08:00:00.000Z',
        updatedAt: '2026-07-17T08:00:00.000Z'
      },
      {
        id: 'session-2',
        title: 'Frog Racecar Driver',
        status: 'active',
        coverGenerationId: 'generation-2',
        coverImageUrl: 'https://example.com/session-2.jpg',
        createdAt: '2026-07-17T07:00:00.000Z',
        updatedAt: '2026-07-17T07:00:00.000Z'
      }
    ];

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image?sessionId=session-1']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const sessionSection = container.querySelector('.create-side-nav-sessions');
    const sessionCards = container.querySelectorAll(
      '.create-side-nav-session-card'
    );
    expect(sessionSection).not.toHaveClass('is-collapsed');
    expect(screen.getByText('新建会话')).toBeInTheDocument();
    expect(sessionCards).toHaveLength(2);
    expect(sessionCards[0]).toHaveClass('is-active');
    expect(sessionCards[0].querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/session-1.jpg'
    );
    expect(screen.queryByText('历史生成')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '收起左侧导航' }));

    expect(sessionSection).toHaveClass('is-collapsed');
    expect(sessionCards).toHaveLength(2);
    expect(sessionCards[0]).toHaveAttribute('aria-label', 'Untitled');
    expect(sessionCards[1]).toHaveAttribute(
      'aria-label',
      'Frog Racecar Driver'
    );
  });

  it('collapses and expands the session list from the session heading', () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    imageSessionState.sessions = [
      {
        id: 'session-1',
        title: 'Toggleable session',
        status: 'active',
        coverGenerationId: 'generation-1',
        coverImageUrl: 'https://example.com/session-1.jpg',
        createdAt: '2026-07-17T08:00:00.000Z',
        updatedAt: '2026-07-17T08:00:00.000Z'
      }
    ];

    render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const collapseSessions = screen.getByRole('button', {
      name: '收起创作会话'
    });
    expect(collapseSessions).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Toggleable session')).toBeVisible();

    fireEvent.click(collapseSessions);

    expect(
      screen.getByRole('button', { name: '展开创作会话' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Toggleable session')).toBeNull();
    expect(screen.getByRole('link', { name: '新建图像会话' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '展开创作会话' }));

    expect(screen.getByText('Toggleable session')).toBeVisible();
    expect(
      screen.getByRole('button', { name: '收起创作会话' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps authenticated sessions mounted outside the image route', () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    imageSessionState.sessions = [
      {
        id: 'session-1',
        title: 'Always visible session',
        status: 'active',
        coverGenerationId: 'generation-1',
        coverImageUrl: 'https://example.com/session-1.jpg',
        createdAt: '2026-07-17T08:00:00.000Z',
        updatedAt: '2026-07-17T08:00:00.000Z'
      }
    ];

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/moodboards']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(container.querySelector('.create-side-nav-sessions')).toBeVisible();
    expect(screen.getByText('Always visible session')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Always visible session' })
    ).not.toHaveClass('is-active');
    expect(screen.queryByText('历史生成')).not.toBeInTheDocument();
  });

  it('reuses the session rail for video sessions on the video route', () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    imageSessionState.sessions = [
      {
        id: 'video-session-1',
        title: '城市夜景运镜',
        status: 'active',
        coverGenerationId: 'video-generation-1',
        coverImageUrl: 'https://example.com/video-poster.jpg',
        createdAt: '2026-07-23T08:00:00.000Z',
        updatedAt: '2026-07-23T08:00:00.000Z'
      }
    ];

    render(
      <MemoryRouter initialEntries={['/zh-CN/video?sessionId=video-session-1']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(imageSessionState.lastArgs[3]).toBe('video');
    expect(screen.getByRole('link', { name: '新建视频会话' })).toHaveAttribute(
      'href',
      '/zh-CN/video?newSession=1'
    );
    expect(screen.getByRole('link', { name: '城市夜景运镜' })).toHaveAttribute(
      'href',
      '/zh-CN/video?sessionId=video-session-1'
    );
  });

  it('opens a session action menu and deletes the owned session after confirmation', async () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    imageSessionState.sessions = [
      {
        id: 'session-1',
        title: 'Horsea',
        status: 'active',
        coverGenerationId: 'generation-1',
        coverImageUrl: 'https://example.com/session-1.jpg',
        createdAt: '2026-07-17T08:00:00.000Z',
        updatedAt: '2026-07-17T08:00:00.000Z'
      }
    ];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/zh-CN/image?sessionId=session-1']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const trigger = screen.getByRole('button', {
      name: '更多操作：Horsea'
    });
    // DropdownMenu 触发器在 pointerdown 时打开（与真实鼠标行为一致）
    fireEvent.pointerDown(trigger, { button: 0 });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('menuitem', { name: '打开会话' })
    ).toHaveAttribute('href', '/zh-CN/image?sessionId=session-1');

    fireEvent.click(screen.getByRole('menuitem', { name: '删除会话' }));

    await waitFor(() => {
      expect(deleteImageSessionMock).toHaveBeenCalledWith('session-1');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      '删除这个创作会话？会话中的对话记录也会一起删除。'
    );
    confirmSpy.mockRestore();
  });

  it('localizes Moodboards and removes the separate Workspace and Saved entries', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const labels = getTopLevelNavLabels(container);
    expect(labels).toContain('情绪板');
    expect(labels).not.toContain('Moodboards');
    expect(labels).not.toContain('收藏');
    expect(labels).not.toContain('工作台');
    expect(labels).not.toContain('案例管理');
    expect(getTopLevelNavEntry(container, '提示词库')).toHaveAttribute(
      'href',
      '/zh-CN/prompts'
    );
  });

  it('renders Case admin as the final first-level entry for admins only', () => {
    authState.user = { email: 'admin@example.com', user_metadata: {} };
    authState.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const labels = getTopLevelNavLabels(container);
    expect(labels).not.toContain('收藏');
    expect(labels).not.toContain('工作台');
    expect(labels.at(-1)).toBe('案例管理');
  });

  it('groups primary and tool entries while keeping upgrade inside the account menu', async () => {
    authState.user = {
      id: 'admin-user',
      email: 'admin@example.com',
      user_metadata: {}
    };
    authState.isAuthenticated = true;
    workspaceUserState.credits = { total: 100 };
    workspaceUserState.subscription = { planName: 'free', status: 'active' };

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const groups = Array.from(
      container.querySelectorAll('.create-side-nav-group')
    );
    expect(groups).toHaveLength(2);
    expect(
      groups.map((group) =>
        group.querySelector('.create-side-nav-group-label')?.textContent?.trim()
      )
    ).toEqual([undefined, '工具']);
    expect(
      container.querySelector('#create-side-nav-group-default')
    ).toBeNull();
    expect(groups[0]).toHaveAttribute('aria-label', '默认');
    expect(
      Array.from(groups[0].querySelectorAll('.ui-navigation-link')).map(
        (node) => node.textContent?.replace(/\s+/g, ' ').trim()
      )
    ).toEqual(['灵感', '情绪板', '角色Beta', '资产库']);
    expect(
      Array.from(groups[1].querySelectorAll('.ui-navigation-link')).map(
        (node) => node.textContent?.replace(/\s+/g, ' ').trim()
      )
    ).toEqual([
      '图像创作',
      '视频创作Beta',
      '图片编辑',
      '提示词库',
      '应用',
      '模型广场',
      '令牌管理',
      '博客',
      '案例管理'
    ]);
    expect(getTopLevelNavEntry(container, '模型广场')).toHaveAttribute(
      'href',
      '/zh-CN/models'
    );
    expect(getTopLevelNavEntry(container, '令牌管理')).toHaveAttribute(
      'href',
      '/zh-CN/api-console'
    );

    const accountActions = container.querySelector(
      '.create-side-nav-account-actions'
    );
    const referralTrigger = accountActions?.querySelector(
      '.create-side-nav-referral-trigger'
    );
    expect(referralTrigger).not.toBeNull();
    expect(referralTrigger?.textContent).toContain('赚取 1,100 积分');
    expect(
      accountActions?.querySelector('.create-side-nav-upgrade')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '.create-side-nav-scroll a[href="/zh-CN/create/tasks"]'
      )
    ).toBeNull();
    expect(screen.getByRole('link', { name: /升级省 30%/ })).toHaveAttribute(
      'href',
      '/zh-CN/create/pricing?source=creator_sidebar&returnTo=%2Fzh-CN%2Fimage'
    );
  });

  it('shows the API model plaza and console to any authenticated user (full launch)', () => {
    authState.user = { id: 'regular-user', email: 'user@example.com' };
    authState.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(getTopLevelNavLabels(container)).toContain('模型广场');
    expect(getTopLevelNavLabels(container)).toContain('令牌管理');
  });

  it('keeps the API model plaza visible to guests while the console stays hidden', () => {
    authState.user = null;
    authState.isAuthenticated = false;

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(getTopLevelNavLabels(container)).toContain('模型广场');
    expect(getTopLevelNavLabels(container)).not.toContain('令牌管理');
  });

  it('hides video and apps until the first image is activated', async () => {
    authState.user = { id: 'new-user', email: '', user_metadata: {} };
    authState.isAuthenticated = true;
    window.localStorage.setItem(
      'webtomind:create-workspace-feature-flags',
      JSON.stringify(['activation_journey_v1'])
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              tasks: [
                {
                  identifier: 'generate_first_commercial_image',
                  is_completed: false
                }
              ]
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
      )
    );

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    await waitFor(() => {
      const labels = getTopLevelNavLabels(container);
      expect(labels).not.toContain('视频创作Beta');
      expect(labels).not.toContain('应用');
    });
  });

  it('reveals video and apps after the activation truth flips', async () => {
    authState.user = { id: 'active-user', email: '', user_metadata: {} };
    authState.isAuthenticated = true;
    window.localStorage.setItem(
      'webtomind:create-workspace-feature-flags',
      JSON.stringify(['activation_journey_v1'])
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              tasks: [
                {
                  identifier: 'generate_first_commercial_image',
                  is_completed: true
                }
              ]
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          )
      )
    );

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    await waitFor(() => {
      const labels = getTopLevelNavLabels(container);
      expect(labels).toContain('视频创作Beta');
      expect(labels).toContain('应用');
    });
  });

  it('hides the persistent banner but keeps account-menu upgrade for paid users', async () => {
    authState.user = {
      email: 'paid@webtomind.test',
      user_metadata: { name: 'Paid Creator' }
    };
    authState.isAuthenticated = true;
    workspaceUserState.credits = { total: 4321 };
    workspaceUserState.subscription = { planName: 'pro', status: 'active' };

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(container.querySelector('.create-side-nav-upgrade')).toBeNull();
    const trigger = screen.getByRole('button', {
      name: /Paid Creator.*4\.3k 积分/i
    });
    expect(trigger).toHaveTextContent('4.3k 积分');

    fireEvent.click(trigger);
    expect(screen.queryByTestId('credits-display')).toBeNull();
    expect(await screen.findByRole('link', { name: '充值' })).toHaveAttribute(
      'href',
      '/zh-CN/recharge?source=creator_account_menu&returnTo=%2Fzh-CN%2Fimage'
    );
    expect(screen.getByRole('link', { name: '升级' })).toHaveAttribute(
      'href',
      '/zh-CN/create/pricing?source=creator_sidebar&returnTo=%2Fzh-CN%2Fimage'
    );
  });

  it('does not render a passed Case admin item for non-admin users', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/prompts']}>
        <CreateSideNav
          promptLibraryAdminItem={{
            key: 'admin',
            label: '案例管理',
            href: '/zh-CN/prompts/admin',
            active: false
          }}
        />
      </MemoryRouter>
    );

    expect(getTopLevelNavLabels(container)).not.toContain('案例管理');
  });

  it('does not expose a separate Saved entry on the workspace favorites URL', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/prompts?view=favorites']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(getTopLevelNavEntry(container, '提示词库')).toHaveClass('active');
    expect(getTopLevelNavEntry(container, '收藏')).toBeUndefined();
    expect(container.querySelector('.create-side-nav-submenu')).toBeNull();
  });

  it('opens the authenticated profile popover and restores focus on Escape', async () => {
    authState.user = {
      email: 'e2e@webtomind.test',
      user_metadata: { name: 'E2E User' }
    };
    authState.isAuthenticated = true;
    workspaceUserState.credits = { total: 100 };
    workspaceUserState.subscription = { planName: 'free', status: 'active' };

    render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    const trigger = screen.getByRole('button', {
      name: /E2E User.*Free/i
    });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('dialog', { name: 'E2E User · Free' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });
  });

  it('does not flash a Free account label while account data is unresolved', () => {
    authState.user = {
      email: 'loading@webtomind.test',
      user_metadata: { name: 'Loading Creator' }
    };
    authState.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/zh-CN/image']}>
        <CreateSideNav />
      </MemoryRouter>
    );

    expect(container.querySelector('.create-side-nav-upgrade')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Loading Creator · —' })
    ).toBeVisible();
    expect(screen.queryByText('Free')).toBeNull();
  });
});
