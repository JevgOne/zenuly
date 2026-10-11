-- =============================================
-- Migration 007: Queue RPC, Lead Card RPC, Shift RPCs, onboarding
-- =============================================

-- =============================================
-- 7.1 profiles.onboarding_completed for first-login wizard
-- =============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- =============================================
-- 7.2 get_queue — returns sorted queue for an operator
-- Ordering: overdue callbacks → new leads → today callbacks/tasks
-- =============================================
CREATE OR REPLACE FUNCTION get_queue(p_project_id uuid, p_operator_id uuid)
RETURNS TABLE (
  id uuid,
  company_name text,
  phone text,
  hook_text text,
  hook_source text,
  priority int,
  stage_key text,
  next_action_at timestamptz,
  attempt_count int,
  max_attempts int,
  is_overdue boolean,
  overdue_minutes int,
  queue_section text
) AS $$
DECLARE
  v_now timestamptz := now();
  v_end_of_day timestamptz;
  v_wh jsonb;
  v_tz text;
BEGIN
  -- Get project working hours for end-of-day calculation
  SELECT p.working_hours INTO v_wh FROM projects p WHERE p.id = p_project_id;
  v_tz := COALESCE(v_wh->>'timezone', 'Europe/Prague');
  v_end_of_day := (date_trunc('day', v_now AT TIME ZONE v_tz) + (COALESCE(v_wh->>'end', '18:00'))::time) AT TIME ZONE v_tz;

  RETURN QUERY
  WITH queue_leads AS (
    SELECT
      l.id,
      l.company AS company_name,
      l.phone,
      l.hook_text,
      l.hook_source,
      l.priority,
      s.key AS stage_key,
      l.next_action_at,
      l.attempt_count,
      proj.max_attempts,
      -- Overdue: has next_action_at in the past
      CASE WHEN l.next_action_at < v_now THEN true ELSE false END AS is_overdue,
      CASE WHEN l.next_action_at < v_now
        THEN EXTRACT(EPOCH FROM (v_now - l.next_action_at))::int / 60
        ELSE 0
      END AS overdue_minutes,
      -- Section classification
      CASE
        WHEN l.next_action_at < v_now AND s.key != 'new' THEN 'overdue'
        WHEN s.key = 'new' THEN 'new'
        ELSE 'today'
      END AS queue_section,
      -- Sort order
      CASE
        WHEN l.next_action_at < v_now AND s.key != 'new' THEN 1  -- overdue first
        WHEN s.key = 'new' THEN 2                                 -- new second
        ELSE 3                                                      -- today third
      END AS sort_section,
      l.created_at
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    JOIN projects proj ON proj.id = l.project_id
    WHERE l.project_id = p_project_id
      AND l.is_active = true
      AND (l.owner_id = p_operator_id OR l.owner_id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM do_not_call dnc
        WHERE dnc.project_id = l.project_id AND dnc.phone = l.phone
      )
      AND (
        -- New leads (always show)
        s.key = 'new'
        -- Or leads with next_action_at within today
        OR (l.next_action_at IS NOT NULL AND l.next_action_at <= v_end_of_day)
      )
  )
  SELECT
    ql.id, ql.company_name, ql.phone, ql.hook_text, ql.hook_source,
    ql.priority, ql.stage_key, ql.next_action_at,
    ql.attempt_count, ql.max_attempts,
    ql.is_overdue, ql.overdue_minutes, ql.queue_section
  FROM queue_leads ql
  ORDER BY
    ql.sort_section,
    CASE WHEN ql.sort_section = 1 THEN ql.next_action_at END ASC,       -- overdue: oldest first
    CASE WHEN ql.sort_section = 2 THEN ql.priority END DESC,            -- new: high priority first
    CASE WHEN ql.sort_section = 2 THEN ql.created_at END ASC,           -- new: oldest first
    CASE WHEN ql.sort_section = 3 THEN ql.next_action_at END ASC;       -- today: earliest first
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 7.3 get_lead_card — returns lead detail + call history
-- =============================================
CREATE OR REPLACE FUNCTION get_lead_card(p_lead_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_lead jsonb;
  v_calls jsonb;
  v_custom_fields jsonb;
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
  ) INTO v_lead
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
  WHERE cf.project_id = (v_lead->>'owner_id')::uuid
    OR cf.project_id = (
      SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
    );

  RETURN v_lead || jsonb_build_object(
    'calls', v_calls,
    'custom_fields', v_custom_fields
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 7.4 Shift management RPCs
-- =============================================

-- Start shift
CREATE OR REPLACE FUNCTION start_shift(p_project_id uuid)
RETURNS uuid AS $$
DECLARE
  v_shift_id uuid;
BEGIN
  -- End any existing active shift for this operator in this project
  UPDATE shifts SET status = 'ended', ended_at = now()
  WHERE operator_id = auth.uid()
    AND project_id = p_project_id
    AND status IN ('active', 'paused');

  INSERT INTO shifts (project_id, operator_id, status)
  VALUES (p_project_id, auth.uid(), 'active')
  RETURNING id INTO v_shift_id;

  INSERT INTO audit_log (project_id, user_id, action, details)
  VALUES (p_project_id, auth.uid(), 'shift_started',
    jsonb_build_object('shift_id', v_shift_id));

  RETURN v_shift_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pause shift
CREATE OR REPLACE FUNCTION pause_shift(p_shift_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE shifts SET status = 'paused', paused_at = now()
  WHERE id = p_shift_id
    AND operator_id = auth.uid()
    AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resume shift
CREATE OR REPLACE FUNCTION resume_shift(p_shift_id uuid)
RETURNS void AS $$
DECLARE
  v_pause_duration int;
BEGIN
  SELECT EXTRACT(EPOCH FROM (now() - paused_at))::int INTO v_pause_duration
  FROM shifts WHERE id = p_shift_id AND operator_id = auth.uid() AND status = 'paused';

  UPDATE shifts
  SET status = 'active',
      paused_at = NULL,
      total_pause_s = total_pause_s + COALESCE(v_pause_duration, 0)
  WHERE id = p_shift_id
    AND operator_id = auth.uid()
    AND status = 'paused';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- End shift
CREATE OR REPLACE FUNCTION end_shift(p_shift_id uuid)
RETURNS void AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_extra_pause int := 0;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND operator_id = auth.uid();

  -- If was paused, add remaining pause time
  IF v_shift.status = 'paused' AND v_shift.paused_at IS NOT NULL THEN
    v_extra_pause := EXTRACT(EPOCH FROM (now() - v_shift.paused_at))::int;
  END IF;

  UPDATE shifts
  SET status = 'ended',
      ended_at = now(),
      paused_at = NULL,
      total_pause_s = total_pause_s + v_extra_pause
  WHERE id = p_shift_id AND operator_id = auth.uid();

  INSERT INTO audit_log (project_id, user_id, action, details)
  VALUES (v_shift.project_id, auth.uid(), 'shift_ended',
    jsonb_build_object('shift_id', p_shift_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7.5 get_active_shift — returns current shift info
-- =============================================
CREATE OR REPLACE FUNCTION get_active_shift(p_project_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_shift shifts%ROWTYPE;
  v_calls_this_hour int;
BEGIN
  SELECT * INTO v_shift
  FROM shifts
  WHERE operator_id = auth.uid()
    AND project_id = p_project_id
    AND status IN ('active', 'paused')
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_shift.id IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  -- Count calls in the current hour
  SELECT COUNT(*) INTO v_calls_this_hour
  FROM calls
  WHERE operator_id = auth.uid()
    AND project_id = p_project_id
    AND created_at >= date_trunc('hour', now());

  RETURN jsonb_build_object(
    'active', true,
    'shift_id', v_shift.id,
    'status', v_shift.status::text,
    'started_at', v_shift.started_at,
    'paused_at', v_shift.paused_at,
    'total_pause_s', v_shift.total_pause_s,
    'calls_this_hour', v_calls_this_hour
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
