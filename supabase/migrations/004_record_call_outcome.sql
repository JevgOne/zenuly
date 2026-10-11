-- =============================================
-- Helper: next_working_day_at
-- Shifts a desired timestamp into working hours.
-- If p_opposite_part = true (for no_answer): next working day, opposite half of day.
-- =============================================
CREATE OR REPLACE FUNCTION next_working_day_at(
  p_project_id uuid,
  p_desired timestamptz,
  p_opposite_part boolean DEFAULT false
) RETURNS timestamptz AS $$
DECLARE
  v_wh jsonb;
  v_tz text;
  v_start time;
  v_end time;
  v_days int[];
  v_local timestamp;
  v_day_of_week int;
  v_midpoint time;
BEGIN
  SELECT working_hours INTO v_wh FROM projects WHERE id = p_project_id;
  v_tz    := v_wh->>'timezone';
  v_start := (v_wh->>'start')::time;
  v_end   := (v_wh->>'end')::time;
  v_days  := ARRAY(SELECT jsonb_array_elements_text(v_wh->'days')::int);
  v_midpoint := v_start + (v_end - v_start) / 2;

  v_local := p_desired AT TIME ZONE v_tz;

  IF p_opposite_part THEN
    -- Next working day
    v_local := v_local + interval '1 day';
    v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
    WHILE NOT (v_day_of_week = ANY(v_days)) LOOP
      v_local := v_local + interval '1 day';
      v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
    END LOOP;
    -- Opposite part: morning call -> afternoon callback, and vice versa
    IF (p_desired AT TIME ZONE v_tz)::time < v_midpoint THEN
      v_local := date_trunc('day', v_local) + v_midpoint;
    ELSE
      v_local := date_trunc('day', v_local) + v_start;
    END IF;
    RETURN v_local AT TIME ZONE v_tz;
  END IF;

  -- Standard: shift into working hours
  v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;

  IF NOT (v_day_of_week = ANY(v_days)) OR v_local::time >= v_end THEN
    LOOP
      v_local := date_trunc('day', v_local) + interval '1 day';
      v_day_of_week := EXTRACT(ISODOW FROM v_local)::int;
      EXIT WHEN v_day_of_week = ANY(v_days);
    END LOOP;
    v_local := date_trunc('day', v_local) + v_start;
  ELSIF v_local::time < v_start THEN
    v_local := date_trunc('day', v_local) + v_start;
  END IF;

  RETURN v_local AT TIME ZONE v_tz;
END;
$$ LANGUAGE plpgsql STABLE;


-- =============================================
-- Helper: find_project_admin
-- =============================================
CREATE OR REPLACE FUNCTION find_project_admin(p_project_id uuid)
RETURNS uuid AS $$
  SELECT pm.profile_id
  FROM project_members pm
  JOIN profiles p ON p.id = pm.profile_id
  WHERE pm.project_id = p_project_id
    AND p.role = 'admin'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- =============================================
-- Main: record_call_outcome
-- One transaction: write call, move stage, schedule callback/task,
-- hand to admin, write DNC, audit. Rules from outcomes.rules JSONB.
-- =============================================
CREATE OR REPLACE FUNCTION record_call_outcome(
  p_lead_id       uuid,
  p_outcome_key   text,
  p_note          text DEFAULT NULL,
  p_callback_at   timestamptz DEFAULT NULL,
  p_email         text DEFAULT NULL,
  p_time_slot     timestamptz DEFAULT NULL,
  p_lost_reason_id uuid DEFAULT NULL,
  p_add_to_dnc    boolean DEFAULT false,
  p_postpone_reason text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_lead         leads%ROWTYPE;
  v_outcome      outcomes%ROWTYPE;
  v_rules        jsonb;
  v_project      projects%ROWTYPE;
  v_new_stage_id uuid;
  v_admin_id     uuid;
  v_call_id      uuid;
  v_now          timestamptz := now();
  v_callback_at  timestamptz;
  v_result       jsonb := '{}'::jsonb;
BEGIN
  -- ========================================
  -- 1. LOAD DATA
  -- ========================================

  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  SELECT * INTO v_outcome
  FROM outcomes
  WHERE project_id = v_lead.project_id AND key = p_outcome_key;
  IF v_outcome IS NULL THEN
    RAISE EXCEPTION 'Outcome % not found for project', p_outcome_key;
  END IF;
  v_rules := v_outcome.rules;

  SELECT * INTO v_project FROM projects WHERE id = v_lead.project_id;
  v_admin_id := find_project_admin(v_lead.project_id);

  -- ========================================
  -- 2. WRITE CALL
  -- ========================================

  INSERT INTO calls (lead_id, project_id, operator_id, outcome_id, note)
  VALUES (v_lead.id, v_lead.project_id, auth.uid(), v_outcome.id, p_note)
  RETURNING id INTO v_call_id;

  -- ========================================
  -- 3. INCREMENT ATTEMPT
  -- ========================================

  IF (v_rules->>'increment_attempt')::boolean IS TRUE THEN
    v_lead.attempt_count := v_lead.attempt_count + 1;
  END IF;

  -- ========================================
  -- 4. CHECK MAX ATTEMPTS -> LOST
  -- ========================================

  IF (v_rules->>'mark_lost_after_max')::boolean IS TRUE
     AND v_lead.attempt_count >= v_project.max_attempts THEN

    SELECT id INTO v_new_stage_id
    FROM stages
    WHERE project_id = v_lead.project_id AND type = 'lost';

    SELECT id INTO v_lead.lost_reason_id
    FROM lost_reasons
    WHERE project_id = v_lead.project_id
      AND key = COALESCE(v_rules->>'lost_reason_key', 'unreachable');

    v_lead.stage_id := v_new_stage_id;
    v_lead.is_active := false;
    v_lead.next_action_at := NULL;
    v_lead.next_action_type := NULL;

    v_result := v_result || jsonb_build_object('auto_email', true);
    v_result := v_result || jsonb_build_object('max_attempts_reached', true);

  ELSE
    -- ========================================
    -- 5. STAGE CHANGE
    -- ========================================

    IF v_rules->>'set_stage' IS NOT NULL THEN
      SELECT id INTO v_new_stage_id
      FROM stages
      WHERE project_id = v_lead.project_id
        AND key = v_rules->>'set_stage';

      IF v_new_stage_id IS NULL THEN
        RAISE EXCEPTION 'Stage % not found', v_rules->>'set_stage';
      END IF;

      v_lead.stage_id := v_new_stage_id;

      -- If moving to lost, deactivate
      IF v_rules->>'set_stage' = 'lost'
         OR EXISTS (SELECT 1 FROM stages WHERE id = v_new_stage_id AND type = 'lost') THEN
        v_lead.is_active := false;
      END IF;
    END IF;

    -- ========================================
    -- 6. ASSIGN TO ADMIN
    -- ========================================

    IF (v_rules->>'assign_to_admin')::boolean IS TRUE THEN
      v_lead.owner_id := v_admin_id;
    END IF;

    -- ========================================
    -- 7. CALLBACK / NEXT ACTION
    -- ========================================

    -- 7a. Opposite part of day (no_answer)
    IF (v_rules->>'callback_opposite_part')::boolean IS TRUE THEN
      v_callback_at := next_working_day_at(v_lead.project_id, v_now, true);
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';

    -- 7b. Custom callback (later)
    ELSIF (v_rules->>'callback_custom')::boolean IS TRUE AND p_callback_at IS NOT NULL THEN
      v_callback_at := next_working_day_at(v_lead.project_id, p_callback_at);
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';
      IF p_postpone_reason IS NOT NULL THEN
        v_lead.postponed_until := v_callback_at;
        v_lead.postpone_reason := p_postpone_reason;
      END IF;

    -- 7c. Fixed callback delay (busy +30min, offer +3d, deck +2d)
    ELSIF v_rules->>'callback_delay' IS NOT NULL THEN
      v_callback_at := next_working_day_at(
        v_lead.project_id,
        v_now + (v_rules->>'callback_delay')::interval
      );
      v_lead.next_action_at := v_callback_at;
      v_lead.next_action_type := 'callback';

    -- 7d. Meeting
    ELSIF (v_rules->>'calendar_event')::boolean IS TRUE AND p_time_slot IS NOT NULL THEN
      v_lead.next_action_at := p_time_slot;
      v_lead.next_action_type := 'meeting';
      v_result := v_result || jsonb_build_object(
        'calendar_event', true,
        'meeting_time', p_time_slot
      );

    -- 7e. Lost — no next action
    ELSIF v_rules->>'set_stage' = 'lost' THEN
      v_lead.next_action_at := NULL;
      v_lead.next_action_type := NULL;

      IF v_rules->>'recontact_after' IS NOT NULL THEN
        v_lead.postponed_until := v_now + (v_rules->>'recontact_after')::interval;
        v_result := v_result || jsonb_build_object(
          'recontact_at', v_lead.postponed_until
        );
      END IF;
    END IF;

    -- ========================================
    -- 8. CREATE TASK
    -- ========================================

    IF v_rules->>'create_task' IS NOT NULL THEN
      INSERT INTO tasks (
        lead_id, project_id, assigned_to, task_type, due_at, note
      ) VALUES (
        v_lead.id,
        v_lead.project_id,
        CASE
          WHEN v_rules->>'task_assign_to' = 'admin' THEN v_admin_id
          ELSE auth.uid()
        END,
        (v_rules->>'create_task')::task_type,
        CASE
          WHEN v_rules->>'task_delay' = '0' THEN v_now
          WHEN v_rules->>'task_delay' IS NOT NULL
            THEN v_now + (v_rules->>'task_delay')::interval
          ELSE v_now + interval '24 hours'
        END,
        p_note
      );

      -- If no next action set yet, use task as next action
      IF v_lead.next_action_type IS NULL AND v_lead.next_action_at IS NULL AND v_lead.is_active IS TRUE THEN
        v_lead.next_action_at := CASE
          WHEN v_rules->>'task_delay' = '0' THEN v_now
          ELSE v_now + COALESCE((v_rules->>'task_delay')::interval, interval '24 hours')
        END;
        v_lead.next_action_type := 'task';
      END IF;
    END IF;

  END IF;  -- end else branch (max attempts not reached)

  -- ========================================
  -- 9. SAVE EMAIL
  -- ========================================

  IF p_email IS NOT NULL AND v_lead.email IS DISTINCT FROM p_email THEN
    v_lead.email := p_email;
  END IF;

  -- ========================================
  -- 10. LOST REASON
  -- ========================================

  IF p_lost_reason_id IS NOT NULL THEN
    v_lead.lost_reason_id := p_lost_reason_id;
  END IF;

  -- ========================================
  -- 11. DO NOT CALL
  -- ========================================

  IF p_add_to_dnc IS TRUE THEN
    INSERT INTO do_not_call (project_id, phone, reason, added_by)
    VALUES (v_lead.project_id, v_lead.phone, 'Klient si nepřeje volat', auth.uid())
    ON CONFLICT (project_id, phone) DO NOTHING;
  END IF;

  -- ========================================
  -- 12. VALIDATE: open lead MUST have next_action_at
  -- ========================================

  IF EXISTS (
    SELECT 1 FROM stages
    WHERE id = v_lead.stage_id
      AND project_id = v_lead.project_id
      AND type = 'open'
  ) AND v_lead.next_action_at IS NULL THEN
    RAISE EXCEPTION 'Open lead must have next_action_at set. Outcome: %', p_outcome_key;
  END IF;

  -- ========================================
  -- 13. SAVE LEAD
  -- ========================================

  UPDATE leads SET
    stage_id         = v_lead.stage_id,
    owner_id         = v_lead.owner_id,
    attempt_count    = v_lead.attempt_count,
    next_action_at   = v_lead.next_action_at,
    next_action_type = v_lead.next_action_type,
    email            = v_lead.email,
    lost_reason_id   = v_lead.lost_reason_id,
    postponed_until  = v_lead.postponed_until,
    postpone_reason  = v_lead.postpone_reason,
    is_active        = v_lead.is_active,
    updated_at       = v_now
  WHERE id = p_lead_id;

  -- ========================================
  -- 14. AUDIT LOG
  -- ========================================

  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (
    v_lead.project_id,
    v_lead.id,
    auth.uid(),
    'call_recorded',
    jsonb_build_object(
      'outcome_key', p_outcome_key,
      'outcome_name', v_outcome.name,
      'call_id', v_call_id,
      'attempt_count', v_lead.attempt_count,
      'new_stage', (SELECT key FROM stages WHERE id = v_lead.stage_id),
      'next_action_at', v_lead.next_action_at,
      'note', p_note
    )
  );

  -- ========================================
  -- 15. RETURN
  -- ========================================

  v_result := v_result || jsonb_build_object(
    'success', true,
    'call_id', v_call_id,
    'lead_id', v_lead.id,
    'outcome', p_outcome_key,
    'next_action_at', v_lead.next_action_at
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- Separate function: postpone_lead
-- Any open lead can be postponed without recording a call.
-- =============================================
CREATE OR REPLACE FUNCTION postpone_lead(
  p_lead_id       uuid,
  p_until         timestamptz,
  p_reason        text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_lead leads%ROWTYPE;
  v_next timestamptz;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', p_lead_id;
  END IF;

  v_next := next_working_day_at(v_lead.project_id, p_until);

  UPDATE leads SET
    next_action_at = v_next,
    postponed_until = p_until,
    postpone_reason = p_reason,
    updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (v_lead.project_id, v_lead.id, auth.uid(), 'lead_postponed',
    jsonb_build_object('until', p_until, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'next_action_at', v_next);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
