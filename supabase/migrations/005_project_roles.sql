-- =============================================
-- 5.1 project_role enum
-- =============================================
CREATE TYPE project_role AS ENUM ('operator', 'manager');

-- =============================================
-- 5.2 Add role to project_members
-- =============================================
ALTER TABLE project_members
  ADD COLUMN role project_role NOT NULL DEFAULT 'operator';

-- =============================================
-- 5.3 Extend user_role with 'user' (registered, no project access)
-- =============================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- =============================================
-- 5.3b Add phone column to profiles
-- =============================================
ALTER TABLE profiles ADD COLUMN phone text;

-- =============================================
-- 5.4 Rewrite handle_new_user trigger: new users get 'user' role
-- =============================================
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
      ELSE 'user'::user_role
    END,
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5.5 Helper: project_role_for — get user's role in a project
-- Returns NULL if user is not a member
-- =============================================
CREATE OR REPLACE FUNCTION project_role_for(p_project_id uuid)
RETURNS project_role AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id
  AND profile_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 5.6 Helper: is_project_manager
-- Superadmin (profiles.role = 'admin') = always true
-- Manager in the given project = true
-- =============================================
CREATE OR REPLACE FUNCTION is_project_manager(p_project_id uuid)
RETURNS boolean AS $$
  SELECT
    auth_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND profile_id = auth.uid()
        AND role = 'manager'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 5.7 Rewrite find_project_admin → prefer project manager
-- record_call_outcome uses this for assign_to_admin
-- =============================================
CREATE OR REPLACE FUNCTION find_project_admin(p_project_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    -- First: project manager
    (SELECT pm.profile_id
     FROM project_members pm
     WHERE pm.project_id = p_project_id
       AND pm.role = 'manager'
     LIMIT 1),
    -- Fallback: global admin who is a project member
    (SELECT pm.profile_id
     FROM project_members pm
     JOIN profiles p ON p.id = pm.profile_id
     WHERE pm.project_id = p_project_id
       AND p.role = 'admin'
     LIMIT 1),
    -- Last fallback: any global admin
    (SELECT p.id
     FROM profiles p
     WHERE p.role = 'admin'
     LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 5.8 RLS: leads — manager sees all in project
-- =============================================
DROP POLICY IF EXISTS leads_select_operator ON leads;
DROP POLICY IF EXISTS leads_update_operator ON leads;

CREATE POLICY leads_select_manager ON leads FOR SELECT
  USING (is_project_manager(project_id));

CREATE POLICY leads_update_manager ON leads FOR UPDATE
  USING (is_project_manager(project_id));

CREATE POLICY leads_select_operator ON leads FOR SELECT
  USING (
    is_project_member(project_id)
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );

CREATE POLICY leads_update_operator ON leads FOR UPDATE
  USING (
    is_project_member(project_id)
    AND owner_id = auth.uid()
  );

-- =============================================
-- 5.9 RLS: calls — manager sees all in project
-- =============================================
DROP POLICY IF EXISTS calls_select_operator ON calls;

CREATE POLICY calls_select_manager ON calls FOR SELECT
  USING (is_project_manager(project_id));

CREATE POLICY calls_select_operator ON calls FOR SELECT
  USING (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );

-- =============================================
-- 5.10 RLS: tasks — manager sees all in project
-- =============================================
DROP POLICY IF EXISTS tasks_select_assigned ON tasks;

CREATE POLICY tasks_select_manager ON tasks FOR SELECT
  USING (is_project_manager(project_id));

CREATE POLICY tasks_select_assigned ON tasks FOR SELECT
  USING (assigned_to = auth.uid());

-- =============================================
-- 5.11 RLS: shifts — manager sees all in project
-- =============================================
CREATE POLICY shifts_select_manager ON shifts FOR SELECT
  USING (is_project_manager(project_id));

-- =============================================
-- 5.12 RLS: audit_log — manager sees all in project
-- =============================================
DROP POLICY IF EXISTS al_select_operator ON audit_log;

CREATE POLICY al_select_manager ON audit_log FOR SELECT
  USING (
    project_id IS NOT NULL AND is_project_manager(project_id)
  );

CREATE POLICY al_select_operator ON audit_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads WHERE leads.id = audit_log.lead_id AND leads.owner_id = auth.uid()
    ))
  );

-- =============================================
-- 5.13 RLS: project_members — manager can manage
-- =============================================
DROP POLICY IF EXISTS pm_select_member ON project_members;

CREATE POLICY pm_select_member ON project_members FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY pm_insert_manager ON project_members FOR INSERT
  WITH CHECK (is_project_manager(project_id));

CREATE POLICY pm_delete_manager ON project_members FOR DELETE
  USING (
    is_project_manager(project_id)
    AND profile_id != auth.uid()
  );
