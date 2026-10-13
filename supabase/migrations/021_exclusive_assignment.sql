-- 021: Exclusive lead assignment + nightly rebalance
-- Pool leads are atomically assigned to operators when they load the queue.
-- Stale leads are returned to pool nightly for redistribution.

-- 1. Add stale_lead_days config to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stale_lead_days int NOT NULL DEFAULT 3;

-- 2. Atomically assign pool leads to an operator (called from get_queue)
CREATE OR REPLACE FUNCTION assign_queue_leads(p_project_id uuid, p_operator_id uuid)
RETURNS int AS $$
DECLARE
  v_max_leads int;
  v_current_leads int;
  v_to_assign int;
  v_assigned int := 0;
BEGIN
  SELECT max_leads INTO v_max_leads FROM projects WHERE id = p_project_id;

  SELECT COUNT(*) INTO v_current_leads
  FROM leads
  WHERE project_id = p_project_id
    AND owner_id = p_operator_id
    AND is_active = true;

  v_to_assign := GREATEST(0, v_max_leads - v_current_leads);
  IF v_to_assign = 0 THEN RETURN 0; END IF;

  WITH pool_leads AS (
    SELECT l.id FROM leads l
    JOIN stages s ON s.id = l.stage_id
    WHERE l.project_id = p_project_id
      AND l.is_active = true
      AND l.owner_id IS NULL
      AND s.type = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM do_not_call dnc
        WHERE dnc.project_id = l.project_id AND dnc.phone = l.phone
      )
    ORDER BY l.priority DESC, l.created_at ASC
    LIMIT v_to_assign
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE leads SET owner_id = p_operator_id, updated_at = now()
    WHERE id IN (SELECT id FROM pool_leads)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_assigned FROM updated;

  IF v_assigned > 0 THEN
    INSERT INTO audit_log (project_id, user_id, action, details)
    VALUES (p_project_id, p_operator_id, 'queue_leads_assigned',
      jsonb_build_object('count', v_assigned, 'method', 'queue_load'));
  END IF;

  RETURN v_assigned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Rewrite get_queue: auto-assign pool leads + operator sees only own leads
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
  v_is_admin boolean;
BEGIN
  v_is_admin := (
    auth_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND profile_id = auth.uid()
        AND role = 'manager'
    )
  );

  -- Auto-assign pool leads to this operator (only for operators)
  IF NOT v_is_admin THEN
    PERFORM assign_queue_leads(p_project_id, p_operator_id);
  END IF;

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
      CASE WHEN l.next_action_at < v_now THEN true ELSE false END AS is_overdue,
      CASE WHEN l.next_action_at < v_now
        THEN EXTRACT(EPOCH FROM (v_now - l.next_action_at))::int / 60
        ELSE 0
      END AS overdue_minutes,
      CASE
        WHEN l.next_action_at < v_now AND s.key != 'new' THEN 'overdue'
        WHEN s.key = 'new' THEN 'new'
        ELSE 'today'
      END AS queue_section,
      CASE
        WHEN l.next_action_at < v_now AND s.key != 'new' THEN 1
        WHEN s.key = 'new' THEN 2
        ELSE 3
      END AS sort_section,
      l.created_at
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    JOIN projects proj ON proj.id = l.project_id
    WHERE l.project_id = p_project_id
      AND l.is_active = true
      -- Operator sees ONLY own leads (no more pool leads)
      AND (v_is_admin OR l.owner_id = p_operator_id)
      AND NOT EXISTS (
        SELECT 1 FROM do_not_call dnc
        WHERE dnc.project_id = l.project_id AND dnc.phone = l.phone
      )
      AND (
        s.key = 'new'
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
    CASE WHEN ql.sort_section = 1 THEN ql.next_action_at END ASC,
    CASE WHEN ql.sort_section = 2 THEN ql.priority END DESC,
    CASE WHEN ql.sort_section = 2 THEN ql.created_at END ASC,
    CASE WHEN ql.sort_section = 3 THEN ql.next_action_at END ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Nightly rebalance: return stale leads to pool
CREATE OR REPLACE FUNCTION rebalance_nightly()
RETURNS jsonb AS $$
DECLARE
  v_project RECORD;
  v_lead RECORD;
  v_returned int := 0;
  v_projects_checked int := 0;
BEGIN
  FOR v_project IN
    SELECT id, stale_lead_days FROM projects WHERE is_active = true
  LOOP
    v_projects_checked := v_projects_checked + 1;

    FOR v_lead IN
      SELECT l.id, l.project_id, l.owner_id
      FROM leads l
      JOIN stages s ON s.id = l.stage_id
      WHERE l.project_id = v_project.id
        AND l.is_active = true
        AND l.owner_id IS NOT NULL
        AND s.type = 'open'
        -- Only leads assigned to operators (not managers/admins)
        AND EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = v_project.id
            AND pm.profile_id = l.owner_id
            AND pm.role = 'operator'
        )
        -- No call from owner in stale_lead_days
        AND NOT EXISTS (
          SELECT 1 FROM calls c
          WHERE c.lead_id = l.id
            AND c.operator_id = l.owner_id
            AND c.created_at > now() - (v_project.stale_lead_days || ' days')::interval
        )
        -- next_action_at is in the past (should have been called but wasn't)
        AND l.next_action_at IS NOT NULL
        AND l.next_action_at < now()
    LOOP
      UPDATE leads SET owner_id = NULL, updated_at = now()
      WHERE id = v_lead.id;

      INSERT INTO audit_log (project_id, lead_id, action, details)
      VALUES (v_lead.project_id, v_lead.id, 'nightly_rebalance',
        jsonb_build_object(
          'previous_owner', v_lead.owner_id,
          'reason', 'stale: no call in ' || v_project.stale_lead_days || ' days'
        ));

      v_returned := v_returned + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'projects_checked', v_projects_checked,
    'leads_returned_to_pool', v_returned,
    'ran_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. pg_cron schedule (fallback, may not be available on all Supabase tiers)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'nightly-rebalance',
      '0 1 * * *',
      'SELECT rebalance_nightly()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
