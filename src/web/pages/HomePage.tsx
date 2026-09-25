import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { TopNav } from '../components/TopNav';
import '../styles/home.css';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  FieldMessage,
  FormField,
  imageFetchPriority,
  Input,
  MediaTile
} from '../../shared/ui';
import type { FieldMessageTone } from '../../shared/ui';
import {
  getPublicPromptCases,
  subscribeMarketingEmail,
  type PromptCase
} from '../../services/agent-api';
import neonCollageHeroProduct from '../assets/home/neon-collage-hero-product.webp';
import neonCollageStickers from '../assets/home/neon-collage-stickers.webp';
import neonCollageWorkflow from '../assets/home/neon-collage-workflow.webp';

type HomeCaseCard = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  meta: string;
  href: string;
  category?: string;
};

type HomeCaseCollection = {
  id: string;
  label: string;
  title: string;
  description: string;
  href: string;
  cases: HomeCaseCard[];
};

type NewsletterStatus =
  | 'idle'
  | 'invalid'
  | 'submitting'
  | 'success'
  | 'duplicate'
  | 'error';

function getCaseTitle(caseItem: PromptCase, fallback: string): string {
  return caseItem.title?.trim() || fallback;
}

function getCaseHref(caseItem: PromptCase, locale: 'zh-CN' | 'en-US'): string {
  const caseLocale =
    caseItem.locale === 'zh-CN' || caseItem.locale === 'en-US'
      ? caseItem.locale
      : locale;
  const params = new URLSearchParams();
  if (caseItem.id) params.set('caseId', caseItem.id);
  if (caseItem.slug) params.set('caseSlug', caseItem.slug);
  return `/${caseLocale}/prompts${params.toString() ? `?${params.toString()}` : ''}`;
}

function getPromptCategoryHref(
  locale: 'zh-CN' | 'en-US',
  slug: string
): string {
  return `/${locale}/prompts/category/${slug}`;
}

function getCaseCategoryLabel(
  category: string | undefined,
  locale: 'zh-CN' | 'en-US'
): string | null {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  const zhLabels: Record<string, string> = {
    character: '角色设定',
    portrait: '人像写真',
    product: '商品视觉',
    'product-images': '商品视觉',
    poster: '海报设计',
    cover: '封面设计',
    social: '社媒视觉',
    avatar: '头像视觉',
    sticker: '贴纸素材',
    workflow: '工作流案例',
    ui: '界面视觉',
    game: '游戏视觉'
  };
  const enLabels: Record<string, string> = {
    character: 'Character design',
    portrait: 'Portrait visual',
    product: 'Product visual',
    'product-images': 'Product visual',
    poster: 'Poster design',
    cover: 'Cover design',
    social: 'Social visual',
    avatar: 'Avatar visual',
    sticker: 'Sticker asset',
    workflow: 'Workflow case',
    ui: 'Interface visual',
    game: 'Game visual'
  };
  const labels = locale === 'zh-CN' ? zhLabels : enLabels;
  return labels[normalized] || category.trim();
}

function getCaseDescription(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US',
  fallback: string
): string {
  const categoryLabel = getCaseCategoryLabel(caseItem.category, locale);
  if (categoryLabel) {
    return locale === 'zh-CN'
      ? `${categoryLabel} · 可复用案例`
      : `${categoryLabel} · Reusable case`;
  }
  return fallback;
}

function isValidNewsletterEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getNewsletterStatusTone(status: NewsletterStatus): FieldMessageTone {
  if (status === 'success') return 'success';
  if (status === 'duplicate') return 'warning';
  if (status === 'invalid' || status === 'error') return 'error';
  return 'neutral';
}

function mapPromptCaseToHomeCard(
  caseItem: PromptCase,
  locale: 'zh-CN' | 'en-US',
  fallbackTitle: string
): HomeCaseCard | null {
  const imageUrl = caseItem.imageUrl || caseItem.imageUrls?.[0];
  if (!imageUrl) return null;
  const stats = [
    caseItem.model,
    caseItem.category,
    caseItem.generateCount ? `${caseItem.generateCount} runs` : null
  ].filter(Boolean);
  return {
    id: caseItem.id,
    title: getCaseTitle(caseItem, fallbackTitle),
    description: getCaseDescription(caseItem, locale, fallbackTitle),
    imageUrl,
    meta: stats.join(' · ') || 'Prompt Case',
    href: getCaseHref(caseItem, locale),
    category: caseItem.category
  };
}

function caseSearchText(caseItem: HomeCaseCard): string {
  return `${caseItem.title} ${caseItem.description} ${caseItem.meta} ${caseItem.category || ''}`.toLowerCase();
}

function matchesAnyCaseToken(
  caseItem: HomeCaseCard,
  tokens: string[]
): boolean {
  const searchText = caseSearchText(caseItem);
  return tokens.some((token) => searchText.includes(token.toLowerCase()));
}

function getHomeCaseCategoryLabel(
  caseItem: HomeCaseCard,
  locale: 'zh-CN' | 'en-US'
): string {
  return (
    getCaseCategoryLabel(caseItem.category, locale) ||
    caseItem.meta.split('·')[0]?.trim() ||
    caseItem.meta
  );
}
const Icons = {
  Logo: () => (
    <img
      src="/icons/logo-icon.svg"
      alt="WebToMind"
      style={{ width: '100%', height: '100%' }}
    />
  ),
  ArrowRight: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
      />
    </svg>
  ),
  Chrome: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z" />
    </svg>
  ),
  Sparkles: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  ),
  MindMap: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
      />
    </svg>
  ),
  Document: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  ),
  Cloud: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
      />
    </svg>
  ),
  Edit: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  ),
  Message: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  ),
  Video: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25c0 .621.504 1.125 1.125 1.125M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621.504 1.125 1.125 1.125M6 13.125C6 12.504 6.504 12 7.125 12m9.75 0v1.5c0 .621.504 1.125 1.125 1.125M16.875 12c.621 0 1.125.504 1.125 1.125m-1.125 0c-.621 0-1.125.504-1.125 1.125"
      />
    </svg>
  ),
  Link: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </svg>
  ),
  Brain: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM21.75 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21.75a3.745 3.745 0 01-3.818-1.343 3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 012.25 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 2.25a3.745 3.745 0 013.818 1.343 3.745 3.745 0 013.296 1.043 3.745 3.745 0 011.043 3.296A3.745 3.745 0 0121.75 12z"
      />
    </svg>
  ),
  Lightning: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    </svg>
  ),
  Folder: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  ),
  Check: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  ),
  Lock: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  ),
  Palette: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"
      />
    </svg>
  ),
  Film: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25c0 .621.504 1.125 1.125 1.125M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621.504 1.125 1.125 1.125M6 13.125C6 12.504 6.504 12 7.125 12m0 0h9.75"
      />
    </svg>
  ),
  PencilSquare: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
      />
    </svg>
  ),
  DevicePhoneMobile: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
      />
    </svg>
  ),
  VideoCameraIcon: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  ),
  NewspaperIcon: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
      />
    </svg>
  )
};

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t, i18n } = useTranslation('home');
  const pathname = location.pathname;
  const isRootHome = pathname === '/';
  const faqItems = useMemo(
    () =>
      (t('faq.items', {
        returnObjects: true
      }) as Array<{ q: string; a: string }>) || [],
    [t]
  );

  const localeFromPath = pathname.startsWith('/en-US')
    ? 'en-US'
    : pathname.startsWith('/zh-CN')
      ? 'zh-CN'
      : i18n.language === 'en-US'
        ? 'en-US'
        : 'zh-CN';
  const localePrefix = localeFromPath === 'en-US' ? '/en-US' : '/zh-CN';
  const heroTitleSeparator = localeFromPath === 'zh-CN' ? '' : ' ';
  const heroTitle = String(t('hero.title'));
  const heroTitleHighlight = String(t('hero.titleHighlight'));
  const zhHeroTitleRest = heroTitleHighlight;
  const promptLibraryTarget =
    localeFromPath === 'en-US' ? '/en-US/prompts' : `${localePrefix}/prompts`;
  const [homeCases, setHomeCases] = useState<HomeCaseCard[]>([]);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] =
    useState<NewsletterStatus>('idle');
  const isZh = localeFromPath === 'zh-CN';

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (
      pathname === '/' ||
      pathname === '/zh-CN/overview' ||
      pathname === '/en-US/overview'
    ) {
      navigate(`${localePrefix}/create`, { replace: true });
    }
  }, [authLoading, isAuthenticated, localePrefix, navigate, pathname]);

  useEffect(() => {
    if (i18n.language !== localeFromPath) {
      void i18n.changeLanguage(localeFromPath);
    }
  }, [i18n, localeFromPath]);

  useEffect(() => {
    let cancelled = false;
    getPublicPromptCases(24, {
      locale: localeFromPath,
      requireImage: true,
      featuredOnly: true
    })
      .then((items) => {
        if (cancelled) return;
        const mapped = items
          .map((item, index) =>
            mapPromptCaseToHomeCard(
              item,
              localeFromPath,
              isZh ? `精选案例 ${index + 1}` : `Featured case ${index + 1}`
            )
          )
          .filter((item): item is HomeCaseCard => Boolean(item))
          .slice(0, 24);
        setHomeCases(mapped);
      })
      .catch(() => {
        if (cancelled) return;
        setHomeCases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isZh, localeFromPath]);

  useEffect(() => {
    const locale = localeFromPath;
    const isEnglish = locale === 'en-US';
    const canonicalPath = isRootHome ? '/' : pathname;
    const canonical = `https://webtomind.com${canonicalPath}`;
    const zhHref = 'https://webtomind.com/zh-CN/overview';
    const enHref = 'https://webtomind.com/en-US/overview';
    const seoTitle = isEnglish
      ? 'WebToMind - Reproducible AI Image Creation Workflow'
      : '\u0057\u0065\u0062\u0054\u006f\u004d\u0069\u006e\u0064 - \u53ef\u590d\u73b0\u7684 \u0041\u0049 \u56fe\u7247\u521b\u4f5c\u5de5\u4f5c\u6d41';
    const seoDescription = isEnglish
      ? 'WebToMind helps AI image creators reverse prompts from reference images, combine visual slots, generate images, and re-edit generation history in one reproducible workflow.'
      : '\u0057\u0065\u0062\u0054\u006f\u004d\u0069\u006e\u0064 \u4e13\u6ce8 \u0041\u0049 \u56fe\u7247\u521b\u4f5c\uff1a\u652f\u6301\u53c2\u8003\u56fe\u53cd\u63a8\u63d0\u793a\u8bcd\u3001\u89c6\u89c9 \u0073\u006c\u006f\u0074 \u7ec4\u5408\u3001\u591a\u6a21\u578b\u51fa\u56fe\u4e0e\u5386\u53f2\u91cd\u7f16\u8f91\uff0c\u8ba9\u6bcf\u5f20\u56fe\u90fd\u53ef\u590d\u73b0\u3001\u53ef\u8fed\u4ee3\u3002';
    const softwareDescription = isEnglish
      ? 'An AI image creation workflow for reference-image prompt reverse, visual slot composition, image generation, and history re-editing.'
      : '\u4e00\u5957 \u0041\u0049 \u56fe\u7247\u521b\u4f5c\u5de5\u4f5c\u6d41\uff0c\u652f\u6301\u53c2\u8003\u56fe\u63d0\u793a\u8bcd\u53cd\u63a8\u3001\u89c6\u89c9 \u0073\u006c\u006f\u0074 \u7ec4\u5408\u3001\u56fe\u7247\u751f\u6210\u4e0e\u5386\u53f2\u91cd\u7f16\u8f91\u3002';
    return applySeo({
      title: seoTitle,
      description: seoDescription,
      canonical,
      htmlLang: locale,
      ogLocale: isEnglish ? 'en_US' : 'zh_CN',
      alternates: [
        { hreflang: 'zh-CN', href: zhHref },
        { hreflang: 'en-US', href: enHref },
        { hreflang: 'x-default', href: 'https://webtomind.com/en-US/overview' }
      ],
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'WebToMind',
          url: 'https://webtomind.com',
          logo: 'https://webtomind.com/icons/logo-icon.svg'
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'WebToMind',
          url: 'https://webtomind.com',
          inLanguage: locale
        },
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'WebToMind',
          applicationCategory: 'ProductivityApplication',
          operatingSystem: 'Web, Chrome Extension',
          url: 'https://webtomind.com',
          description: softwareDescription,
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD'
          }
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.a
            }
          }))
        }
      ]
    });
  }, [faqItems, isRootHome, localeFromPath, pathname, t]);

  const fallbackHomeCases = useMemo<HomeCaseCard[]>(
    () => [
      {
        id: 'fallback-poster',
        title: t('hotCases.fallback.poster.title'),
        description: getCaseDescription(
          {
            id: 'fallback-poster',
            imageUrl: neonCollageHeroProduct,
            prompt: '',
            category: 'poster'
          },
          localeFromPath,
          t('hotCases.fallback.poster.prompt')
        ),
        imageUrl: neonCollageHeroProduct,
        meta: t('hotCases.fallback.poster.meta'),
        href: promptLibraryTarget,
        category: 'poster'
      },
      {
        id: 'fallback-workflow',
        title: t('hotCases.fallback.workflow.title'),
        description: getCaseDescription(
          {
            id: 'fallback-workflow',
            imageUrl: neonCollageWorkflow,
            prompt: '',
            category: 'workflow'
          },
          localeFromPath,
          t('hotCases.fallback.workflow.prompt')
        ),
        imageUrl: neonCollageWorkflow,
        meta: t('hotCases.fallback.workflow.meta'),
        href: promptLibraryTarget,
        category: 'workflow'
      },
      {
        id: 'fallback-stickers',
        title: t('hotCases.fallback.stickers.title'),
        description: getCaseDescription(
          {
            id: 'fallback-stickers',
            imageUrl: neonCollageStickers,
            prompt: '',
            category: 'sticker'
          },
          localeFromPath,
          t('hotCases.fallback.stickers.prompt')
        ),
        imageUrl: neonCollageStickers,
        meta: t('hotCases.fallback.stickers.meta'),
        href: promptLibraryTarget,
        category: 'sticker'
      },
      {
        id: 'fallback-magazine',
        title: t('hotCases.fallback.magazine.title'),
        description: getCaseDescription(
          {
            id: 'fallback-magazine',
            imageUrl: neonCollageWorkflow,
            prompt: '',
            category: 'cover'
          },
          localeFromPath,
          t('hotCases.fallback.magazine.prompt')
        ),
        imageUrl: neonCollageWorkflow,
        meta: t('hotCases.fallback.magazine.meta'),
        href: promptLibraryTarget,
        category: 'cover'
      },
      {
        id: 'fallback-product',
        title: t('hotCases.fallback.product.title'),
        description: getCaseDescription(
          {
            id: 'fallback-product',
            imageUrl: neonCollageHeroProduct,
            prompt: '',
            category: 'product'
          },
          localeFromPath,
          t('hotCases.fallback.product.prompt')
        ),
        imageUrl: neonCollageHeroProduct,
        meta: t('hotCases.fallback.product.meta'),
        href: promptLibraryTarget,
        category: 'product'
      },
      {
        id: 'fallback-character',
        title: t('hotCases.fallback.character.title'),
        description: getCaseDescription(
          {
            id: 'fallback-character',
            imageUrl: neonCollageStickers,
            prompt: '',
            category: 'character'
          },
          localeFromPath,
          t('hotCases.fallback.character.prompt')
        ),
        imageUrl: neonCollageStickers,
        meta: t('hotCases.fallback.character.meta'),
        href: promptLibraryTarget,
        category: 'character'
      }
    ],
    [localeFromPath, promptLibraryTarget, t]
  );
  const homeCasePool = homeCases.length > 0 ? homeCases : fallbackHomeCases;
  const displayedHomeCases = homeCasePool.slice(0, 8);
  const caseCollections = useMemo<HomeCaseCollection[]>(() => {
    const shouldAvoidFeaturedDuplicates =
      homeCasePool.length > displayedHomeCases.length;
    const usedIds = new Set(
      shouldAvoidFeaturedDuplicates
        ? displayedHomeCases.map((caseItem) => caseItem.id)
        : []
    );
    const collectionConfigs = [
      {
        id: 'portrait',
        label: t('caseCollections.portrait.label'),
        title: t('caseCollections.portrait.title'),
        description: t('caseCollections.portrait.description'),
        href: getPromptCategoryHref(localeFromPath, 'ai-portrait'),
        tokens: [
          'portrait',
          'fashion',
          '人像',
          '写真',
          '肖像',
          'cosplay',
          '穿搭',
          '摄影'
        ]
      },
      {
        id: 'commerce',
        label: t('caseCollections.commerce.label'),
        title: t('caseCollections.commerce.title'),
        description: t('caseCollections.commerce.description'),
        href: getPromptCategoryHref(localeFromPath, 'product-images'),
        tokens: [
          'ecommerce',
          'product',
          'poster',
          'featured',
          '商品',
          '电商',
          '主图',
          '广告',
          '海报',
          '封面',
          '美食',
          'kv'
        ]
      },
      {
        id: 'character',
        label: t('caseCollections.character.label'),
        title: t('caseCollections.character.title'),
        description: t('caseCollections.character.description'),
        href: getPromptCategoryHref(localeFromPath, 'character-consistency'),
        tokens: [
          'character',
          'game',
          'ui',
          '角色',
          '游戏',
          '奖励',
          '界面',
          'q版',
          '电竞',
          '高达',
          '冒险岛'
        ]
      },
      {
        id: 'poster',
        label: t('caseCollections.poster.label'),
        title: t('caseCollections.poster.title'),
        description: t('caseCollections.poster.description'),
        href: getPromptCategoryHref(localeFromPath, 'xiaohongshu-cover'),
        tokens: [
          'poster',
          'cover',
          'social',
          'magazine',
          '海报',
          '封面',
          '杂志',
          '社媒',
          '小红书',
          '活动',
          '宣发'
        ]
      },
      {
        id: 'workflow',
        label: t('caseCollections.workflow.label'),
        title: t('caseCollections.workflow.title'),
        description: t('caseCollections.workflow.description'),
        href: getPromptCategoryHref(localeFromPath, 'sref-prompts'),
        tokens: [
          'workflow',
          'slot',
          'prompt',
          'reference',
          'ui',
          '工作流',
          '提示词',
          '参考图',
          '复用',
          '界面',
          '奖励'
        ]
      }
    ];

    const pushUnique = (
      target: HomeCaseCard[],
      source: HomeCaseCard[],
      options: { avoidUsed: boolean }
    ) => {
      source.forEach((caseItem) => {
        if (target.length >= 4) return;
        if (options.avoidUsed && usedIds.has(caseItem.id)) return;
        if (!target.some((selectedItem) => selectedItem.id === caseItem.id)) {
          target.push(caseItem);
        }
      });
    };

    return collectionConfigs
      .map((config) => {
        const directMatches = homeCasePool.filter((caseItem) =>
          matchesAnyCaseToken(caseItem, config.tokens)
        );
        const selected: HomeCaseCard[] = [];

        pushUnique(selected, directMatches, { avoidUsed: true });
        pushUnique(selected, homeCasePool, { avoidUsed: true });
        pushUnique(selected, directMatches, { avoidUsed: false });
        pushUnique(selected, homeCasePool, { avoidUsed: false });

        selected.forEach((caseItem) => usedIds.add(caseItem.id));
        return {
          id: config.id,
          label: config.label,
          title: config.title,
          description: config.description,
          href: config.href,
          cases: selected
        };
      })
      .filter((collection) => collection.cases.length >= 2);
  }, [displayedHomeCases, homeCasePool, localeFromPath, t]);

  async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = newsletterEmail.trim();
    if (newsletterStatus === 'submitting') return;
    if (!email) {
      setNewsletterStatus('invalid');
      return;
    }
    if (!isValidNewsletterEmail(email)) {
      setNewsletterStatus('invalid');
      return;
    }
    setNewsletterStatus('submitting');
    try {
      const result = await subscribeMarketingEmail({
        email,
        locale: localeFromPath,
        source: 'home_hot_cases'
      });
      setNewsletterStatus(
        result.status === 'already_subscribed' ? 'duplicate' : 'success'
      );
    } catch {
      setNewsletterStatus('error');
    }
  }

  return (
    <div className="home-page">
      <TopNav />

      <section className="hero-section">
        <div
          className="home-neon-sticker-cloud home-neon-sticker-cloud-hero"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${neonCollageStickers})`,
            backgroundSize: '100% auto',
            backgroundRepeat: 'no-repeat'
          }}
        />
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot" />
              <span>{t('hero.badge')}</span>
            </div>
            <h1 className="hero-title">
              {localeFromPath === 'zh-CN' ? (
                <>
                  <span className="hero-title-line">{heroTitle}</span>
                  <span className="hero-title-line hero-title-highlight">
                    {zhHeroTitleRest}
                  </span>
                </>
              ) : (
                <>
                  {heroTitle}
                  {heroTitleSeparator}
                  <span className="hero-title-highlight">
                    {heroTitleHighlight}
                  </span>
                </>
              )}
            </h1>
            <p className="hero-description">{t('hero.description')}</p>
            <div className="hero-actions">
              <Button
                type="button"
                onClick={() => navigate(promptLibraryTarget)}
                variant="primary"
                size="lg"
                className="home-neon-button home-neon-button-primary"
                trailingIcon={<Icons.ArrowRight />}
              >
                {isAuthenticated ? t('hero.ctaAuth') : t('hero.ctaUnauth')}
              </Button>
              <Button
                type="button"
                onClick={() => navigate(`${localePrefix}/create`)}
                variant="secondary"
                size="lg"
                className="home-neon-button home-neon-button-secondary"
                leadingIcon={<Icons.ArrowRight />}
              >
                {t('hero.installExtension')}
              </Button>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-value">500+</div>
                <div className="hero-stat-label">{t('hero.stats.users')}</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-value">2K+</div>
                <div className="hero-stat-label">{t('hero.stats.content')}</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-value">4.8</div>
                <div className="hero-stat-label">{t('hero.stats.rating')}</div>
              </div>
            </div>
          </div>

          <div className="hero-visual hero-visual-neon">
            <div className="neon-hero-stage">
              <img
                className="neon-hero-art neon-hero-art-product"
                src={neonCollageHeroProduct}
                alt="WebToMind visual prompt workflow collage showing reference inputs becoming reusable AI image prompts and outputs"
                width="1536"
                height="1024"
                loading="eager"
                decoding="async"
                {...imageFetchPriority('high')}
              />
              <span className="neon-signal-chip neon-signal-chip-top">
                VISUAL PROMPT OS
              </span>
              <span className="neon-signal-chip neon-signal-chip-bottom">
                REF TO IMAGE
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="hot-cases" className="hot-cases-section">
        <div className="hot-cases-container">
          <div className="hot-cases-header">
            <div>
              <span className="section-label">{t('hotCases.label')}</span>
              <h2 className="section-title">{t('hotCases.title')}</h2>
              <p className="section-description">{t('hotCases.description')}</p>
            </div>
            <Button
              type="button"
              onClick={() => navigate(promptLibraryTarget)}
              variant="secondary"
              size="md"
              className="hot-cases-more"
              trailingIcon={<Icons.ArrowRight />}
            >
              {t('hotCases.viewAll')}
            </Button>
          </div>
          <div className="hot-cases-grid">
            {displayedHomeCases.map((caseItem, index) => (
              <Card
                as="a"
                key={caseItem.id}
                className="hot-case-card"
                variant="media"
                density="compact"
                href={caseItem.href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(caseItem.href);
                }}
              >
                <MediaTile
                  className="hot-case-cover-wrap"
                  ratio="portrait"
                  fit="cover"
                >
                  <img
                    className="hot-case-cover"
                    src={caseItem.imageUrl}
                    alt={caseItem.title}
                    loading={index < 4 ? 'eager' : 'lazy'}
                    decoding="async"
                    {...imageFetchPriority(index < 2 ? 'high' : 'auto')}
                    sizes="(max-width: 760px) 46vw, (max-width: 1080px) 30vw, 280px"
                  />
                  <Badge className="hot-case-rank" variant="accent" size="md">
                    {String(index + 1).padStart(2, '0')}
                  </Badge>
                </MediaTile>
                <div className="hot-case-body">
                  <Badge className="hot-case-meta" variant="accent" size="sm">
                    {caseItem.meta}
                  </Badge>
                  <h3>{caseItem.title}</h3>
                  <p>{getHomeCaseCategoryLabel(caseItem, localeFromPath)}</p>
                  <span className="hot-case-cta">
                    {t('hotCases.cardCta')}
                    <Icons.ArrowRight />
                  </span>
                </div>
              </Card>
            ))}
          </div>
          <div
            className="case-collections"
            aria-label={t('caseCollections.ariaLabel')}
          >
            {caseCollections.map((collection) => (
              <section
                className={`case-collection case-collection-${collection.id}`}
                key={collection.id}
              >
                <div className="case-collection-copy">
                  <span className="case-collection-label">
                    {collection.label}
                  </span>
                  <h3>{collection.title}</h3>
                  <p>{collection.description}</p>
                  <ButtonLink
                    className="case-collection-cta"
                    to={collection.href}
                    variant="secondary"
                    size="sm"
                    trailingIcon={<Icons.ArrowRight />}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(collection.href);
                    }}
                  >
                    {t('caseCollections.viewCategory')}
                  </ButtonLink>
                </div>
                <div className="case-collection-list">
                  {collection.cases.map((caseItem) => (
                    <Card
                      as="a"
                      key={`${collection.id}-${caseItem.id}`}
                      className="case-collection-card"
                      variant="media"
                      density="compact"
                      href={caseItem.href}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(caseItem.href);
                      }}
                    >
                      <MediaTile
                        className="case-collection-thumb"
                        ratio="landscape"
                        fit="cover"
                      >
                        <img
                          src={caseItem.imageUrl}
                          alt={caseItem.title}
                          loading="lazy"
                          decoding="async"
                          {...imageFetchPriority('low')}
                          sizes="(max-width: 760px) 43vw, (max-width: 1100px) 22vw, 160px"
                        />
                      </MediaTile>
                      <span className="case-collection-card-copy">
                        <strong>{caseItem.title}</strong>
                        <span>
                          {getHomeCaseCategoryLabel(caseItem, localeFromPath)}
                        </span>
                        <span className="case-collection-card-cta">
                          {t('hotCases.cardCta')}
                          <Icons.ArrowRight />
                        </span>
                      </span>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="newsletter-section">
        <div className="newsletter-container">
          <div className="newsletter-copy">
            <span className="section-label">{t('newsletter.label')}</span>
            <h2 className="section-title">{t('newsletter.title')}</h2>
            <p className="section-description">{t('newsletter.description')}</p>
          </div>
          <form
            className="newsletter-form"
            onSubmit={handleNewsletterSubmit}
            noValidate
          >
            <FormField
              label={t('newsletter.emailLabel')}
              htmlFor="home-newsletter-email"
              required
              className="newsletter-field"
            >
              <div className="newsletter-input-row">
                <Input
                  id="home-newsletter-email"
                  type="email"
                  value={newsletterEmail}
                  invalid={newsletterStatus === 'invalid'}
                  aria-describedby="home-newsletter-status"
                  onChange={(event) => {
                    setNewsletterEmail(event.target.value);
                    if (newsletterStatus !== 'submitting') {
                      setNewsletterStatus('idle');
                    }
                  }}
                  placeholder={t('newsletter.placeholder')}
                  inputSize="lg"
                  className="newsletter-input"
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="home-neon-button home-neon-button-primary newsletter-submit"
                  isLoading={newsletterStatus === 'submitting'}
                >
                  {newsletterStatus === 'submitting'
                    ? t('newsletter.submitting')
                    : t('newsletter.submit')}
                </Button>
              </div>
              <FieldMessage
                id="home-newsletter-status"
                tone={getNewsletterStatusTone(newsletterStatus)}
                className={`newsletter-status newsletter-status-${newsletterStatus}`}
                aria-live="polite"
              >
                {newsletterStatus === 'success'
                  ? t('newsletter.success')
                  : newsletterStatus === 'duplicate'
                    ? t('newsletter.duplicate')
                    : newsletterStatus === 'invalid'
                      ? t('newsletter.invalid')
                      : newsletterStatus === 'error'
                        ? t('newsletter.error')
                        : t('newsletter.privacy')}
              </FieldMessage>
            </FormField>
          </form>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-container">
          <img
            className="neon-cta-art"
            src={neonCollageWorkflow}
            alt="WebToMind 图片创作工作流：从参考图整理到 Prompt 与成图"
            width="1536"
            height="1024"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <h2 className="cta-title">{t('cta.title')}</h2>
          <p className="cta-description">{t('cta.description')}</p>
          <div className="cta-actions">
            <Button
              type="button"
              onClick={() => navigate(promptLibraryTarget)}
              variant="primary"
              size="lg"
              className="home-neon-button home-neon-button-primary"
              trailingIcon={<Icons.ArrowRight />}
            >
              {isAuthenticated ? t('cta.ctaAuth') : t('cta.ctaUnauth')}
            </Button>
            <Button
              type="button"
              onClick={() => navigate(`${localePrefix}/create`)}
              variant="secondary"
              size="lg"
              className="home-neon-button home-neon-button-secondary"
            >
              {t('cta.workspace')}
            </Button>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-container">
          <div className="footer-logo">
            <div className="footer-logo-icon">
              <Icons.Logo />
            </div>
            <span className="footer-logo-text">WebToMind</span>
          </div>
          <div className="footer-links">
            <a href="/terms" className="footer-link">
              {t('footer.terms')}
            </a>
            <a href="/privacy" className="footer-link">
              {t('footer.privacy')}
            </a>
            <a href={promptLibraryTarget} className="footer-link">
              {localeFromPath === 'en-US'
                ? 'AI Image Prompts'
                : 'Prompt 案例库'}
            </a>
            <a href="mailto:admin@example.com" className="footer-link">
              {t('footer.contact')}
            </a>
            <a
              href="https://x.com/webtomind"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              {t('footer.followX')}
            </a>
          </div>
          <div className="footer-ph-badge">
            <a
              href="https://www.producthunt.com/products/webtomind?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-webtomind"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WebToMind on Product Hunt"
            >
              <img
                alt="WebToMind - AI image prompts + model settings, one-click generate | Product Hunt"
                width="250"
                height="54"
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1218706&theme=dark"
                loading="lazy"
                decoding="async"
              />
            </a>
          </div>
          <div className="footer-copyright">{t('footer.copyright')}</div>
          <div className="footer-copyright" style={{ marginTop: '4px' }}>
            深圳市宇宙掘金科技有限公司 |{' '}
            <a
              href="https://beian.miit.gov.cn"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              粤ICP备2025434118号
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
