import { describe, expect, it } from 'vitest';
import { renderSeoPageHtmlWithStatus } from '../../api/seo-page-render';

const SHELL =
  '<!doctype html><html lang="zh-CN"><head><title>WebToMind</title></head><body><div id="root"></div></body></html>';

const EXPECTED_CTAS = [
  ['pindou-generator-guide', 'try_tool', '/zh-CN/tools/pindou-pattern-maker'],
  ['ai-image-prompt-examples', 'browse_prompts', '/zh-CN/prompts'],
  ['free-image-prompts-guide', 'use_template', '/zh-CN/prompts'],
  ['ai-image-prompt-library-comparison', 'browse_prompts', '/zh-CN/prompts'],
  ['image-prompt-writing-guide', 'use_template', '/zh-CN/prompts'],
  ['product-image-ai-guide', 'use_template', '/zh-CN/prompts']
] as const;

describe('SEO blog CTA attribution', () => {
  it.each(EXPECTED_CTAS)(
    'renders a localized and attributable CTA for %s',
    (slug, kind, targetPath) => {
      const rendered = renderSeoPageHtmlWithStatus(
        SHELL,
        `/zh-CN/blog/${slug}`
      );
      const source = `seo_blog_${slug}_${kind}`;

      expect(rendered.status).toBe(200);
      expect(rendered.html.match(/<h1\b/g)).toHaveLength(1);
      expect(rendered.html).toContain(`data-cta-source="${source}"`);
      expect(rendered.html).toContain(`data-cta-kind="${kind}"`);
      expect(rendered.html).toContain(`href="${targetPath}`);
      expect(rendered.html).toContain(`source=${source}`);
      expect(rendered.html).toContain(`seo_content_id=${slug}`);
      expect(rendered.html).toContain(
        `seo_content_path=%2Fzh-CN%2Fblog%2F${slug}`
      );
    }
  );

  it('keeps English CTA attribution on the English canonical content path', () => {
    const rendered = renderSeoPageHtmlWithStatus(
      SHELL,
      '/en-US/blog/product-image-ai-guide'
    );

    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('href="/en-US/prompts?label=product-commercial');
    expect(rendered.html).toContain(
      'seo_content_path=%2Fen-US%2Fblog%2Fproduct-image-ai-guide'
    );
  });
});
