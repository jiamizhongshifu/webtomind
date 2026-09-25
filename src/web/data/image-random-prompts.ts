export const RANDOM_IMAGE_PROMPTS_ZH = [
  '为一款 AI 笔记工具生成小红书首图：大标题突出“3 分钟整理完网页资料”，画面包含浏览器截图、笔记卡片和清爽桌面，整体干净、有行动感。',
  '生成一张电商新品主图：白色无线耳机悬浮在柔和棚拍背景中，旁边有 3 个卖点标签，光线高级，适合独立站首页首屏。',
  '为咖啡店夏季新品做一张公众号封面：冰拿铁、透明杯、阳光窗影和留白标题区，氛围清爽但不廉价。',
  '生成一张知识博主课程海报：主体是正在整理资料的创作者，背景有思维导图和网页素材卡片，标题区醒目，适合手机信息流。',
  '为一个设计工作室生成商业案例封面：桌面上散落品牌色卡、样机和社媒排版草图，视觉精致，强调“从素材到成品”。',
  '生成一张角色一致性展示图：同一个原创角色出现在 3 个不同场景小卡中，主视觉像高质量作品集页面，角色特征稳定清晰。'
] as const;

export const RANDOM_IMAGE_PROMPTS_EN = [
  'Create a high-click social cover for an AI note-taking tool: bold headline, browser screenshot, note cards and a clean desk scene with a clear action feel.',
  'Generate an ecommerce hero image for white wireless earbuds floating on a soft studio background, with three benefit labels and premium lighting.',
  'Create a newsletter cover for a summer cafe launch: iced latte, transparent cup, sunlit window shadows and a clean headline area.',
  'Generate a course poster for a knowledge creator: a person organizing research, mind-map cards in the background and a strong mobile-feed headline area.',
  'Create a portfolio cover for a design studio: brand swatches, mockups and social layout sketches on a refined desk scene.',
  'Generate a character consistency sheet: one original character across three scene cards, styled like a polished visual portfolio page.'
] as const;

export function pickNextRandomImagePrompt(
  locale: 'zh-CN' | 'en-US',
  currentPrompt: string
): string {
  const prompts =
    locale === 'en-US' ? RANDOM_IMAGE_PROMPTS_EN : RANDOM_IMAGE_PROMPTS_ZH;
  const currentIndex = prompts.findIndex(
    (item) => item === currentPrompt.trim()
  );
  if (currentIndex >= 0) {
    return prompts[(currentIndex + 1) % prompts.length];
  }
  return prompts[Math.floor(Math.random() * prompts.length)];
}
