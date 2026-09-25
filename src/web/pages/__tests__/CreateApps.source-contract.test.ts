import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('image tools source contracts', () => {
  it('keeps the directory public and links cards directly to tools', () => {
    const page = source('src/web/pages/CreateAppsPage.tsx');
    const main = source('src/web/main.tsx');
    expect(page).toContain('<CreateWorkspaceFrame');
    expect(page).toContain(
      'className="create-apps-route image-tools-directory"'
    );
    expect(page).not.toContain('<MarketingPageShell');
    expect(page).not.toContain('ToggleGroup');
    expect(page).not.toContain('ProtectedRoute');
    expect(page).toContain('to={`${prefix}${tool.href}`}');
    expect(main).toContain("'apps'");
    for (const path of [
      '/create/apps',
      '/zh-CN/create/apps',
      '/en-US/create/apps'
    ]) {
      expect(main).toContain(`'${path}'`);
    }
    expect(main).not.toContain('CreateAppDetailPage');
    expect(main).not.toContain('CreateAppUsePage');
  });

  it('provides tool routes in three locale forms', () => {
    const main = source('src/web/main.tsx');
    for (const slug of [
      'image-upscaler',
      'image-splitter',
      'watermark-remover',
      'gpt-image-2-denoiser',
      'image-compressor'
    ]) {
      expect(main).toContain(`'/tools/${slug}'`);
      expect(main).toContain(`'/zh-CN/tools/${slug}'`);
      expect(main).toContain(`'/en-US/tools/${slug}'`);
    }
  });

  it('keeps the paused AI watermark tool out of the Worker API surface', () => {
    const worker = source('workers/webtomind.ts');
    expect(worker).not.toContain("'/api/tools/ai-marks'");
    expect(worker).not.toContain('aiMarksHandler');
  });

  it('keeps every tool detail inside the creator workspace frame', () => {
    const shell = source('src/web/components/image-tools/ImageToolShell.tsx');
    const pindou = source('src/web/pages/PindouPatternMakerPage.tsx');
    const nav = source('src/web/components/image-create/CreateSideNav.tsx');
    const css = source('src/web/styles/image-tools.css');

    expect(shell).toContain('<CreateWorkspaceFrame');
    expect(shell).toContain('image-tool-workspace-route');
    expect(shell).not.toContain('<MarketingPageShell');
    expect(pindou).toContain('<ImageToolWorkspaceShell');
    expect(pindou).not.toContain('<MarketingPageShell');
    expect(nav).toContain('isImageToolRoute(normalized)');
    expect(css).toContain('.image-tool-page .create-workspace-page');

    for (const page of [
      'ImageUpscalerPage.tsx',
      'ImageSplitterPage.tsx',
      'WatermarkRemoverPage.tsx',
      'GptImage2DenoiserPage.tsx',
      'ImageCompressorPage.tsx'
    ]) {
      expect(source(`src/web/pages/${page}`)).toContain('<ImageToolShell');
    }
  });

  // Batch processing, zoom, comparison, and 44px targets are exercised by
  // scripts/smoke-image-upscaler.mjs against the rendered application.

  it('reuses the zoomable comparison contract for denoise verification', () => {
    const denoiser = source('src/web/pages/GptImage2DenoiserPage.tsx');
    const worker = source('src/workers/image-ai.worker.ts');
    const routes = source('src/web/routes/devHarnessRoutes.tsx');

    expect(denoiser).toContain('<BeforeAfterComparison');
    expect(denoiser).toContain('beforeSrc={upload.source!.url}');
    expect(denoiser).toContain('afterLabel="清理后"');
    expect(denoiser).toContain('pixelChange.changedPixelPercent.toFixed(1)');
    expect(worker).toContain('blendDenoisedRgba');
    expect(worker).toContain('pixelChange:');
    expect(worker).not.toContain('outputContext.globalAlpha = 1 - weight');
    expect(routes).toContain('/__dev/image-comparison-harness');
  });

  it('keeps applications in the sidebar and the mobile bottom nav to five core entries', () => {
    const nav = source('src/web/components/image-create/CreateSideNav.tsx');
    const navData = source('src/web/data/create-workspace.ts');
    const consentCss = source('src/web/styles/analytics-consent.css');
    // 应用入口保留在侧栏导航数据中
    expect(navData).toContain("id: 'apps'");
    expect(navData).toContain('href: CREATOR_ROUTE_PATHS.apps');
    expect(navData).toContain('icon: AppWindow');
    // 移动底栏只保留核心入口（首页/图像/视频/资产库/账户），不含应用
    const mobileIdsSection = nav.slice(
      nav.indexOf('const mobileNavItems'),
      nav.indexOf('const visibleNavItems')
    );
    for (const id of ['home', 'image', 'video', 'gallery', 'account']) {
      expect(mobileIdsSection).toContain(`id: '${id}'`);
    }
    expect(mobileIdsSection).not.toContain("id: 'apps'");
    // 激活旅程未完成时隐藏视频/应用入口
    expect(nav).toContain('hideFutureCreationEntries');
    expect(consentCss).toContain(
      '.image-create-route-active .analytics-consent'
    );
    expect(consentCss).toContain(
      'bottom: max(84px, calc(env(safe-area-inset-bottom) + 72px));'
    );
  });
});
