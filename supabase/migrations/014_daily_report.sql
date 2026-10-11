-- =============================================
-- 014: Daily report RPC
-- =============================================

CREATE OR REPLACE FUNCTION get_daily_report(
  p_project_id uuid,
  p_date date DEFAULT CURRENT_DATE
) RETURNS jsonb AS $$
DECLARE
  v_project projects%ROWTYPE;
  v_target int;
  v_operators jsonb;
  v_outcomes jsonb;
  v_lost_reasons jsonb;
  v_lost_trend jsonb;
  v_funnel jsonb;
  v_funnel_prev jsonb;
  v_overdue_tasks int;
  v_overdue_callbacks int;
  v_new_dnc int;
  v_total_calls int;
  v_total_reached int;
  v_total_meetings int;
  v_avg_calls_per_hour numeric;
  v_total_hours numeric;
  v_decks_overdue int;
  v_offers_overdue int;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_target := v_project.calls_per_hour;

  -- ============================================
  -- 1. OPERATORS: hours, calls, calls/h, reached, meetings
  -- ============================================
  SELECT COALESCE(jsonb_agg(op_row ORDER BY op_row->>'operator_name'), '[]'::jsonb)
  INTO v_operators
  FROM (
    SELECT jsonb_build_object(
      'operator_id', sub.operator_id,
      'operator_name', sub.operator_name,
      'hours', sub.net_hours,
      'calls', sub.total_calls,
      'calls_per_hour', sub.calls_per_hour,
      'reached', sub.reached,
      'reached_pct', CASE WHEN sub.total_calls > 0
        THEN ROUND(sub.reached * 100.0 / sub.total_calls, 0) ELSE 0 END,
      'meetings', sub.meetings,
      'below_target', sub.calls_per_hour < v_target
    ) AS op_row
    FROM (
      SELECT
        pm.profile_id AS operator_id,
        pr.full_name AS operator_name,
        COALESCE(ROUND((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 1), 0) AS net_hours,
        (SELECT COUNT(*) FROM calls c
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date)::int AS total_calls,
        (SELECT COUNT(*) FROM calls c
         JOIN outcomes o ON o.id = c.outcome_id
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date
           AND o.key NOT IN ('no_answer', 'busy'))::int AS reached,
        (SELECT COUNT(*) FROM calls c
         JOIN outcomes o ON o.id = c.outcome_id
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date
           AND o.key = 'meeting')::int AS meetings,
        CASE WHEN COALESCE((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 0) > 0
        THEN ROUND((
          SELECT COUNT(*)::numeric FROM calls c
          WHERE c.operator_id = pm.profile_id
            AND c.project_id = p_project_id
            AND c.created_at::date = p_date
        ) / NULLIF((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 0), 1)
        ELSE 0 END AS calls_per_hour
      FROM project_members pm
      JOIN profiles pr ON pr.id = pm.profile_id
      WHERE pm.project_id = p_project_id
        AND pr.role = 'operator'
    ) sub
    WHERE sub.total_calls > 0 OR sub.net_hours > 0
  ) x;

  -- ============================================
  -- 2. OUTCOMES summary (whole day)
  -- ============================================
  SELECT jsonb_build_object(
    'total_calls', COUNT(*)::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int,
    'offers', COUNT(*) FILTER (WHERE o.key = 'offer')::int,
    'decks', COUNT(*) FILTER (WHERE o.key = 'deck')::int,
    'reports', COUNT(*) FILTER (WHERE o.key = 'report')::int,
    'later', COUNT(*) FILTER (WHERE o.key = 'later')::int,
    'no_answer', COUNT(*) FILTER (WHERE o.key = 'no_answer')::int,
    'busy', COUNT(*) FILTER (WHERE o.key = 'busy')::int,
    'not_interested', COUNT(*) FILTER (WHERE o.key = 'not_interested')::int,
    'wrong_number', COUNT(*) FILTER (WHERE o.key = 'wrong_number')::int,
    'defunct', COUNT(*) FILTER (WHERE o.key = 'defunct')::int,
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int
  ) INTO v_outcomes
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date;

  v_total_calls := (v_outcomes->>'total_calls')::int;
  v_total_reached := (v_outcomes->>'reached')::int;
  v_total_meetings := (v_outcomes->>'meetings')::int;

  -- Total hours for avg calls/h
  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
    - s.total_pause_s
  ) / 3600.0, 1), 0) INTO v_total_hours
  FROM shifts s
  WHERE s.project_id = p_project_id
    AND s.started_at::date = p_date;

  v_avg_calls_per_hour := CASE WHEN v_total_hours > 0
    THEN ROUND(v_total_calls::numeric / v_total_hours, 1)
    ELSE 0 END;

  -- ============================================
  -- 3. LOST REASONS (today)
  -- ============================================
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason_name', lr.name,
    'reason_key', lr.key,
    'count', sub.cnt
  ) ORDER BY sub.cnt DESC), '[]'::jsonb) INTO v_lost_reasons
  FROM (
    SELECT l.lost_reason_id, COUNT(*)::int AS cnt
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    WHERE l.project_id = p_project_id
      AND s.type = 'lost'
      AND l.updated_at::date = p_date
      AND l.lost_reason_id IS NOT NULL
    GROUP BY l.lost_reason_id
  ) sub
  JOIN lost_reasons lr ON lr.id = sub.lost_reason_id;

  -- 7-day trend
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason_name', lr.name,
    'reason_key', lr.key,
    'count_7d', sub.cnt,
    'pct_7d', ROUND(sub.cnt * 100.0 / NULLIF(sub.total, 0), 0)
  ) ORDER BY sub.cnt DESC), '[]'::jsonb) INTO v_lost_trend
  FROM (
    SELECT l.lost_reason_id, COUNT(*)::int AS cnt,
           SUM(COUNT(*)) OVER()::int AS total
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    WHERE l.project_id = p_project_id
      AND s.type = 'lost'
      AND l.updated_at::date BETWEEN p_date - 7 AND p_date
      AND l.lost_reason_id IS NOT NULL
    GROUP BY l.lost_reason_id
  ) sub
  JOIN lost_reasons lr ON lr.id = sub.lost_reason_id;

  -- ============================================
  -- 4. FUNNEL: reached -> interest -> meetings (today)
  -- ============================================
  SELECT jsonb_build_object(
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int,
    'interest', COUNT(*) FILTER (WHERE o.key IN ('meeting', 'offer', 'deck', 'report'))::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int
  ) INTO v_funnel
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date;

  -- Comparison: same day last week
  SELECT jsonb_build_object(
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int,
    'interest', COUNT(*) FILTER (WHERE o.key IN ('meeting', 'offer', 'deck', 'report'))::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int
  ) INTO v_funnel_prev
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date - 7;

  -- ============================================
  -- 5. OVERDUE
  -- ============================================
  SELECT COUNT(*)::int INTO v_overdue_tasks
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.due_at < now();

  SELECT COUNT(*)::int INTO v_overdue_callbacks
  FROM leads l
  JOIN stages s ON s.id = l.stage_id
  WHERE l.project_id = p_project_id
    AND l.is_active = true
    AND s.type = 'open'
    AND l.next_action_at < now()
    AND l.next_action_type = 'callback';

  SELECT COUNT(*)::int INTO v_decks_overdue
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.task_type = 'send_deck'
    AND t.due_at < now();

  SELECT COUNT(*)::int INTO v_offers_overdue
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.task_type = 'send_offer'
    AND t.due_at < now();

  SELECT COUNT(*)::int INTO v_new_dnc
  FROM do_not_call dnc
  WHERE dnc.project_id = p_project_id
    AND dnc.created_at::date = p_date;

  -- ============================================
  -- COMPOSE RESULT
  -- ============================================
  RETURN jsonb_build_object(
    'date', p_date,
    'project_name', v_project.name,
    'target_per_hour', v_target,
    'total_calls', v_total_calls,
    'total_reached', v_total_reached,
    'total_meetings', v_total_meetings,
    'total_hours', v_total_hours,
    'avg_calls_per_hour', v_avg_calls_per_hour,
    'reached_pct', CASE WHEN v_total_calls > 0
      THEN ROUND(v_total_reached * 100.0 / v_total_calls, 0) ELSE 0 END,
    'not_interested_pct', CASE WHEN v_total_reached > 0
      THEN ROUND((v_outcomes->>'not_interested')::int * 100.0 / v_total_reached, 0) ELSE 0 END,
    'outcomes', v_outcomes,
    'operators', v_operators,
    'lost_reasons', v_lost_reasons,
    'lost_trend_7d', v_lost_trend,
    'funnel', v_funnel,
    'funnel_prev_week', v_funnel_prev,
    'overdue_tasks', v_overdue_tasks,
    'overdue_callbacks', v_overdue_callbacks,
    'overdue_decks', v_decks_overdue,
    'overdue_offers', v_offers_overdue,
    'new_dnc', v_new_dnc
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
