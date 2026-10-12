-- =============================================
-- Migration 015: Fix get_queue — admin/manager sees all leads, not just owned
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
  v_is_admin boolean;
BEGIN
  -- Check if caller is admin or manager
  v_is_admin := (
    auth_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND profile_id = auth.uid()
        AND role = 'manager'
    )
  );

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
      -- Admin/manager sees all leads; operator sees only own + unassigned
      AND (v_is_admin OR l.owner_id = p_operator_id OR l.owner_id IS NULL)
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
