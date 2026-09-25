/**
 * 创作工作台核心页面路由。
 *
 * 这些页面拥有独立的顶层 URL（/image、/video、/prompts ...），
 * 而不是 /create 下的次级 URL。旧路径仍可通过重定向访问，
 * 见 workers/webtomind.ts 与 src/web/main.tsx 中的重定向逻辑。
 */

export const CREATOR_ROUTE_PATHS = {
  moodboards: '/moodboards',
  characters: '/characters',
  gallery: '/gallery',
  image: '/image',
  video: '/video',
  prompts: '/prompts',
  apps: '/apps'
} as const;

export type CreatorRoutePath =
  (typeof CREATOR_ROUTE_PATHS)[keyof typeof CREATOR_ROUTE_PATHS];

/**
 * 旧路径段 -> 新路径段。仅匹配独立页面入口；
 * /create/moodboards/*、/create/prompts/share/* 等子路径由
 * canonicalizeCreatorPathname 单独处理。
 */
const LEGACY_CREATOR_PATH_SEGMENTS: ReadonlyArray<
  [legacy: string, canonical: string]
> = [
  ['/create/moodboards', '/moodboards'],
  ['/create/characters', '/characters'],
  ['/create/gallery', '/gallery'],
  ['/create/image', '/image'],
  ['/create/video', '/video'],
  ['/create/prompts', '/prompts'],
  ['/create/apps', '/apps']
];

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') || '/';
}

/**
 * 把旧创作路由路径映射为新的顶层路径；非旧创作路由返回 null。
 * 入参可以是带语言前缀的完整 pathname（/zh-CN/create/image）。
 */
export function canonicalizeCreatorPathname(pathname: string): string | null {
  const stripped = stripLocalePrefix(pathname);

  // /image/create 及 /zh-CN/image/create 旧别名
  if (stripped === '/image/create' || stripped.startsWith('/image/create/')) {
    return '/image';
  }

  for (const [legacy, canonical] of LEGACY_CREATOR_PATH_SEGMENTS) {
    if (stripped === legacy) return canonical;
    if (stripped.startsWith(`${legacy}/`)) {
      // /create/prompts/share/:caseId 保留独立分享流程，不做机械重写
      if (legacy === '/create/prompts' && stripped.startsWith('/create/prompts/share/')) {
        return null;
      }
      return `${canonical}${stripped.slice(legacy.length)}`;
    }
  }

  return null;
}

/**
 * 判断 pathname（可带语言前缀）是否命中新的顶层创作页面路径。
 * 仅覆盖工作台页面本身：/prompts/:slug 等公开 SEO 页、
 * /moodboards/s/:token 公开分享页不属于工作台路由。
 */
export function isCreatorRoutePathname(pathname: string): boolean {
  const stripped = stripLocalePrefix(pathname);
  if (Object.values(CREATOR_ROUTE_PATHS).includes(stripped as CreatorRoutePath)) {
    return true;
  }
  if (stripped.startsWith('/moodboards/')) {
    return !stripped.startsWith('/moodboards/s/');
  }
  return false;
}
