-- Migration: 036_skill_rpc_functions
-- Description: 添加 Skill 系统所需的 RPC 函数
-- Date: 2026-01-27

-- ============================================
-- 1. 原子递增技能使用计数
-- ============================================
CREATE OR REPLACE FUNCTION public.increment_skill_use_count(p_skill_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE skills
    SET use_count = COALESCE(use_count, 0) + 1,
        updated_at = NOW()
    WHERE id = p_skill_id
    AND user_id = auth.uid();
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.increment_skill_use_count(UUID) IS '原子递增技能使用计数，仅允许用户更新自己的技能';

-- ============================================
-- 2. 批量获取技能的 Layer 3 元数据
-- ============================================
CREATE OR REPLACE FUNCTION public.get_skill_layer3_metadata(p_skill_ids UUID[])
RETURNS TABLE (
    skill_id UUID,
    references_count INTEGER,
    scripts_count INTEGER,
    ref_data JSONB,
    script_data JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id AS skill_id,
        COALESCE((SELECT COUNT(*)::INTEGER FROM skill_references sr WHERE sr.skill_id = s.id), 0) AS references_count,
        COALESCE((SELECT COUNT(*)::INTEGER FROM skill_scripts ss WHERE ss.skill_id = s.id), 0) AS scripts_count,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'name', sr.name,
                'description', sr.description,
                'word_count', sr.word_count
            )) FROM skill_references sr WHERE sr.skill_id = s.id),
            '[]'::jsonb
        ) AS ref_data,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'name', ss.name,
                'description', ss.description,
                'parameters', ss.parameters
            )) FROM skill_scripts ss WHERE ss.skill_id = s.id),
            '[]'::jsonb
        ) AS script_data
    FROM skills s
    WHERE s.id = ANY(p_skill_ids)
    AND s.user_id = auth.uid();
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.get_skill_layer3_metadata(UUID[]) IS '批量获取技能的 Layer 3 元数据（参考文档和脚本列表）';

-- ============================================
-- 3. 计算参考文档字数的辅助函数
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_word_count(p_content TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_content IS NULL OR p_content = '' THEN
        RETURN 0;
    END IF;
    RETURN array_length(regexp_split_to_array(trim(p_content), '\s+'), 1);
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.calculate_word_count(TEXT) IS '计算文本的字数（按空白字符分割）';

-- ============================================
-- 4. 获取用户技能统计
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_skill_stats()
RETURNS TABLE (
    total_skills INTEGER,
    active_skills INTEGER,
    total_use_count BIGINT,
    total_scripts INTEGER,
    total_refs INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*)::INTEGER FROM skills WHERE user_id = v_user_id) AS total_skills,
        (SELECT COUNT(*)::INTEGER FROM skills WHERE user_id = v_user_id AND is_active = true) AS active_skills,
        (SELECT COALESCE(SUM(use_count), 0)::BIGINT FROM skills WHERE user_id = v_user_id) AS total_use_count,
        (SELECT COUNT(*)::INTEGER FROM skill_scripts ss 
         JOIN skills s ON ss.skill_id = s.id 
         WHERE s.user_id = v_user_id) AS total_scripts,
        (SELECT COUNT(*)::INTEGER FROM skill_references sr 
         JOIN skills s ON sr.skill_id = s.id 
         WHERE s.user_id = v_user_id) AS total_refs;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.get_user_skill_stats() IS '获取当前用户的技能统计信息';

-- ============================================
-- 5. 复制技能（从模板或其他技能）
-- ============================================
CREATE OR REPLACE FUNCTION public.copy_skill_from_template(p_template_id UUID, p_new_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_skill_id UUID;
    v_template RECORD;
BEGIN
    SELECT * INTO v_template FROM skill_templates WHERE id = p_template_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;
    
    INSERT INTO skills (
        user_id, name, display_name, description, icon,
        triggers, core_instructions, output_type,
        associated_tools, default_options, category,
        allowed_tools, license, compatibility, metadata
    )
    VALUES (
        v_user_id,
        COALESCE(p_new_name, v_template.name || '_copy'),
        v_template.display_name,
        v_template.description,
        v_template.icon,
        v_template.triggers,
        v_template.core_instructions,
        v_template.output_type,
        v_template.associated_tools,
        v_template.default_options,
        v_template.category,
        v_template.allowed_tools,
        v_template.license,
        v_template.compatibility,
        v_template.metadata
    )
    RETURNING id INTO v_new_skill_id;
    
    RETURN v_new_skill_id;
END;
$$;

-- 添加注释
COMMENT ON FUNCTION public.copy_skill_from_template(UUID, TEXT) IS '从模板复制创建新技能';

-- ============================================
-- 6. 授权
-- ============================================
GRANT EXECUTE ON FUNCTION public.increment_skill_use_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_skill_layer3_metadata(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_word_count(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_skill_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_skill_from_template(UUID, TEXT) TO authenticated;
