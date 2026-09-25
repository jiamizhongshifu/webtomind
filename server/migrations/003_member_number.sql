-- 创始成员编号系统迁移
-- 为用户分配唯一的创始成员编号，按注册顺序自动分配

-- ============================================
-- 1. 添加 member_number 字段
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS member_number INTEGER UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_member_number ON profiles(member_number);

-- ============================================
-- 2. 为现有用户按注册顺序分配编号
-- ============================================
WITH ranked_users AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rank
  FROM profiles
  WHERE member_number IS NULL
)
UPDATE profiles
SET member_number = ranked_users.rank
FROM ranked_users
WHERE profiles.id = ranked_users.id;

-- ============================================
-- 3. 修改触发器：新用户自动分配编号
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  next_member_number INTEGER;
BEGIN
  SELECT COALESCE(MAX(member_number), 0) + 1 INTO next_member_number FROM profiles;

  INSERT INTO public.profiles (id, username, avatar_url, member_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    next_member_number
  );
  RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
