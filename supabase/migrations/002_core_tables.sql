-- =============================================
-- 2.1 profiles
-- =============================================
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  role        user_role NOT NULL DEFAULT 'operator',
  avatar_url  text,
  onboarded   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 2.2 projects
-- =============================================
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  calls_per_hour  int NOT NULL DEFAULT 20,
  max_leads       int NOT NULL DEFAULT 80,
  max_attempts    int NOT NULL DEFAULT 4,
  sla_first_call  interval NOT NULL DEFAULT '2 hours',
  working_hours   jsonb NOT NULL DEFAULT '{
    "days": [1,2,3,4,5],
    "start": "09:00",
    "end": "18:00",
    "timezone": "Europe/Prague"
  }',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 2.3 project_members
-- =============================================
CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, profile_id)
);

-- =============================================
-- Helper functions (depend on profiles + project_members)
-- =============================================
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
    AND profile_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================
-- 2.4 stages
-- =============================================
CREATE TABLE stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  type        stage_type NOT NULL,
  position    int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
CREATE INDEX idx_stages_project ON stages(project_id, position);

-- =============================================
-- 2.5 custom_fields
-- =============================================
CREATE TABLE custom_fields (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key               text NOT NULL,
  name              text NOT NULL,
  field_type        custom_field_type NOT NULL,
  options           jsonb,
  required_from_stage text,
  position          int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- =============================================
-- 2.6 lost_reasons (MUST be before leads — FK reference)
-- =============================================
CREATE TABLE lost_reasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  is_system   boolean NOT NULL DEFAULT false,
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- =============================================
-- 2.7 outcomes
-- =============================================
CREATE TABLE outcomes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  group_name  text NOT NULL,
  shortcut    int,
  position    int NOT NULL DEFAULT 0,
  rules       jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- =============================================
-- 2.8 leads
-- =============================================
CREATE TABLE leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Basic info
  company           text NOT NULL,
  contact_person    text,
  phone             text NOT NULL,
  email             text,
  website           text,
  city              text,
  ico               text,
  lead_source       text,
  phone_source      phone_source NOT NULL,

  -- Pipeline
  stage_id          uuid NOT NULL REFERENCES stages(id),
  owner_id          uuid REFERENCES profiles(id),
  priority          int NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  attempt_count     int NOT NULL DEFAULT 0,

  -- Next action
  next_action_at    timestamptz,
  next_action_type  next_action_type,

  -- Hook
  hook_text         text,
  hook_source       text,

  -- Postpone
  postponed_until   timestamptz,
  postpone_reason   text,

  -- Lost
  lost_reason_id    uuid REFERENCES lost_reasons(id),
  lost_reason_note  text,

  -- Custom fields (JSONB, key = custom_fields.key)
  custom_data       jsonb NOT NULL DEFAULT '{}',

  -- Metadata
  imported_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_project_stage ON leads(project_id, stage_id);
CREATE INDEX idx_leads_owner ON leads(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_leads_next_action ON leads(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX idx_leads_phone ON leads(project_id, phone);
CREATE INDEX idx_leads_email ON leads(project_id, email) WHERE email IS NOT NULL;

-- Unique phone per project for non-lost leads
-- (Using is_active approach since partial index with subselect is not supported)
ALTER TABLE leads ADD COLUMN is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX idx_leads_phone_unique ON leads(project_id, phone) WHERE is_active = true;

-- =============================================
-- 2.9 calls
-- =============================================
CREATE TABLE calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  outcome_id  uuid NOT NULL REFERENCES outcomes(id),
  note        text,
  voice_note_url text,
  duration_s  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_lead ON calls(lead_id, created_at DESC);
CREATE INDEX idx_calls_operator ON calls(operator_id, created_at DESC);
CREATE INDEX idx_calls_project_date ON calls(project_id, created_at);

-- =============================================
-- 2.10 tasks
-- =============================================
CREATE TABLE tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id),
  assigned_to uuid NOT NULL REFERENCES profiles(id),
  task_type   task_type NOT NULL,
  status      task_status NOT NULL DEFAULT 'pending',
  due_at      timestamptz NOT NULL,
  completed_at timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to, status, due_at);
CREATE INDEX idx_tasks_project ON tasks(project_id, status);

-- =============================================
-- 2.11 do_not_call
-- =============================================
CREATE TABLE do_not_call (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phone       text NOT NULL,
  reason      text,
  added_by    uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, phone)
);
CREATE INDEX idx_dnc_phone ON do_not_call(phone);

-- =============================================
-- 2.12 shifts
-- =============================================
CREATE TABLE shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  status      shift_status NOT NULL DEFAULT 'active',
  started_at  timestamptz NOT NULL DEFAULT now(),
  paused_at   timestamptz,
  ended_at    timestamptz,
  total_pause_s int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_operator ON shifts(operator_id, started_at DESC);
CREATE INDEX idx_shifts_active ON shifts(operator_id, status) WHERE status = 'active';

-- =============================================
-- 2.13 email_templates
-- =============================================
CREATE TABLE email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,
  subject     text NOT NULL,
  body_html   text NOT NULL,
  variables   jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- =============================================
-- 2.14 audit_log
-- =============================================
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects(id),
  lead_id     uuid REFERENCES leads(id),
  user_id     uuid REFERENCES profiles(id),
  action      text NOT NULL,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_project ON audit_log(project_id, created_at DESC);
CREATE INDEX idx_audit_lead ON audit_log(lead_id, created_at DESC);

-- =============================================
-- Triggers: updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Trigger: new auth user -> profile
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
           AND NEW.raw_user_meta_data->>'role' != ''
      THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'operator'::user_role
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
