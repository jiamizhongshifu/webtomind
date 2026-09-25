-- ============================================
-- 将公众号工作流 Skill 模板同步到指定用户
-- 用户 ID: 7ea04090-b870-40ec-9951-d21089748648
-- ============================================

-- 从 skill_templates 复制到用户的 skills 表
INSERT INTO skills (
  user_id,
  name,
  display_name,
  description,
  icon,
  triggers,
  core_instructions,
  output_type,
  associated_tools,
  category,
  priority,
  is_active
)
SELECT
  '5d8cb110-842b-4e74-8453-bcb5d5c9a72c'::UUID,
  t.name,
  t.display_name,
  t.description,
  t.icon,
  t.triggers,
  t.core_instructions,
  t.output_type,
  t.associated_tools,
  t.category,
  50,  -- 默认优先级
  true -- 默认启用
FROM skill_templates t
WHERE t.name IN (
  'article_layout',
  'cosmic_engraving',
  'wechat_publisher',
  'topic_decision',
  'material_manager'
)
ON CONFLICT (user_id, name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  triggers = EXCLUDED.triggers,
  core_instructions = EXCLUDED.core_instructions,
  output_type = EXCLUDED.output_type,
  associated_tools = EXCLUDED.associated_tools,
  category = EXCLUDED.category,
  updated_at = NOW();
