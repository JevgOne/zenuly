-- =============================================
-- Migration 020: Audit fixes
-- Fixes 6 bugs found during code audit:
--   1. get_dashboard_stats reached_today uses wrong filter (group_name='interest' → key NOT IN no_answer/busy)
--   2. get_daily_report filters operators by pr.role instead of pm.role
--   3. get_contacts_overview pagination applied before sorting
--   4. get_contacts_overview trust_score references 'meeting_set' instead of 'meeting_booked'
--   5. get_lead_card missing emails (012 version dropped by later override — re-apply)
--   6. Missing performance indexes
-- =============================================

-- =============================================
-- BUG 1: get_dashboard_stats — reached_today must filter by
-- outcome key NOT IN ('no_answer','busy'), not group_name='interest'
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
        AND o.key NOT IN ('no_answer', 'busy')
    ),
    'calls_today_total_for_pct', (
      SELECT GREATEST(COUNT(*), 1) FROM calls WHERE project_id = p_project_id AND created_at >= v_today_start
    ),
    'consultations_this_week', (
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
              AND c.created_at >= v_today_start AND o.key NOT IN ('no_answer', 'busy')
          ),
          'consultations_week', (
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


-- =============================================
-- BUG 2: get_daily_report — operator filter uses pr.role (profiles)
-- but should use pm.role (project_members)
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
        AND pm.role = 'operator'
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


-- =============================================
-- BUG 3 + 4: get_contacts_overview
--   3. Pagination (LIMIT/OFFSET) applied before sorting — move ORDER BY into subquery
--   4. trust_score references 'meeting_set' — should be 'meeting_booked'
-- =============================================
CREATE OR REPLACE FUNCTION get_contacts_overview(
  p_project_id uuid,
  p_search text DEFAULT NULL,
  p_stage_key text DEFAULT NULL,
  p_sort text DEFAULT 'trust_desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_total int;
BEGIN
  -- Total count (with filters)
  SELECT COUNT(*) INTO v_total
  FROM leads l
  JOIN stages s ON s.id = l.stage_id
  WHERE l.project_id = p_project_id
    AND l.is_active = true
    AND (p_search IS NULL OR p_search = '' OR
         l.company ILIKE '%' || p_search || '%' OR
         l.contact_person ILIKE '%' || p_search || '%' OR
         l.email ILIKE '%' || p_search || '%' OR
         l.phone ILIKE '%' || p_search || '%')
    AND (p_stage_key IS NULL OR p_stage_key = '' OR s.key = p_stage_key);

  -- Build result — ORDER BY inside subquery BEFORE LIMIT/OFFSET
  SELECT jsonb_build_object(
    'total', v_total,
    'contacts', COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', l.id,
      'company', l.company,
      'contact_person', l.contact_person,
      'phone', l.phone,
      'email', l.email,
      'website', l.website,
      'city', l.city,
      'ico', l.ico,
      'stage_key', s.key,
      'stage_name', s.name,
      'stage_type', s.type,
      'priority', l.priority,
      'attempt_count', l.attempt_count,
      'owner_name', pr.full_name,
      'created_at', l.created_at,
      'updated_at', l.updated_at,
      'last_activity', COALESCE(
        (SELECT MAX(c.created_at) FROM calls c WHERE c.lead_id = l.id),
        l.updated_at
      ),
      'total_calls', (SELECT COUNT(*) FROM calls c WHERE c.lead_id = l.id),
      'completeness_pct', (
        (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 1 ELSE 0 END
        + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 1 ELSE 0 END
        + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 1 ELSE 0 END
        + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 1 ELSE 0 END
        + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 1 ELSE 0 END
        + CASE WHEN l.hook_text IS NOT NULL AND l.hook_text != '' THEN 1 ELSE 0 END
        + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 1 ELSE 0 END
        + CASE WHEN l.custom_data != '{}'::jsonb AND l.custom_data != 'null'::jsonb THEN 1 ELSE 0 END
        ) * 100 / 8
      ),
      'trust_score', (
        LEAST(100, (
          -- Data completeness (max 30 points)
          (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 5 ELSE 0 END
          + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 8 ELSE 0 END
          + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 5 ELSE 0 END
          + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 3 ELSE 0 END
          + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 4 ELSE 0 END
          + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 5 ELSE 0 END)
          -- Engagement (max 40 points)
          + LEAST(20, (SELECT COUNT(*) FROM calls c WHERE c.lead_id = l.id) * 4)
          + CASE WHEN (SELECT COUNT(*) FROM calls c
                       JOIN outcomes o ON o.id = c.outcome_id
                       WHERE c.lead_id = l.id AND o.group_name = 'interest') > 0
              THEN 20 ELSE 0 END
          -- Pipeline progress (max 30 points) — BUG 4 fix: meeting_set → meeting_booked
          + CASE
              WHEN s.type = 'won' THEN 30
              WHEN s.key = 'meeting_booked' THEN 25
              WHEN s.key = 'contacted' THEN 15
              WHEN s.key = 'new' THEN 5
              WHEN s.type = 'lost' THEN 0
              ELSE 10
            END
        ))
      )
    ) AS row_data
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    LEFT JOIN profiles pr ON pr.id = l.owner_id
    WHERE l.project_id = p_project_id
      AND l.is_active = true
      AND (p_search IS NULL OR p_search = '' OR
           l.company ILIKE '%' || p_search || '%' OR
           l.contact_person ILIKE '%' || p_search || '%' OR
           l.email ILIKE '%' || p_search || '%' OR
           l.phone ILIKE '%' || p_search || '%')
      AND (p_stage_key IS NULL OR p_stage_key = '' OR s.key = p_stage_key)
    ORDER BY
      CASE WHEN p_sort = 'trust_desc' THEN -(
        LEAST(100, (
          (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 5 ELSE 0 END
          + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 8 ELSE 0 END
          + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 5 ELSE 0 END
          + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 3 ELSE 0 END
          + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 4 ELSE 0 END
          + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 5 ELSE 0 END)
          + LEAST(20, (SELECT COUNT(*) FROM calls c WHERE c.lead_id = l.id) * 4)
          + CASE WHEN (SELECT COUNT(*) FROM calls c
                       JOIN outcomes o ON o.id = c.outcome_id
                       WHERE c.lead_id = l.id AND o.group_name = 'interest') > 0
              THEN 20 ELSE 0 END
          + CASE
              WHEN s.type = 'won' THEN 30
              WHEN s.key = 'meeting_booked' THEN 25
              WHEN s.key = 'contacted' THEN 15
              WHEN s.key = 'new' THEN 5
              WHEN s.type = 'lost' THEN 0
              ELSE 10
            END
        ))
      )::numeric END,
      CASE WHEN p_sort = 'trust_asc' THEN (
        LEAST(100, (
          (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 5 ELSE 0 END
          + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 8 ELSE 0 END
          + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 5 ELSE 0 END
          + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 3 ELSE 0 END
          + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 4 ELSE 0 END
          + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 5 ELSE 0 END)
          + LEAST(20, (SELECT COUNT(*) FROM calls c WHERE c.lead_id = l.id) * 4)
          + CASE WHEN (SELECT COUNT(*) FROM calls c
                       JOIN outcomes o ON o.id = c.outcome_id
                       WHERE c.lead_id = l.id AND o.group_name = 'interest') > 0
              THEN 20 ELSE 0 END
          + CASE
              WHEN s.type = 'won' THEN 30
              WHEN s.key = 'meeting_booked' THEN 25
              WHEN s.key = 'contacted' THEN 15
              WHEN s.key = 'new' THEN 5
              WHEN s.type = 'lost' THEN 0
              ELSE 10
            END
        ))
      )::numeric END,
      CASE WHEN p_sort = 'completeness_desc' THEN -(
        (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 1 ELSE 0 END
        + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 1 ELSE 0 END
        + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 1 ELSE 0 END
        + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 1 ELSE 0 END
        + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 1 ELSE 0 END
        + CASE WHEN l.hook_text IS NOT NULL AND l.hook_text != '' THEN 1 ELSE 0 END
        + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 1 ELSE 0 END
        + CASE WHEN l.custom_data != '{}'::jsonb AND l.custom_data != 'null'::jsonb THEN 1 ELSE 0 END
        ) * 100 / 8
      )::numeric END,
      CASE WHEN p_sort = 'completeness_asc' THEN (
        (CASE WHEN l.contact_person IS NOT NULL AND l.contact_person != '' THEN 1 ELSE 0 END
        + CASE WHEN l.email IS NOT NULL AND l.email != '' THEN 1 ELSE 0 END
        + CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 1 ELSE 0 END
        + CASE WHEN l.city IS NOT NULL AND l.city != '' THEN 1 ELSE 0 END
        + CASE WHEN l.ico IS NOT NULL AND l.ico != '' THEN 1 ELSE 0 END
        + CASE WHEN l.hook_text IS NOT NULL AND l.hook_text != '' THEN 1 ELSE 0 END
        + CASE WHEN l.findings IS NOT NULL AND l.findings != '' THEN 1 ELSE 0 END
        + CASE WHEN l.custom_data != '{}'::jsonb AND l.custom_data != 'null'::jsonb THEN 1 ELSE 0 END
        ) * 100 / 8
      )::numeric END,
      CASE WHEN p_sort = 'activity_desc' THEN COALESCE(
        (SELECT MAX(c.created_at) FROM calls c WHERE c.lead_id = l.id),
        l.updated_at
      ) END DESC,
      CASE WHEN p_sort = 'activity_asc' THEN COALESCE(
        (SELECT MAX(c.created_at) FROM calls c WHERE c.lead_id = l.id),
        l.updated_at
      ) END ASC,
      CASE WHEN p_sort = 'name_asc' THEN l.company END ASC,
      CASE WHEN p_sort = 'name_desc' THEN l.company END DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- =============================================
-- BUG 5: get_lead_card — emails section missing
-- Migration 012 added it, but if a later migration overwrote
-- without emails, we re-apply the complete version with emails
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


-- =============================================
-- BUG 6: Missing performance indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome_id);
CREATE INDEX IF NOT EXISTS idx_leads_active_project ON leads(project_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sent_emails_project ON sent_emails(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
