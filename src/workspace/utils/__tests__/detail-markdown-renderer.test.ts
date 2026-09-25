import { describe, expect, it } from 'vitest';
import { renderDetailMarkdown } from '../detail-markdown-renderer';

describe('renderDetailMarkdown', () => {
  it('preserves raw html media blocks inside markdown content', () => {
    const markdown = [
      '# 示例标题',
      '',
      '<div class="mb-4"><img src="https://example.com/a.jpg" alt="图片1" class="max-w-full rounded-lg" /></div>',
      '<div style="color:#334155">段落内容</div>'
    ].join('\n');

    const html = renderDetailMarkdown(markdown);

    expect(html).toContain('<img src="https://example.com/a.jpg"');
    expect(html).toContain('<div class="mb-4">');
    expect(html).toContain('<div style="color:#334155">段落内容</div>');
    expect(html).not.toContain('&lt;img');
  });
});
