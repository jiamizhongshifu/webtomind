/**
 * Cosmic Engraving Skill
 * One-time execution skill that generates branded visual images
 * using the generate_image tool
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

export const cosmicEngravingSkill: AgentSkillDefinition = {
  metadata: {
    name: 'cosmic-engraving',
    description: '根据主题生成风格化品牌配图',
    triggers: [
      '配图',
      '封面',
      '品牌图',
      '生成图片',
      'image',
      'cover',
      '海报'
    ],
    version: '1.0.0',
    category: 'content' as SkillCategory,
    priority: 65,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 120000, maxSteps: 4 },
    capabilities: {
      allowedTools: ['generate_image'],
      artifactTypes: ['image']
    },
    permissions: { confirmationMode: 'never', sideEffects: [] },
    output: { primaryType: 'image' }
  },

  coreInstructions: `---
name: cosmic-engraving
description: 根据主题生成风格化品牌配图
allowed-tools: generate_image
---

## 品牌配图

根据用户提供的主题和风格偏好，生成高质量的品牌配图。

### 支持的视觉主题
- **auto**: 自动选择最佳风格
- **crystal-ball**: 水晶球/未来感
- **quill-pen**: 羽毛笔/文学风
- **gears**: 齿轮/工业机械风
- **compass**: 指南针/探索风
- **library**: 图书馆/知识风
- **telescope**: 望远镜/科技探索风

### 支持的画幅比例
- 1:1 方形（社交媒体头像、正方形配图）
- 16:9 横屏（公众号封面、博客头图）
- 9:16 竖屏（小红书、手机壁纸）

### 工作流程
1. 解析用户的主题描述和风格偏好
2. 构建图片生成 prompt
3. 调用 generate_image 工具生成图片
4. 输出图片链接和预览

### 输出
品牌配图的 Markdown 预览，包含图片链接和元信息。
`,

  associatedTools: ['generate_image']
};
