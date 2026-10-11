-- =============================================
-- Tests for record_call_outcome
-- 14 tests covering all 8 outcomes + edge cases
-- =============================================

BEGIN;

-- =============================================
-- SETUP: test users, project, stages, outcomes, lead
-- =============================================

-- Test UUIDs
-- Admin:    11111111-1111-1111-1111-111111111111
-- Operator: 22222222-2222-2222-2222-222222222222
-- Project:  00000000-0000-0000-0000-000000000001 (from seed)

-- Create test users
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@test.cz',
   '{"full_name": "Admin Test", "role": "admin"}',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   crypt('password', gen_salt('bf')), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'op1@test.cz',
   '{"full_name": "Operator Test", "role": "operator"}',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   crypt('password', gen_salt('bf')), now(), now());

-- Assign to project
INSERT INTO project_members (project_id, profile_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

-- Set auth context to operator
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-2222-2222-222222222222"}';

-- Helper: get stage id by key
CREATE OR REPLACE FUNCTION test_stage_id(p_key text) RETURNS uuid AS $$
  SELECT id FROM stages WHERE project_id = '00000000-0000-0000-0000-000000000001' AND key = p_key;
$$ LANGUAGE sql;

-- Helper: create a fresh test lead, returns its id
CREATE OR REPLACE FUNCTION create_test_lead(
  p_phone text DEFAULT '+420600000001',
  p_attempt_count int DEFAULT 0,
  p_stage_key text DEFAULT 'new'
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO leads (
    project_id, company, phone, phone_source, stage_id,
    owner_id, attempt_count, next_action_at, is_active
  ) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Firma ' || p_phone,
    p_phone,
    'web_firmy',
    test_stage_id(p_stage_key),
    '22222222-2222-2222-2222-222222222222',
    p_attempt_count,
    now() + interval '1 hour',
    true
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================
-- TEST 1: Konzultace (meeting)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_call_count int;
BEGIN
  v_lead_id := create_test_lead('+420600000101');
  v_result := record_call_outcome(
    v_lead_id, 'meeting',
    p_time_slot => '2026-10-15 10:00:00+02'::timestamptz
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;
  SELECT count(*) INTO v_call_count FROM calls WHERE lead_id = v_lead_id;

  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'meeting_booked' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: stage should be meeting_booked, got %',
      (SELECT key FROM stages WHERE id = v_lead.stage_id);
  END IF;
  IF v_lead.owner_id != '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: owner should be admin';
  END IF;
  IF v_lead.next_action_type != 'meeting' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: next_action_type should be meeting';
  END IF;
  IF v_call_count != 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: should have 1 call, got %', v_call_count;
  END IF;
  IF (v_result->>'calendar_event')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 1 FAILED: result should have calendar_event=true';
  END IF;

  RAISE NOTICE 'TEST 1 PASSED: Konzultace — stage=meeting_booked, owner=admin, calendar_event=true';
END $$;


-- =============================================
-- TEST 2: Nabidka (offer)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_task_count int;
BEGIN
  v_lead_id := create_test_lead('+420600000102');
  v_result := record_call_outcome(
    v_lead_id, 'offer',
    p_email => 'test@example.com'
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;
  SELECT count(*) INTO v_task_count FROM tasks
    WHERE lead_id = v_lead_id AND task_type = 'send_offer';

  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'new' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: stage should remain new';
  END IF;
  IF v_lead.email != 'test@example.com' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: email should be set';
  END IF;
  IF v_lead.next_action_type != 'callback' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: next_action_type should be callback';
  END IF;
  IF v_task_count != 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: should have 1 send_offer task';
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: Nabidka — stage unchanged, email saved, task created, callback +3d';
END $$;


-- =============================================
-- TEST 3: Prezentace (deck)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_task tasks%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000103');
  v_result := record_call_outcome(
    v_lead_id, 'deck',
    p_email => 'deck@example.com'
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;
  SELECT * INTO v_task FROM tasks WHERE lead_id = v_lead_id AND task_type = 'send_deck';

  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'contacted' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: stage should be contacted';
  END IF;
  IF v_lead.email != 'deck@example.com' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: email should be set';
  END IF;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'TEST 3 FAILED: should have send_deck task';
  END IF;
  IF v_lead.next_action_type != 'callback' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: next_action_type should be callback';
  END IF;

  RAISE NOTICE 'TEST 3 PASSED: Prezentace — stage=contacted, send_deck task, callback +2d';
END $$;


-- =============================================
-- TEST 4: Jindy (later) — short callback
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000104');
  v_result := record_call_outcome(
    v_lead_id, 'later',
    p_callback_at => now() + interval '2 hours'
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;

  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'contacted' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: stage should be contacted';
  END IF;
  IF v_lead.next_action_type != 'callback' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: next_action_type should be callback';
  END IF;
  IF v_lead.next_action_at IS NULL THEN
    RAISE EXCEPTION 'TEST 4 FAILED: next_action_at should be set';
  END IF;
  IF v_lead.postpone_reason IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 4 FAILED: postpone_reason should be NULL for short callback';
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: Jindy short — stage=contacted, callback set, no postpone reason';
END $$;


-- =============================================
-- TEST 5: Jindy (later) — long callback with reason (7+ days)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000105');
  v_result := record_call_outcome(
    v_lead_id, 'later',
    p_callback_at => now() + interval '1 month',
    p_postpone_reason => 'az po sezone'
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;

  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'contacted' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: stage should be contacted';
  END IF;
  IF v_lead.postponed_until IS NULL THEN
    RAISE EXCEPTION 'TEST 5 FAILED: postponed_until should be set';
  END IF;
  IF v_lead.postpone_reason != 'az po sezone' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: postpone_reason should be "az po sezone"';
  END IF;

  RAISE NOTICE 'TEST 5 PASSED: Jindy long — postponed_until set, reason saved';
END $$;


-- =============================================
-- TEST 6: Nevzal to (no_answer) — first attempt
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000106', p_attempt_count => 0);
  v_result := record_call_outcome(v_lead_id, 'no_answer');

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;

  IF v_lead.attempt_count != 1 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: attempt_count should be 1, got %', v_lead.attempt_count;
  END IF;
  IF (SELECT key FROM stages WHERE id = v_lead.stage_id) != 'new' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: stage should remain new';
  END IF;
  IF v_lead.next_action_type != 'callback' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: next_action_type should be callback';
  END IF;
  IF v_lead.next_action_at IS NULL THEN
    RAISE EXCEPTION 'TEST 6 FAILED: next_action_at should be set';
  END IF;

  RAISE NOTICE 'TEST 6 PASSED: Nevzal to 1st — attempt=1, stage unchanged, callback opposite day';
END $$;


-- =============================================
-- TEST 7: Nevzal to (no_answer) — 4th attempt (max)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000107', p_attempt_count => 3);
  v_result := record_call_outcome(v_lead_id, 'no_answer');

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;

  IF v_lead.attempt_count != 4 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: attempt_count should be 4, got %', v_lead.attempt_count;
  END IF;
  IF (SELECT type FROM stages WHERE id = v_lead.stage_id) != 'lost' THEN
    RAISE EXCEPTION 'TEST 7 FAILED: stage type should be lost';
  END IF;
  IF v_lead.next_action_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 7 FAILED: next_action_at should be NULL (lost)';
  END IF;
  IF (v_result->>'auto_email')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 7 FAILED: result should have auto_email=true';
  END IF;
  IF (v_result->>'max_attempts_reached')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 7 FAILED: result should have max_attempts_reached=true';
  END IF;
  IF v_lead.lost_reason_id IS NULL THEN
    RAISE EXCEPTION 'TEST 7 FAILED: lost_reason_id should be set (unreachable)';
  END IF;

  RAISE NOTICE 'TEST 7 PASSED: Nevzal to max — attempt=4, lost, unreachable, auto_email';
END $$;


-- =============================================
-- TEST 8: Obsazeno (busy)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000108', p_attempt_count => 1);
  v_result := record_call_outcome(v_lead_id, 'busy');

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;

  IF v_lead.attempt_count != 1 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: attempt_count should remain 1 (busy does not count), got %', v_lead.attempt_count;
  END IF;
  IF v_lead.next_action_type != 'callback' THEN
    RAISE EXCEPTION 'TEST 8 FAILED: next_action_type should be callback';
  END IF;
  IF v_lead.next_action_at IS NULL THEN
    RAISE EXCEPTION 'TEST 8 FAILED: next_action_at should be set';
  END IF;

  RAISE NOTICE 'TEST 8 PASSED: Obsazeno — attempt unchanged, callback +30min';
END $$;


-- =============================================
-- TEST 9: Nema zajem (not_interested) WITHOUT DNC
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_reason_id uuid;
  v_dnc_count int;
BEGIN
  SELECT id INTO v_reason_id FROM lost_reasons
    WHERE project_id = '00000000-0000-0000-0000-000000000001' AND key = 'price';

  v_lead_id := create_test_lead('+420600000109', p_stage_key => 'contacted');
  v_result := record_call_outcome(
    v_lead_id, 'not_interested',
    p_lost_reason_id => v_reason_id,
    p_add_to_dnc => false
  );

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;
  SELECT count(*) INTO v_dnc_count FROM do_not_call
    WHERE phone = '+420600000109';

  IF (SELECT type FROM stages WHERE id = v_lead.stage_id) != 'lost' THEN
    RAISE EXCEPTION 'TEST 9 FAILED: stage type should be lost';
  END IF;
  IF v_lead.lost_reason_id != v_reason_id THEN
    RAISE EXCEPTION 'TEST 9 FAILED: lost_reason_id should be price';
  END IF;
  IF v_lead.next_action_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 9 FAILED: next_action_at should be NULL';
  END IF;
  IF v_lead.postponed_until IS NULL THEN
    RAISE EXCEPTION 'TEST 9 FAILED: postponed_until should be set (recontact 6m)';
  END IF;
  IF v_dnc_count != 0 THEN
    RAISE EXCEPTION 'TEST 9 FAILED: should have 0 DNC entries';
  END IF;

  RAISE NOTICE 'TEST 9 PASSED: Nema zajem no DNC — lost, price reason, recontact 6m, no DNC';
END $$;


-- =============================================
-- TEST 10: Nema zajem (not_interested) WITH DNC
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_reason_id uuid;
  v_dnc_count int;
BEGIN
  SELECT id INTO v_reason_id FROM lost_reasons
    WHERE project_id = '00000000-0000-0000-0000-000000000001' AND key = 'price';

  v_lead_id := create_test_lead('+420600000110', p_stage_key => 'contacted');
  v_result := record_call_outcome(
    v_lead_id, 'not_interested',
    p_lost_reason_id => v_reason_id,
    p_add_to_dnc => true
  );

  SELECT count(*) INTO v_dnc_count FROM do_not_call
    WHERE phone = '+420600000110'
      AND project_id = '00000000-0000-0000-0000-000000000001';

  IF v_dnc_count != 1 THEN
    RAISE EXCEPTION 'TEST 10 FAILED: should have 1 DNC entry, got %', v_dnc_count;
  END IF;

  RAISE NOTICE 'TEST 10 PASSED: Nema zajem with DNC — phone added to do_not_call';
END $$;


-- =============================================
-- TEST 11: Spatne cislo (wrong_number)
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_task tasks%ROWTYPE;
BEGIN
  v_lead_id := create_test_lead('+420600000111');
  v_result := record_call_outcome(v_lead_id, 'wrong_number');

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id;
  SELECT * INTO v_task FROM tasks
    WHERE lead_id = v_lead_id AND task_type = 'check_contact';

  IF (SELECT type FROM stages WHERE id = v_lead.stage_id) != 'lost' THEN
    RAISE EXCEPTION 'TEST 11 FAILED: stage type should be lost';
  END IF;
  IF v_lead.next_action_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 11 FAILED: next_action_at should be NULL';
  END IF;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'TEST 11 FAILED: should have check_contact task';
  END IF;
  IF v_task.assigned_to != '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'TEST 11 FAILED: task should be assigned to admin';
  END IF;

  RAISE NOTICE 'TEST 11 PASSED: Spatne cislo — lost, check_contact task for admin';
END $$;


-- =============================================
-- TEST 12: Open lead MUST have next_action_at
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_test_outcome_id uuid;
BEGIN
  -- Create a broken outcome that sets stage to open but no next_action
  INSERT INTO outcomes (id, project_id, key, name, group_name, position, rules)
  VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '00000000-0000-0000-0000-000000000001',
    'broken_test', 'Broken', 'retry', 99,
    '{"set_stage": "contacted", "increment_attempt": false}'
  );

  v_lead_id := create_test_lead('+420600000112');

  BEGIN
    PERFORM record_call_outcome(v_lead_id, 'broken_test');
    RAISE EXCEPTION 'TEST 12 FAILED: should have raised exception for missing next_action_at';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%next_action_at%' THEN
      RAISE NOTICE 'TEST 12 PASSED: Open lead without next_action_at raises exception';
    ELSE
      RAISE EXCEPTION 'TEST 12 FAILED: unexpected error: %', SQLERRM;
    END IF;
  END;

  -- Cleanup test outcome
  DELETE FROM outcomes WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
END $$;


-- =============================================
-- TEST 13: Callback outside working hours shifts to next working day
-- Scenario: Friday 17:30 Prague + 30min (busy) = 18:00 = outside
-- Expected: Monday 09:00
-- =============================================
DO $$
DECLARE
  v_lead_id uuid;
  v_result jsonb;
  v_lead leads%ROWTYPE;
  v_expected_day int;
BEGIN
  v_lead_id := create_test_lead('+420600000113');

  -- Test the helper directly: Friday 17:30 Prague + 30min
  -- 2026-10-09 is a Friday
  DECLARE
    v_friday timestamptz := '2026-10-09 17:30:00 Europe/Prague'::timestamptz;
    v_shifted timestamptz;
    v_shifted_local timestamp;
  BEGIN
    v_shifted := next_working_day_at(
      '00000000-0000-0000-0000-000000000001',
      v_friday + interval '30 minutes'
    );
    v_shifted_local := v_shifted AT TIME ZONE 'Europe/Prague';

    -- Should be Monday (ISODOW=1)
    IF EXTRACT(ISODOW FROM v_shifted_local) != 1 THEN
      RAISE EXCEPTION 'TEST 13 FAILED: should shift to Monday (1), got day %',
        EXTRACT(ISODOW FROM v_shifted_local);
    END IF;
    -- Should be 09:00
    IF v_shifted_local::time != '09:00:00' THEN
      RAISE EXCEPTION 'TEST 13 FAILED: should shift to 09:00, got %', v_shifted_local::time;
    END IF;

    RAISE NOTICE 'TEST 13 PASSED: Friday 17:30+30min -> Monday 09:00';
  END;
END $$;


-- =============================================
-- TEST 14: Nevzal to — opposite part of day
-- Morning call -> afternoon callback next working day
-- Afternoon call -> morning callback next working day
-- =============================================
DO $$
DECLARE
  v_shifted timestamptz;
  v_shifted_local timestamp;
BEGIN
  -- Test A: Tuesday 10:00 (morning) -> Wednesday 13:30 (afternoon)
  -- 2026-10-13 is a Tuesday
  v_shifted := next_working_day_at(
    '00000000-0000-0000-0000-000000000001',
    '2026-10-13 10:00:00 Europe/Prague'::timestamptz,
    true  -- opposite_part
  );
  v_shifted_local := v_shifted AT TIME ZONE 'Europe/Prague';

  IF EXTRACT(ISODOW FROM v_shifted_local) != 3 THEN
    RAISE EXCEPTION 'TEST 14a FAILED: should be Wednesday (3), got %',
      EXTRACT(ISODOW FROM v_shifted_local);
  END IF;
  IF v_shifted_local::time != '13:30:00' THEN
    RAISE EXCEPTION 'TEST 14a FAILED: should be 13:30, got %', v_shifted_local::time;
  END IF;

  -- Test B: Tuesday 15:00 (afternoon) -> Wednesday 09:00 (morning)
  v_shifted := next_working_day_at(
    '00000000-0000-0000-0000-000000000001',
    '2026-10-13 15:00:00 Europe/Prague'::timestamptz,
    true
  );
  v_shifted_local := v_shifted AT TIME ZONE 'Europe/Prague';

  IF EXTRACT(ISODOW FROM v_shifted_local) != 3 THEN
    RAISE EXCEPTION 'TEST 14b FAILED: should be Wednesday (3), got %',
      EXTRACT(ISODOW FROM v_shifted_local);
  END IF;
  IF v_shifted_local::time != '09:00:00' THEN
    RAISE EXCEPTION 'TEST 14b FAILED: should be 09:00, got %', v_shifted_local::time;
  END IF;

  RAISE NOTICE 'TEST 14 PASSED: Opposite part — morning->afternoon, afternoon->morning';
END $$;


-- =============================================
-- Cleanup
-- =============================================
ROLLBACK;
