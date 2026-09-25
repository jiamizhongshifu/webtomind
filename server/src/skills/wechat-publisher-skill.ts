/**
 * WeChat Publisher Skill
 * One-time execution skill that formats and publishes content
 * to WeChat Official Account via wechat_publish tool
 */

import type { AgentSkillDefinition, SkillCategory } from './types.js';

export const wechatPublisherSkill: AgentSkillDefinition = {
  metadata: {
    name: 'wechat-publisher',
    description: '将内容排版并发布到微信公众号',
    triggers: [
      '公众号',
      '微信',
      '发布',
      'wechat',
      'publish',
      '推送'
    ],
    version: '1.0.0',
    category: 'content' as SkillCategory,
    priority: 60,
    dependencies: [],
    source: 'system',
    status: 'active',
    runtime: { mode: 'async', planner: 'workflow', timeoutMs: 120000, maxSteps: 4 },
    capabilities: {
      allowedTools: ['wechat_publish'],
      artifactTypes: ['text']
    },
    permissions: { confirmationMode: 'on_write', sideEffects: ['publish_external'] },
    output: { primaryType: 'text' }
  },

  coreInstructions: `---
name: wechat-publisher
description: 将内容排版并发布到微信公众号
allowed-tools: wechat_publish
---

## 公众号发布

将选中的素材内容进行排版美化，并发布到微信公众号。

### 支持的排版主题
- **autumn-warm**: 秋日暖色 — 温暖柔和的色调
- **spring-fresh**: 春日清新 — 清爽明亮的风格
- **ocean-calm**: 海洋沉静 — 沉稳大气的蓝色调

### 工作流程
1. 提取用户选中的素材内容
2. 根据排版主题格式化内容
3. 调用 wechat_publish 工具发布到公众号
4. 返回发布结果和文章链接

### 输出
发布结果，包含文章链接和排版主题信息。
`,

  associatedTools: ['wechat_publish']
};
