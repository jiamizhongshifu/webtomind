export function replaceSeoTag(
  html: string,
  pattern: RegExp,
  replacement: string
): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}
