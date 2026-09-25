import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/CreateSideNav.tsx'),
  'utf8'
);

describe('CreateSideNav system announcements', () => {
  it('publishes the marketplace launch and recent creation updates', () => {
    expect(source).toContain(
      "const SYSTEM_ANNOUNCEMENTS_VERSION = '2026-09-09.1'"
    );
    expect(source).toContain('GPT Image 2.5 已上线');
    expect(source).toContain('GPT 图像生成与编辑现已统一升级为 GPT Image 2.5');
    expect(source).toContain('原 GPT Image 2 入口已下架');
    expect(source).toContain('历史作品仍可正常查看');
    expect(source).toContain('GPT Image 2.5 is now available');
    expect(source).toContain(
      'GPT image generation and editing have been upgraded to GPT Image 2.5'
    );
    expect(source).toContain('The GPT Image 2 entry has been retired');
    expect(source).toContain('模型广场与令牌管理正式上线');
    expect(source).toContain('459 个模型');
    expect(source).toContain('sk-wtm_');
    expect(source).toContain('https://webtomind.com/v1');
    expect(source).toContain('每分钟 60 次、每日 5000 次');
    expect(source).toContain('Model Plaza and Token Management are live');
    expect(source).toContain('60 requests/minute and 5,000/day');
    expect(source).toContain('全新 AI 图片编辑器上线');
    expect(source).toContain('从创作会话或资产库一键带入图片');
    expect(source).toContain('Enter 发送、Shift+Enter 换行');
    expect(source).toContain('A new AI Image Editor is here');
    expect(source).toContain('send with Enter, insert a new line with Shift+Enter');
    expect(source).toContain('Seedance 2.5 已接入视频创作');
    expect(source).toContain('4 至 30 秒');
    expect(source).toContain('Seedance 2.5 is now available in Video creation');
    expect(source).toContain('4–30 second output');
    expect(source).toContain('粘贴参考图体验已优化');
    expect(source).toContain('每张图片只会添加一次');
    expect(source).toContain('一次粘贴多张不同图片');
    expect(source).toContain('Clipboard reference uploads are more reliable');
    expect(source).toContain('Each image is now added once');
    expect(source).toContain('视频生成功能正式推出');
    expect(source).toContain('Doubao Seedance 2.0、Fast 与 Mini');
    expect(source).toContain('自动保存到资产库');
    expect(source).toContain('Video generation is officially available');
    expect(source).toContain('灵感页全面焕新');
    expect(source).toContain('滚动到底部会自动加载更多内容');
    expect(source).toContain('情绪板成为可复用的视觉资产');
    expect(source).toContain('创建一份可编辑的个人副本');
    expect(source).toContain('图像创作升级为连续会话工作流');
    expect(source).toContain('新的结果会同步到对话记录、会话缩略图和个人图库');
    expect(source).toContain('A completely redesigned Inspiration page');
    expect(source).toContain('Moodboards are now reusable visual assets');
    expect(source).toContain(
      'Image creation is now a continuous session workflow'
    );
    expect(source).toContain('图库与案例预览更顺手');
    expect(source).toContain('套餐与积分说明更清晰');
    expect(source).toContain('aria-label={navCopy.announcements}');
    expect(source).toContain('tabIndex={0}');
  });

  it('keeps the GPT Image 2.5 announcement first in both locales', () => {
    expect(source.indexOf('GPT Image 2.5 已上线')).toBeLessThan(
      source.indexOf('模型广场与令牌管理正式上线')
    );
    expect(source.indexOf('全新 AI 图片编辑器上线')).toBeLessThan(
      source.indexOf('Seedance 2.5 已接入视频创作')
    );
    expect(source.indexOf('全新 AI 图片编辑器上线')).toBeLessThan(
      source.indexOf('粘贴参考图体验已优化')
    );
    expect(source.indexOf('A new AI Image Editor is here')).toBeLessThan(
      source.indexOf('Seedance 2.5 is now available in Video creation')
    );
    expect(source.indexOf('A new AI Image Editor is here')).toBeLessThan(
      source.indexOf('Clipboard reference uploads are more reliable')
    );
    expect(source.indexOf('GPT Image 2.5 is now available')).toBeLessThan(
      source.indexOf('Model Plaza and Token Management are live')
    );
  });

  it('exposes unread status through the announcement button name', () => {
    expect(source).toContain(
      '`${navCopy.announcements} · ${navCopy.announcementsUnread}`'
    );
    expect(source).toMatch(
      /create-side-nav-announcement-unread-dot[\s\S]*aria-hidden="true"/
    );
  });
});
