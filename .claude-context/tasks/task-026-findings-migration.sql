-- =============================================
-- Migration: findings column + report outcome + defunct outcome
-- Grounded in: SYSTEM.md §3.8, §3.10, §6; ZADANI.md §4 (steps 8-10)
-- Depends on: 001_types_and_helpers, 002_core_tables, 004_record_call_outcome, seed.sql
-- =============================================

-- -----------------------------------------------
-- 1. leads.findings — raw findings from lead-finder pipeline
--
-- SYSTEM.md §3.8: karta firmy zobrazuje "proč voláme" (hook_text) a
-- "o čem mluvit" (talking points). hook_text a hook_source už v tabulce
-- leads existují (002_core_tables.sql řádky 154-155).
--
-- findings je surový vstup z inspect.ts datedness() a kvalita.mjs verify(),
-- pipe-delimited string typu "bez HTTPS|PageSpeed mobil 31/100|patička © 2019".
-- Z něj callscript.ts reasonsFor() generuje věty pro operátora.
-- ZADANI.md §4 kroky 8-9: bodování zastaralosti → důvod hovoru → věty.
-- -----------------------------------------------

ALTER TABLE leads ADD COLUMN IF NOT EXISTS findings text;

COMMENT ON COLUMN leads.findings
  IS 'Raw pipe-delimited findings from lead-finder (inspect.ts datedness + verify). Input for reasonsFor(). SYSTEM.md §3.8, ZADANI.md §4.8-4.9';

-- -----------------------------------------------
-- 2. task_type enum: add 'send_report'
--
-- SYSTEM.md §3.11: "Kliknutí na pošlete mi rozbor odešle celý rozbor automaticky."
-- ZADANI.md §4: krok 8 bodování → plný rozbor (analyzátor Weblyx) nad prahem.
-- The report is sent as an async task, not inline in the API route.
-- -----------------------------------------------

ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'send_report';

-- -----------------------------------------------
-- 3. phone_source enum: add 'lead_finder'
--
-- SYSTEM.md §3.4: telefon z OSM, z webu, ze skriptů, z ARES.
-- Lead-finder pipeline is the primary source; existing values
-- (web_firmy, profil_firmy, databaze, poptavka) cover manual/other sources.
-- -----------------------------------------------

ALTER TYPE phone_source ADD VALUE IF NOT EXISTS 'lead_finder';

-- -----------------------------------------------
-- 4. New outcome: 'report' (Rozbor e-mailem)
--
-- SYSTEM.md §3.10: outcome "zájem" → "naplánuje se další krok (nabídka, schůzka)".
-- SYSTEM.md §3.11: "Kliknutí na pošlete mi rozbor odešle celý rozbor automaticky."
-- Callscript prototype: outcome wants_report — live website audit sent on consent.
-- CRM specifikace-weblyx.md: deck = "Ukázky webů pro obor" (prezentace, jiný obsah).
--
-- report ≠ deck. deck posílá reference/ukázky, report posílá technický rozbor webu.
-- Consent povinný — SYSTEM.md §4: "Nic se neodesílá bez potvrzení."
-- ZADANI.md §6: "Nic se neodesílá bez potvrzení."
-- -----------------------------------------------

INSERT INTO outcomes (project_id, key, name, group_name, shortcut, position, rules)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'report',
  'Rozbor e-mailem',
  'interest',
  9,
  9,
  '{
    "set_stage": "contacted",
    "create_task": "send_report",
    "task_delay": "0",
    "task_assign_to": "admin",
    "callback_delay": "2 days",
    "increment_attempt": false,
    "required_inputs": ["email", "consent"],
    "consent_text": "Klient výslovně souhlasil s odesláním rozboru"
  }'
)
ON CONFLICT (project_id, key) DO NOTHING;

-- -----------------------------------------------
-- 5. New outcome: 'defunct' (Firma nefunguje)
--
-- SYSTEM.md §3.10: "firma nefunguje — vyřazeno, zapíše se do sdílené databáze
-- pro všechny projekty".
-- This is absent from both callscript prototype AND current CRM seed.sql.
-- It's distinct from wrong_number (phone issue) and not_interested (they said no).
-- It means the business itself is gone — permanently closed, no longer operating.
-- -----------------------------------------------

INSERT INTO outcomes (project_id, key, name, group_name, shortcut, position, rules)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'defunct',
  'Firma nefunguje',
  'end',
  0,
  10,
  '{
    "set_stage": "lost",
    "increment_attempt": false,
    "required_inputs": [],
    "mark_defunct_shared": true
  }'
)
ON CONFLICT (project_id, key) DO NOTHING;

-- lost_reason for defunct businesses
INSERT INTO lost_reasons (project_id, key, name, is_system, position)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'defunct',
  'Firma nefunguje',
  true,
  10
)
ON CONFLICT (project_id, key) DO NOTHING;

-- -----------------------------------------------
-- Notes on what was NOT changed and why:
--
-- hook_text, hook_source: already in 002_core_tables.sql (lines 154-155).
--   No ALTER needed.
--
-- "nechce být kontaktován" (SYSTEM.md §3.10): covered by not_interested
--   outcome + add_to_dnc: "optional" (seed.sql). SYSTEM.md says it blocks
--   both email AND phone, for all projects. Current do_not_call table is
--   per-project, phone only. Extending DNC to cover email + cross-project
--   is a separate, larger change — flagged as TODO for a future task.
--
-- record_call_outcome(): no changes needed. New JSONB keys (consent_text,
--   mark_defunct_shared) are not read by the function — safely ignored.
--   Existing keys (set_stage, create_task, callback_delay, increment_attempt,
--   required_inputs) handle the new outcomes correctly.
--   mark_defunct_shared is for the application layer (write to shared
--   "firmy" table per SYSTEM.md §6), not the SQL function.
-- -----------------------------------------------
