import { escapeHtml, renderStudioDocToHtml } from './export-html';
import { writeClipboardHtml } from './clipboard-service';

function sanitizeForLark(html: string): string {
  return html
    .replace(/style="([^"]*)"/gi, (_full, styleText: string) => {
      const safeRules = styleText
        .split(';')
        .map((rule: string) => rule.trim())
        .filter(Boolean)
        .filter((rule: string) => {
          const key = rule.split(':')[0]?.trim().toLowerCase();
          return key !== 'margin' && key !== 'padding';
        });
      if (safeRules.length === 0) return '';
      return `style="${safeRules.join(';')}"`;
    })
    .replace(/\sstyle=""/gi, '')
    .replace(/\sclass=""/gi, '')
    .replace(/<p>\s*<\/p>/gi, '');
}

export async function copyStudioDocForLark(data: {
  title: string;
  content: Record<string, unknown>;
}) {
  const bodyHtml = renderStudioDocToHtml(data.content);
  const html = sanitizeForLark(
    `
<article data-webtomind-export="lark">
  <h1>${escapeHtml(data.title)}</h1>
  ${bodyHtml}
</article>
`.trim()
  );
  const plainText = `${data.title}\n\n${bodyHtml.replace(/<[^>]+>/g, '')}`;
  await writeClipboardHtml(html, plainText);
}
