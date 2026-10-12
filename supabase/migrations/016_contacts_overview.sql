-- =============================================
-- Migration 016: get_contacts_overview RPC
-- Returns leads with completeness % and trust/quality score
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

  -- Build result
  SELECT jsonb_build_object(
    'total', v_total,
    'contacts', COALESCE(jsonb_agg(row_data ORDER BY
      CASE WHEN p_sort = 'trust_desc' THEN -(row_data->>'trust_score')::numeric END,
      CASE WHEN p_sort = 'trust_asc' THEN (row_data->>'trust_score')::numeric END,
      CASE WHEN p_sort = 'completeness_desc' THEN -(row_data->>'completeness_pct')::numeric END,
      CASE WHEN p_sort = 'completeness_asc' THEN (row_data->>'completeness_pct')::numeric END,
      CASE WHEN p_sort = 'activity_desc' THEN row_data->>'last_activity' END DESC,
      CASE WHEN p_sort = 'activity_asc' THEN row_data->>'last_activity' END ASC,
      CASE WHEN p_sort = 'name_asc' THEN row_data->>'company' END ASC,
      CASE WHEN p_sort = 'name_desc' THEN row_data->>'company' END DESC
    ), '[]'::jsonb)
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
        -- Count filled optional fields out of 8 checkable fields
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
        -- Trust score 0-100 based on multiple factors
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
          -- Pipeline progress (max 30 points)
          + CASE
              WHEN s.type = 'won' THEN 30
              WHEN s.key = 'meeting_set' THEN 25
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
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
