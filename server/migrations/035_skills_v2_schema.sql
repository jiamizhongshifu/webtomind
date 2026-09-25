-- Skills System V2 Schema Update
-- 严格遵循官方 Agent Skills 标准 (https://github.com/anthropics/skills)
-- 官方标准字段: name, description, allowed-tools, license, compatibility, metadata

-- ============================================
-- Phase 1: 官方标准基础字段
-- ============================================

-- 1. 更新 skills 表 (官方标准字段)
ALTER TABLE skills ADD COLUMN IF NOT EXISTS allowed_tools TEXT[] DEFAULT '{}';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS compatibility TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. 更新 skill_templates 表 (官方标准字段)
ALTER TABLE skill_templates ADD COLUMN IF NOT EXISTS allowed_tools TEXT[] DEFAULT '{}';
ALTER TABLE skill_templates ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE skill_templates ADD COLUMN IF NOT EXISTS compatibility TEXT;
ALTER TABLE skill_templates ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 3. 添加注释 (官方标准)
COMMENT ON COLUMN skills.allowed_tools IS '官方标准: 允许使用的工具列表 (space-delimited in SKILL.md)';
COMMENT ON COLUMN skills.license IS '官方标准: 技能许可证 (e.g., MIT, Apache-2.0)';
COMMENT ON COLUMN skills.compatibility IS '官方标准: 版本要求或环境说明';
COMMENT ON COLUMN skills.metadata IS '官方标准: 自定义键值对元数据';

COMMENT ON COLUMN skill_templates.allowed_tools IS '官方标准: 允许使用的工具列表';
COMMENT ON COLUMN skill_templates.license IS '官方标准: 技能许可证';
COMMENT ON COLUMN skill_templates.compatibility IS '官方标准: 版本要求或环境说明';
COMMENT ON COLUMN skill_templates.metadata IS '官方标准: 自定义键值对元数据';

-- 4. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_skills_allowed_tools ON skills USING GIN(allowed_tools) WHERE is_active = true;

-- ============================================
-- Phase 2: 渐进式披露 Layer 3 (scripts, references, assets)
-- ============================================

-- 5. 脚本存储表 (scripts/)
CREATE TABLE IF NOT EXISTS skill_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'python',
    content TEXT NOT NULL,
    description TEXT,
    parameters JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, name)
);

-- 6. 参考文档存储表 (references/)
CREATE TABLE IF NOT EXISTS skill_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, name)
);

-- 7. 资源文件存储表 (assets/) - 使用 Supabase Storage
CREATE TABLE IF NOT EXISTS skill_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(skill_id, name)
);

-- 8. 脚本执行日志表
CREATE TABLE IF NOT EXISTS script_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    script_id UUID NOT NULL REFERENCES skill_scripts(id) ON DELETE CASCADE,
    input JSONB,
    output JSONB,
    status TEXT NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 添加注释
COMMENT ON TABLE skill_scripts IS 'Layer 3: 技能关联的可执行脚本';
COMMENT ON TABLE skill_references IS 'Layer 3: 技能关联的参考文档';
COMMENT ON TABLE skill_assets IS 'Layer 3: 技能关联的资源文件';
COMMENT ON TABLE script_executions IS '脚本执行日志，用于审计和调试';

-- 10. 创建索引
CREATE INDEX IF NOT EXISTS idx_skill_scripts_skill_id ON skill_scripts(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_references_skill_id ON skill_references(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_assets_skill_id ON skill_assets(skill_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_user_id ON script_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_script_id ON script_executions(script_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_created_at ON script_executions(created_at DESC);


-- ============================================
-- Phase 3: RLS 策略 (使用 DROP IF EXISTS 确保幂等)
-- ============================================

-- 11. RLS 策略 - skill_scripts
ALTER TABLE skill_scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_scripts_select_policy" ON skill_scripts;
CREATE POLICY "skill_scripts_select_policy" ON skill_scripts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_scripts.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_scripts_insert_policy" ON skill_scripts;
CREATE POLICY "skill_scripts_insert_policy" ON skill_scripts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_scripts.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_scripts_update_policy" ON skill_scripts;
CREATE POLICY "skill_scripts_update_policy" ON skill_scripts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_scripts.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_scripts_delete_policy" ON skill_scripts;
CREATE POLICY "skill_scripts_delete_policy" ON skill_scripts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_scripts.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

-- 12. RLS 策略 - skill_references
ALTER TABLE skill_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_references_select_policy" ON skill_references;
CREATE POLICY "skill_references_select_policy" ON skill_references
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_references.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_references_insert_policy" ON skill_references;
CREATE POLICY "skill_references_insert_policy" ON skill_references
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_references.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_references_update_policy" ON skill_references;
CREATE POLICY "skill_references_update_policy" ON skill_references
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_references.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_references_delete_policy" ON skill_references;
CREATE POLICY "skill_references_delete_policy" ON skill_references
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_references.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

-- 13. RLS 策略 - skill_assets
ALTER TABLE skill_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_assets_select_policy" ON skill_assets;
CREATE POLICY "skill_assets_select_policy" ON skill_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_assets.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_assets_insert_policy" ON skill_assets;
CREATE POLICY "skill_assets_insert_policy" ON skill_assets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_assets.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "skill_assets_delete_policy" ON skill_assets;
CREATE POLICY "skill_assets_delete_policy" ON skill_assets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM skills 
            WHERE skills.id = skill_assets.skill_id 
            AND skills.user_id = (select auth.uid())
        )
    );

-- 14. RLS 策略 - script_executions
ALTER TABLE script_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "script_executions_select_policy" ON script_executions;
CREATE POLICY "script_executions_select_policy" ON script_executions
    FOR SELECT USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "script_executions_insert_policy" ON script_executions;
CREATE POLICY "script_executions_insert_policy" ON script_executions
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));


-- ============================================
-- Phase 4: 触发器函数
-- ============================================

-- 15. 更新触发器 - skill_scripts
CREATE OR REPLACE FUNCTION public.update_skill_scripts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skill_scripts_updated_at ON skill_scripts;
CREATE TRIGGER skill_scripts_updated_at
    BEFORE UPDATE ON skill_scripts
    FOR EACH ROW
    EXECUTE FUNCTION update_skill_scripts_updated_at();

-- 16. 更新触发器 - skill_references (自动计算字数)
CREATE OR REPLACE FUNCTION public.update_skill_references_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    -- 自动计算字数
    IF NEW.content IS NOT NULL AND NEW.content != '' THEN
        NEW.word_count = array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1);
    ELSE
        NEW.word_count = 0;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skill_references_updated_at ON skill_references;
CREATE TRIGGER skill_references_updated_at
    BEFORE UPDATE ON skill_references
    FOR EACH ROW
    EXECUTE FUNCTION update_skill_references_updated_at();

-- 17. 插入触发器 - skill_references (计算字数)
DROP TRIGGER IF EXISTS skill_references_insert_word_count ON skill_references;
CREATE TRIGGER skill_references_insert_word_count
    BEFORE INSERT ON skill_references
    FOR EACH ROW
    EXECUTE FUNCTION update_skill_references_updated_at();
