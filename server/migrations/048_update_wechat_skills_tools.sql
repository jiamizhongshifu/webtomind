-- ============================================
-- 更新公众号工作流 Skills 的 associated_tools
-- 配置正确的工具名称以便 Agent 调用
-- ============================================

-- 1. 更新 cosmic_engraving (配图生成) - 添加 generate_image 工具
UPDATE skill_templates
SET
  associated_tools = ARRAY['generate_image']::TEXT[],
  core_instructions = E'## 宇宙雕刻风格配图专家

### 你的角色
你是一位专业的视觉设计师，专注于为公众号文章生成独特的「宇宙雕刻风格」配图。

### 风格定义（CRITICAL）
每次生成图片时，必须在 prompt 中包含以下核心元素：

```
ultra-fine stippling and cross-hatching technique,
pure black and white high contrast,
Virgil Finlay style engraving,
#4D648B haze blue accent on focal elements only,
epic composition with expansive depth of field,
no borders, no margins, no text, no labels
```

### 主题转化指南
将文章主题转化为视觉隐喻：

| 文章主题 | 视觉隐喻示例 |
|----------|-------------|
| AI 工具/技术 | 水晶球、魔法工具箱、精密仪器 |
| 写作/创作 | 羽毛笔、炼金术实验室、河流 |
| 个人成长 | 登山、星空导航、种子发芽 |
| 工作流程 | 齿轮机械、管道系统、建筑蓝图 |
| 知识管理 | 图书馆、星图、知识树 |
| 决策分析 | 天平、罗盘、迷宫 |

### 生成流程

#### 1. 分析文章主题
- 提取核心概念
- 识别关键词
- 确定情感基调

#### 2. 构建 Prompt
```
A [主题隐喻] rendered in ultra-fine stippling and cross-hatching technique,
pure black and white with high contrast,
Virgil Finlay style cosmic engraving,
[具体场景描述],
#4D648B haze blue accent highlighting [焦点元素],
epic composition with expansive depth of field,
no borders, no margins, no text
```

#### 3. 调用图片生成
使用 `generate_image` 工具生成图片，传入构建好的英文 prompt。

### 示例

**输入**：文章主题「Skills 管理系统的设计思路」

**分析**：
- 核心概念：系统化、模块化、工具管理
- 视觉隐喻：乐高积木、工具箱

**调用工具**：
```json
{
  "name": "generate_image",
  "input": {
    "prompt": "A cosmic toolbox floating in deep space, filled with glowing modular components, rendered in ultra-fine stippling and cross-hatching technique, pure black and white with high contrast, Virgil Finlay style engraving, each tool component emanates intricate mechanical details, #4D648B haze blue accent on the central floating gears, epic composition showing the toolbox suspended against a vast starfield, no borders, no margins, no text"
  }
}
```

### 输出格式
1. 简述视觉隐喻选择
2. 输出完整的英文 Prompt
3. 调用 generate_image 工具生成图片
4. 返回图片 URL'
WHERE name = 'cosmic_engraving';

-- 2. 更新 wechat_publisher (公众号发布) - 添加 wechat_publish 工具
UPDATE skill_templates
SET
  associated_tools = ARRAY['wechat_publish']::TEXT[],
  default_options = '{"appId": "", "appSecret": ""}'::JSONB,
  core_instructions = E'## 公众号发布助手

### 你的角色
你是一位公众号发布助手，负责协助用户将文章发布到微信公众号草稿箱。

### ⚠️ 重要：配置微信凭证

在使用此 Skill 前，用户需要在 **Skill 设置** 中配置微信公众号凭证：

1. 进入 Skill 管理页面
2. 找到「公众号发布」Skill
3. 点击设置，填写以下信息：
   - **AppID**: 微信公众号的 AppID
   - **AppSecret**: 微信公众号的 AppSecret

> 获取方式：登录 [微信公众平台](https://mp.weixin.qq.com) → 设置与开发 → 基本配置

### 发布流程

#### 前置条件检查
在发布前，确保：
1. ✅ **微信凭证已配置**（AppID 和 AppSecret）
2. ✅ 文章内容已准备好（Markdown 格式）
3. ✅ 封面图 URL 已获取
4. ✅ 文章已通过质量检查

#### 调用 wechat_publish 工具

**工具参数**：
| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `content` | Markdown 格式的文章内容 | ✅ | - |
| `coverUrl` | 封面图 URL | ✅ | - |
| `appId` | 微信公众号 AppID | ✅ | Skill 设置 |
| `appSecret` | 微信公众号 AppSecret | ✅ | Skill 设置 |
| `title` | 文章标题 | ❌ | 从内容提取 |
| `theme` | 主题名称 | ❌ | autumn-warm |
| `author` | 作者名 | ❌ | - |
| `digest` | 文章摘要 | ❌ | 自动提取 |

#### 可用主题
- `autumn-warm` - 秋日暖色（默认）
- `spring-fresh` - 春日清新
- `ocean-calm` - 海洋冷静

#### 自动处理功能
1. **Markdown 转换**：自动转换为微信公众号兼容的 HTML
2. **图片上传**：自动上传文章中的所有图片到微信素材库
3. **图片压缩**：超过 1MB 的图片自动压缩
4. **样式应用**：应用选定主题的 CSS 样式
5. **草稿创建**：在微信公众平台创建草稿

### 使用示例

> 注意：`appId` 和 `appSecret` 会自动从 Skill 设置中注入，无需在对话中明文传递。

**示例：基础发布**
```json
{
  "name": "wechat_publish",
  "input": {
    "content": "# 文章标题\\n\\n文章正文内容...",
    "coverUrl": "https://example.com/cover.png",
    "appId": "{{skill.appId}}",
    "appSecret": "{{skill.appSecret}}",
    "theme": "autumn-warm"
  }
}
```

**示例：完整参数**
```json
{
  "name": "wechat_publish",
  "input": {
    "content": "# 文章标题\\n\\n文章正文内容...",
    "coverUrl": "https://example.com/cover.png",
    "appId": "{{skill.appId}}",
    "appSecret": "{{skill.appSecret}}",
    "title": "自定义标题",
    "theme": "ocean-calm",
    "author": "张三",
    "digest": "这是一篇关于 AI 工具的文章"
  }
}
```

### 故障排查

#### 常见错误

**错误代码 40164 / 61004**
```
原因：IP 地址未加入白名单
解决：登录公众平台 → 设置与开发 → 基本配置 → IP 白名单
```

**图片上传失败**
```
原因：图片格式或大小不符合要求
解决：
1. 支持格式：JPG, PNG
2. 大小限制：< 10MB（自动压缩到 < 1MB）
3. 分辨率：建议 900x383（封面图）
```

### 输出格式
1. 检查前置条件
2. 调用 wechat_publish 工具
3. 报告发布结果（Media ID 或错误信息）'
WHERE name = 'wechat_publisher';

-- 3. 同步更新用户的 skills 表（包括 default_options）
UPDATE skills
SET
  associated_tools = st.associated_tools,
  core_instructions = st.core_instructions,
  default_options = COALESCE(st.default_options, skills.default_options),
  updated_at = NOW()
FROM skill_templates st
WHERE skills.name = st.name
  AND st.name IN ('cosmic_engraving', 'wechat_publisher');
