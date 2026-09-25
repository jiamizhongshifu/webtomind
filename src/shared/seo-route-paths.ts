import {
  PROMPT_STYLE_GRID_ALL_PATHS,
  PROMPT_STYLE_GRID_DETAIL_PATHS
} from './prompt-style-grid-seo';

export type LocaleRoutePrefix = '' | '/zh-CN' | '/en-US';
export type SeoLocale = 'zh-CN' | 'en-US';
export type SeoAlternatePath = {
  hreflang: SeoLocale | 'x-default';
  path: string;
};

const ZH_ONLY_SEO_PATHS = new Set(['/video-prompts']);

export const PROMPT_SEO_ALIAS_PATHS = [
  '/ai-image-prompts',
  '/free-ai-image-prompts',
  '/best-ai-image-prompts',
  '/ai-image-prompt-examples',
  '/ai-image-prompt-library',
  '/ai-image-prompts-gallery',
  '/free-ai-image-prompts-gallery',
  '/image-to-prompt-generator',
  '/reference-image-to-prompt-generator',
  '/ai-image-prompt-generator',
  '/gpt-image-2-prompts',
  '/free-gpt-image-2-prompts',
  '/gpt-image-2-prompts-gallery',
  '/imagine-image-2-0-prompts',
  '/grok-imagine-image-2-0-prompts',
  '/nano-banana-prompts',
  '/nano-banana-prompts-gallery',
  '/nano-banana-2-prompts',
  '/nano-banana-pro-prompts',
  '/flux-prompts',
  '/seedream-prompts',
  '/mona-lisa-1-prompts',
  '/mona-lisa-prompts',
  '/gpt-image-2-5-prompts',
  '/luna-lisa-alpha-prompts',
  '/astra-prompts',
  '/gpt-6-astra-prompts',
  '/sref-prompts',
  '/ai-photo-prompts',
  '/portrait-prompts',
  '/boudoir-prompts',
  '/glamour-prompts',
  '/product-photography-prompts',
  '/character-design-prompts',
  '/text-to-image-prompts',
  '/marketing-creative-prompts',
  '/poster-design-prompts',
  '/gta-vi-cover-prompts',
  '/gta-6-cover-girls-prompts',
  '/brand-identity-prompts',
  '/3d-figurine-prompts',
  '/clay-aesthetic-prompts'
] as const;

export const EXACT_SEO_PATHS = [
  '/',
  ...PROMPT_SEO_ALIAS_PATHS,
  ...PROMPT_STYLE_GRID_ALL_PATHS,
  ...PROMPT_STYLE_GRID_DETAIL_PATHS,
  '/ai-image-generator',
  '/zh-CN/skills',
  '/en-US/skills',
  '/create/prompts',
  '/tools/comfyui-workflow-checker',
  '/tools/pindou-pattern-maker',
  '/zh-CN/overview',
  '/en-US/overview',
  '/zh-CN/create/prompts',
  '/en-US/create/prompts',
  '/zh-CN/prompts',
  '/en-US/prompts',
  '/zh-CN/video-prompts',
  '/zh-CN/tools/comfyui-workflow-checker',
  '/en-US/tools/comfyui-workflow-checker',
  '/zh-CN/tools/pindou-pattern-maker',
  '/en-US/tools/pindou-pattern-maker',
  '/zh-CN/use-cases',
  '/en-US/use-cases',
  '/zh-CN/blog',
  '/en-US/blog',
  '/zh-CN/updates',
  '/en-US/updates',
  '/zh-CN/links',
  '/en-US/links',
  '/pricing',
  '/zh-CN/pricing',
  '/en-US/pricing',
  '/terms',
  '/privacy',
  '/zh-CN/terms',
  '/en-US/terms',
  '/zh-CN/privacy',
  '/en-US/privacy',
  '/login',
  '/zh-CN/login',
  '/en-US/login',
  '/auth/callback',
  '/zh-CN/auth/callback',
  '/en-US/auth/callback'
] as const;

const EXACT_SEO_PATH_SET = new Set<string>(EXACT_SEO_PATHS);
const PROMPT_SEO_ALIAS_PATH_SET = new Set<string>(PROMPT_SEO_ALIAS_PATHS);

const MARKETING_EXACT_PATHS = new Set<string>([
  '/',
  '/overview',
  '/zh-CN',
  '/en-US',
  '/zh-CN/overview',
  '/en-US/overview',
  '/ai-image-generator',
  ...PROMPT_SEO_ALIAS_PATHS
]);

function normalizeRoutePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
}

export function getLocalizedSeoPath(
  locale: SeoLocale,
  pathWithoutLocale: string
): string {
  const normalized = normalizeRoutePath(pathWithoutLocale);
  return normalized === '/' ? `/${locale}/overview` : `/${locale}${normalized}`;
}

export function getSeoAlternatePaths(
  pathWithoutLocale: string
): SeoAlternatePath[] {
  const normalized = stripLocaleRoutePrefix(pathWithoutLocale);
  if (ZH_ONLY_SEO_PATHS.has(normalized)) return [];
  const zhPath = getLocalizedSeoPath('zh-CN', normalized);
  const enPath = getLocalizedSeoPath('en-US', normalized);
  return [
    { hreflang: 'zh-CN', path: zhPath },
    { hreflang: 'en-US', path: enPath },
    { hreflang: 'x-default', path: enPath }
  ];
}

export function getLocaleRoutePrefix(pathname: string): LocaleRoutePrefix {
  if (pathname.startsWith('/zh-CN')) return '/zh-CN';
  if (pathname.startsWith('/en-US')) return '/en-US';
  return '';
}

export function stripLocaleRoutePrefix(pathname: string): string {
  return (
    normalizeRoutePath(pathname).replace(/^\/(?:zh-CN|en-US)(?=\/|$)/, '') ||
    '/'
  );
}

export function isLocalizedLoginRoute(pathname: string): boolean {
  return stripLocaleRoutePrefix(pathname) === '/login';
}

export function isLocalizedAuthCallbackRoute(pathname: string): boolean {
  return stripLocaleRoutePrefix(pathname) === '/auth/callback';
}

export function isExactSeoPath(pathname: string): boolean {
  return EXACT_SEO_PATH_SET.has(normalizeRoutePath(pathname));
}

export function isPromptSeoAliasPath(pathname: string): boolean {
  return PROMPT_SEO_ALIAS_PATH_SET.has(normalizeRoutePath(pathname));
}

export function isMarketingRoutePath(pathname: string): boolean {
  const routePath = normalizeRoutePath(pathname);
  return (
    MARKETING_EXACT_PATHS.has(routePath) ||
    routePath.includes('/use-cases') ||
    routePath.includes('/blog') ||
    routePath.includes('/updates') ||
    routePath.includes('/links') ||
    routePath.includes('/prompts') ||
    routePath.includes('/skills') ||
    routePath.includes('/pricing') ||
    routePath.includes('/tools/') ||
    /^\/(?:zh-CN\/|en-US\/)?(?:terms|privacy)$/.test(routePath)
  );
}

export function buildPromptCaseShareRedirectPath(input: {
  pathname: string;
  search: string;
  hash: string;
  caseId?: string;
}): string {
  const localePrefix = getLocaleRoutePrefix(input.pathname) || '/zh-CN';
  const params = new URLSearchParams(input.search);
  const caseId = input.caseId || '';
  if (caseId && !params.has('caseId') && !params.has('caseSlug')) {
    params.set('caseId', caseId);
  }
  const query = params.toString();
  return `${localePrefix}/prompts${query ? `?${query}` : ''}${input.hash}`;
}
