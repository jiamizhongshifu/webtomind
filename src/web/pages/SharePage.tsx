/**
 * SharePage - Public Share View
 *
 * Displays shared content without requiring authentication.
 * Route: /s/:token
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createLogger } from '@/utils/logger';
import { Loader2, AlertCircle } from 'lucide-react';
import { ButtonLink, Card, DynamicIcon, EmptyState } from '../../shared/ui';
import { applySeo } from '../lib/seo';
import { SafeHtml } from '@/components/SafeHtml';

const log = createLogger('SharePage');

interface ShareData {
  title: string;
  content?: string;
  content_html?: string;
  created_at: string;
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShareData | null>(null);

  useEffect(() => {
    const title = data?.title
      ? `${data.title} | WebToMind 分享`
      : 'WebToMind 分享内容';
    const description = data?.title
      ? `查看 WebToMind 分享内容：${data.title}`
      : '查看由 WebToMind 生成的分享内容。';
    const canonical = token
      ? `https://webtomind.com/s/${token}`
      : 'https://webtomind.com';

    return applySeo({
      title,
      description,
      canonical,
      robots: 'noindex,nofollow',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, [data?.title, token]);

  useEffect(() => {
    if (!token) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    const fetchShareContent = async () => {
      try {
        const response = await fetch(`/api/share/${token}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          if (response.status === 404) {
            setError('This share link does not exist');
          } else if (response.status === 410) {
            setError('This share link has been revoked');
          } else {
            setError(result.error?.message || 'Failed to load content');
          }
          return;
        }

        setData(result.data);
      } catch (err) {
        log.error('[SharePage] Fetch error:', err);
        setError('Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    fetchShareContent();
  }, [token]);

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Render markdown content as HTML
  const renderContent = (markdown: string): string => {
    // Check if content is already HTML
    if (markdown.trim().startsWith('<')) {
      return markdown;
    }

    // Simple markdown to HTML conversion
    const lines = markdown.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        result.push(
          `<h1 class="text-2xl font-bold mb-4">${escapeHtml(line.slice(2))}</h1>`
        );
      } else if (line.startsWith('## ')) {
        result.push(
          `<h2 class="text-xl font-semibold mt-6 mb-3">${escapeHtml(line.slice(3))}</h2>`
        );
      } else if (line.startsWith('### ')) {
        result.push(
          `<h3 class="text-lg font-medium mt-4 mb-2">${escapeHtml(line.slice(4))}</h3>`
        );
      } else if (line.startsWith('> ')) {
        result.push(
          `<blockquote class="border-l-4 border-slate-300 pl-4 italic text-slate-600">${escapeHtml(line.slice(2))}</blockquote>`
        );
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        result.push(`<p class="mb-1">• ${escapeHtml(line.slice(2))}</p>`);
      } else if (line.trim() === '') {
        result.push('<br />');
      } else {
        result.push(`<p class="mb-2">${escapeHtml(line)}</p>`);
      }
    }

    return result.join('');
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--web-bg-canvas)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--web-text-secondary)]">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--web-bg-canvas)] flex items-center justify-center">
        <EmptyState
          className="max-w-md px-6 py-8"
          tone="glass"
          icon={<AlertCircle className="w-6 h-6" />}
          title="Content Unavailable"
          description={error}
          action={
            <ButtonLink
              to="/"
              variant="secondary"
              size="md"
              leadingIcon={<DynamicIcon name="external-link" size={16} />}
            >
              Go to WebToMind
            </ButtonLink>
          }
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const safeContentHtml =
    data.content_html || renderContent(data.content || '');

  return (
    <div className="min-h-screen bg-[var(--web-bg-canvas)]">
      {/* Header */}
      <header className="bg-white border-b border-[var(--web-border-soft)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-sm text-slate-800 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--web-brand-support)] focus-visible:ring-offset-2"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 128 128"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="128" height="128" rx="32" fill="url(#grad)" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M103 19C108.523 19 113 23.4772 113 29V99C113 104.523 108.523 109 103 109H25C19.4772 109 15 104.523 15 99V29C15 23.4772 19.4772 19 25 19H103ZM23 97C23 99.2091 24.7909 101 27 101H101C103.209 101 105 99.2091 105 97V37H23V97ZM26 25C24.3431 25 23 26.3431 23 28C23 29.6569 24.3431 31 26 31C27.6569 31 29 29.6569 29 28C29 26.3431 27.6569 25 26 25ZM36 25C34.3431 25 33 26.3431 33 28C33 29.6569 34.3431 31 36 31C37.6569 31 39 29.6569 39 28C39 26.3431 37.6569 25 36 25ZM46 25C44.3431 25 43 26.3431 43 28C43 29.6569 44.3431 31 46 31C47.6569 31 49 29.6569 49 28C49 26.3431 47.6569 25 46 25Z"
                fill="white"
              />
              <defs>
                <linearGradient
                  id="grad"
                  x1="0"
                  y1="0"
                  x2="128"
                  y2="128"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#F7306E" />
                  <stop offset="0.5" stopColor="#EB78F9" />
                  <stop offset="1" stopColor="#00AEFF" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-semibold">WebToMind</span>
          </Link>
          <span className="text-sm text-slate-500">
            {formatDate(data.created_at)}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Card as="article" variant="raised" className="ui-card--web p-8">
          <SafeHtml
            as="div"
            className="prose prose-slate max-w-none"
            html={safeContentHtml}
          />
        </Card>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-slate-500">
          <p>
            Shared via{' '}
            <a
              href="https://webtomind.com"
              className="text-blue-500 hover:underline"
            >
              WebToMind
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
