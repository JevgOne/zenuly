-- =============================================
-- Migration 009: Round-robin lead assignment + SLA monitoring
-- =============================================

-- =============================================
-- 9.1 assign_new_lead — round-robin assignment
-- Finds operator with active shift and fewest leads (< max_leads).
-- If nobody available, lead stays in pool (owner_id = NULL).
-- =============================================
CREATE OR REPLACE FUNCTION assign_new_lead(
  p_lead_id uuid,
  p_project_id uuid,
  p_exclude_operator_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_max_leads int;
  v_chosen_operator uuid;
BEGIN
  SELECT max_leads INTO v_max_leads FROM projects WHERE id = p_project_id;

  -- Find operator with active shift and fewest open leads, under capacity
  WITH active_operators AS (
    SELECT DISTINCT pm.profile_id
    FROM project_members pm
    JOIN shifts s ON s.operator_id = pm.profile_id
      AND s.project_id = p_project_id
      AND s.status = 'active'
    WHERE pm.project_id = p_project_id
      AND (p_exclude_operator_id IS NULL OR pm.profile_id != p_exclude_operator_id)
  ),
  lead_counts AS (
    SELECT ao.profile_id,
           COUNT(l.id) AS open_leads
    FROM active_operators ao
    LEFT JOIN leads l ON l.owner_id = ao.profile_id
      AND l.project_id = p_project_id
      AND l.is_active = true
    GROUP BY ao.profile_id
    HAVING COUNT(l.id) < v_max_leads
  )
  SELECT profile_id INTO v_chosen_operator
  FROM lead_counts
  ORDER BY open_leads ASC, random()
  LIMIT 1;

  -- Assign the lead
  IF v_chosen_operator IS NOT NULL THEN
    UPDATE leads SET owner_id = v_chosen_operator, updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
    VALUES (p_project_id, p_lead_id, v_chosen_operator, 'lead_assigned',
      jsonb_build_object('method', 'round_robin', 'operator_id', v_chosen_operator));
  END IF;

  RETURN v_chosen_operator;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9.2 reassign_stale_leads — SLA monitoring
-- Finds leads stage='new' that have been waiting > sla_first_call
-- and reassigns them to another operator.
-- Called by pg_cron every 15 minutes.
-- =============================================
CREATE OR REPLACE FUNCTION reassign_stale_leads()
RETURNS int AS $$
DECLARE
  v_lead RECORD;
  v_count int := 0;
  v_new_operator uuid;
BEGIN
  FOR v_lead IN
    SELECT l.id, l.project_id, l.owner_id, s.key AS stage_key
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    JOIN projects p ON p.id = l.project_id
    WHERE s.key = 'new'
      AND l.is_active = true
      AND l.owner_id IS NOT NULL
      AND l.created_at + p.sla_first_call < now()
  LOOP
    -- Try to reassign to a different operator
    v_new_operator := assign_new_lead(v_lead.id, v_lead.project_id, v_lead.owner_id);

    IF v_new_operator IS NOT NULL THEN
      INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
      VALUES (v_lead.project_id, v_lead.id, v_new_operator, 'sla_reassigned',
        jsonb_build_object(
          'previous_owner', v_lead.owner_id,
          'reason', 'SLA first call exceeded'
        ));
      v_count := v_count + 1;
    ELSE
      -- No other operator available, put in pool
      UPDATE leads SET owner_id = NULL, updated_at = now()
      WHERE id = v_lead.id;

      INSERT INTO audit_log (project_id, lead_id, action, details)
      VALUES (v_lead.project_id, v_lead.id, 'sla_pool',
        jsonb_build_object(
          'previous_owner', v_lead.owner_id,
          'reason', 'SLA exceeded, no operator available'
        ));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9.3 claim_lead — operator claims a pool lead
-- Used when operator clicks a lead with owner_id IS NULL
-- =============================================
CREATE OR REPLACE FUNCTION claim_lead(p_lead_id uuid)
RETURNS boolean AS $$
DECLARE
  v_lead leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;

  IF v_lead IS NULL THEN
    RETURN false;
  END IF;

  -- Only claim if unowned or already owned by caller
  IF v_lead.owner_id IS NOT NULL AND v_lead.owner_id != auth.uid() THEN
    RETURN false;
  END IF;

  UPDATE leads SET owner_id = auth.uid(), updated_at = now()
  WHERE id = p_lead_id AND (owner_id IS NULL OR owner_id = auth.uid());

  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (v_lead.project_id, v_lead.id, auth.uid(), 'lead_claimed',
    jsonb_build_object('method', 'manual'));

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9.4 Schedule pg_cron for SLA check (if pg_cron extension available)
-- This may fail if pg_cron is not enabled — that's OK, we'll use
-- Edge Function or server-side cron as fallback.
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reassign-stale-leads',
      '*/15 * * * *',
      'SELECT reassign_stale_leads()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available, skip
  NULL;
END;
$$;
