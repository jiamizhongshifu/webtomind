import { describe, expect, it } from 'vitest';
import { renderNoindexAppShellHtml } from '../../api/seo-page-render';

const BASE_HTML =
  '<!DOCTYPE html><html lang="zh-CN"><head><title>WebToMind 工作台</title></head><body></body></html>';

describe('renderNoindexAppShellHtml locale', () => {
  it('按路径前缀本地化（默认行为）', () => {
    const zh = renderNoindexAppShellHtml(BASE_HTML, '/create');
    expect(zh).toContain('<html lang="zh-CN"');
    expect(zh).toContain('<title>WebToMind 工作台</title>');

    const en = renderNoindexAppShellHtml(BASE_HTML, '/en-US/create');
    expect(en).toContain('<html lang="en"');
    expect(en).toContain('<title>WebToMind Workspace</title>');
  });

  it('无前缀路径可通过 locale 覆盖为英文（与请求语言一致）', () => {
    const html = renderNoindexAppShellHtml(BASE_HTML, '/create', 'en-US');
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('<title>WebToMind Workspace</title>');
  });

  it('无前缀路径 locale 覆盖为中文时保持中文元数据', () => {
    const html = renderNoindexAppShellHtml(BASE_HTML, '/create', 'zh-CN');
    expect(html).toContain('<html lang="zh-CN"');
    expect(html).toContain('<title>WebToMind 工作台</title>');
  });
});
