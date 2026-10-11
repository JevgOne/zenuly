# Krok 2: Databaze a nastaveni Weblyxu — detailni plan

## Prehled
Vytvorit kompletni databazove schema pro Weblyx CRM, RLS politiky, seed data pro projekt Weblyx a SQL testy. Vse co se lisi mezi projekty je konfigurace v DB, ne kod.

## Zasada
- Tabulky a sloupce anglicky, enum hodnoty anglicky
- Casy v UTC, zobrazeni v Europe/Prague (aplikacni vrstva)
- Telefony normalizovane E.164 (+420...)
- Kazda tabulka ma RLS enabled
- Migrace v `supabase/migrations/`, testy v `supabase/tests/`

---

## MIGRACE 1: Zakladni typy a pomocne funkce

### Soubor: `supabase/migrations/001_types_and_helpers.sql`

```sql
-- Enum: role uzivatele
CREATE TYPE user_role AS ENUM ('admin', 'operator');

-- Enum: typ faze
CREATE TYPE stage_type AS ENUM ('open', 'won', 'lost');

-- Enum: typ vlastniho pole
CREATE TYPE custom_field_type AS ENUM ('select', 'text', 'number', 'date');

-- Enum: zdroj cisla
CREATE TYPE phone_source AS ENUM ('web_firmy', 'profil_firmy', 'databaze', 'poptavka');

-- Enum: typ dalsi akce
CREATE TYPE next_action_type AS ENUM ('callback', 'task', 'meeting');

-- Enum: typ ukolu
CREATE TYPE task_type AS ENUM ('send_offer', 'send_deck', 'check_contact', 'custom');

-- Enum: stav ukolu
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'cancelled');

-- Enum: stav smeny
CREATE TYPE shift_status AS ENUM ('active', 'paused', 'ended');

-- Pomocna funkce: generovani UUID (pouzivame gen_random_uuid() z pgcrypto)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Pomocna funkce: aktualni cas v UTC
-- (Postgres uz uklada timestamptz v UTC, jen pro jasnost)

-- Pomocna funkce: zjisteni role aktualniho uzivatele
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Pomocna funkce: zjisteni zda je uzivatel clenem projektu
CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
    AND profile_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## MIGRACE 2: Hlavni tabulky

### Soubor: `supabase/migrations/002_core_tables.sql`

### 2.1 profiles
Rozsiruje Supabase auth.users o aplikacni data.
```sql
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  role        user_role NOT NULL DEFAULT 'operator',
  avatar_url  text,
  onboarded   boolean NOT NULL DEFAULT false,  -- pruvodce prvnim prihlasenim
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```
**Trigger:** `handle_new_user` — po INSERT do auth.users automaticky vytvori radek v profiles.

### 2.2 projects
```sql
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,          -- url-friendly identifikator
  calls_per_hour  int NOT NULL DEFAULT 20,       -- cil hovoru za hodinu
  max_leads       int NOT NULL DEFAULT 80,       -- max otevrenych leadu na operatora
  max_attempts    int NOT NULL DEFAULT 4,        -- max pokusu pred lost
  sla_first_call  interval NOT NULL DEFAULT '2 hours',  -- SLA prvniho hovoru
  working_hours   jsonb NOT NULL DEFAULT '{
    "days": [1,2,3,4,5],
    "start": "09:00",
    "end": "18:00",
    "timezone": "Europe/Prague"
  }',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 2.3 project_members
```sql
CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, profile_id)
);
```

### 2.4 stages (faze pipeline)
```sql
CREATE TABLE stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,              -- 'new', 'contacted', ...
  name        text NOT NULL,              -- 'Novy lead', 'Kontaktovan', ...
  type        stage_type NOT NULL,        -- 'open', 'won', 'lost'
  position    int NOT NULL,               -- poradi v pipeline (1-8)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
CREATE INDEX idx_stages_project ON stages(project_id, position);
```

### 2.5 custom_fields (vlastni pole — konfigurace per projekt)
```sql
CREATE TABLE custom_fields (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key               text NOT NULL,            -- 'sector', 'project_type', ...
  name              text NOT NULL,            -- 'Obor', 'Typ projektu', ...
  field_type        custom_field_type NOT NULL,
  options           jsonb,                    -- pro 'select': ["remeslnici_a_stavebni", ...]
  required_from_stage text,                   -- key faze od ktere je povinne (null = nepovinne)
  position          int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
```
**Pozn:** `required_from_stage` odkazuje na `stages.key` ve stejnem projektu. Kontrola povinnosti se provadi v aplikaci pri posunu faze.

### 2.6 leads
```sql
CREATE TABLE leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Zakladni udaje
  company           text NOT NULL,
  contact_person    text,
  phone             text NOT NULL,             -- E.164 format (+420...)
  email             text,
  website           text,
  city              text,
  ico               text,                      -- ICO firmy
  lead_source       text,                      -- zdroj leadu (web, databaze, ...)
  phone_source      phone_source NOT NULL,     -- zdroj cisla (povinne)
  
  -- Pipeline
  stage_id          uuid NOT NULL REFERENCES stages(id),
  owner_id          uuid REFERENCES profiles(id),  -- null = pool
  priority          int NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),  -- 1=vysoka, 3=nizka
  attempt_count     int NOT NULL DEFAULT 0,
  
  -- Dalsi akce
  next_action_at    timestamptz,               -- KAZDY otevreny lead MUSI mit
  next_action_type  next_action_type,
  
  -- Hacek pro otevreni hovoru
  hook_text         text,                      -- "Web se na mobilu nacita 6,1 s"
  hook_source       text,                      -- "PageSpeed 34/100 · AI audit"
  
  -- Odlozeni
  postponed_until   timestamptz,               -- datum navratu do fronty
  postpone_reason   text,                      -- "az po sezone"
  
  -- Uzavreni
  lost_reason_id    uuid REFERENCES lost_reasons(id),
  lost_reason_note  text,                      -- poznamka k duvodu ztraty
  
  -- Vlastni pole (JSONB — klic = custom_fields.key)
  custom_data       jsonb NOT NULL DEFAULT '{}',
  
  -- Metadata
  imported_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexy
CREATE INDEX idx_leads_project_stage ON leads(project_id, stage_id);
CREATE INDEX idx_leads_owner ON leads(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_leads_next_action ON leads(next_action_at) WHERE next_action_at IS NOT NULL;
CREATE INDEX idx_leads_phone ON leads(project_id, phone);       -- duplicity check
CREATE INDEX idx_leads_email ON leads(project_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_leads_phone_unique ON leads(project_id, phone) 
  WHERE stage_id NOT IN (SELECT id FROM stages WHERE type = 'lost');  
  -- duplicity v ramci projektu, ale jen u otevrenych/vyhranych
```
**POZN k unikatnimu indexu:** Duplicitni kontrola telefonu v ramci projektu — ale ztracene leady neblokuji reimport. Implementator zvazi, zda partial unique index funguje spravne s podselektem, nebo zda pouzit constraint trigger.

### 2.7 lost_reasons (duvody ztraty — konfigurace per projekt)
```sql
CREATE TABLE lost_reasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  name        text NOT NULL,              -- 'Cena', 'Uz ma web', ...
  is_system   boolean NOT NULL DEFAULT false,  -- 'unreachable' = systemovy
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
```

### 2.8 outcomes (vysledky hovoru — konfigurace per projekt s pravidly)
```sql
CREATE TABLE outcomes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,              -- 'meeting', 'offer', ...
  name        text NOT NULL,              -- 'Konzultace', 'Nabidka', ...
  group_name  text NOT NULL,              -- 'interest', 'retry', 'end'
  shortcut    int,                        -- klavesa 1-8
  position    int NOT NULL DEFAULT 0,
  
  -- Pravidla (co se stane po zvoleni) — JSON
  rules       jsonb NOT NULL DEFAULT '{}',
  /*
    Struktura rules:
    {
      "set_stage": "meeting_booked" | null,
      "assign_to_admin": true | false,
      "create_task": "send_offer" | "send_deck" | "check_contact" | null,
      "task_delay": "24 hours" | "0" | null,
      "callback_delay": "3 days" | "30 minutes" | null,
      "callback_opposite_part": true | false,   -- pro no_answer
      "increment_attempt": true | false,
      "mark_lost_after_max": true | false,       -- po max pokusech -> lost
      "lost_reason_key": "unreachable" | null,
      "auto_email": true | false,                -- auto email po vycerpani
      "add_to_dnc": "optional" | "required" | null,  -- seznam Nevolat
      "required_inputs": ["date", "email", "lost_reason", "time_slot"],
      "recontact_after": "6 months" | null,
      "quick_options": ["2h", "tomorrow_9", "1w", "1m", "3m", "custom"] | null
    }
  */
  
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
```

### 2.9 calls (zaznamy hovoru)
```sql
CREATE TABLE calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  outcome_id  uuid NOT NULL REFERENCES outcomes(id),
  note        text,
  voice_note_url text,                    -- hlasova poznamka (budouci)
  duration_s  int,                        -- delka hovoru v sekundach (budouci)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_lead ON calls(lead_id, created_at DESC);
CREATE INDEX idx_calls_operator ON calls(operator_id, created_at DESC);
CREATE INDEX idx_calls_project_date ON calls(project_id, created_at);
```

### 2.10 tasks (ukoly — odeslat nabidku, prezentaci, zkontrolovat kontakt)
```sql
CREATE TABLE tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id),
  assigned_to uuid NOT NULL REFERENCES profiles(id),
  task_type   task_type NOT NULL,
  status      task_status NOT NULL DEFAULT 'pending',
  due_at      timestamptz NOT NULL,
  completed_at timestamptz,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to, status, due_at);
CREATE INDEX idx_tasks_project ON tasks(project_id, status);
```

### 2.11 do_not_call (seznam Nevolat)
```sql
CREATE TABLE do_not_call (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phone       text NOT NULL,               -- E.164
  reason      text,
  added_by    uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, phone)
);
CREATE INDEX idx_dnc_phone ON do_not_call(phone);  -- globalni lookup
```
**Pozn ze specifikace:** "platí pro všechny operátory navždy, blokuje import i volání". DNC se kontroluje per project (UNIQUE na project_id, phone). Pokud se pozdeji chce globalni DNC, prida se index bez project_id.

### 2.12 shifts (smeny)
```sql
CREATE TABLE shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  operator_id uuid NOT NULL REFERENCES profiles(id),
  status      shift_status NOT NULL DEFAULT 'active',
  started_at  timestamptz NOT NULL DEFAULT now(),
  paused_at   timestamptz,                 -- cas posledni pauzy
  ended_at    timestamptz,
  total_pause_s int NOT NULL DEFAULT 0,    -- celkovy cas pauzy v sekundach
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shifts_operator ON shifts(operator_id, started_at DESC);
CREATE INDEX idx_shifts_active ON shifts(operator_id, status) WHERE status = 'active';
```

### 2.13 email_templates (sablony e-mailu — konfigurace per projekt)
```sql
CREATE TABLE email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,               -- 'offer', 'deck', 'unreachable_auto'
  name        text NOT NULL,               -- 'Nabidka', 'Prezentace', ...
  subject     text NOT NULL,               -- sablon predmetu s {{promennymi}}
  body_html   text NOT NULL,               -- HTML telo s {{promennymi}}
  variables   jsonb NOT NULL DEFAULT '[]', -- seznam dostupnych promennych
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
```

### 2.14 audit_log
```sql
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES projects(id),
  lead_id     uuid REFERENCES leads(id),
  user_id     uuid REFERENCES profiles(id),
  action      text NOT NULL,               -- 'call_recorded', 'stage_changed', 'lead_imported', ...
  details     jsonb,                       -- detaily akce
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_project ON audit_log(project_id, created_at DESC);
CREATE INDEX idx_audit_lead ON audit_log(lead_id, created_at DESC);
```

### 2.15 Trigger: updated_at
```sql
-- Univerzalni trigger pro updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplikovat na tabulky s updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2.16 Trigger: novy uzivatel -> profil
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## MIGRACE 3: RLS politiky

### Soubor: `supabase/migrations/003_rls_policies.sql`

**Princip:** Admin vidi vse. Operator vidi jen data svych projektu, a u leadu jen ty co vlastni nebo jsou v poolu (owner_id IS NULL). Telefony cizich leadu operator nevidi.

```sql
-- === PROFILES ===
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Kazdy vidi svuj profil
CREATE POLICY profiles_select_own ON profiles FOR SELECT
  USING (id = auth.uid());
-- Admin vidi vsechny profily
CREATE POLICY profiles_select_admin ON profiles FOR SELECT
  USING (auth_user_role() = 'admin');
-- Kazdy muze editovat svuj profil
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
-- Admin muze editovat vsechny
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (auth_user_role() = 'admin');

-- === PROJECTS ===
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Admin vidi vsechny projekty
CREATE POLICY projects_select_admin ON projects FOR SELECT
  USING (auth_user_role() = 'admin');
-- Operator vidi jen projekty kde je clenem
CREATE POLICY projects_select_member ON projects FOR SELECT
  USING (is_project_member(id));
-- Jen admin muze CRUD
CREATE POLICY projects_insert_admin ON projects FOR INSERT
  WITH CHECK (auth_user_role() = 'admin');
CREATE POLICY projects_update_admin ON projects FOR UPDATE
  USING (auth_user_role() = 'admin');
CREATE POLICY projects_delete_admin ON projects FOR DELETE
  USING (auth_user_role() = 'admin');

-- === PROJECT_MEMBERS ===
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select_admin ON project_members FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY pm_select_member ON project_members FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY pm_insert_admin ON project_members FOR INSERT
  WITH CHECK (auth_user_role() = 'admin');
CREATE POLICY pm_delete_admin ON project_members FOR DELETE
  USING (auth_user_role() = 'admin');

-- === STAGES ===
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY stages_select_admin ON stages FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY stages_select_member ON stages FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY stages_manage_admin ON stages FOR ALL
  USING (auth_user_role() = 'admin');

-- === CUSTOM_FIELDS ===
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY cf_select_admin ON custom_fields FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY cf_select_member ON custom_fields FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY cf_manage_admin ON custom_fields FOR ALL
  USING (auth_user_role() = 'admin');

-- === LEADS ===
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Admin vidi vsechny leady
CREATE POLICY leads_select_admin ON leads FOR SELECT
  USING (auth_user_role() = 'admin');
-- Operator vidi leady sveho projektu ktere vlastni NEBO jsou v poolu
-- DULEZITE: telefony cizich leadu operator NEVIDI (reseno tim ze nevidi cely radek)
CREATE POLICY leads_select_operator ON leads FOR SELECT
  USING (
    is_project_member(project_id)
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );
-- Operator muze updatovat sve leady
CREATE POLICY leads_update_operator ON leads FOR UPDATE
  USING (
    is_project_member(project_id)
    AND owner_id = auth.uid()
  );
-- Operator muze prevzit lead z poolu (update owner_id z NULL na sebe)
CREATE POLICY leads_claim_pool ON leads FOR UPDATE
  USING (
    is_project_member(project_id)
    AND owner_id IS NULL
  )
  WITH CHECK (owner_id = auth.uid());
-- Admin muze vse
CREATE POLICY leads_manage_admin ON leads FOR ALL
  USING (auth_user_role() = 'admin');

-- === OUTCOMES ===
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY outcomes_select_admin ON outcomes FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY outcomes_select_member ON outcomes FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY outcomes_manage_admin ON outcomes FOR ALL
  USING (auth_user_role() = 'admin');

-- === CALLS ===
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY calls_select_admin ON calls FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY calls_select_operator ON calls FOR SELECT
  USING (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );
-- Insert pres record_call_outcome (SECURITY DEFINER), ale pro pripad:
CREATE POLICY calls_insert_operator ON calls FOR INSERT
  WITH CHECK (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );

-- === LOST_REASONS ===
ALTER TABLE lost_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY lr_select_admin ON lost_reasons FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY lr_select_member ON lost_reasons FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY lr_manage_admin ON lost_reasons FOR ALL
  USING (auth_user_role() = 'admin');

-- === TASKS ===
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_select_admin ON tasks FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY tasks_select_assigned ON tasks FOR SELECT
  USING (assigned_to = auth.uid());
CREATE POLICY tasks_update_assigned ON tasks FOR UPDATE
  USING (assigned_to = auth.uid());
CREATE POLICY tasks_manage_admin ON tasks FOR ALL
  USING (auth_user_role() = 'admin');

-- === DO_NOT_CALL ===
ALTER TABLE do_not_call ENABLE ROW LEVEL SECURITY;

CREATE POLICY dnc_select_admin ON do_not_call FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY dnc_select_member ON do_not_call FOR SELECT
  USING (is_project_member(project_id));
-- Operator muze pridat (pri "Nevolat" v hovoru)
CREATE POLICY dnc_insert_member ON do_not_call FOR INSERT
  WITH CHECK (is_project_member(project_id));
-- Jen admin muze mazat
CREATE POLICY dnc_delete_admin ON do_not_call FOR DELETE
  USING (auth_user_role() = 'admin');

-- === SHIFTS ===
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shifts_select_admin ON shifts FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY shifts_select_own ON shifts FOR SELECT
  USING (operator_id = auth.uid());
CREATE POLICY shifts_insert_own ON shifts FOR INSERT
  WITH CHECK (operator_id = auth.uid());
CREATE POLICY shifts_update_own ON shifts FOR UPDATE
  USING (operator_id = auth.uid());

-- === EMAIL_TEMPLATES ===
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY et_select_admin ON email_templates FOR SELECT
  USING (auth_user_role() = 'admin');
CREATE POLICY et_select_member ON email_templates FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY et_manage_admin ON email_templates FOR ALL
  USING (auth_user_role() = 'admin');

-- === AUDIT_LOG ===
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY al_select_admin ON audit_log FOR SELECT
  USING (auth_user_role() = 'admin');
-- Operator vidi audit svych leadu
CREATE POLICY al_select_operator ON audit_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads WHERE leads.id = audit_log.lead_id AND leads.owner_id = auth.uid()
    ))
  );
-- Insert obvykle pres SECURITY DEFINER funkce, ale:
CREATE POLICY al_insert ON audit_log FOR INSERT
  WITH CHECK (true);  -- insert povoleny vsem autentizovanym (RLS uz overuje auth)
```

---

## MIGRACE 4: Seed data — projekt Weblyx

### Soubor: `supabase/migrations/004_seed_weblyx.sql`

**DULEZITE:** Toto je seed, ne migrace. Implementator muze pouzit `supabase/seed.sql` nebo separatni migraci. Rozhodnuti na implementatorovi.

```sql
-- 1. Projekt Weblyx
INSERT INTO projects (id, name, slug, calls_per_hour, max_leads, max_attempts)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Weblyx', 'weblyx', 20, 80, 4
);

-- 2. Osm fazi pipeline
INSERT INTO stages (project_id, key, name, type, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'new',             'Nový lead',                'open', 1),
  ('00000000-0000-0000-0000-000000000001', 'contacted',       'Kontaktován',              'open', 2),
  ('00000000-0000-0000-0000-000000000001', 'meeting_booked',  'Konzultace domluvena',     'open', 3),
  ('00000000-0000-0000-0000-000000000001', 'meeting_done',    'Konzultace proběhla',      'open', 4),
  ('00000000-0000-0000-0000-000000000001', 'offer_sent',      'Nabídka odeslána',         'open', 5),
  ('00000000-0000-0000-0000-000000000001', 'negotiation',     'Vyjednávání',              'open', 6),
  ('00000000-0000-0000-0000-000000000001', 'won',             'Vyhráno (záloha zaplacena)','won',  7),
  ('00000000-0000-0000-0000-000000000001', 'lost',            'Ztraceno',                 'lost', 8);

-- 3. Vlastni pole Weblyxu
INSERT INTO custom_fields (project_id, key, name, field_type, options, required_from_stage, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'sector',
   'Obor', 'select',
   '["Řemeslníci a stavební", "Služby s rezervacemi", "Restaurace a ubytování", "Ostatní"]',
   'contacted', 1),
  ('00000000-0000-0000-0000-000000000001', 'project_type',
   'Typ projektu', 'select',
   '["Landing page", "Prezentační web", "E-shop", "Redesign"]',
   'meeting_booked', 2),
  ('00000000-0000-0000-0000-000000000001', 'budget',
   'Rozpočet', 'select',
   '["Do 10 tis.", "10–30 tis.", "30–80 tis.", "80 tis.+"]',
   'meeting_done', 3),
  ('00000000-0000-0000-0000-000000000001', 'decision_maker',
   'Rozhodovatel', 'text', NULL,
   'meeting_booked', 4),
  ('00000000-0000-0000-0000-000000000001', 'launch_date',
   'Termín spuštění', 'date', NULL,
   'meeting_done', 5),
  ('00000000-0000-0000-0000-000000000001', 'offer_value',
   'Hodnota nabídky (Kč)', 'number', NULL,
   'offer_sent', 6);

-- 4. Osm vysledku hovoru s pravidly
INSERT INTO outcomes (project_id, key, name, group_name, shortcut, position, rules) VALUES
  ('00000000-0000-0000-0000-000000000001', 'meeting',
   'Konzultace', 'interest', 1, 1,
   '{
     "set_stage": "meeting_booked",
     "assign_to_admin": true,
     "create_task": null,
     "callback_delay": null,
     "increment_attempt": false,
     "required_inputs": ["time_slot"],
     "calendar_event": true
   }'),
  ('00000000-0000-0000-0000-000000000001', 'offer',
   'Nabídka', 'interest', 2, 2,
   '{
     "set_stage": null,
     "create_task": "send_offer",
     "task_delay": "24 hours",
     "callback_delay": "3 days",
     "increment_attempt": false,
     "required_inputs": ["email"]
   }'),
  ('00000000-0000-0000-0000-000000000001', 'deck',
   'Prezentace', 'interest', 3, 3,
   '{
     "set_stage": "contacted",
     "create_task": "send_deck",
     "task_delay": "0",
     "callback_delay": "2 days",
     "increment_attempt": false,
     "required_inputs": ["email"]
   }'),
  ('00000000-0000-0000-0000-000000000001', 'later',
   'Jindy', 'retry', 4, 4,
   '{
     "set_stage": "contacted",
     "callback_delay": null,
     "callback_custom": true,
     "increment_attempt": false,
     "required_inputs": ["date"],
     "quick_options": ["2h", "tomorrow_9", "1w", "1m", "3m", "custom"],
     "reason_required_after_days": 7
   }'),
  ('00000000-0000-0000-0000-000000000001', 'no_answer',
   'Nevzal to', 'retry', 5, 5,
   '{
     "set_stage": null,
     "callback_opposite_part": true,
     "increment_attempt": true,
     "mark_lost_after_max": true,
     "lost_reason_key": "unreachable",
     "auto_email": true,
     "required_inputs": []
   }'),
  ('00000000-0000-0000-0000-000000000001', 'busy',
   'Obsazeno', 'retry', 6, 6,
   '{
     "set_stage": null,
     "callback_delay": "30 minutes",
     "increment_attempt": false,
     "required_inputs": []
   }'),
  ('00000000-0000-0000-0000-000000000001', 'not_interested',
   'Nemá zájem', 'end', 7, 7,
   '{
     "set_stage": "lost",
     "increment_attempt": false,
     "required_inputs": ["lost_reason"],
     "add_to_dnc": "optional",
     "recontact_after": "6 months"
   }'),
  ('00000000-0000-0000-0000-000000000001', 'wrong_number',
   'Špatné číslo', 'end', 8, 8,
   '{
     "set_stage": "lost",
     "create_task": "check_contact",
     "task_assign_to": "admin",
     "increment_attempt": false,
     "required_inputs": []
   }');

-- 5. Duvody ztraty
INSERT INTO lost_reasons (project_id, key, name, is_system, position) VALUES
  ('00000000-0000-0000-0000-000000000001', 'price',          'Cena',                        false, 1),
  ('00000000-0000-0000-0000-000000000001', 'has_website',    'Už má web',                   false, 2),
  ('00000000-0000-0000-0000-000000000001', 'no_time',        'Nemá čas / teď ne',           false, 3),
  ('00000000-0000-0000-0000-000000000001', 'has_agency',     'Má agenturu nebo známého',    false, 4),
  ('00000000-0000-0000-0000-000000000001', 'diy',            'Udělá si sám',                false, 5),
  ('00000000-0000-0000-0000-000000000001', 'distrust_ai',    'Nedůvěra k AI',               false, 6),
  ('00000000-0000-0000-0000-000000000001', 'no_value',       'Nevidí přínos',               false, 7),
  ('00000000-0000-0000-0000-000000000001', 'unreachable',    'Nedosažitelný',               true,  8),
  ('00000000-0000-0000-0000-000000000001', 'other',          'Jiné',                        false, 9);

-- 6. Sablony e-mailu
INSERT INTO email_templates (project_id, key, name, subject, body_html, variables) VALUES
  ('00000000-0000-0000-0000-000000000001', 'offer',
   'Nabídka',
   'Rozbor webu {{web}} a nabídka od Weblyxu',
   '<p>Dobrý den, {{contact_person}},</p>
<p>děkuji za dnešní hovor. Podívali jsme se na váš web {{web}} a našli jsme několik věcí:</p>
<ul>
  <li>{{finding_1}}</li>
  <li>{{finding_2}}</li>
</ul>
<p>Na základě toho vám nabízíme {{project_type}} za <strong>{{price}} Kč</strong> jednorázově (nejsme plátci DPH). Termín dodání: {{delivery_date}}.</p>
<p>Garance: načtení webu pod 2 s, jinak vracíme peníze. Záloha 50 % až po schválení designu.</p>
<p>Ozvu se vám {{next_contact_date}}, nebo si rovnou vyberte termín konzultace: {{booking_link}}</p>
<p>S pozdravem,<br>Weblyx</p>',
   '["contact_person", "web", "finding_1", "finding_2", "project_type", "price", "delivery_date", "next_contact_date", "booking_link"]'),
  ('00000000-0000-0000-0000-000000000001', 'deck',
   'Prezentace',
   'Ukázky webů pro {{sector}}',
   '<p>Dobrý den, {{contact_person}},</p>
<p>posílám ukázky webů, které jsme vytvořili pro firmy z oboru {{sector}}:</p>
<ul>
  <li>{{reference_1}}</li>
  <li>{{reference_2}}</li>
</ul>
<p>V příloze najdete krátkou prezentaci.</p>
<p>Ozvu se vám {{next_contact_date}} – pokud chcete, můžeme si domluvit 20 minut s majitelem a probrat to osobně.</p>
<p>S pozdravem,<br>Weblyx</p>',
   '["contact_person", "sector", "reference_1", "reference_2", "next_contact_date"]');
```

---

## MIGRACE 5 (volitelna): Pohled pro frontu "Volat ted"

Neni soucasti Kroku 2, ale pripravit zaklad pro budouci pouziti:
```sql
-- Tohle implementovat az v Kroku 7 (fronta), ale schema uz pocita s indexy:
-- idx_leads_next_action, idx_leads_owner, idx_leads_project_stage
```

---

## SQL TESTY RLS

### Soubor: `supabase/tests/001_rls_test.sql`

Testy overuji ze:
1. Operator NEVIDI leady cizich projektu
2. Operator NEVIDI leady jineho operatora (jen sve + pool)
3. Operator NEVIDI telefony cizich leadu
4. Admin VIDI vse
5. Operator NEMUZE menit nastaveni projektu
6. Operator NEMUZE mazat z DNC
7. Operator VIDI konfigurace sveho projektu (stages, outcomes, fields)

```sql
-- Testovaci struktura:
-- 1. Vytvor 2 testovaci uzivatele (admin, operator) v auth.users
-- 2. Vytvor 2 projekty (Weblyx, Uklid)
-- 3. Operator je clenem jen Weblyxu
-- 4. Vytvor leady v obou projektech
-- 5. Prepni RLS context na operatora a over co vidi/nevidi

-- Test 1: Operator vidi jen leady sveho projektu
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claim.sub TO '<operator_uuid>';
-- SELECT count(*) FROM leads;  -- musi byt jen Weblyx leady

-- Test 2: Operator nevidi leady jineho operatora
-- Lead vlastneny jinym operatorem v tom samem projektu NENI videt

-- Test 3: Operator vidi pool leady (owner_id IS NULL) sveho projektu

-- Test 4: Admin vidi vsechno
-- SET LOCAL request.jwt.claim.sub TO '<admin_uuid>';
-- SELECT count(*) FROM leads;  -- musi byt vsechny

-- Test 5: Operator nemuze INSERT do projects

-- Test 6: Operator nemuze DELETE z do_not_call

-- Test 7: Operator vidi stages a outcomes sveho projektu
```

**Pozn:** Presna implementace testu zavisi na tom, zda se pouzije pgTAP (doporuceno v CLAUDE.md) nebo plain SQL skripty. Implementator rozhodne. Doporucuji pgTAP pro lepsi strukturu a asserty.

---

## Poradi implementace

1. **Migrace 001**: Typy a helpery (zavislost: zadna)
2. **Migrace 002**: Vsechny tabulky (zavislost: 001)
3. **Migrace 003**: RLS politiky (zavislost: 002)
4. **Seed**: Projekt Weblyx data (zavislost: 002)
5. **Testy**: RLS testy (zavislost: 003 + seed)
6. **Overeni**: `supabase db reset` na ciste DB, seed projde, testy projdou

## Kriterium hotovo

- Migrace projdou na ciste databazi (`supabase db reset`)
- Seed vytvori projekt Weblyx se vsemi konfiguracemi
- Testy potvrzuji ze operator nevidi cizi leady
- Zadny SQL error

## Dulezite poznamky pro implementatora

1. **Poradi referenci**: Tabulka `leads` referencuje `lost_reasons`, proto `lost_reasons` musi byt definovana PRED `leads`, nebo pouzit ALTER TABLE pro FK dodatecne.
2. **Unique index na leads.phone**: Partial unique index s podselectem na stages nefunguje v Postgresu. Reseni: bud constraint trigger, nebo sloupec `is_active` na leads a partial index `WHERE is_active = true`.
3. **auth_user_role()**: Tato funkce zavisi na `profiles`, ktera jeste neexistuje v migraci 001. Bud presunout do migrace 002 za profiles, nebo pouzit forward reference.
4. **Seed jako separatni soubor**: Supabase CLI podporuje `supabase/seed.sql` ktery se spusti po migracich pri `supabase db reset`. To je lepsi nez mit seed jako migraci.
5. **JSONB rules v outcomes**: Pravidla jsou naschval v JSONB, ne v oddelenach sloupcich, protoze se budou lisit mezi projekty. Funkce `record_call_outcome` (Krok 3) je bude cist.
6. **Czech characters v seed**: Ceske znaky (hacky, carky) v nazvech fazi, duvodu ztraty atd. — pouzivat UTF-8.
