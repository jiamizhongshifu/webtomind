-- 官网营销内容：博客与更新日志
-- 用于 /api/content/blog 与 /api/content/updates 公共读取

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en-US')),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-CN' CHECK (locale IN ('zh-CN', 'en-US')),
  title TEXT NOT NULL,
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_locale_published
  ON public.blog_posts (locale, is_published, published_at DESC, sort_order DESC);
CREATE INDEX IF NOT EXISTS idx_product_updates_locale_published
  ON public.product_updates (locale, is_published, published_at DESC, sort_order DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blog_posts_public_read" ON public.blog_posts;
CREATE POLICY "blog_posts_public_read"
ON public.blog_posts
FOR SELECT
TO anon, authenticated
USING (is_published = true AND published_at <= now());

DROP POLICY IF EXISTS "product_updates_public_read" ON public.product_updates;
CREATE POLICY "product_updates_public_read"
ON public.product_updates
FOR SELECT
TO anon, authenticated
USING (is_published = true AND published_at <= now());

DROP POLICY IF EXISTS "blog_posts_service_role_all" ON public.blog_posts;
CREATE POLICY "blog_posts_service_role_all"
ON public.blog_posts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "product_updates_service_role_all" ON public.product_updates;
CREATE POLICY "product_updates_service_role_all"
ON public.product_updates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_blog_posts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_updates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.set_blog_posts_updated_at();

DROP TRIGGER IF EXISTS trg_product_updates_updated_at ON public.product_updates;
CREATE TRIGGER trg_product_updates_updated_at
BEFORE UPDATE ON public.product_updates
FOR EACH ROW EXECUTE FUNCTION public.set_product_updates_updated_at();

-- 初始内容（中文）
INSERT INTO public.blog_posts (slug, locale, title, excerpt, tag, body_markdown, is_published, sort_order, published_at)
VALUES
  (
    'ai-workflow-sop',
    'zh-CN',
    '从素材堆积到稳定产出：内容团队的 AI 工作流 SOP',
    '把采集、整理、创作、发布拆成可执行环节，让产出节奏稳定可复用。',
    '方法论',
    '# 从素材堆积到稳定产出\n\n本文介绍 WebToMind 的内容生产 SOP。',
    true,
    100,
    now()
  ),
  (
    'creative-block-process',
    'zh-CN',
    '为什么创作卡住不是能力问题，而是流程问题',
    '定位创作中断点并建立闭环机制，提升从输入到输出的转化率。',
    '创作效率',
    '# 为什么创作会卡住\n\n关键是流程断点，而非单点能力。',
    true,
    90,
    now() - interval '3 day'
  ),
  (
    'sustainable-material-library',
    'zh-CN',
    '如何构建可持续的内容素材库（避免重复检索）',
    '通过结构化分类和标签策略，让历史素材持续服务新内容生产。',
    '素材管理',
    '# 可持续素材库\n\n建立分类、标签与复用机制。',
    true,
    80,
    now() - interval '7 day'
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.product_updates (version, locale, title, highlights, is_published, sort_order, published_at)
VALUES
  (
    'v1.3.0',
    'zh-CN',
    '官网内容架构升级（SEO 准备）',
    '[
      "新增 Use Cases / Skills / Blog / Updates 四个公开分页。",
      "统一页面标题与 CTA 结构，便于后续关键词与转化链路优化。",
      "为每个页面补齐基础 SEO 元信息与结构化展示。"
    ]'::jsonb,
    true,
    100,
    now()
  ),
  (
    'v1.2.9',
    'zh-CN',
    '技能广场与技能详情体验优化',
    '[
      "技能卡片信息层级重构，统一图标、标题与摘要密度。",
      "技能安装链路打通，安装后实时进入已安装状态。"
    ]'::jsonb,
    true,
    90,
    now() - interval '2 day'
  ),
  (
    'v1.2.8',
    'zh-CN',
    '工作台性能与布局稳定性优化',
    '[
      "优化页面重渲染与列表渲染策略，减少卡顿与崩溃风险。",
      "来源与对话分栏比例重新平衡，提升主操作区可用面积。"
    ]'::jsonb,
    true,
    80,
    now() - interval '5 day'
  )
ON CONFLICT DO NOTHING;
