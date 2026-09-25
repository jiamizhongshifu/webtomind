-- 用户账号系统数据库迁移
-- 在 Supabase SQL Editor 中执行此脚本

-- ============================================
-- 1. 创建 profiles 表（扩展用户信息）
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  invite_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql' SET search_path = public;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 创建触发器在用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 2. 修改 summaries 表添加 user_id
-- ============================================
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON summaries(user_id);

-- ============================================
-- 3. 修改 shortcuts 表添加 user_id
-- ============================================
ALTER TABLE shortcuts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shortcuts_user_id ON shortcuts(user_id);

-- ============================================
-- 4. 配置 RLS (Row Level Security) 策略
-- ============================================

-- profiles 表 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- summaries 表 RLS
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own summaries" ON summaries;
CREATE POLICY "Users can view own summaries" ON summaries
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert own summaries" ON summaries;
CREATE POLICY "Users can insert own summaries" ON summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own summaries" ON summaries;
CREATE POLICY "Users can update own summaries" ON summaries
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own summaries" ON summaries;
CREATE POLICY "Users can delete own summaries" ON summaries
  FOR DELETE USING (auth.uid() = user_id);

-- shortcuts 表 RLS
ALTER TABLE shortcuts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own shortcuts" ON shortcuts;
CREATE POLICY "Users can view own shortcuts" ON shortcuts
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert own shortcuts" ON shortcuts;
CREATE POLICY "Users can insert own shortcuts" ON shortcuts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own shortcuts" ON shortcuts;
CREATE POLICY "Users can update own shortcuts" ON shortcuts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own shortcuts" ON shortcuts;
CREATE POLICY "Users can delete own shortcuts" ON shortcuts
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 5. 允许服务端使用 service_role key 绕过 RLS
-- ============================================
-- 注意：后端 API 使用 service_role key 时会自动绕过 RLS
-- 需要在后端代码中手动根据 user_id 过滤数据
