-- =============================================
-- Migration 018: Fix get_dashboard_stats RPC
-- Fixes: task_type 'consultation' doesn't exist (use next_action_type 'meeting'),
--        pr.role should be pm.role for project-level role check
-- =============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_project_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_tz text;
  v_wh jsonb;
BEGIN
  -- Get project timezone
  SELECT p.working_hours INTO v_wh FROM projects p WHERE p.id = p_project_id;
  v_tz := COALESCE(v_wh->>'timezone', 'Europe/Prague');
  v_today_start := date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_week_start := date_trunc('week', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  SELECT jsonb_build_object(
    -- KPI counters
    'total_leads', (
      SELECT COUNT(*) FROM leads WHERE project_id = p_project_id AND is_active = true
    ),
    'calls_today', (
      SELECT COUNT(*) FROM calls WHERE project_id = p_project_id AND created_at >= v_today_start
    ),
    'reached_today', (
      SELECT COUNT(*) FROM calls c
      JOIN outcomes o ON o.id = c.outcome_id
      WHERE c.project_id = p_project_id
        AND c.created_at >= v_today_start
        AND o.group_name = 'interest'
    ),
    'calls_today_total_for_pct', (
      SELECT GREATEST(COUNT(*), 1) FROM calls WHERE project_id = p_project_id AND created_at >= v_today_start
    ),
    'consultations_this_week', (
      -- Count leads with meeting scheduled this week
      SELECT COUNT(*) FROM leads
      WHERE project_id = p_project_id
        AND is_active = true
        AND next_action_type = 'meeting'
        AND next_action_at >= v_week_start
        AND next_action_at < v_week_start + interval '7 days'
    ),
    'pending_tasks', (
      SELECT COUNT(*) FROM tasks
      WHERE project_id = p_project_id AND status = 'pending'
    ),
    'active_shifts', (
      SELECT COUNT(*) FROM shifts
      WHERE project_id = p_project_id AND status = 'active'
    ),
    -- Pipeline: stages with lead counts
    'pipeline', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'key', s.key,
          'type', s.type,
          'count', (
            SELECT COUNT(*) FROM leads l
            WHERE l.project_id = p_project_id AND l.stage_id = s.id AND l.is_active = true
          )
        ) ORDER BY s.position
      ), '[]'::jsonb)
      FROM stages s WHERE s.project_id = p_project_id
    ),
    -- Operators: name, calls today, reached, consultations, has active shift
    'operators', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'name', pr.full_name,
          'calls_today', (
            SELECT COUNT(*) FROM calls c
            WHERE c.operator_id = pr.id AND c.project_id = p_project_id AND c.created_at >= v_today_start
          ),
          'reached_today', (
            SELECT COUNT(*) FROM calls c
            JOIN outcomes o ON o.id = c.outcome_id
            WHERE c.operator_id = pr.id AND c.project_id = p_project_id
              AND c.created_at >= v_today_start AND o.group_name = 'interest'
          ),
          'consultations_week', (
            -- Count leads owned by this operator with meeting this week
            SELECT COUNT(*) FROM leads l
            WHERE l.owner_id = pr.id AND l.project_id = p_project_id
              AND l.is_active = true
              AND l.next_action_type = 'meeting'
              AND l.next_action_at >= v_week_start AND l.next_action_at < v_week_start + interval '7 days'
          ),
          'has_active_shift', EXISTS(
            SELECT 1 FROM shifts sh
            WHERE sh.operator_id = pr.id AND sh.project_id = p_project_id AND sh.status = 'active'
          )
        ) ORDER BY pr.full_name
      ), '[]'::jsonb)
      FROM project_members pm
      JOIN profiles pr ON pr.id = pm.profile_id
      WHERE pm.project_id = p_project_id
        AND pm.role = 'operator'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
