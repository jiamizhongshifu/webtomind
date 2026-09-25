import { useMemo } from 'react';
import { sanitizeHtml } from '@/utils/sanitize-html';

type SafeHtmlTag = 'div' | 'span';

interface SafeHtmlProps {
  html: string;
  className?: string;
  as?: SafeHtmlTag;
}

export function SafeHtml({ html, className, as = 'div' }: SafeHtmlProps) {
  const sanitizedHtml = useMemo(() => sanitizeHtml(html), [html]);

  if (as === 'span') {
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
