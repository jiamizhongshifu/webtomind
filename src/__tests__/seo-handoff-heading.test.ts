import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  injectPromptLibraryBootstrap,
  renderSeoPageHtml
} from '../../api/seo-page-render';

const APP_SHELL = `<!doctype html>
<html lang="zh-CN">
  <head><title>WebToMind</title></head>
  <body><div id="root"></div></body>
</html>`;

describe('prompt SEO handoff heading semantics', () => {
  it('does not put remote telemetry in the ordered deferred app boot queue', () => {
    const source = readFileSync('web.html', 'utf8');
    const tag = source.match(/<script\b[^>]*src="https:\/\/vibeloft.ai\/telemetry\/v1.js"[^>]*>/)?.[0];
    expect(tag).toMatch(/\basync\b/);
    expect(tag).not.toMatch(/\bdefer\b/);
  });
  it('preloads only safe build-generated route assets without adding an SSR body', () => {
    const source = APP_SHELL.replace(
      '</head>',
      '<script type="application/json" id="webtomind-prompt-route-assets">["/assets/Prompt.hash.js","/assets/Prompt.hash.js","https://evil.test/x.js","/assets/../x.js"]</script></head>'
    );
    const result = injectPromptLibraryBootstrap(source, {}, true);
    expect(result.match(/data-webtomind-prompt-route-preload/g)).toHaveLength(
      1
    );
    expect(result).toContain('href="/assets/Prompt.hash.js"');
    expect(result).not.toContain('href="https://evil.test');
    expect(result).toContain('<div id="root"></div>');
    expect(injectPromptLibraryBootstrap(APP_SHELL, {}, true)).toBe(APP_SHELL);
  });
  it.each(['/zh-CN/prompts', '/en-US/prompts'])(
    'renders one H1 while preserving the hidden fallback content for %s',
    (route) => {
      const html = renderSeoPageHtml(APP_SHELL, route);

      expect(html.match(/<h1\b/gi)).toHaveLength(1);
      expect(html).toContain('data-webtomind-ssr="prompt-handoff"');
      expect(html).toContain('class="prompt-seo-fallback-heading"');
      expect(html).toContain('prompt-seo-fallback');
      expect(html).toMatch(/<a\s+href=/i);
      expect(html).toContain('data-webtomind-boot-watchdog="1"');
      expect(html).toContain('src="/boot-watchdog.js"');
      expect(html).toContain('prompt-seo-handoff-sidebar');
      expect(html).toContain('prompt-seo-handoff-grid');
    }
  );

  it('matches the client page heading on the prompt library root', () => {
    const zh = renderSeoPageHtml(APP_SHELL, '/zh-CN/prompts');
    const en = renderSeoPageHtml(APP_SHELL, '/en-US/prompts');

    expect(zh).toContain('<h1>AI 图片 Prompt 案例库</h1>');
    expect(zh).toContain(
      '按模型和场景筛选可复用案例，复制 Prompt 后直接进入创作。'
    );
    expect(en).toContain('<h1>Free AI Image Prompts Library</h1>');
    expect(en).toContain(
      'Filter reusable prompt cases by model and use case, then copy or generate.'
    );
    // SEO 正文仍以隐藏 fallback 形式保留关键词标题。
    expect(zh).toContain('prompt-seo-fallback-heading');
    expect(zh).toContain('按模型和场景整理的 AI 图片 Prompt 案例');
  });
});
