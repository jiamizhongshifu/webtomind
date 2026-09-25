import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gift,
  Home,
  Image,
  Megaphone,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '@/workspace/components/Logo';
import { useWorkspaceUser } from '@/workspace/hooks/useWorkspaceUser';
import { formatCredits } from '@/services/credits-api';
import { isFreePlanName } from '@/shared/credit-policy';
import { isImageToolRoute } from '@/shared/image-tool-routes';
import { collapsePaywallReturnTo } from '@/shared/paywall-return-to';
import {
  createNavItems,
  localizeCreateHref,
  type CreateNavItem
} from '../../data/create-workspace';
import {
  Button,
  DynamicIcon,
  type DynamicIconHandle,
  IconButton,
  IconLink,
  Navigation,
  NavigationLink,
  useOverlayBehavior
} from '@/shared/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/ui/radix/dropdown-menu';
import { deleteImageSession } from '@/services/create-workspace-v2-api';
import { CreatorAccountMenu } from './CreatorAccountMenu';
import { ReferralInviteDialog } from './ReferralInviteDialog';
import { TARGET_YEARLY_DISCOUNT_PERCENT } from '@/shared/pricing-catalog';
import { REFERRAL_TOTAL_INVITER_REWARD_CREDITS } from '@/shared/referral-rewards';
import {
  CREATE_WORKSPACE_FEATURE_FLAGS,
  type ImageCreationSession
} from '@/shared/create-workspace-v2';
import { isCreateWorkspaceFeatureEnabled } from '../../lib/create-workspace-flags';
import { useActivationStatus } from '../../lib/use-activation-status';
import { useImageCreationSessions } from './useImageCreationSessions';
import './CreateSideNavSessions.css';
import './CreateSideNavUpgrade.css';

function getLocalePrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  if (pathname.startsWith('/en-US')) return '/en-US';
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  return '';
}

function stripLocale(pathname: string): string {
  if (pathname.startsWith('/zh-CN'))
    return pathname.slice('/zh-CN'.length) || '/';
  if (pathname.startsWith('/en-US'))
    return pathname.slice('/en-US'.length) || '/';
  return pathname;
}

function isActiveNav(itemHref: string, pathname: string): boolean {
  const normalized = stripLocale(pathname);
  if (itemHref === '/create') return normalized === '/create';
  if (itemHref === '/apps') {
    return (
      normalized === '/apps' ||
      normalized.startsWith('/apps/') ||
      (isImageToolRoute(normalized) && normalized !== '/tools/image-editor')
    );
  }
  if (itemHref === '/use-cases') {
    return (
      normalized === '/use-cases' ||
      normalized.startsWith('/use-cases/') ||
      normalized === '/blog' ||
      normalized.startsWith('/blog/')
    );
  }
  if (itemHref === '/boards') {
    return (
      normalized.startsWith('/create/boards') ||
      normalized.startsWith('/boards')
    );
  }
  return normalized === itemHref || normalized.startsWith(`${itemHref}/`);
}

function isActiveMobileNav(id: string, pathname: string): boolean {
  const normalized = stripLocale(pathname);
  if (id === 'home') return normalized === '/create';
  if (id === 'apps') {
    return (
      normalized.startsWith('/apps') ||
      (isImageToolRoute(normalized) && normalized !== '/tools/image-editor')
    );
  }
  if (id === 'useCases') {
    return (
      normalized === '/use-cases' ||
      normalized.startsWith('/use-cases/') ||
      normalized === '/blog' ||
      normalized.startsWith('/blog/')
    );
  }
  if (id === 'moodboards') return normalized.startsWith('/moodboards');
  if (id === 'image') return normalized.startsWith('/image');
  if (id === 'video') return normalized.startsWith('/video');
  if (id === 'gallery') return normalized.startsWith('/gallery');
  if (id === 'account') {
    return (
      normalized.startsWith('/account') || normalized.startsWith('/settings')
    );
  }
  return false;
}

const CREATE_SIDE_NAV_COPY = {
  zh: {
    ariaLabel: '创作导航',
    mobileItems: {
      home: '首页',
      apps: '应用',
      apiModels: '模型广场',
      useCases: '博客',
      moodboards: '情绪板',
      image: '图像创作',
      video: '视频',
      gallery: '资产库',
      account: '账户'
    },
    navItems: {
      inspiration: '灵感',
      promptLibrary: '提示词库',
      moodboards: '情绪板',
      workspace: '工作台',
      image: '图像创作',
      video: '视频创作',
      imageEdit: '图片编辑',
      gallery: '资产库',
      characters: '角色',
      apps: '应用',
      apiModels: '模型广场',
      apiConsole: '令牌管理',
      useCases: '博客',
      tasks: '积分与任务',
      favorites: '收藏',
      promptAdmin: '案例管理'
    },
    navGroups: {
      default: '默认',
      tools: '工具'
    },
    creditSuffix: '积分',
    creditTrailing: '充值',
    profileFallback: '个人资料',
    xOfficial: 'WebToMind 官方 X',
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
    themeSystem: '跟随系统',
    signIn: '登录',
    signInSubtitle: '同步资产库和任务',
    announcements: '系统公告',
    announcementsUnread: '有新的系统公告',
    announcementsTitle: '系统公告',
    announcementsSubtitle: '近期产品更新、模型调整和重要通知会同步在这里。',
    announcementsTabNotice: '通知',
    announcementsClose: '关闭公告',
    announcementsCloseToday: '今日关闭',
    collapse: '收起左侧导航',
    expand: '展开左侧导航',
    sessionMore: '更多操作',
    sessionOpen: '打开会话',
    sessionDelete: '删除会话',
    sessionDeleting: '正在删除…',
    sessionDeleteConfirm: '删除这个创作会话？会话中的对话记录也会一起删除。',
    sessionDeleteFailed: '删除失败，请稍后重试。',
    earnCredits: `赚取 ${REFERRAL_TOTAL_INVITER_REWARD_CREDITS.toLocaleString()} 积分`,
    upgradeDiscount: `省 ${TARGET_YEARLY_DISCOUNT_PERCENT}%`
  },
  en: {
    ariaLabel: 'Creation navigation',
    mobileItems: {
      home: 'Home',
      apps: 'Apps',
      apiModels: 'Model plaza',
      useCases: 'Blog',
      moodboards: 'Boards',
      image: 'Create',
      video: 'Video',
      gallery: 'Gallery',
      account: 'Account'
    },
    navItems: {
      inspiration: 'Inspiration',
      promptLibrary: 'Prompt library',
      moodboards: 'Moodboards',
      workspace: 'Workspace',
      image: 'Image',
      video: 'Video',
      imageEdit: 'Image Edit',
      gallery: 'Gallery',
      characters: 'Characters',
      apps: 'Apps',
      apiModels: 'Model plaza',
      apiConsole: 'Token management',
      useCases: 'Blog',
      tasks: 'Credits',
      favorites: 'Saved',
      promptAdmin: 'Case admin'
    },
    navGroups: {
      default: 'Default',
      tools: 'Tools'
    },
    creditSuffix: 'credits',
    creditTrailing: 'Top up',
    profileFallback: 'Profile',
    xOfficial: 'WebToMind on X',
    founderMember: 'Founding Member',
    personalSpace: 'Personal space',
    pricing: 'Upgrade',
    workspace: 'Workspace',
    settings: 'Settings',
    trash: 'Trash',
    installExtension: 'Install extension',
    contact: 'Contact us',
    signOut: 'Sign out',
    language: 'Language',
    languageChinese: '简体中文',
    languageEnglish: 'English',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    signIn: 'Sign in',
    signInSubtitle: 'Sync gallery and tasks',
    announcements: 'System updates',
    announcementsUnread: 'New system updates',
    announcementsTitle: 'System updates',
    announcementsSubtitle:
      'Recent product updates, model changes, and important notices appear here.',
    announcementsTabNotice: 'Notice',
    announcementsClose: 'Close',
    announcementsCloseToday: 'Close today',
    collapse: 'Collapse navigation',
    expand: 'Expand navigation',
    sessionMore: 'More actions',
    sessionOpen: 'Open session',
    sessionDelete: 'Delete session',
    sessionDeleting: 'Deleting…',
    sessionDeleteConfirm:
      'Delete this session and all of its conversation turns?',
    sessionDeleteFailed: 'Could not delete the session. Try again.',
    earnCredits: `Earn ${REFERRAL_TOTAL_INVITER_REWARD_CREDITS.toLocaleString()} credits`,
    upgradeDiscount: `${TARGET_YEARLY_DISCOUNT_PERCENT}% off`
  }
} as const;

const SYSTEM_ANNOUNCEMENTS_VERSION = '2026-09-09.1';
const SYSTEM_ANNOUNCEMENTS_STORAGE_KEY =
  'webtomind:create-system-announcements-seen';
const CREATE_SIDE_NAV_COLLAPSED_STORAGE_KEY =
  'webtomind:create-side-nav-collapsed';

function getStoredSideNavCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(CREATE_SIDE_NAV_COLLAPSED_STORAGE_KEY) ===
      'true'
    );
  } catch {
    return false;
  }
}

function storeSideNavCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CREATE_SIDE_NAV_COLLAPSED_STORAGE_KEY,
      String(collapsed)
    );
  } catch {
    // Keep the control usable when browser storage is unavailable.
  }
}

const SYSTEM_ANNOUNCEMENTS = {
  zh: [
    {
      title: 'GPT Image 2.5 已上线',
      body: [
        'GPT 图像生成与编辑现已统一升级为 GPT Image 2.5。',
        '原 GPT Image 2 入口已下架；历史作品仍可正常查看，也可以继续复用其中的提示词发起新创作。'
      ],
      meta: '图像创作 · 2026-09-09',
      tone: 'critical'
    },
    {
      title: '模型广场与令牌管理正式上线',
      body: [
        '「模型广场」已向所有登录用户开放：459 个模型的输入/输出/按次价格、计费方式、可用端点与实时健康状态一目了然，支持搜索、标签筛选与双语浏览。',
        '「令牌管理」同步上线：登录后即可创建属于你的 API Key（sk-wtm_ 前缀），所有 Key 共享账户 API 额度，支持自定义命名、随时启用或吊销。',
        'OpenAI 兼容接口 https://webtomind.com/v1 已就绪，覆盖对话、视频、生图、音频等端点；每次调用都按模型广场展示的价格精确计费，失败请求不计费。所有用户共享每分钟 60 次、每日 5000 次的调用额度，钱包余额可在令牌管理页随时充值。'
      ],
      meta: 'API 开放平台 · 2026-08-27',
      tone: 'critical'
    },
    {
      title: '全新 AI 图片编辑器上线',
      body: [
        '新增「图片编辑」工具：从创作会话或资产库一键带入图片，用文字指令完成局部修改、区域框选、多图融合、裁剪扩图与光影调整，支持版本历史随时回退。',
        '图像与视频创作的输入框同步升级：Enter 发送、Shift+Enter 换行，发送后自动清空并跟随新结果滚动；编辑器已支持深色主题与更精细的移动端适配。'
      ],
      meta: '图片编辑 · 2026-08-13',
      tone: 'critical'
    },
    {
      title: 'Seedance 2.5 已接入视频创作',
      body: [
        '视频创作现已支持 Doubao Seedance 2.5，可生成 4 至 30 秒、480P 或 720P 视频，并支持原生音频。',
        '单次任务最多可组合 30 张图片、10 段视频与 10 段音频作为参考；Seedance 2.0 系列仍可继续使用。'
      ],
      meta: '视频创作 · 2026-08-07',
      tone: 'critical'
    },
    {
      title: '粘贴参考图体验已优化',
      body: [
        '图像创作与视频创作现在都支持将剪贴板中的图片直接粘贴到提示词输入框，图片会自动作为参考图上传。',
        '已修复部分浏览器单次粘贴会重复上传两张相同图片的问题。现在每张图片只会添加一次，同时仍支持一次粘贴多张不同图片。'
      ],
      meta: '图像与视频创作 · 2026-08-05',
      tone: 'critical'
    },
    {
      title: '视频生成功能正式推出',
      body: [
        '视频创作现已正式开放，支持 Doubao Seedance 2.0、Fast 与 Mini 三种模型，可生成 4 至 15 秒视频，并提供首尾帧、画幅、分辨率与同步音频控制。',
        '提交后会自动创建视频会话并实时展示生成进度；成片支持悬停预览、下载、收藏，并会自动保存到资产库。图像与视频统一使用套餐积分，失败任务自动退回积分。'
      ],
      meta: '视频创作 · 2026-07-23',
      tone: 'critical'
    },
    {
      title: '灵感页全面焕新',
      body: [
        '图像与情绪板现在以更高密度的自适应瀑布流呈现，滚动到底部会自动加载更多内容，探索不会中断。',
        '上传图片后会由 AI 解析视觉关键词；你也可以继续补充搜索词，结果会实时匹配，并能一键保存到默认或指定情绪板。'
      ],
      meta: '灵感探索 · 2026-07-21',
      tone: 'critical'
    },
    {
      title: '情绪板成为可复用的视觉资产',
      body: [
        '预设情绪板已扩充，每套都包含完整参考图、风格画像和关键词；使用预设时会创建一份可编辑的个人副本，不会影响官方模板。',
        '新版详情页支持查看、编辑、删除和继续补充图片，也可以从灵感页直接收藏素材，再把整套风格带入图像创作。'
      ],
      meta: '情绪板 · 2026-07-21',
      tone: 'warm'
    },
    {
      title: '图像创作升级为连续会话工作流',
      body: [
        '发送提示词后会立即显示生成状态；同一会话可连续创作，新的结果会同步到对话记录、会话缩略图和个人图库。',
        '参考图、情绪板与可视化配方可以组合使用；生成记录会保留提示词和模型信息，并提供重试、下载、删除与更多图片操作。'
      ],
      meta: '图像创作 · 2026-07-21',
      tone: 'info'
    },
    {
      title: '图库与案例预览更顺手',
      body: [
        '图库和提示词案例的全屏预览已统一层级，图片、提示词与可视化配方不再被弹窗遮挡。',
        '从灵感图进入详情时会自动回到顶部，并换一批相似灵感；“再创作”可在新会话中直接发起生成。'
      ],
      meta: '图库与案例 · 2026-07-20',
      tone: 'warm'
    },
    {
      title: '套餐与积分说明更清晰',
      body: [
        '套餐页现在会随屏幕宽度调整整体尺寸，并默认展示更优惠的年付价格。',
        '积分消耗、年付节省和会员权益统一呈现，生成前即可确认预计消耗，失败任务不会扣除积分。'
      ],
      meta: '套餐与积分 · 2026-07-20',
      tone: 'info'
    }
  ],
  en: [
    {
      title: 'GPT Image 2.5 is now available',
      body: [
        'GPT image generation and editing have been upgraded to GPT Image 2.5.',
        'The GPT Image 2 entry has been retired. Your existing creations remain available, and you can reuse their prompts to start something new.'
      ],
      meta: 'Image creation · 2026-09-09',
      tone: 'critical'
    },
    {
      title: 'Model Plaza and Token Management are live',
      body: [
        'The Model Plaza is now open to every signed-in user: browse 459 models with input/output/per-request pricing, billing modes, supported endpoints, and live health status — with search, tag filters, and full bilingual support.',
        'Token Management arrives alongside: create your own API keys (sk-wtm_ prefix) after signing in. All keys share one account-level API balance, with custom names and instant enable/revoke.',
        'Our OpenAI-compatible endpoint https://webtomind.com/v1 covers chat, video, image, and audio APIs. Every call is billed exactly at the plaza price, and failed requests are never charged. Rate limits are 60 requests/minute and 5,000/day per account; top up your wallet anytime from the console.'
      ],
      meta: 'API platform · 2026-08-27',
      tone: 'critical'
    },
    {
      title: 'A new AI Image Editor is here',
      body: [
        'Edit any generated image directly: jump in from a session result or your gallery with one click, then use plain text, boxed regions, multiple references, crop & expand, lighting and palette presets — every result becomes a version you can jump back to.',
        'Image and Video creation inputs now send with Enter, insert a new line with Shift+Enter, and clear and auto-scroll after sending. The editor also follows your system theme with dark mode and mobile refinements.'
      ],
      meta: 'Image editor · 2026-08-13',
      tone: 'critical'
    },
    {
      title: 'Seedance 2.5 is now available in Video creation',
      body: [
        'Video creation now supports Doubao Seedance 2.5 with 4–30 second output at 480P or 720P and native audio.',
        'Each task can combine up to 30 images, 10 videos, and 10 audio clips as references. The Seedance 2.0 family remains available.'
      ],
      meta: 'Video creation · 2026-08-07',
      tone: 'critical'
    },
    {
      title: 'Clipboard reference uploads are more reliable',
      body: [
        'Paste clipboard images directly into the prompt field in Image or Video creation, and they will be uploaded automatically as references.',
        'We fixed an issue where some browsers uploaded the same image twice from one paste. Each image is now added once, while pasting multiple different images remains supported.'
      ],
      meta: 'Image & video creation · 2026-08-05',
      tone: 'critical'
    },
    {
      title: 'Video generation is officially available',
      body: [
        'Video creation now supports Doubao Seedance 2.0, Fast, and Mini, with 4–15 second output plus first/last frames, aspect ratio, resolution, and synchronized audio controls.',
        'Each request starts a video Session with live progress. Finished videos support hover preview, download, favorites, and automatic saving to the asset library. Image and video creation share plan credits, and failed tasks are refunded automatically.'
      ],
      meta: 'Video creation · 2026-07-23',
      tone: 'critical'
    },
    {
      title: 'A completely redesigned Inspiration page',
      body: [
        'Images and moodboards now appear in a denser responsive masonry feed that automatically loads more as you scroll.',
        'Upload an image for AI-powered visual keyword analysis, add your own search terms for live matching, and save any result to your default or selected moodboard.'
      ],
      meta: 'Inspiration · 2026-07-21',
      tone: 'critical'
    },
    {
      title: 'Moodboards are now reusable visual assets',
      body: [
        'The preset collection has expanded, with complete reference images, a taste profile, and keywords for every board. Using a preset creates an editable personal copy without changing the original.',
        'The new detail experience supports viewing, editing, deleting, and adding images. You can also save inspiration directly to a board and carry the full visual direction into image creation.'
      ],
      meta: 'Moodboards · 2026-07-21',
      tone: 'warm'
    },
    {
      title: 'Image creation is now a continuous session workflow',
      body: [
        'Generation status appears immediately after sending a prompt. Continue creating in one session while new results update the conversation, session thumbnail, and personal gallery.',
        'Combine reference images, moodboards, and visual recipes. Every result keeps its prompt and model details, with retry, download, delete, and additional image actions close at hand.'
      ],
      meta: 'Image creation · 2026-07-21',
      tone: 'info'
    },
    {
      title: 'Gallery and case previews are easier to use',
      body: [
        'Gallery and prompt-case fullscreen previews now share a consistent layer, keeping images, prompts, and visual recipes above the surrounding dialog.',
        'Image details return to the top and refresh related inspiration on open. Recreate now starts generation directly in a new session.'
      ],
      meta: 'Gallery and cases · 2026-07-20',
      tone: 'warm'
    },
    {
      title: 'Clearer plans and credit guidance',
      body: [
        'The plans page now scales with the available screen width and defaults to the better-value yearly option.',
        'Credit usage, yearly savings, and membership benefits are shown together. Failed jobs do not consume credits.'
      ],
      meta: 'Plans and credits · 2026-07-20',
      tone: 'info'
    }
  ]
} as const;

function hasSeenSystemAnnouncements(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return (
      window.localStorage.getItem(SYSTEM_ANNOUNCEMENTS_STORAGE_KEY) ===
      SYSTEM_ANNOUNCEMENTS_VERSION
    );
  } catch {
    return true;
  }
}

function markSystemAnnouncementsSeen() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SYSTEM_ANNOUNCEMENTS_STORAGE_KEY,
      SYSTEM_ANNOUNCEMENTS_VERSION
    );
  } catch {
    // Ignore storage failures; the modal still remains usable.
  }
}

interface CreateSideNavEntryProps {
  item: CreateNavItem;
  label: string;
  active: boolean;
  localePrefix: '' | '/zh-CN' | '/en-US';
  boardsHref: string;
  collapsed: boolean;
}

export interface CreateSideNavPromptItem {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

interface CreateSideNavProps {
  promptLibraryAdminItem?: CreateSideNavPromptItem;
}

function CreateSideNavEntry({
  item,
  label,
  active,
  localePrefix,
  boardsHref,
  collapsed
}: CreateSideNavEntryProps) {
  const Icon = item.icon;
  const iconRef = useRef<DynamicIconHandle | null>(null);
  const startIconMotion = () => iconRef.current?.startAnimation();
  const stopIconMotion = () => iconRef.current?.stopAnimation();
  const navIcon = item.motionIcon ? (
    <DynamicIcon
      ref={iconRef}
      name={item.motionIcon}
      size={17}
      strokeWidth={2}
      className="create-side-nav-motion-icon"
    />
  ) : (
    <Icon size={17} />
  );
  const sharedProps = {
    className: active ? 'active' : '',
    isActive: active,
    icon: navIcon,
    onMouseEnter: startIconMotion,
    onMouseLeave: stopIconMotion,
    onFocus: startIconMotion,
    onBlur: stopIconMotion,
    title: collapsed ? label : undefined
  };

  if (item.id === 'workspace') {
    return (
      <NavigationLink
        href={boardsHref}
        target="_blank"
        rel="noreferrer"
        {...sharedProps}
      >
        <span>{label}</span>
        {item.badge && <strong>{item.badge}</strong>}
      </NavigationLink>
    );
  }

  return (
    <NavigationLink
      as={Link}
      to={localizeCreateHref(item.href, localePrefix)}
      {...sharedProps}
    >
      <span>{label}</span>
      {item.badge && <strong>{item.badge}</strong>}
    </NavigationLink>
  );
}

function CreateSideNavPromptLink({
  item,
  icon,
  collapsed
}: {
  item: CreateSideNavPromptItem;
  icon: ReactNode;
  collapsed: boolean;
}) {
  return (
    <NavigationLink
      as={Link}
      to={item.href}
      className={item.active ? 'active' : ''}
      isActive={item.active}
      icon={icon}
      title={collapsed ? item.label : undefined}
    >
      <span>{item.label}</span>
    </NavigationLink>
  );
}

function ImageSessionNavItem({
  session,
  selected,
  collapsed,
  href,
  copy,
  onDelete
}: {
  session: ImageCreationSession;
  selected: boolean;
  collapsed: boolean;
  href: string;
  copy: {
    more: string;
    open: string;
    delete: string;
    deleting: string;
    deleteConfirm: string;
    deleteFailed: string;
  };
  onDelete: (session: ImageCreationSession) => Promise<void>;
}) {
  const [failedCoverUrl, setFailedCoverUrl] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const showCover =
    Boolean(session.coverImageUrl) && failedCoverUrl !== session.coverImageUrl;

  const handleDelete = async () => {
    if (deleting || !window.confirm(copy.deleteConfirm)) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(session);
      setMenuOpen(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error && error.message
          ? error.message
          : copy.deleteFailed
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className={`create-side-nav-session-card-shell${selected ? ' is-active' : ''}`}
    >
      <Link
        className={`create-side-nav-session-card${selected ? ' is-active' : ''}`}
        to={href}
        aria-current={selected ? 'page' : undefined}
        aria-label={collapsed ? session.title : undefined}
        title={collapsed ? session.title : undefined}
      >
        <span className="create-side-nav-session-thumb" aria-hidden="true">
          {showCover ? (
            <img
              src={session.coverImageUrl}
              alt=""
              loading="eager"
              decoding="async"
              onError={() => setFailedCoverUrl(session.coverImageUrl)}
            />
          ) : (
            <MessageSquare />
          )}
        </span>
        <span className="create-side-nav-session-title">{session.title}</span>
      </Link>
      {!collapsed && (
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(nextOpen) => {
            setMenuOpen(nextOpen);
            if (nextOpen) setDeleteError('');
          }}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="create-side-nav-session-more"
              label={`${copy.more}：${session.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              icon={<MoreHorizontal aria-hidden="true" />}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="create-side-nav-session-menu"
            aria-label={`${copy.more}：${session.title}`}
            align="start"
            side="right"
            sideOffset={8}
            collisionPadding={12}
          >
            <DropdownMenuItem asChild>
              <Link to={href} onClick={() => setMenuOpen(false)}>
                <ArrowRight aria-hidden="true" />
                <span>{copy.open}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="danger"
              disabled={deleting}
              onSelect={(event) => {
                // 删除失败时需要保留菜单展示错误，关闭时机由 handleDelete 控制。
                event.preventDefault();
                void handleDelete();
              }}
            >
              <Trash2 aria-hidden="true" />
              <span>{deleting ? copy.deleting : copy.delete}</span>
            </DropdownMenuItem>
            {deleteError && <p role="alert">{deleteError}</p>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function CreateSideNav({
  promptLibraryAdminItem
}: CreateSideNavProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, signOut } = useAuth();
  const { profile, credits, subscription } = useWorkspaceUser(isAuthenticated);
  const journeyEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.activationJourneyV1
  );
  const activation = useActivationStatus(user?.id || null);
  const hideFutureCreationEntries =
    journeyEnabled &&
    !activation.loading &&
    !activation.unavailable &&
    !activation.activated;
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [referralInviteOpen, setReferralInviteOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(getStoredSideNavCollapsed);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(
    () => !hasSeenSystemAnnouncements()
  );
  const localePrefix = getLocalePrefix(location.pathname);
  const isEnglish = localePrefix === '/en-US';
  const navCopy = isEnglish ? CREATE_SIDE_NAV_COPY.en : CREATE_SIDE_NAV_COPY.zh;
  const hasWorkspaceAccountData =
    !isAuthenticated ||
    profile !== null ||
    credits !== null ||
    subscription !== null;
  const isPaidUser = Boolean(
    subscription?.planName && !isFreePlanName(subscription.planName)
  );
  const accountStatusLabel = !hasWorkspaceAccountData
    ? '—'
    : isPaidUser
      ? `${formatCredits(credits?.total ?? 0)} ${navCopy.creditSuffix}`
      : 'Free';
  const announcementItems = isEnglish
    ? SYSTEM_ANNOUNCEMENTS.en
    : SYSTEM_ANNOUNCEMENTS.zh;
  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'WebToMind User';
  const userInitial =
    userName.slice(0, 1).toUpperCase() ||
    user?.email?.slice(0, 1).toUpperCase() ||
    'W';
  const boardsHref = '/boards';
  const settingsHref = localizeCreateHref('/settings', localePrefix);
  const accountHref = localizeCreateHref('/account', localePrefix);
  const returnTo = collapsePaywallReturnTo(
    location.pathname,
    location.search,
    location.hash,
    `${localePrefix}/image`
  );
  const pricingWorkspaceEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.pricingWorkspaceV2
  );
  const moodboardsEnabled = isCreateWorkspaceFeatureEnabled(
    CREATE_WORKSPACE_FEATURE_FLAGS.moodboardsV1
  );
  const pricingHref = `${localePrefix}${pricingWorkspaceEnabled ? '/create/pricing' : '/pricing'}?source=creator_sidebar&returnTo=${encodeURIComponent(
    returnTo
  )}`;
  const rechargeHref = `${localePrefix}/recharge?source=creator_account_menu&returnTo=${encodeURIComponent(
    collapsePaywallReturnTo(
      location.pathname,
      location.search,
      location.hash,
      `${localePrefix}/create`
    )
  )}`;
  const isPromptCaseAdmin = Boolean(user);
  const isApiMarketplaceAdmin = Boolean(user);
  const defaultPromptLibraryAdminItem: CreateSideNavPromptItem | undefined =
    isPromptCaseAdmin
      ? {
          key: 'admin',
          label: navCopy.navItems.promptAdmin,
          href: localizeCreateHref('/prompts/admin', localePrefix),
          active: stripLocale(location.pathname).startsWith('/prompts/admin')
        }
      : undefined;
  const resolvedPromptLibraryAdminItem = isPromptCaseAdmin
    ? promptLibraryAdminItem || defaultPromptLibraryAdminItem
    : undefined;
  const isPromptLibrarySecondaryEntryActive = Boolean(
    resolvedPromptLibraryAdminItem?.active
  );
  const mobileAccountHref = isAuthenticated
    ? accountHref
    : `/login?redirect=${encodeURIComponent(accountHref)}&source=create_mobile_account`;
  const mobileNavItems = [
    {
      id: 'home',
      label: navCopy.mobileItems.home,
      href: localizeCreateHref('/create', localePrefix),
      icon: Home
    },
    {
      id: 'image',
      label: navCopy.mobileItems.image,
      href: localizeCreateHref('/image', localePrefix),
      icon: Image
    },
    ...(hideFutureCreationEntries
      ? []
      : [
          {
            id: 'video',
            label: navCopy.mobileItems.video,
            href: localizeCreateHref('/video', localePrefix),
            icon: Video
          }
        ]),
    {
      id: 'gallery',
      label: navCopy.mobileItems.gallery,
      href: localizeCreateHref('/gallery', localePrefix),
      icon: MessageSquare
    },
    {
      id: 'account',
      label: navCopy.mobileItems.account,
      href: mobileAccountHref,
      icon: UserRound
    }
  ];
  const visibleNavItems = createNavItems.filter(
    (item) =>
      (item.id !== 'moodboards' || moodboardsEnabled) &&
      item.id !== 'apiModels' &&
      (item.id !== 'apiConsole' || isApiMarketplaceAdmin) &&
      (!hideFutureCreationEntries ||
        (item.id !== 'video' && item.id !== 'apps'))
  );
  const apiModelsEntryIndex = visibleNavItems.findIndex(
    (item) => item.id === 'apiConsole'
  );
  const apiModelsEntry = createNavItems.find((item) => item.id === 'apiModels');
  if (apiModelsEntry) {
    visibleNavItems.splice(
      apiModelsEntryIndex === -1 ? visibleNavItems.length : apiModelsEntryIndex,
      0,
      apiModelsEntry
    );
  }
  const primaryNavGroups = [
    {
      id: 'default' as const,
      label: navCopy.navGroups.default,
      showLabel: false,
      items: visibleNavItems.filter((item) => item.group === 'default')
    },
    {
      id: 'tools' as const,
      label: navCopy.navGroups.tools,
      showLabel: true,
      items: visibleNavItems.filter((item) => item.group === 'tools')
    }
  ];
  const isImageCreateRoute = stripLocale(location.pathname).startsWith(
    '/image'
  );
  const isVideoCreateRoute = stripLocale(location.pathname).startsWith(
    '/video'
  );
  const sessionMediaType = isVideoCreateRoute ? 'video' : 'image';
  const creationSessions = useImageCreationSessions(
    isAuthenticated,
    6,
    user?.id || 'authenticated-user',
    sessionMediaType
  );
  const imageSessionSearch = new URLSearchParams(location.search);
  const activeCreationSessionId =
    isImageCreateRoute || isVideoCreateRoute
      ? imageSessionSearch.get('sessionId')
      : null;

  const handleDeleteImageSession = async (session: ImageCreationSession) => {
    await deleteImageSession(session.id);
    window.dispatchEvent(new Event('creation-session-changed'));
    if (activeCreationSessionId === session.id) {
      navigate(`${localePrefix}/${sessionMediaType}?newSession=1`, {
        replace: true
      });
    }
  };

  const openSystemAnnouncements = () => {
    setAnnouncementsOpen(true);
    setHasUnreadAnnouncements(false);
    markSystemAnnouncementsSeen();
  };

  const toggleCollapsed = () => {
    setIsCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      storeSideNavCollapsed(nextCollapsed);
      return nextCollapsed;
    });
  };

  const announcementsModalRef = useOverlayBehavior<HTMLElement>({
    open: announcementsOpen,
    onClose: () => setAnnouncementsOpen(false)
  });

  return (
    <>
      <aside
        className={`create-side-nav${isCollapsed ? ' is-collapsed' : ''}`}
        aria-label={navCopy.ariaLabel}
      >
        <div className="create-side-nav-brand-row">
          <Link
            to={localizeCreateHref('/create', localePrefix)}
            className="create-side-nav-brand"
          >
            <Logo size={26} className="create-side-nav-logo" />
            <span>WebToMind</span>
          </Link>
          <IconLink
            href="https://x.com/webtomind"
            target="_blank"
            rel="noreferrer"
            label={navCopy.xOfficial}
            size="sm"
            variant="ghost"
            className="create-side-nav-social-link"
            icon={
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="create-side-nav-social-icon"
              >
                <path
                  d="M13.9 10.47 21.35 2h-1.77l-6.47 7.35L7.95 2H2l7.82 11.13L2 22h1.77l6.84-7.76L16.07 22H22l-8.1-11.53Zm-2.42 2.75-.79-1.11-6.31-8.8h2.72l5.08 7.09.79 1.11 6.61 9.22h-2.72l-5.38-7.51Z"
                  fill="currentColor"
                />
              </svg>
            }
          />
          <span className="create-side-nav-announcement-wrap">
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              className="create-side-nav-icon-action create-side-nav-announcement-trigger"
              label={
                hasUnreadAnnouncements
                  ? `${navCopy.announcements} · ${navCopy.announcementsUnread}`
                  : navCopy.announcements
              }
              icon={<Megaphone aria-hidden="true" />}
              aria-haspopup="dialog"
              onClick={openSystemAnnouncements}
            />
            {hasUnreadAnnouncements && (
              <i
                className="create-side-nav-announcement-unread-dot"
                aria-hidden="true"
              />
            )}
          </span>
        </div>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="create-side-nav-icon-action create-side-nav-collapse-toggle"
          label={isCollapsed ? navCopy.expand : navCopy.collapse}
          title={isCollapsed ? navCopy.expand : navCopy.collapse}
          aria-expanded={!isCollapsed}
          aria-controls="create-side-nav-links"
          icon={
            isCollapsed ? (
              <ChevronRight aria-hidden="true" />
            ) : (
              <ChevronLeft aria-hidden="true" />
            )
          }
          onClick={toggleCollapsed}
        />
        <div id="create-side-nav-links" className="create-side-nav-scroll">
          <Navigation
            aria-label={navCopy.ariaLabel}
            variant="rail"
            orientation="vertical"
          >
            {primaryNavGroups.map((group) => (
              <section
                key={group.id}
                className="create-side-nav-group"
                aria-label={group.showLabel ? undefined : group.label}
                aria-labelledby={
                  group.showLabel
                    ? `create-side-nav-group-${group.id}`
                    : undefined
                }
              >
                {group.showLabel && (
                  <h2
                    id={`create-side-nav-group-${group.id}`}
                    className="create-side-nav-group-label"
                  >
                    {group.label}
                  </h2>
                )}
                <div className="create-side-nav-group-items">
                  {group.items.map((item) => {
                    const active =
                      item.id === 'promptLibrary' &&
                      isPromptLibrarySecondaryEntryActive
                        ? false
                        : isActiveNav(item.href, location.pathname);
                    return (
                      <div key={item.id} className="create-side-nav-item-group">
                        <CreateSideNavEntry
                          item={item}
                          label={navCopy.navItems[item.id] || item.label}
                          active={active}
                          localePrefix={localePrefix}
                          boardsHref={boardsHref}
                          collapsed={isCollapsed}
                        />
                      </div>
                    );
                  })}
                  {group.id === 'tools' && resolvedPromptLibraryAdminItem && (
                    <div className="create-side-nav-item-group">
                      <CreateSideNavPromptLink
                        item={resolvedPromptLibraryAdminItem}
                        icon={<Settings size={17} />}
                        collapsed={isCollapsed}
                      />
                    </div>
                  )}
                </div>
              </section>
            ))}
          </Navigation>
        </div>
        {isAuthenticated ? (
          <section
            className={`create-side-nav-sessions${isCollapsed ? ' is-collapsed' : ''}`}
            aria-label={
              isEnglish
                ? `${isVideoCreateRoute ? 'Video' : 'Image'} sessions`
                : `${isVideoCreateRoute ? '视频' : '图像'}创作会话`
            }
          >
            <button
              type="button"
              className="create-side-nav-sessions-heading"
              aria-expanded={sessionsExpanded}
              aria-controls="create-side-nav-session-list"
              aria-label={
                isEnglish
                  ? sessionsExpanded
                    ? 'Collapse sessions'
                    : 'Expand sessions'
                  : sessionsExpanded
                    ? '收起创作会话'
                    : '展开创作会话'
              }
              onClick={() => setSessionsExpanded((expanded) => !expanded)}
            >
              <span>{isEnglish ? 'Sessions' : '创作会话'}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            <Link
              className="create-side-nav-session-new"
              to={`${localePrefix}/${sessionMediaType}?newSession=1`}
              aria-label={
                isEnglish
                  ? `New ${sessionMediaType} session`
                  : `新建${isVideoCreateRoute ? '视频' : '图像'}会话`
              }
              title={
                isCollapsed
                  ? isEnglish
                    ? 'New Session'
                    : '新建会话'
                  : undefined
              }
            >
              <span className="create-side-nav-session-new-icon">
                <Plus />
              </span>
              <span>{isEnglish ? 'New Session' : '新建会话'}</span>
            </Link>
            {(isCollapsed || sessionsExpanded) && (
              <div
                id="create-side-nav-session-list"
                className="create-side-nav-session-list"
              >
                {creationSessions.map((session) => (
                  <ImageSessionNavItem
                    key={session.id}
                    session={session}
                    selected={activeCreationSessionId === session.id}
                    collapsed={isCollapsed}
                    href={`${localePrefix}/${sessionMediaType}?sessionId=${encodeURIComponent(session.id)}`}
                    copy={{
                      more: navCopy.sessionMore,
                      open: navCopy.sessionOpen,
                      delete: navCopy.sessionDelete,
                      deleting: navCopy.sessionDeleting,
                      deleteConfirm: navCopy.sessionDeleteConfirm,
                      deleteFailed: navCopy.sessionDeleteFailed
                    }}
                    onDelete={handleDeleteImageSession}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
        <div className="create-side-nav-bottom">
          <div className="create-side-nav-account-actions">
            {hasWorkspaceAccountData && !isPaidUser && (
              <Link
                className="create-side-nav-upgrade"
                to={pricingHref}
                title={isCollapsed ? navCopy.pricing : undefined}
              >
                <Sparkles aria-hidden="true" />
                <span>{navCopy.pricing}</span>
                <strong>{navCopy.upgradeDiscount}</strong>
              </Link>
            )}
            {isAuthenticated && (
              <Button
                type="button"
                variant="ghost"
                className="create-side-nav-referral-trigger"
                title={isCollapsed ? navCopy.earnCredits : undefined}
                aria-haspopup="dialog"
                leadingIcon={<Gift aria-hidden="true" />}
                onClick={() => setReferralInviteOpen(true)}
              >
                {navCopy.earnCredits}
              </Button>
            )}
          </div>
          {isAuthenticated ? (
            <CreatorAccountMenu
              placement="sidebar"
              compact={isCollapsed}
              user={user}
              userName={userName}
              memberNumber={profile?.member_number_formatted}
              accountStatusLabel={accountStatusLabel}
              creditsTrailingLabel={navCopy.creditTrailing}
              rechargeHref={rechargeHref}
              pricingHref={pricingHref}
              workspaceHref={boardsHref}
              settingsHref={settingsHref}
              copy={navCopy}
              onSignOut={signOut}
            />
          ) : (
            <Link
              to="/login"
              className="create-side-nav-profile"
              title={isCollapsed ? navCopy.signIn : undefined}
            >
              <span className="create-side-nav-avatar">{userInitial}</span>
              <span className="create-side-nav-user">
                <strong>{navCopy.signIn}</strong>
                <em>{navCopy.signInSubtitle}</em>
              </span>
              <Menu size={16} />
            </Link>
          )}
        </div>
      </aside>
      <ReferralInviteDialog
        open={referralInviteOpen}
        isEnglish={isEnglish}
        onClose={() => setReferralInviteOpen(false)}
      />
      <Navigation
        className="create-mobile-nav"
        aria-label={navCopy.ariaLabel}
        variant="mobile"
        density="compact"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveMobileNav(item.id, location.pathname);
          return (
            <NavigationLink
              key={item.id}
              as={Link}
              to={item.href}
              className={active ? 'active' : ''}
              isActive={active}
            >
              <span className="create-mobile-nav-icon">
                <Icon size={18} />
              </span>
              <span className="create-mobile-nav-label">{item.label}</span>
            </NavigationLink>
          );
        })}
      </Navigation>
      {announcementsOpen && (
        <div
          className="create-side-nav-announcement-backdrop"
          onMouseDown={() => setAnnouncementsOpen(false)}
        >
          <section
            ref={announcementsModalRef}
            className="create-side-nav-announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-system-announcements-title"
            onMouseDown={(event) => event.stopPropagation()}
            tabIndex={-1}
          >
            <header className="create-side-nav-announcement-head">
              <div>
                <h2 id="create-system-announcements-title">
                  {navCopy.announcementsTitle}
                </h2>
                <p>{navCopy.announcementsSubtitle}</p>
              </div>
              <div className="create-side-nav-announcement-tabs">
                <span>{navCopy.announcementsTabNotice}</span>
                <strong>
                  <Megaphone size={15} />
                  {navCopy.announcements}
                </strong>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={navCopy.announcementsClose}
                  onClick={() => setAnnouncementsOpen(false)}
                >
                  <X />
                </Button>
              </div>
            </header>
            <div
              className="create-side-nav-announcement-timeline"
              role="region"
              aria-label={navCopy.announcements}
              tabIndex={0}
            >
              {announcementItems.map((item) => (
                <article
                  key={`${item.meta}-${item.title}`}
                  className={`create-side-nav-announcement-item is-${item.tone}`}
                >
                  <span
                    className="create-side-nav-announcement-dot"
                    aria-hidden="true"
                  />
                  <div>
                    <h3>{item.title}</h3>
                    {item.body.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    <time>{item.meta}</time>
                  </div>
                </article>
              ))}
            </div>
            <footer className="create-side-nav-announcement-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAnnouncementsOpen(false)}
              >
                {navCopy.announcementsCloseToday}
              </Button>
              <Button
                type="button"
                className="primary"
                onClick={() => setAnnouncementsOpen(false)}
              >
                {navCopy.announcementsClose}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
