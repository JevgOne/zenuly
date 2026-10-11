-- =============================================
-- Fix: allow users to see their own project_members rows directly
-- The existing pm_select_member policy uses is_project_member() which
-- works but can cause subtle issues with joins. Adding a direct
-- profile_id = auth.uid() policy is clearer and more reliable.
-- =============================================

-- Users can always see their own memberships
CREATE POLICY pm_select_own ON project_members FOR SELECT
  USING (profile_id = auth.uid());

-- Allow members to see other members' profiles (for team display)
CREATE POLICY profiles_select_project_member ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm1
      JOIN project_members pm2 ON pm1.project_id = pm2.project_id
      WHERE pm1.profile_id = auth.uid()
        AND pm2.profile_id = profiles.id
    )
  );
