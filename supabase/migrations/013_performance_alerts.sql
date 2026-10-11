-- =============================================
-- 013: Performance alerts + operator stats + monthly hours export
-- =============================================

-- Alerts table (rapid calls, future: SLA breach, etc.)
CREATE TABLE alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  alert_type  text NOT NULL,
  operator_id uuid REFERENCES profiles(id),
  details     jsonb NOT NULL DEFAULT '{}',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_project ON alerts(project_id, created_at DESC);
CREATE INDEX idx_alerts_unread ON alerts(project_id, read) WHERE read = false;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_admin ON alerts FOR ALL
  USING (auth_user_role() = 'admin');

-- =============================================
-- Trigger: detect rapid calls (< 20s gap)
-- =============================================
CREATE OR REPLACE FUNCTION check_rapid_calls()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_call timestamptz;
  v_gap_s int;
BEGIN
  SELECT created_at INTO v_prev_call
  FROM calls
  WHERE operator_id = NEW.operator_id
    AND project_id = NEW.project_id
    AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_prev_call IS NOT NULL THEN
    v_gap_s := EXTRACT(EPOCH FROM (NEW.created_at - v_prev_call))::int;
    IF v_gap_s < 20 THEN
      INSERT INTO alerts (project_id, alert_type, operator_id, details)
      VALUES (NEW.project_id, 'rapid_calls', NEW.operator_id,
        jsonb_build_object(
          'gap_seconds', v_gap_s,
          'call_id', NEW.id,
          'previous_call_at', v_prev_call
        ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_rapid_calls
  AFTER INSERT ON calls
  FOR EACH ROW EXECUTE FUNCTION check_rapid_calls();

-- =============================================
-- RPC: get_operator_stats (today's KPIs for current user)
-- =============================================
CREATE OR REPLACE FUNCTION get_operator_stats(p_project_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb AS $$
DECLARE
  v_calls_today int;
  v_reached_today int;
  v_meetings_today int;
  v_hours_today numeric;
  v_calls_per_hour numeric;
  v_target int;
BEGIN
  SELECT calls_per_hour INTO v_target FROM projects WHERE id = p_project_id;

  SELECT COUNT(*) INTO v_calls_today
  FROM calls
  WHERE operator_id = auth.uid()
    AND project_id = p_project_id
    AND created_at::date = p_date;

  SELECT COUNT(*) INTO v_reached_today
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.operator_id = auth.uid()
    AND c.project_id = p_project_id
    AND c.created_at::date = p_date
    AND o.key NOT IN ('no_answer', 'busy');

  SELECT COUNT(*) INTO v_meetings_today
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.operator_id = auth.uid()
    AND c.project_id = p_project_id
    AND c.created_at::date = p_date
    AND o.key = 'meeting';

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at) - make_interval(secs => s.total_pause_s))
  ) / 3600.0, 0) INTO v_hours_today
  FROM shifts s
  WHERE s.operator_id = auth.uid()
    AND s.project_id = p_project_id
    AND s.started_at::date = p_date;

  v_calls_per_hour := CASE WHEN v_hours_today > 0
    THEN ROUND(v_calls_today / v_hours_today, 1)
    ELSE 0 END;

  RETURN jsonb_build_object(
    'calls_today', v_calls_today,
    'reached_today', v_reached_today,
    'meetings_today', v_meetings_today,
    'hours_today', ROUND(v_hours_today, 1),
    'calls_per_hour', v_calls_per_hour,
    'target_per_hour', COALESCE(v_target, 20),
    'on_target', v_calls_per_hour >= COALESCE(v_target, 20)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- RPC: export_monthly_hours (admin — all operators for a month)
-- =============================================
CREATE OR REPLACE FUNCTION export_monthly_hours(p_project_id uuid, p_year int, p_month int)
RETURNS TABLE (
  operator_id uuid,
  operator_name text,
  total_shifts int,
  total_hours numeric,
  total_pause_hours numeric,
  net_hours numeric,
  total_calls int,
  total_reached int,
  calls_per_hour numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH shift_data AS (
    SELECT
      s.operator_id,
      pr.full_name AS operator_name,
      COUNT(s.id)::int AS total_shifts,
      SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at))) / 3600.0 AS gross_hours,
      SUM(s.total_pause_s) / 3600.0 AS pause_hours
    FROM shifts s
    JOIN profiles pr ON pr.id = s.operator_id
    WHERE s.project_id = p_project_id
      AND s.status = 'ended'
      AND EXTRACT(YEAR FROM s.started_at) = p_year
      AND EXTRACT(MONTH FROM s.started_at) = p_month
    GROUP BY s.operator_id, pr.full_name
  ),
  call_data AS (
    SELECT
      c.operator_id,
      COUNT(c.id)::int AS total_calls,
      COUNT(c.id) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int AS total_reached
    FROM calls c
    JOIN outcomes o ON o.id = c.outcome_id
    WHERE c.project_id = p_project_id
      AND EXTRACT(YEAR FROM c.created_at) = p_year
      AND EXTRACT(MONTH FROM c.created_at) = p_month
    GROUP BY c.operator_id
  )
  SELECT
    sd.operator_id,
    sd.operator_name,
    sd.total_shifts,
    ROUND(sd.gross_hours, 1),
    ROUND(sd.pause_hours, 1),
    ROUND(sd.gross_hours - sd.pause_hours, 1) AS net_hours,
    COALESCE(cd.total_calls, 0)::int,
    COALESCE(cd.total_reached, 0)::int,
    CASE WHEN (sd.gross_hours - sd.pause_hours) > 0
      THEN ROUND(COALESCE(cd.total_calls, 0)::numeric / (sd.gross_hours - sd.pause_hours), 1)
      ELSE 0::numeric END
  FROM shift_data sd
  LEFT JOIN call_data cd ON cd.operator_id = sd.operator_id
  ORDER BY sd.operator_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
