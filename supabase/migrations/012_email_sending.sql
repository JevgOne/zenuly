-- =============================================
-- 012: Email sending — sent_emails history + unreachable template + complete_send_task
-- =============================================

-- History of sent emails
CREATE TABLE sent_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),
  lead_id       uuid NOT NULL REFERENCES leads(id),
  task_id       uuid REFERENCES tasks(id),
  template_key  text NOT NULL,
  to_email      text NOT NULL,
  subject       text NOT NULL,
  body_html     text NOT NULL,
  resend_id     text,
  sent_by       uuid REFERENCES profiles(id),
  sent_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sent_emails_lead ON sent_emails(lead_id, sent_at DESC);

-- RLS
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY se_admin ON sent_emails FOR ALL
  USING (auth_user_role() = 'admin');

CREATE POLICY se_member_select ON sent_emails FOR SELECT
  USING (is_project_member(project_id));

CREATE POLICY se_member_insert ON sent_emails FOR INSERT
  WITH CHECK (is_project_member(project_id));

-- New template: automatic email after max attempts
INSERT INTO email_templates (project_id, key, name, subject, body_html, variables) VALUES
  ('00000000-0000-0000-0000-000000000001', 'unreachable',
   'Nedosazitelny',
   'Zkouseli jsme vas zastihnout -- {{company}}',
   '<p>Dobry den,</p>
<p>v poslednich dnech jsme se vam nekolikrat pokouseli dovolat ohledne moznosti pro vas web.</p>
<p>Pokud mate zajem o nezavaznou konzultaci zdarma, staci odpovedet na tento e-mail nebo zavolat na {{phone}}.</p>
<p>Preji hezky den,<br>Weblyx</p>',
   '["company", "phone"]');

-- =============================================
-- Function: complete_send_task
-- Closes task + advances stage for send_offer
-- =============================================
CREATE OR REPLACE FUNCTION complete_send_task(
  p_task_id uuid,
  p_email_sent boolean DEFAULT true
) RETURNS jsonb AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_new_stage_id uuid;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  -- Close the task
  UPDATE tasks SET status = 'completed', completed_at = now()
  WHERE id = p_task_id;

  -- Advance stage for send_offer -> offer_sent
  IF v_task.task_type = 'send_offer' THEN
    SELECT id INTO v_new_stage_id
    FROM stages WHERE project_id = v_task.project_id AND key = 'offer_sent';

    IF v_new_stage_id IS NOT NULL THEN
      UPDATE leads SET stage_id = v_new_stage_id, updated_at = now()
      WHERE id = v_task.lead_id;
    END IF;
  END IF;

  -- Audit
  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (v_task.project_id, v_task.lead_id, auth.uid(), 'task_completed',
    jsonb_build_object('task_type', v_task.task_type::text, 'email_sent', p_email_sent));

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Extend get_lead_card with sent emails
-- =============================================
CREATE OR REPLACE FUNCTION get_lead_card(p_lead_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_lead jsonb;
  v_calls jsonb;
  v_emails jsonb;
  v_custom_fields jsonb;
  v_project_id uuid;
BEGIN
  -- Lead data
  SELECT jsonb_build_object(
    'id', l.id,
    'company_name', l.company,
    'contact_person', l.contact_person,
    'phone', l.phone,
    'email', l.email,
    'website', l.website,
    'city', l.city,
    'ico', l.ico,
    'lead_source', l.lead_source,
    'phone_source', l.phone_source::text,
    'findings', l.findings,
    'hook_text', l.hook_text,
    'hook_source', l.hook_source,
    'stage_key', s.key,
    'stage_name', s.name,
    'priority', l.priority,
    'attempt_count', l.attempt_count,
    'max_attempts', p.max_attempts,
    'next_action_at', l.next_action_at,
    'next_action_type', l.next_action_type::text,
    'postponed_until', l.postponed_until,
    'postpone_reason', l.postpone_reason,
    'custom_data', l.custom_data,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'owner_id', l.owner_id
  ), l.project_id
  INTO v_lead, v_project_id
  FROM leads l
  JOIN stages s ON s.id = l.stage_id
  JOIN projects p ON p.id = l.project_id
  WHERE l.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  -- Call history (last 10)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'outcome_name', o.name,
      'outcome_key', o.key,
      'outcome_group', o.group_name,
      'operator_name', pr.full_name,
      'note', c.note,
      'created_at', c.created_at
    ) ORDER BY c.created_at DESC
  ), '[]'::jsonb) INTO v_calls
  FROM (
    SELECT * FROM calls WHERE lead_id = p_lead_id ORDER BY created_at DESC LIMIT 10
  ) c
  JOIN outcomes o ON o.id = c.outcome_id
  JOIN profiles pr ON pr.id = c.operator_id;

  -- Sent emails
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', se.id,
      'template_key', se.template_key,
      'subject', se.subject,
      'sent_at', se.sent_at,
      'sent_by', pr.full_name
    ) ORDER BY se.sent_at DESC
  ), '[]'::jsonb) INTO v_emails
  FROM sent_emails se
  LEFT JOIN profiles pr ON pr.id = se.sent_by
  WHERE se.lead_id = p_lead_id;

  -- Custom fields definition for this project
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'key', cf.key,
      'name', cf.name,
      'field_type', cf.field_type::text,
      'options', cf.options
    ) ORDER BY cf.position
  ), '[]'::jsonb) INTO v_custom_fields
  FROM custom_fields cf
  WHERE cf.project_id = v_project_id;

  RETURN v_lead || jsonb_build_object(
    'calls', v_calls,
    'emails', v_emails,
    'custom_fields', v_custom_fields
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
