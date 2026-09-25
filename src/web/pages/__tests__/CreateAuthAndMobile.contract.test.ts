import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

const mainSource = readSource('src/web/main.tsx');
const imagePageSource = readSource('src/web/pages/ImageCreatePage.tsx');
const createHomeSource = readSource('src/web/pages/CreateHomePage.tsx');
const panelSource = readSource(
  'src/web/components/image-create/PromptCompilerPanel.tsx'
);
const mobileStyles = readSource('src/web/styles/image-create-mobile.css');

describe('create auth and mobile first-screen contracts', () => {
  it('keeps automatic Google fallback prompts on guest-visible pages', () => {
    // 未登录访客在任意页面（登录/回调/充值/开发壳除外）都展示快捷登录。
    expect(mainSource).not.toMatch(
      /const enabled =[\s\S]*?!isCreateWorkspacePage/
    );
    expect(mainSource).toMatch(
      /const enabled =[\s\S]*?!isDevHarnessPage[\s\S]*?<GoogleOneTapLoginPrompt/
    );
    expect(mainSource).not.toContain(
      'global-google-login-fallback--route-create'
    );
    expect(mobileStyles).not.toContain('global-google-login-fallback');
  });

  it('opens the existing AuthModal from user intent and preserves the route', () => {
    expect(imagePageSource).toContain('openAuthModal({');
    expect(imagePageSource).toContain("requestLogin('image_generate_gate')");
    expect(imagePageSource).toContain("requestLogin('preset_save_gate')");
    // 图像/视频创作页开放访客访问，不再使用路由级登录墙；
    // 关键交互由页面内 requestLogin / openAuthModal 门控。
    expect(mainSource).toMatch(
      /image:\s*<ImageCreatePage \/>/
    );
    expect(mainSource).toMatch(
      /video:\s*<CreateVideoPage \/>/
    );
    expect(mainSource).toMatch(
      /buildCreatorCanonicalRouteElements\('\/zh-CN'\)/
    );
    expect(mainSource).toMatch(
      /buildCreatorCanonicalRouteElements\('\/en-US'\)/
    );
    expect(imagePageSource).toContain(
      "redirectTo: `${location.pathname}${location.search}`"
    );
    expect(createHomeSource).toContain('openAuthModal({');
    expect(imagePageSource).not.toMatch(/navigate\([^\n]*['"]\/login/);
    expect(createHomeSource).not.toMatch(/navigate\([^\n]*['"]\/login/);
  });

  it('keeps the mobile summary and primary action before collapsible settings', () => {
    expect(panelSource).toContain('aria-expanded={mobileSettingsExpanded}');
    expect(panelSource).toContain('aria-controls={mobileSettingsId}');
    expect(panelSource).toContain("matchMedia('(max-width: 800px)')");
    expect(panelSource).toContain(
      "data-mobile-expanded={mobileSettingsExpanded ? 'true' : 'false'}"
    );
    expect(mobileStyles).toMatch(
      /\.creator-prompt-mobile-summary\s*\{[\s\S]*?order:\s*5;/
    );
    expect(mobileStyles).toMatch(
      /\.creator-prompt-primary-actions\s*\{[\s\S]*?order:\s*6;/
    );
    expect(mobileStyles).toMatch(
      /\.creator-prompt-mobile-settings-toggle\s*\{[\s\S]*?order:\s*8;/
    );
    expect(mobileStyles).toContain(
      ".creator-prompt-settings[data-mobile-expanded='false']"
    );
    const compactViewportStyles = mobileStyles.slice(
      mobileStyles.indexOf(
        '@media (max-width: 560px) and (max-height: 720px)'
      )
    );
    expect(compactViewportStyles).toContain('max-height: 186px');
    expect(compactViewportStyles).toMatch(
      /\.creator-prompt-mobile-settings-toggle\s*\{[\s\S]*?margin-top:\s*8px;/
    );
  });
});
