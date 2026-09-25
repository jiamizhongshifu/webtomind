import {
  Film,
  House,
  Image,
  Images,
  Settings,
  Sparkles,
  UserRound,
  WandSparkles
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './prompt-library-shell-nav.css';

type PromptLibraryNavItem = {
  id: string;
  href: string;
  label: string;
  icon: typeof House;
};

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
}

function isActiveItem(id: string, pathname: string): boolean {
  const normalized = stripLocale(pathname);
  if (id === 'prompts') {
    return (
      normalized === '/prompts' ||
      normalized === '/video-prompts' ||
      normalized.startsWith('/prompts/')
    );
  }
  if (id === 'home') return normalized === '/create';
  if (id === 'account') {
    return (
      normalized.startsWith('/account') || normalized.startsWith('/settings')
    );
  }
  return normalized.startsWith(`/${id}`);
}

export function PromptLibraryShellNav({
  locale,
  isZh,
  showPromptAdmin = false
}: {
  locale: 'zh-CN' | 'en-US';
  isZh: boolean;
  showPromptAdmin?: boolean;
}) {
  const { pathname } = useLocation();
  const prefix = `/${locale}`;
  const items: PromptLibraryNavItem[] = [
    {
      id: 'home',
      href: `${prefix}/create`,
      label: isZh ? '首页' : 'Home',
      icon: House
    },
    {
      id: 'prompts',
      href: `${prefix}/prompts`,
      label: isZh ? '提示词库' : 'Prompts',
      icon: Sparkles
    },
    {
      id: 'image',
      href: `${prefix}/image`,
      label: isZh ? '图像创作' : 'Image',
      icon: Image
    },
    {
      id: 'video',
      href: `${prefix}/video`,
      label: isZh ? '视频创作' : 'Video',
      icon: Film
    },
    {
      id: 'gallery',
      href: `${prefix}/gallery`,
      label: isZh ? '资产库' : 'Gallery',
      icon: Images
    },
    {
      id: 'account',
      href: `${prefix}/account`,
      label: isZh ? '账户' : 'Account',
      icon: UserRound
    }
  ];

  return (
    <>
      <aside
        className="prompt-library-shell-nav"
        aria-label={
          isZh ? 'Prompt 与创作导航' : 'Prompt and creation navigation'
        }
      >
        <Link className="prompt-library-shell-brand" to={`${prefix}/create`}>
          <span className="prompt-library-shell-brand-mark" aria-hidden="true">
            W
          </span>
          <span>WebToMind</span>
        </Link>

        <nav className="prompt-library-shell-links">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActiveItem(item.id, pathname);
            return (
              <Link
                key={item.id}
                to={item.href}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {showPromptAdmin ? (
            <Link to={`${prefix}/prompts/admin`}>
              <Settings aria-hidden="true" />
              <span>{isZh ? '案例管理' : 'Manage cases'}</span>
            </Link>
          ) : null}
        </nav>

        <Link
          className="prompt-library-shell-create"
          to={`${prefix}/image?source=prompt_library_nav`}
        >
          <WandSparkles aria-hidden="true" />
          <span>{isZh ? '开始创作' : 'Start creating'}</span>
        </Link>
      </aside>

      <nav
        className="prompt-library-mobile-nav"
        aria-label={
          isZh ? '移动端 Prompt 与创作导航' : 'Mobile prompt navigation'
        }
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActiveItem(item.id, pathname);
          return (
            <Link
              key={item.id}
              to={item.href}
              className={active ? 'active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
