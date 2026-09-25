export function decodeHtmlEntities(value: string): string {
  if (!value) return '';

  if (typeof document === 'undefined') {
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

export function normalizeMediaUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return '';
  const decoded = decodeHtmlEntities(rawUrl).trim();
  if (/^data:(image|video)\//i.test(decoded)) {
    return decoded.replace(/;\s*base64\s*,\s*/i, ';base64,');
  }
  return decoded;
}

export function extractFirstImageUrl(
  content: string | undefined
): string | null {
  if (!content) return null;

  const htmlMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlMatch?.[1]) {
    const normalized = normalizeMediaUrl(htmlMatch[1]);
    return normalized || null;
  }

  const markdownMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (markdownMatch?.[1]) {
    const normalized = normalizeMediaUrl(markdownMatch[1]);
    return normalized || null;
  }

  return null;
}

export function extractFirstVideoUrl(
  content: string | undefined
): string | null {
  if (!content) return null;
  const htmlMatch = content.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (!htmlMatch?.[1]) return null;
  const normalized = normalizeMediaUrl(htmlMatch[1]);
  return normalized || null;
}
