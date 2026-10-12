-- =============================================
-- 019: Fix default role — 'user' → 'operator'
-- New registrations should default to 'operator', not 'user'.
-- Also fix existing profiles with role='user'.
-- =============================================

-- 1. Update existing 'user' profiles to 'operator'
UPDATE profiles SET role = 'operator' WHERE role = 'user';

-- 2. Rewrite handle_new_user: default to 'operator'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
           AND NEW.raw_user_meta_data->>'role' != ''
      THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'operator'::user_role
    END,
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
