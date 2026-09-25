import { escapeHtml, renderStudioDocToHtml } from './export-html';
import { writeClipboardHtml } from './clipboard-service';

export async function copyStudioDocForNotion(data: {
  title: string;
  content: Record<string, unknown>;
}) {
  const bodyHtml = renderStudioDocToHtml(data.content);
  const html = `
<article data-webtomind-export="notion">
  <h1>${escapeHtml(data.title)}</h1>
  ${bodyHtml}
</article>
`.trim();
  const plainText = `${data.title}\n\n${bodyHtml.replace(/<[^>]+>/g, '')}`;
  await writeClipboardHtml(html, plainText);
}
