import { normalizeMediaUrl } from './media-url';
import {
  parseTwitterMetadata,
  stripTwitterMetadata,
  type TwitterEmbedMedia,
  type TwitterMetadata
} from '@/utils/twitter-metadata';

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDetailMarkdownInline(text: string): string {
  const safeText = escapeHtmlText(text);
  return safeText
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      const normalized = normalizeMediaUrl(url);
      if (!normalized) return '';
      return `<img src="${escapeHtmlText(normalized)}" alt="${alt}" class="max-w-full h-auto rounded-lg my-2" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" />`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
      const normalized = normalizeMediaUrl(url);
      if (!normalized) return label;
      return `<a href="${escapeHtmlText(normalized)}" class="text-blue-600 dark:text-blue-400 underline" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(?:^|[\s])_([^_]+)_(?:[\s]|$)/g, ' <em>$1</em> ')
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-slate-100 dark:bg-slate-700 px-1 rounded">$1</code>'
    )
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

function isRawHtmlLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('<') || !trimmed.endsWith('>')) {
    return false;
  }

  // Keep Markdown autolink syntax like <https://example.com> as plain text.
  if (/^<https?:\/\//i.test(trimmed)) {
    return false;
  }

  const hasHtmlTag = /<\/?[a-zA-Z][\w:-]*(\s[^<>]*)?\s*\/?>/.test(trimmed);
  if (!hasHtmlTag) {
    return false;
  }

  return (
    /^<[^>]+>$/.test(trimmed) ||
    /^<([a-zA-Z][\w:-]*)(\s[^<>]*)?>[\s\S]*<\/\1>$/.test(trimmed)
  );
}

export function renderDetailMarkdown(markdown: string): string {
  const twitterMetadata = parseTwitterMetadata(markdown);
  const normalizedMarkdown = stripTwitterMetadata(markdown);
  const rawLines = normalizedMarkdown.split('\n');
  const lines: string[] = [];
  let inFence = false;
  let previousLineEmpty = false;
  for (const rawLine of rawLines) {
    if (rawLine.startsWith('```')) {
      inFence = !inFence;
      previousLineEmpty = false;
      lines.push(rawLine);
      continue;
    }

    if (!inFence && rawLine.trim() === '') {
      if (previousLineEmpty) {
        continue;
      }
      previousLineEmpty = true;
      lines.push('');
      continue;
    }

    previousLineEmpty = false;
    lines.push(rawLine);
  }
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  const formatCompactNumber = (value?: number): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '0';
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  };

  const linkifyInlineText = (text: string): string => {
    const escaped = escapeHtmlText(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
      return `<a href="${url}" class="text-blue-600 dark:text-blue-400 underline break-all" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
  };

  const renderTweetMediaItem = (
    media: TwitterEmbedMedia,
    index: number
  ): string => {
    const normalizedUrl = normalizeMediaUrl(media.url);
    if (!normalizedUrl) return '';
    const safeUrl = escapeHtmlText(normalizedUrl);
    const safeThumb = media.thumbnailUrl
      ? escapeHtmlText(normalizeMediaUrl(media.thumbnailUrl))
      : '';

    if (media.type === 'video' || media.type === 'gif') {
      return `<div class="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black/90"><video class="w-full h-auto" controls preload="metadata" playsinline ${safeThumb ? `poster="${safeThumb}"` : ''}><source src="${safeUrl}" type="video/mp4" /></video></div>`;
    }

    return `<div class="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"><img src="${safeUrl}" alt="tweet-media-${index + 1}" class="w-full h-auto block" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></div>`;
  };

  const renderTwitterCard = (metadata: TwitterMetadata): string => {
    const safeAuthorName = escapeHtmlText(metadata.author.name || 'Unknown');
    const safeScreenName = escapeHtmlText(
      metadata.author.screenName || 'unknown'
    );
    const safeAvatar = metadata.author.avatarUrl
      ? escapeHtmlText(normalizeMediaUrl(metadata.author.avatarUrl))
      : '';
    const safePostUrl = escapeHtmlText(metadata.url);
    const textHtml = linkifyInlineText(metadata.text || '').replace(
      /\n/g,
      '<br>'
    );

    const fetchModeLabel =
      metadata.fetchMode === 'thread' ? 'Thread API' : 'Status API';
    const sourceLabel =
      metadata.source === 'bookmark-monitor' ? 'Bookmark Monitor' : 'FxEmbed';
    const traceLabel =
      metadata.fetchTrace?.statusFallbackUsed === true
        ? 'thread failed, fallback status'
        : metadata.fetchTrace?.threadSuccess
          ? 'thread success'
          : 'status only';

    const mediaHtml =
      metadata.media && metadata.media.length > 0
        ? `<div class="mt-3 grid gap-2" style="grid-template-columns: ${metadata.media.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr'};">${metadata.media
            .map((item, index) => renderTweetMediaItem(item, index))
            .join('')}</div>`
        : '';

    const quoteHtml = metadata.quote?.text
      ? `<div class="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3"><div class="text-xs text-slate-500">引用 @${escapeHtmlText(metadata.quote.author?.screenName || 'unknown')}</div><div class="mt-1 text-sm text-slate-700 dark:text-slate-300">${linkifyInlineText(metadata.quote.text).replace(/\n/g, '<br>')}</div></div>`
      : '';

    const threadPreview = (metadata.thread || []).slice(0, 2);
    const threadRemain = Math.max((metadata.thread || []).length - 2, 0);
    const threadHtml =
      threadPreview.length > 0
        ? `<div class="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3"><div class="text-xs font-medium text-slate-500 mb-2">线程上下文（共${metadata.thread?.length || 0}条）</div>${threadPreview
            .map((item, index) => {
              const author = item.author?.screenName
                ? `@${escapeHtmlText(item.author.screenName)}`
                : 'unknown';
              const text = linkifyInlineText(item.text || '').replace(
                /\n/g,
                '<br>'
              );
              return `<div class="${index > 0 ? 'mt-2 pt-2 border-t border-slate-200 dark:border-slate-700' : ''}"><div class="text-xs text-slate-500">${author}</div><div class="text-sm text-slate-700 dark:text-slate-300 mt-1">${text}</div></div>`;
            })
            .join(
              ''
            )}${threadRemain > 0 ? `<div class="mt-2 text-xs text-slate-500">还有 ${threadRemain} 条线程内容，点击“在 X 打开原帖”查看完整上下文。</div>` : ''}</div>`
        : '';

    const articleHtml = metadata.article?.title
      ? `<div class="mt-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-3"><div class="text-xs text-blue-700 dark:text-blue-300 font-medium">X Article</div><div class="text-sm text-slate-800 dark:text-slate-200 mt-1">${escapeHtmlText(metadata.article.title)}</div></div>`
      : '';

    const stats = metadata.stats || {};
    const statsHtml = `<div class="mt-3 text-xs text-slate-500 flex flex-wrap gap-3"><span>💬 ${formatCompactNumber(stats.replies)}</span><span>🔁 ${formatCompactNumber(stats.retweets)}</span><span>❤️ ${formatCompactNumber(stats.likes)}</span><span>👁️ ${formatCompactNumber(stats.views)}</span></div>`;

    return `<div class="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div class="flex items-center gap-3">
        ${safeAvatar ? `<img src="${safeAvatar}" alt="${safeAuthorName}" class="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ''}
        <div>
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">${safeAuthorName}</div>
          <div class="text-xs text-slate-500">@${safeScreenName}</div>
        </div>
      </div>
      ${textHtml ? `<div class="mt-3 text-sm leading-6 text-slate-800 dark:text-slate-200">${textHtml}</div>` : ''}
      ${articleHtml}
      ${quoteHtml}
      ${threadHtml}
      ${mediaHtml}
      ${statsHtml}
      <div class="mt-3 text-[11px] text-slate-500">${escapeHtmlText(sourceLabel)} · ${escapeHtmlText(fetchModeLabel)} · ${escapeHtmlText(traceLabel)}</div>
      <a href="${safePostUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex text-xs text-blue-600 dark:text-blue-400 underline">在 X 打开原帖</a>
    </div>`;
  };

  if (twitterMetadata) {
    result.push(renderTwitterCard(twitterMetadata));
  }

  const readMetaValue = (line: string, label: string): string | null => {
    const match = line.match(new RegExp(`^\\s*${label}[：:]\\s*(.+?)\\s*$`));
    return match?.[1]?.trim() || null;
  };

  const renderSourceCard = (
    sourceTitle: string,
    sourceUrl: string,
    savedAt?: string | null
  ): string => {
    const safeTitle = escapeHtmlText(sourceTitle);
    const safeUrl = escapeHtmlText(sourceUrl);
    const safeSavedAt = savedAt ? escapeHtmlText(savedAt) : '';

    return `<div class="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/85 dark:bg-slate-800/60 p-3 hover:border-blue-400/60 dark:hover:border-blue-500/60 transition-colors">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="block no-underline">
        <div class="text-xs font-medium uppercase tracking-wide text-slate-500">来源页面</div>
        <div class="mt-1 text-sm leading-relaxed text-slate-900 dark:text-slate-100 break-words">${safeTitle}</div>
        <div class="mt-2 text-xs text-blue-600 dark:text-blue-400 break-all">${safeUrl}</div>
        ${safeSavedAt ? `<div class="mt-1 text-xs text-slate-500">保存时间：${safeSavedAt}</div>` : ''}
      </a>
    </div>`;
  };

  const hasMarkdownTable = (content: string): boolean => {
    const contentLines = content.split('\n');
    for (let idx = 0; idx < contentLines.length - 1; idx += 1) {
      if (
        contentLines[idx].includes('|') &&
        /^\s*\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)*\s*\|?\s*$/.test(
          contentLines[idx + 1] || ''
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const splitTableRow = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.trim());
  };

  const getColumnAlign = (segment: string): 'left' | 'center' | 'right' => {
    const trimmed = segment.trim();
    const starts = trimmed.startsWith(':');
    const ends = trimmed.endsWith(':');
    if (starts && ends) return 'center';
    if (ends) return 'right';
    return 'left';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        const codeContent = codeBlockContent.join('\n');

        if (
          /^(markdown|md)$/i.test(codeBlockLang) &&
          hasMarkdownTable(codeContent)
        ) {
          result.push(renderDetailMarkdown(codeContent));
          codeBlockLang = '';
          codeBlockContent = [];
          continue;
        }

        const escapedCode = codeContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const safeCodeBlockLang = escapeHtmlText(codeBlockLang);

        result.push(`<div class="code-block-wrapper my-4">
        <div class="bg-slate-800 dark:bg-slate-900 rounded-lg overflow-hidden">
          ${safeCodeBlockLang ? `<div class="px-4 py-2 text-xs text-muted-foreground border-b border-slate-700 font-mono">${safeCodeBlockLang}</div>` : ''}
          <pre class="p-4 overflow-x-auto"><code class="text-sm font-mono text-slate-100 whitespace-pre">${escapedCode}</code></pre>
        </div>
      </div>`);

        codeBlockLang = '';
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (isRawHtmlLine(line)) {
      result.push(line.trim());
      continue;
    }

    const sourceTitleDirect = readMetaValue(line, '来源页面');
    const sourceUrlDirect = readMetaValue(lines[i + 1] || '', '链接');
    const savedAtDirect = readMetaValue(lines[i + 2] || '', '保存时间');
    if (sourceTitleDirect && sourceUrlDirect) {
      result.push(
        renderSourceCard(sourceTitleDirect, sourceUrlDirect, savedAtDirect)
      );
      i += savedAtDirect ? 2 : 1;
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line)) {
      const sourceTitleAfterDivider = readMetaValue(
        lines[i + 1] || '',
        '来源页面'
      );
      const sourceUrlAfterDivider = readMetaValue(lines[i + 2] || '', '链接');
      const savedAtAfterDivider = readMetaValue(lines[i + 3] || '', '保存时间');

      if (sourceTitleAfterDivider && sourceUrlAfterDivider) {
        result.push(
          renderSourceCard(
            sourceTitleAfterDivider,
            sourceUrlAfterDivider,
            savedAtAfterDivider
          )
        );
        i += savedAtAfterDivider ? 3 : 2;
        continue;
      }
    }

    const nextLine = lines[i + 1] || '';
    const isTableHeader = line.includes('|');
    const isTableSeparator =
      /^\s*\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)*\s*\|?\s*$/.test(nextLine);

    if (isTableHeader && isTableSeparator) {
      const headerCells = splitTableRow(line);
      const alignSegments = splitTableRow(nextLine);
      const columnAligns = alignSegments.map(getColumnAlign);

      const bodyRows: string[][] = [];
      let cursor = i + 2;
      while (cursor < lines.length) {
        const tableLine = lines[cursor];
        if (!tableLine || !tableLine.includes('|') || tableLine.trim() === '') {
          break;
        }
        bodyRows.push(splitTableRow(tableLine));
        cursor += 1;
      }

      const headerHtml = headerCells
        .map((cell, index) => {
          const align = columnAligns[index] || 'left';
          const alignClass =
            align === 'center'
              ? 'text-center'
              : align === 'right'
                ? 'text-right'
                : 'text-left';
          return `<th class="px-3 py-2 border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 font-semibold ${alignClass}">${formatDetailMarkdownInline(cell)}</th>`;
        })
        .join('');

      const bodyHtml = bodyRows
        .map((row) => {
          const rowHtml = headerCells
            .map((_, index) => {
              const align = columnAligns[index] || 'left';
              const alignClass =
                align === 'center'
                  ? 'text-center'
                  : align === 'right'
                    ? 'text-right'
                    : 'text-left';
              const cell = row[index] || '';
              return `<td class="px-3 py-2 border border-slate-300 dark:border-slate-600 ${alignClass}">${formatDetailMarkdownInline(cell)}</td>`;
            })
            .join('');
          return `<tr>${rowHtml}</tr>`;
        })
        .join('');

      result.push(
        `<div class="my-4 overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-600"><table class="w-full border-collapse text-sm text-slate-800 dark:text-slate-200"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
      );

      i = cursor - 1;
      continue;
    }

    const cleanedLine = line.replace(/^(#{1,6})\s+#{1,6}\s+/g, '$1 ');

    if (cleanedLine.startsWith('# ')) {
      result.push(
        `<div class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">${formatDetailMarkdownInline(cleanedLine.slice(2))}</div>`
      );
      continue;
    }
    if (cleanedLine.startsWith('## ')) {
      result.push(
        `<div class="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-3">${formatDetailMarkdownInline(cleanedLine.slice(3))}</div>`
      );
      continue;
    }
    if (cleanedLine.startsWith('### ')) {
      result.push(
        `<div class="text-base font-medium text-slate-700 dark:text-slate-300 mt-4 mb-2">${formatDetailMarkdownInline(cleanedLine.slice(4))}</div>`
      );
      continue;
    }
    if (cleanedLine.startsWith('#### ')) {
      result.push(
        `<div class="text-sm font-medium text-slate-600 mt-3 mb-2">${formatDetailMarkdownInline(cleanedLine.slice(5))}</div>`
      );
      continue;
    }
    if (cleanedLine.startsWith('> ')) {
      result.push(
        `<div class="text-base leading-relaxed text-slate-600 pl-4 border-l-4 border-slate-300 dark:border-slate-600 mb-3 italic">${formatDetailMarkdownInline(cleanedLine.slice(2))}</div>`
      );
      continue;
    }
    if (cleanedLine.startsWith('- ') || cleanedLine.startsWith('• ')) {
      const content = cleanedLine.slice(2);
      result.push(
        `<div class="text-base leading-relaxed text-slate-800 dark:text-slate-200 mb-1">• ${formatDetailMarkdownInline(content)}</div>`
      );
      continue;
    }
    if (cleanedLine.trim() === '') {
      result.push(
        '<div class="text-base leading-relaxed text-slate-800 dark:text-slate-200 mb-0"><br></div>'
      );
      continue;
    }
    result.push(
      `<div class="text-base leading-relaxed text-slate-800 dark:text-slate-200 mb-0">${formatDetailMarkdownInline(cleanedLine)}</div>`
    );
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    const codeContent = codeBlockContent.join('\n');
    const escapedCode = codeContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeCodeBlockLang = escapeHtmlText(codeBlockLang);
    result.push(`<div class="code-block-wrapper my-4">
    <div class="bg-slate-800 dark:bg-slate-900 rounded-lg overflow-hidden">
      ${safeCodeBlockLang ? `<div class="px-4 py-2 text-xs text-muted-foreground border-b border-slate-700 font-mono">${safeCodeBlockLang}</div>` : ''}
      <pre class="p-4 overflow-x-auto"><code class="text-sm font-mono text-slate-100 whitespace-pre">${escapedCode}</code></pre>
    </div>
  </div>`);
  }

  return result.join('');
}
