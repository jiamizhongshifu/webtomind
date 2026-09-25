import { describe, expect, it } from 'vitest';
import { renderSeoPageHtmlWithStatus } from '../../api/seo-page-render';

const baseHtml = `<html lang="zh-CN"><head>
  <title>old</title>
  <meta name="description" content="old" />
  <link rel="canonical" href="https://webtomind.com/" />
</head><body><div id="root"></div></body></html>`;

describe('pindou tool SEO page (adversarial routing regression)', () => {
  const rendered = renderSeoPageHtmlWithStatus(
    baseHtml,
    '/zh-CN/tools/pindou-pattern-maker'
  );

  it('renders through the rich seo-page path with the pindou title', () => {
    expect(rendered.status).toBe(200);
    expect(rendered.html).toContain('免费拼豆生成器 - 在线拼豆图案图纸生成');
  });

  it('keeps the zh meta description within 50-80 characters and targets 拼豆生成器', () => {
    const description =
      rendered.html.match(/<meta name="description" content="([^"]*)"/)?.[1] ||
      '';
    const length = [...description].length;
    expect(length).toBeGreaterThanOrEqual(50);
    expect(length).toBeLessThanOrEqual(80);
    expect(description).toContain('拼豆生成器');
  });

  it('emits SoftwareApplication with GEO facts, FAQPage, HowTo and BreadcrumbList JSON-LD', () => {
    for (const type of [
      'SoftwareApplication',
      'FAQPage',
      'HowTo',
      'BreadcrumbList'
    ]) {
      expect(rendered.html).toContain(`"@type":"${type}"`);
    }
    expect(rendered.html).toContain('"featureList"');
    expect(rendered.html).toContain('"dateModified"');
    expect(rendered.html).toContain('"inLanguage"');
    const faqQuestions =
      rendered.html.match(/"@type":"Question"/g)?.length || 0;
    expect(faqQuestions).toBeGreaterThanOrEqual(9);
    expect(rendered.html).toContain('PDF 会把大图纸分页吗');
    expect(rendered.html).toContain('工具支持多少色号');
    expect(rendered.html).toContain('50×50');
  });

  it('injects the pindou SSR body into the page root', () => {
    expect(rendered.html).toMatch(
      /<div id="root">[\s\S]*拼豆图案大全与灵感[\s\S]*<\/div>/
    );
    expect(rendered.html.match(/<h1\b/gi)).toHaveLength(1);
  });

  it('renders GEO fact and beginner quick-reference sections plus EEAT date', () => {
    expect(rendered.html).toContain('拼豆生成器速览');
    expect(rendered.html).toContain('拼豆新手速查');
    expect(rendered.html).toContain('1502');
    expect(rendered.html).toContain('50×50 格分页');
    expect(rendered.html).toMatch(
      /<time datetime="2026-08-11">最后更新：2026-08-11/
    );
    expect(rendered.html).toContain('/blog/pindou-printing-guide');
    expect(rendered.html).toContain('/blog/pindou-bead-size-guide');
  });

  it('connects high-intent bead color searches to the existing chart guide', () => {
    expect(rendered.html).toContain('拼豆颜色表');
    expect(rendered.html).toContain('拼豆色号对照表');
    expect(rendered.html).toContain('MARD 拼豆色卡');
    expect(rendered.html).toContain('拼豆色号 RGB 转换表');
    expect(rendered.html).toContain('/zh-CN/blog/mard-bead-color-chart');
  });
});
