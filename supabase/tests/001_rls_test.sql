-- =============================================
-- RLS Tests for Weblyx CRM
-- =============================================
-- These tests verify RLS policies using Supabase's auth context simulation.
-- Run with: supabase test db

-- Test UUIDs
-- Admin:     11111111-1111-1111-1111-111111111111
-- Operator1: 22222222-2222-2222-2222-222222222222 (member of Weblyx)
-- Operator2: 33333333-3333-3333-3333-333333333333 (member of Uklid only)

BEGIN;

-- =============================================
-- Setup: Create test users and data
-- =============================================

-- Create test users in auth.users
INSERT INTO auth.users (id, email, raw_user_meta_data, instance_id, aud, role, encrypted_password, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@test.cz',
   '{"full_name": "Admin Test", "role": "admin"}',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   crypt('password', gen_salt('bf')), now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'op1@test.cz',
   '{"full_name": "Operator Weblyx", "role": "operator"}',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   crypt('password', gen_salt('bf')), now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'op2@test.cz',
   '{"full_name": "Operator Uklid", "role": "operator"}',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   crypt('password', gen_salt('bf')), now(), now());

-- Create second project (Uklid)
INSERT INTO projects (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000002', 'Úklid', 'uklid');

-- Create stages for Uklid
INSERT INTO stages (id, project_id, key, name, type, position)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '00000000-0000-0000-0000-000000000002', 'new', 'Nový lead', 'open', 1);

-- Assign operators to projects
-- Operator1 -> Weblyx only
INSERT INTO project_members (project_id, profile_id) VALUES
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
-- Operator2 -> Uklid only
INSERT INTO project_members (project_id, profile_id) VALUES
  ('00000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333');

-- Get Weblyx 'new' stage id
DO $$
DECLARE
  v_weblyx_new_stage uuid;
  v_uklid_new_stage uuid;
BEGIN
  SELECT id INTO v_weblyx_new_stage FROM stages
    WHERE project_id = '00000000-0000-0000-0000-000000000001' AND key = 'new';
  v_uklid_new_stage := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  -- Create leads in Weblyx (owned by operator1)
  INSERT INTO leads (id, project_id, company, phone, phone_source, stage_id, owner_id, next_action_at)
  VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
     '00000000-0000-0000-0000-000000000001',
     'Firma A', '+420111111111', 'web_firmy', v_weblyx_new_stage,
     '22222222-2222-2222-2222-222222222222', now() + interval '1 hour');

  -- Create pool lead in Weblyx (no owner)
  INSERT INTO leads (id, project_id, company, phone, phone_source, stage_id, owner_id, next_action_at)
  VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
     '00000000-0000-0000-0000-000000000001',
     'Firma B', '+420222222222', 'databaze', v_weblyx_new_stage,
     NULL, now() + interval '2 hours');

  -- Create lead in Uklid (owned by operator2)
  INSERT INTO leads (id, project_id, company, phone, phone_source, stage_id, owner_id, next_action_at)
  VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
     '00000000-0000-0000-0000-000000000002',
     'Firma C', '+420333333333', 'profil_firmy', v_uklid_new_stage,
     '33333333-3333-3333-3333-333333333333', now() + interval '3 hours');
END $$;

-- =============================================
-- Test 1: Operator sees only leads from their project (own + pool)
-- =============================================
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-2222-2222-222222222222"}';

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM leads;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Operator1 should see 2 leads (own + pool), got %', v_count;
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Operator sees only 2 leads (own + pool)';
END $$;

-- =============================================
-- Test 2: Operator does NOT see leads from other projects
-- =============================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM leads
    WHERE project_id = '00000000-0000-0000-0000-000000000002';
  IF v_count != 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Operator1 should see 0 Uklid leads, got %', v_count;
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Operator does not see leads from other projects';
END $$;

-- =============================================
-- Test 3: Operator sees pool leads (owner_id IS NULL) from their project
-- =============================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM leads WHERE owner_id IS NULL;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Operator1 should see 1 pool lead, got %', v_count;
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Operator sees pool leads from own project';
END $$;

-- =============================================
-- Test 4: Admin sees ALL leads
-- =============================================
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-1111-1111-111111111111"}';

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM leads;
  IF v_count != 3 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Admin should see 3 leads, got %', v_count;
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: Admin sees all 3 leads';
END $$;

-- =============================================
-- Test 5: Operator cannot INSERT into projects
-- =============================================
SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-2222-2222-222222222222"}';

DO $$
BEGIN
  BEGIN
    INSERT INTO projects (name, slug) VALUES ('Hacker Project', 'hack');
    RAISE EXCEPTION 'TEST 5 FAILED: Operator should not be able to insert projects';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 5 PASSED: Operator cannot insert into projects';
  END;
END $$;

-- =============================================
-- Test 6: Operator cannot DELETE from do_not_call
-- =============================================
-- First insert a DNC entry as admin
SET LOCAL request.jwt.claims TO '{"sub": "11111111-1111-1111-1111-111111111111"}';

INSERT INTO do_not_call (id, project_id, phone, reason, added_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        '00000000-0000-0000-0000-000000000001',
        '+420999999999', 'Test DNC', '11111111-1111-1111-1111-111111111111');

SET LOCAL request.jwt.claims TO '{"sub": "22222222-2222-2222-2222-222222222222"}';

DO $$
BEGIN
  BEGIN
    DELETE FROM do_not_call WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    -- If we get here, check if any rows were actually deleted
    IF FOUND THEN
      RAISE EXCEPTION 'TEST 6 FAILED: Operator should not be able to delete from DNC';
    ELSE
      RAISE NOTICE 'TEST 6 PASSED: Operator cannot delete from do_not_call (0 rows)';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST 6 PASSED: Operator cannot delete from do_not_call';
  END;
END $$;

-- =============================================
-- Test 7: Operator sees stages and outcomes of their project
-- =============================================
DO $$
DECLARE
  v_stages int;
  v_outcomes int;
BEGIN
  SELECT count(*) INTO v_stages FROM stages
    WHERE project_id = '00000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_outcomes FROM outcomes
    WHERE project_id = '00000000-0000-0000-0000-000000000001';

  IF v_stages != 8 THEN
    RAISE EXCEPTION 'TEST 7a FAILED: Operator should see 8 Weblyx stages, got %', v_stages;
  END IF;
  IF v_outcomes != 8 THEN
    RAISE EXCEPTION 'TEST 7b FAILED: Operator should see 8 Weblyx outcomes, got %', v_outcomes;
  END IF;
  RAISE NOTICE 'TEST 7 PASSED: Operator sees 8 stages and 8 outcomes of own project';
END $$;

-- =============================================
-- Test 8: Operator2 sees only Uklid leads, not Weblyx
-- =============================================
SET LOCAL request.jwt.claims TO '{"sub": "33333333-3333-3333-3333-333333333333"}';

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM leads;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Operator2 should see 1 lead (Uklid), got %', v_count;
  END IF;
  RAISE NOTICE 'TEST 8 PASSED: Operator2 sees only their own project leads';
END $$;

-- =============================================
-- Cleanup
-- =============================================
ROLLBACK;
