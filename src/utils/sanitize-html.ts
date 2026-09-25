import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'ul',
  'video',
  'source'
];

const ALLOWED_ATTR = [
  'alt',
  'class',
  'controls',
  'height',
  'href',
  'loop',
  'muted',
  'playsinline',
  'poster',
  'rel',
  'src',
  'target',
  'title',
  'type',
  'width',
  'style'
];

const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|mailto|tel):|data:image\/|data:video\/)/i;

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP
  });
}
