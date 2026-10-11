-- =============================================
-- PROFILES
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON profiles FOR SELECT
  USING (id = auth.uid());
CREATE POLICY profiles_select_admin ON profiles FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (auth_user_role() = 'admin');

-- =============================================
-- PROJECTS
-- =============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_admin ON projects FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY projects_select_member ON projects FOR SELECT
  USING (is_project_member(id));
CREATE POLICY projects_insert_admin ON projects FOR INSERT
  WITH CHECK (auth_user_role() = 'admin');
CREATE POLICY projects_update_admin ON projects FOR UPDATE
  USING (auth_user_role() = 'admin');
CREATE POLICY projects_delete_admin ON projects FOR DELETE
  USING (auth_user_role() = 'admin');

-- =============================================
-- PROJECT_MEMBERS
-- =============================================
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select_admin ON project_members FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY pm_select_member ON project_members FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY pm_insert_admin ON project_members FOR INSERT
  WITH CHECK (auth_user_role() = 'admin');
CREATE POLICY pm_delete_admin ON project_members FOR DELETE
  USING (auth_user_role() = 'admin');

-- =============================================
-- STAGES
-- =============================================
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY stages_select_admin ON stages FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY stages_select_member ON stages FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY stages_manage_admin ON stages FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- CUSTOM_FIELDS
-- =============================================
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY cf_select_admin ON custom_fields FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY cf_select_member ON custom_fields FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY cf_manage_admin ON custom_fields FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- LEADS
-- =============================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_select_admin ON leads FOR SELECT
  USING (auth_user_role() = 'admin');
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
CREATE POLICY leads_claim_pool ON leads FOR UPDATE
  USING (
    is_project_member(project_id)
    AND owner_id IS NULL
  )
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY leads_manage_admin ON leads FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- OUTCOMES
-- =============================================
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY outcomes_select_admin ON outcomes FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY outcomes_select_member ON outcomes FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY outcomes_manage_admin ON outcomes FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- CALLS
-- =============================================
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY calls_select_admin ON calls FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY calls_select_operator ON calls FOR SELECT
  USING (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );
CREATE POLICY calls_insert_operator ON calls FOR INSERT
  WITH CHECK (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );

-- =============================================
-- LOST_REASONS
-- =============================================
ALTER TABLE lost_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY lr_select_admin ON lost_reasons FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY lr_select_member ON lost_reasons FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY lr_manage_admin ON lost_reasons FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- TASKS
-- =============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_admin ON tasks FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY tasks_select_assigned ON tasks FOR SELECT
  USING (assigned_to = auth.uid());
CREATE POLICY tasks_update_assigned ON tasks FOR UPDATE
  USING (assigned_to = auth.uid());
CREATE POLICY tasks_manage_admin ON tasks FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- DO_NOT_CALL
-- =============================================
ALTER TABLE do_not_call ENABLE ROW LEVEL SECURITY;

CREATE POLICY dnc_select_admin ON do_not_call FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY dnc_select_member ON do_not_call FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY dnc_insert_member ON do_not_call FOR INSERT
  WITH CHECK (is_project_member(project_id));
CREATE POLICY dnc_delete_admin ON do_not_call FOR DELETE
  USING (auth_user_role() = 'admin');

-- =============================================
-- SHIFTS
-- =============================================
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shifts_select_admin ON shifts FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY shifts_select_own ON shifts FOR SELECT
  USING (operator_id = auth.uid());
CREATE POLICY shifts_insert_own ON shifts FOR INSERT
  WITH CHECK (operator_id = auth.uid());
CREATE POLICY shifts_update_own ON shifts FOR UPDATE
  USING (operator_id = auth.uid());

-- =============================================
-- EMAIL_TEMPLATES
-- =============================================
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY et_select_admin ON email_templates FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY et_select_member ON email_templates FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY et_manage_admin ON email_templates FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- AUDIT_LOG
-- =============================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY al_select_admin ON audit_log FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY al_select_operator ON audit_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads WHERE leads.id = audit_log.lead_id AND leads.owner_id = auth.uid()
    ))
  );
CREATE POLICY al_insert ON audit_log FOR INSERT
  WITH CHECK (true);
