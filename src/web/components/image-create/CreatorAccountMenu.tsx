import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Globe2,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Puzzle,
  Sparkles,
  Settings,
  Trash2
} from 'lucide-react';
import type { AvatarUserLike } from '@/shared/avatar-utils';
import { UserAvatar } from '@/shared/components/UserAvatar';
import type { SupportedLanguage } from '@/i18n/config';
import { useLanguage } from '@/i18n/hooks/useLanguage';
import { changeTheme, getStoredTheme, type Theme } from '@/utils/theme';
import {
  Button,
  IconButton,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue
} from '@/shared/ui';
import '../../styles/creator-account-menu.css';

export type CreatorAccountMenuCopy = {
  profileFallback: string;
  founderMember: string;
  personalSpace: string;
  pricing: string;
  workspace: string;
  settings: string;
  trash: string;
  installExtension: string;
  contact: string;
  signOut: string;
  language: string;
  languageChinese: string;
  languageEnglish: string;
  theme: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
};

type CreatorAccountMenuProps = {
  placement: 'sidebar' | 'topbar';
  compact?: boolean;
  user: AvatarUserLike | null;
  userName: string;
  memberNumber?: string | null;
  accountStatusLabel?: string;
  creditsTrailingLabel?: string;
  rechargeHref?: string;
  pricingHref: string;
  workspaceHref: string;
  settingsHref: string;
  copy: CreatorAccountMenuCopy;
  onSignOut: () => void | Promise<void>;
};

const HOVER_CLOSE_DELAY = 120;
type AccountMenuOpenReason = 'hover' | 'pointer' | 'keyboard' | 'programmatic';

function mapPathToLocale(pathname: string, language: SupportedLanguage) {
  const prefix = `/${language}`;
  if (pathname === '/zh-CN' || pathname === '/en-US') return prefix;
  if (pathname.startsWith('/zh-CN/')) {
    return pathname.replace('/zh-CN/', `${prefix}/`);
  }
  if (pathname.startsWith('/en-US/')) {
    return pathname.replace('/en-US/', `${prefix}/`);
  }
  return `${prefix}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export function CreatorAccountMenu({
  placement,
  compact = false,
  user,
  userName,
  memberNumber,
  accountStatusLabel,
  creditsTrailingLabel,
  rechargeHref,
  pricingHref,
  workspaceHref,
  settingsHref,
  copy,
  onSignOut
}: CreatorAccountMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    language,
    changeLanguage,
    isLoading: languageLoading
  } = useLanguage();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const closeTimerRef = useRef<number | null>(null);
  const preferenceSelectOpenRef = useRef(false);
  const restoreFocusRef = useRef(false);
  const openReasonRef = useRef<AccountMenuOpenReason>('programmatic');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const email = user?.email || copy.profileFallback;
  const isSidebar = placement === 'sidebar';
  const identityMeta =
    isSidebar && accountStatusLabel ? accountStatusLabel : email;
  const currentLanguage: SupportedLanguage = language?.startsWith('en')
    ? 'en-US'
    : 'zh-CN';

  const cancelScheduledClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    if (preferenceSelectOpenRef.current) return;
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY);
  };

  const handleLanguageChange = async (nextLanguage: SupportedLanguage) => {
    if (languageLoading || nextLanguage === currentLanguage) return;
    await changeLanguage(nextLanguage);
    navigate(
      `${mapPathToLocale(location.pathname, nextLanguage)}${location.search}${location.hash}`,
      { replace: true }
    );
  };

  const handleThemeChange = (nextTheme: Theme) => {
    if (nextTheme === theme) return;
    setTheme(nextTheme);
    changeTheme(nextTheme);
  };

  const handlePreferenceOpenChange = (nextOpen: boolean) => {
    preferenceSelectOpenRef.current = nextOpen;
    cancelScheduledClose();
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (open) setTheme(getStoredTheme());
  }, [open]);

  const handleTriggerPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.pointerType !== 'mouse' || !open) {
      openReasonRef.current = 'pointer';
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && !open) {
      openReasonRef.current = 'keyboard';
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      restoreFocusRef.current = true;
      setOpen(false);
    }
  };

  const sidebarAvatar = (
    <UserAvatar
      user={user}
      name={userName}
      email={user?.email}
      className="create-side-nav-avatar"
      loading="eager"
      fetchPriority="high"
      preload
    />
  );

  const trigger =
    isSidebar && compact ? (
      <IconButton
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="md"
        className="create-side-nav-profile is-compact"
        label={`${userName} · ${identityMeta}`}
        onPointerDown={handleTriggerPointerDown}
        onKeyDown={handleTriggerKeyDown}
        icon={sidebarAvatar}
      />
    ) : isSidebar ? (
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        className="create-side-nav-profile"
        title={identityMeta}
        aria-label={`${userName} · ${identityMeta}`}
        onPointerDown={handleTriggerPointerDown}
        onKeyDown={handleTriggerKeyDown}
        leadingIcon={sidebarAvatar}
        trailingIcon={<Menu size={16} />}
      >
        <span className="create-side-nav-user">
          <strong>{userName}</strong>
          <em>{identityMeta}</em>
        </span>
      </Button>
    ) : (
      <IconButton
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        className="image-create-mininav-profile"
        label={email}
        onPointerDown={handleTriggerPointerDown}
        onKeyDown={handleTriggerKeyDown}
        icon={
          <UserAvatar
            user={user}
            name={userName}
            email={user?.email}
            className="image-create-mininav-avatar"
            loading="eager"
            fetchPriority="high"
            preload
          />
        }
      />
    );

  return (
    <div
      className={
        isSidebar
          ? `create-side-nav-profile-wrap${compact ? ' is-compact' : ''}`
          : 'image-create-mininav-profile-wrap'
      }
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        cancelScheduledClose();
        if (!open) openReasonRef.current = 'hover';
        setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return;
        scheduleClose();
      }}
    >
      <PopoverRoot
        open={open}
        onOpenChange={(nextOpen) => {
          cancelScheduledClose();
          if (nextOpen && openReasonRef.current === 'programmatic') {
            openReasonRef.current = 'pointer';
          }
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          className={
            isSidebar
              ? `create-side-nav-profile-popover${compact ? ' is-compact' : ''}`
              : 'image-create-mininav-profile-popover'
          }
          aria-label={isSidebar ? `${userName} · ${identityMeta}` : email}
          align={isSidebar ? 'start' : 'end'}
          side={isSidebar ? 'top' : 'bottom'}
          sideOffset={isSidebar ? -2 : 10}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            if (openReasonRef.current !== 'keyboard') event.preventDefault();
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') cancelScheduledClose();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') scheduleClose();
          }}
          onEscapeKeyDown={() => {
            restoreFocusRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            if (!restoreFocusRef.current) event.preventDefault();
            restoreFocusRef.current = false;
            openReasonRef.current = 'programmatic';
          }}
        >
          <div className="create-side-nav-popover-head">
            <UserAvatar
              user={user}
              name={userName}
              email={user?.email}
              className="create-side-nav-popover-avatar"
            />
            <span>
              <strong>{userName}</strong>
              <span className="create-side-nav-popover-account-meta">
                <em>{identityMeta}</em>
                {isSidebar && rechargeHref && creditsTrailingLabel && (
                  <Link
                    className="create-side-nav-account-recharge"
                    to={rechargeHref}
                    onClick={() => setOpen(false)}
                  >
                    {creditsTrailingLabel}
                  </Link>
                )}
              </span>
            </span>
          </div>
          {memberNumber && (
            <span className="create-side-nav-founder-badge">
              {copy.founderMember} {memberNumber}
            </span>
          )}
          <div className="creator-account-preferences">
            <div className="creator-account-preference">
              <span className="creator-account-preference-label">
                <Globe2 size={14} />
                {copy.language}
              </span>
              <SelectRoot
                value={currentLanguage}
                disabled={languageLoading}
                onOpenChange={handlePreferenceOpenChange}
                onValueChange={(value) =>
                  void handleLanguageChange(value as SupportedLanguage)
                }
              >
                <SelectTrigger
                  className="creator-account-preference-trigger"
                  aria-label={copy.language}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="creator-account-preference-content">
                  <SelectGroup>
                    <SelectItem value="zh-CN">
                      {copy.languageChinese}
                    </SelectItem>
                    <SelectItem value="en-US">
                      {copy.languageEnglish}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </SelectRoot>
            </div>
            <div className="creator-account-preference">
              <span className="creator-account-preference-label">
                <Monitor size={14} />
                {copy.theme}
              </span>
              <SelectRoot
                value={theme}
                onOpenChange={handlePreferenceOpenChange}
                onValueChange={(value) => handleThemeChange(value as Theme)}
              >
                <SelectTrigger
                  className="creator-account-preference-trigger"
                  aria-label={copy.theme}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="creator-account-preference-content">
                  <SelectGroup>
                    <SelectItem value="light">{copy.themeLight}</SelectItem>
                    <SelectItem value="dark">{copy.themeDark}</SelectItem>
                    <SelectItem value="system">{copy.themeSystem}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
          <Link
            className="creator-account-upgrade"
            to={pricingHref}
            onClick={() => setOpen(false)}
          >
            <Sparkles size={14} />
            {copy.pricing}
          </Link>
          <Link to={settingsHref} onClick={() => setOpen(false)}>
            <Settings size={14} />
            {copy.settings}
          </Link>
          <a
            href={`${workspaceHref}?view=trash`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            <Trash2 size={14} />
            {copy.trash}
          </a>
          <a
            href="https://chromewebstore.google.com/detail/webtomind/fjhopalhpkgfakchpphhonaofimflnon"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            <Puzzle size={14} />
            {copy.installExtension}
          </a>
          <a href="mailto:support@webtomind.com" onClick={() => setOpen(false)}>
            <MessageSquare size={14} />
            {copy.contact}
          </a>
          <Button
            type="button"
            variant="ghost"
            className="danger"
            leadingIcon={<LogOut size={14} />}
            onClick={() => {
              setOpen(false);
              void onSignOut();
            }}
          >
            {copy.signOut}
          </Button>
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}
