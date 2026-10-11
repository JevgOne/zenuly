-- =============================================
-- Migration 010: Fix get_lead_card custom_fields condition
-- Bug: WHERE used owner_id (operator UUID) instead of project_id
-- =============================================

CREATE OR REPLACE FUNCTION get_lead_card(p_lead_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_lead jsonb;
  v_calls jsonb;
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

  -- Custom fields definition for this project (fixed: uses project_id, not owner_id)
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
    'custom_fields', v_custom_fields
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
