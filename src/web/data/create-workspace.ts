import type { LucideIcon } from 'lucide-react';
import type { DynamicIconName } from '../../shared/ui';
import {
  AppWindow,
  BookImage,
  BookOpenText,
  Code2,
  Compass,
  GalleryHorizontalEnd,
  Image,
  KeyRound,
  PanelsTopLeft,
  Sparkles,
  Trophy,
  UserRound,
  Wand2,
  Video
} from 'lucide-react';
import {
  createAppContentItems,
  createHomeFeaturedAppSlugs,
  type CreateAppContentItem
} from '../../shared/create-apps';
import { CREATOR_ROUTE_PATHS } from '../../shared/creator-route-paths';

export interface CreateNavItem {
  id:
    | 'inspiration'
    | 'promptLibrary'
    | 'moodboards'
    | 'workspace'
    | 'image'
    | 'video'
    | 'gallery'
    | 'characters'
    | 'apps'
    | 'useCases'
    | 'tasks'
    | 'imageEdit'
    | 'apiModels'
    | 'apiConsole';
  label: string;
  href: string;
  icon: LucideIcon;
  group: 'default' | 'tools' | 'account';
  motionIcon?: DynamicIconName;
  badge?: string;
  requiresAuth?: boolean;
}

export type CreateAppItem = CreateAppContentItem;

export const createNavItems: CreateNavItem[] = [
  {
    id: 'inspiration',
    label: '灵感',
    href: '/create',
    icon: Sparkles,
    group: 'default',
    motionIcon: 'inspiration'
  },
  {
    id: 'moodboards',
    label: '情绪板',
    href: CREATOR_ROUTE_PATHS.moodboards,
    icon: BookImage,
    group: 'default',
    requiresAuth: true
  },
  {
    id: 'characters',
    label: '角色',
    href: CREATOR_ROUTE_PATHS.characters,
    icon: UserRound,
    group: 'default',
    motionIcon: 'characters',
    badge: 'Beta',
    requiresAuth: true
  },
  {
    id: 'gallery',
    label: '资产库',
    href: CREATOR_ROUTE_PATHS.gallery,
    icon: GalleryHorizontalEnd,
    group: 'default',
    motionIcon: 'gallery',
    requiresAuth: true
  },
  {
    id: 'image',
    label: '图像创作',
    href: CREATOR_ROUTE_PATHS.image,
    icon: Image,
    group: 'tools',
    motionIcon: 'image-create'
  },
  {
    id: 'video',
    label: '视频创作',
    href: CREATOR_ROUTE_PATHS.video,
    icon: Video,
    group: 'tools',
    motionIcon: 'video-create',
    badge: 'Beta',
    requiresAuth: true
  },
  {
    id: 'imageEdit',
    label: '图片编辑',
    href: '/tools/image-editor',
    icon: Wand2,
    group: 'tools'
  },
  {
    id: 'promptLibrary',
    label: '提示词库',
    href: CREATOR_ROUTE_PATHS.prompts,
    icon: BookOpenText,
    group: 'tools',
    motionIcon: 'prompt-library'
  },
  {
    id: 'apps',
    label: '应用',
    href: CREATOR_ROUTE_PATHS.apps,
    icon: AppWindow,
    group: 'tools',
    motionIcon: 'apps'
  },
  {
    id: 'apiModels',
    label: '模型广场',
    href: '/models',
    icon: Code2,
    group: 'tools'
  },
  {
    id: 'apiConsole',
    label: '令牌管理',
    href: '/api-console',
    icon: KeyRound,
    group: 'tools',
    requiresAuth: true
  },
  {
    id: 'useCases',
    label: '使用案例',
    href: '/blog',
    icon: Compass,
    group: 'tools'
  },
  {
    id: 'tasks',
    label: '积分与任务',
    href: '/create/tasks',
    icon: Trophy,
    group: 'account',
    motionIcon: 'tasks',
    requiresAuth: true
  }
];

export const createAppItems: CreateAppItem[] = createAppContentItems;

export { createHomeFeaturedAppSlugs };

export function localizeCreateHref(
  href: string,
  localePrefix: '' | '/zh-CN' | '/en-US'
): string {
  if (!localePrefix) return href;
  if (href.startsWith('/zh-CN') || href.startsWith('/en-US')) return href;
  if (
    href.startsWith('/tools') ||
    href.startsWith('/skills') ||
    href.startsWith('/settings')
  ) {
    return `${localePrefix}${href}`;
  }
  if (href.startsWith('/create')) return `${localePrefix}${href}`;
  if (href.startsWith('/prompts')) return `${localePrefix}${href}`;
  if (href.startsWith('/use-cases'))
    return `${localePrefix}/blog${href.slice('/use-cases'.length)}`;
  if (href.startsWith('/blog')) return `${localePrefix}${href}`;
  if (href.startsWith('/models') || href.startsWith('/api-console')) {
    return `${localePrefix}${href}`;
  }
  if (
    href.startsWith('/moodboards') ||
    href.startsWith('/characters') ||
    href.startsWith('/gallery') ||
    href.startsWith('/image') ||
    href.startsWith('/video') ||
    href.startsWith('/apps')
  ) {
    return `${localePrefix}${href}`;
  }
  return href;
}

export const createNavBrandIcon = PanelsTopLeft;
