# Task #33 — Evžen: kontrola registrace + project roles

**Datum:** 2026-10-08
**Kontrolor:** Evžen THE KING
**Krok:** Registrace + Project Roles (Krok 5)
**Verdict:** SCHVÁLENO

---

## Kontrolované požadavky (doslovné zadání)

### 1. Login: text "CRM", žádný Google, odkaz na registraci
- **login/page.tsx**: Zobrazuje "CRM" vedle loga — OK
- **login/login-form.tsx**: Žádný Google OAuth — OK
- **login/login-form.tsx**: Odkaz "Zaregistrujte se" → /register — OK

### 2. Registrace: Jméno, Email, Telefon, Heslo — žádný Google
- **register/register-form.tsx**: Pole "Jméno a příjmení" (text, required) — OK
- **register/register-form.tsx**: Pole "E-mail" (email, required) — OK
- **register/register-form.tsx**: Pole "Telefon" (tel, required, placeholder "+420") — OK
- **register/register-form.tsx**: Pole "Heslo" (password, minLength=6, show/hide toggle) — OK
- **register/register-form.tsx**: Žádný Google OAuth — OK
- **proxy.ts**: `/register` je v PUBLIC_ROUTES — OK

### 3. Project role model: operator/manager per projekt, admin = superadmin
- **005_project_roles.sql**: `CREATE TYPE project_role AS ENUM ('operator', 'manager')` — OK
- **005_project_roles.sql**: `ALTER TABLE project_members ADD COLUMN role project_role NOT NULL DEFAULT 'operator'` — OK
- **005_project_roles.sql**: `is_project_manager()` — admin = vždy true, manager v projektu = true — OK
- **actions/users.ts**: `inviteOperator` — per-project role z formuláře — OK
- **actions/users.ts**: `changeProjectRole` — přepínání operator/manager — OK
- **admin/users/invite-form.tsx**: Dropdown Operátor/Manažer per projekt — OK

### 4. Nový uživatel = 'user' bez přístupu, admin přiřadí
- **005_project_roles.sql**: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user'` — OK
- **005_project_roles.sql**: `handle_new_user()` — default role = 'user' — OK
- **page.tsx (root)**: Uživatel bez membership vidí "Čekáte na přiřazení k projektu" — OK
- **actions/users.ts**: `assignToProject`, `removeFromProject` — admin přiřazuje — OK

### 5. Manager vidí reporty svého projektu, operator jen své leady
- **005_project_roles.sql**: RLS policies:
  - `leads_select_manager` — `is_project_manager(project_id)` — OK
  - `leads_select_operator` — `is_project_member AND (owner_id = auth.uid() OR owner_id IS NULL)` — OK
  - `calls_select_manager` — `is_project_manager(project_id)` — OK
  - `calls_select_operator` — `is_project_member AND operator_id = auth.uid()` — OK
  - `tasks_select_manager` — `is_project_manager(project_id)` — OK
  - `shifts_select_manager` — `is_project_manager(project_id)` — OK
  - `al_select_manager` (audit_log) — `is_project_manager(project_id)` — OK
- Operator vidí jen své leady + pool (owner IS NULL) — OK
- Manager vidí vše v projektu — OK

### Doplňkové kontroly
- **005_project_roles.sql**: `find_project_admin()` preferuje project managera → fallback global admin member → fallback any admin — OK
- **005_project_roles.sql**: `project_role_for()` helper — OK
- **005_project_roles.sql**: Profily mají phone sloupec — OK
- **005_project_roles.sql**: `pm_insert_manager` / `pm_delete_manager` — manager může přidávat/odebírat členy (ne sebe) — OK
- **register/register-form.tsx**: Po registraci zobrazí "Na váš e-mail jsme odeslali ověřovací odkaz" — OK
- **Build**: passes — OK

---

## Neshody
Žádné.

## Závěr
Všech 5 požadavků je implementováno přesně podle zadání. Registrace funguje správně, project role model je kompletní, RLS politiky správně rozlišují operator/manager přístup.

**SCHVÁLENO**
