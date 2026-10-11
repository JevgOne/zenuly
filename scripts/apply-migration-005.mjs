import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(
  'https://lftzebeptmmyoljyifbe.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8'
);

// Split migration into logical blocks and run each via rpc
const statements = [
  // 5.1 project_role enum
  `CREATE TYPE project_role AS ENUM ('operator', 'manager')`,

  // 5.2 Add role to project_members
  `ALTER TABLE project_members ADD COLUMN role project_role NOT NULL DEFAULT 'operator'`,

  // 5.3 Extend user_role
  `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user'`,

  // 5.3b Add phone to profiles
  `ALTER TABLE profiles ADD COLUMN phone text`,

  // 5.4 Rewrite handle_new_user
  `CREATE OR REPLACE FUNCTION handle_new_user()
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
$$ LANGUAGE plpgsql`,

  // 5.5 project_role_for
  `CREATE OR REPLACE FUNCTION project_role_for(p_project_id uuid)
RETURNS project_role AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id
  AND profile_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER`,

  // 5.6 is_project_manager
  `CREATE OR REPLACE FUNCTION is_project_manager(p_project_id uuid)
RETURNS boolean AS $$
  SELECT
    auth_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND profile_id = auth.uid()
        AND role = 'manager'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER`,

  // 5.7 find_project_admin
  `CREATE OR REPLACE FUNCTION find_project_admin(p_project_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    (SELECT pm.profile_id
     FROM project_members pm
     WHERE pm.project_id = p_project_id
       AND pm.role = 'manager'
     LIMIT 1),
    (SELECT pm.profile_id
     FROM project_members pm
     JOIN profiles p ON p.id = pm.profile_id
     WHERE pm.project_id = p_project_id
       AND p.role = 'admin'
     LIMIT 1),
    (SELECT p.id
     FROM profiles p
     WHERE p.role = 'admin'
     LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER`,

  // 5.8 RLS leads
  `DROP POLICY IF EXISTS leads_select_operator ON leads`,
  `DROP POLICY IF EXISTS leads_update_operator ON leads`,
  `CREATE POLICY leads_select_manager ON leads FOR SELECT USING (is_project_manager(project_id))`,
  `CREATE POLICY leads_update_manager ON leads FOR UPDATE USING (is_project_manager(project_id))`,
  `CREATE POLICY leads_select_operator ON leads FOR SELECT USING (is_project_member(project_id) AND (owner_id = auth.uid() OR owner_id IS NULL))`,
  `CREATE POLICY leads_update_operator ON leads FOR UPDATE USING (is_project_member(project_id) AND owner_id = auth.uid())`,

  // 5.9 RLS calls
  `DROP POLICY IF EXISTS calls_select_operator ON calls`,
  `CREATE POLICY calls_select_manager ON calls FOR SELECT USING (is_project_manager(project_id))`,
  `CREATE POLICY calls_select_operator ON calls FOR SELECT USING (is_project_member(project_id) AND operator_id = auth.uid())`,

  // 5.10 RLS tasks
  `DROP POLICY IF EXISTS tasks_select_assigned ON tasks`,
  `CREATE POLICY tasks_select_manager ON tasks FOR SELECT USING (is_project_manager(project_id))`,
  `CREATE POLICY tasks_select_assigned ON tasks FOR SELECT USING (assigned_to = auth.uid())`,

  // 5.11 RLS shifts
  `CREATE POLICY shifts_select_manager ON shifts FOR SELECT USING (is_project_manager(project_id))`,

  // 5.12 RLS audit_log
  `DROP POLICY IF EXISTS al_select_operator ON audit_log`,
  `CREATE POLICY al_select_manager ON audit_log FOR SELECT USING (project_id IS NOT NULL AND is_project_manager(project_id))`,
  `CREATE POLICY al_select_operator ON audit_log FOR SELECT USING (user_id = auth.uid() OR (lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads WHERE leads.id = audit_log.lead_id AND leads.owner_id = auth.uid())))`,

  // 5.13 RLS project_members
  `DROP POLICY IF EXISTS pm_select_member ON project_members`,
  `CREATE POLICY pm_select_member ON project_members FOR SELECT USING (is_project_member(project_id))`,
  `CREATE POLICY pm_insert_manager ON project_members FOR INSERT WITH CHECK (is_project_manager(project_id))`,
  `CREATE POLICY pm_delete_manager ON project_members FOR DELETE USING (is_project_manager(project_id) AND profile_id != auth.uid())`,
];

async function main() {
  console.log(`Aplikuji migraci 005 (${statements.length} příkazů)...\n`);

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    const preview = sql.slice(0, 80).replace(/\n/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });

    if (error) {
      // Try alternative: use the postgres connection via REST
      const res = await fetch('https://lftzebeptmmyoljyifbe.supabase.co/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql_text: sql }),
      });

      if (!res.ok) {
        const body = await res.text();
        // Check if it's a "already exists" type error — skip those
        if (body.includes('already exists') || body.includes('duplicate')) {
          console.log('SKIP (already exists)');
          continue;
        }
        console.log(`FAIL: ${body}`);
        continue;
      }
      console.log('OK (via REST)');
    } else {
      console.log('OK');
    }
  }

  // Verify
  console.log('\n--- Ověření ---');

  const { data: enumCheck } = await supabase
    .from('project_members')
    .select('role')
    .limit(1);
  console.log('project_members.role sloupec:', enumCheck !== null ? 'EXISTS' : 'MISSING');

  const { data: phoneCheck } = await supabase
    .from('profiles')
    .select('phone')
    .limit(1);
  console.log('profiles.phone sloupec:', phoneCheck !== null ? 'EXISTS' : 'MISSING');

  console.log('\n--- HOTOVO ---');
}

main().catch(console.error);
