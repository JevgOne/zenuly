# Plán: Project-level role model

> Task #29 — planner, 2026-10-08

## Kontext

Uživatel: "registrovat se může každý, pak záleží komu dám jaký práva, například jednomu emailu dám práva operátor k projektu weblyx a úklid, pak bude manažer projektu úklid"

### Aktuální stav

```
profiles.role = user_role enum ('admin', 'operator')  ← GLOBÁLNÍ
project_members = (project_id, profile_id)             ← bez role, jen členství
```

- `auth_user_role()` vrací globální roli z `profiles`
- RLS policies porovnávají `auth_user_role() = 'admin'` (33 výskytů v 003_rls_policies.sql)
- `find_project_admin()` hledá `profiles.role = 'admin'` v členech projektu
- App kód: `profile.role === "admin"` ve 12 souborech
- `user_role` enum má jen 2 hodnoty: `admin`, `operator`

### Cílový stav

```
profiles.role = global_role ('admin', 'user')           ← jen superadmin vs běžný uživatel
project_members.role = project_role ('operator', 'manager')  ← role PER PROJEKT
```

- Nový registrovaný uživatel: `profiles.role = 'user'`, 0 project_members → nevidí nic
- Admin ho přiřadí k projektu(ům) s rolí operator nebo manager
- Superadmin (`profiles.role = 'admin'`): vidí vše, spravuje vše, přiřazuje role
- Manager projektu: vidí všechny leady projektu, reporty, operátory; nemůže spravovat jiné projekty
- Operator projektu: vidí jen své leady + pool, zapisuje výsledky

---

## Části plánu

### Část 1: Nový enum a ALTER project_members

**Soubor:** `supabase/migrations/005_project_roles.sql`

```sql
-- 1a. Nový enum pro project-level role
CREATE TYPE project_role AS ENUM ('operator', 'manager');

-- 1b. Přidat roli do project_members
ALTER TABLE project_members ADD COLUMN role project_role NOT NULL DEFAULT 'operator';

-- 1c. Rozšířit user_role o 'user' (registrovaný, bez přístupu)
-- Postgres neumí přejmenovat enum hodnotu, ale přidat novou ano.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- 1d. Přenastavit výchozí roli v handle_new_user trigger
-- Nová registrace = 'user' (ne 'operator'), protože uživatel zatím nemá žádný projekt.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'role', '')::user_role,
      'user'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Pozn.:** Stávající admin účet zůstává `profiles.role = 'admin'`. Stávající operátoři v profiles zůstanou `'operator'` — po migraci se mohou přenastavit na `'user'` (protože jejich skutečná role je teď v project_members), ale zpětná kompatibilita to nevyžaduje ihned.

### Část 2: Nové helper funkce

```sql
-- 2a. Project-specific role check
-- Vrací roli uživatele v daném projektu, nebo NULL pokud není členem.
CREATE OR REPLACE FUNCTION project_role_for(p_project_id uuid)
RETURNS project_role AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id
    AND profile_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2b. Je uživatel manager nebo admin?
-- Superadmin (profiles.role = 'admin') = ano vždy.
-- Manager v daném projektu = ano.
CREATE OR REPLACE FUNCTION is_project_manager(p_project_id uuid)
RETURNS boolean AS $$
  SELECT
    auth_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members
      WHERE project_id = p_project_id
        AND profile_id = auth.uid()
        AND role = 'manager'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2c. Přepsat find_project_admin → find_project_manager
-- record_call_outcome volá tuto funkci pro assign_to_admin.
-- Nyní hledá managera projektu (ne globálního admina).
-- Fallback na superadmina, pokud projekt nemá managera.
CREATE OR REPLACE FUNCTION find_project_admin(p_project_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    -- Nejdřív manager projektu
    (SELECT pm.profile_id
     FROM project_members pm
     WHERE pm.project_id = p_project_id
       AND pm.role = 'manager'
     LIMIT 1),
    -- Fallback: globální admin, který je členem
    (SELECT pm.profile_id
     FROM project_members pm
     JOIN profiles p ON p.id = pm.profile_id
     WHERE pm.project_id = p_project_id
       AND p.role = 'admin'
     LIMIT 1),
    -- Poslední fallback: jakýkoli globální admin
    (SELECT p.id
     FROM profiles p
     WHERE p.role = 'admin'
     LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2d. auth_user_role() zůstává beze změny
-- Stále vrací globální roli z profiles. Používá se jen pro superadmin check.
-- RLS policies se změní (viz Část 3) aby používaly project_role_for() nebo is_project_manager().
```

### Část 3: Přepis RLS policies

Každá policy se přepíše. Princip:
- `auth_user_role() = 'admin'` → superadmin, beze změny (vidí vše)
- `is_project_member(project_id)` → zůstává (operator i manager projektu)
- NOVÉ: manager vidí všechny leady projektu (ne jen své + pool)
- NOVÉ: manager vidí všechny hovory projektu (ne jen své)

```sql
-- =============================================
-- LEADS — manager vidí vše v projektu
-- =============================================

-- Smazat starou policy
DROP POLICY IF EXISTS leads_select_operator ON leads;

-- Manager projektu: vidí všechny leady projektu
CREATE POLICY leads_select_manager ON leads FOR SELECT
  USING (
    is_project_manager(project_id)
  );

-- Operator projektu: vidí jen své leady + pool (beze změny logiky)
CREATE POLICY leads_select_operator ON leads FOR SELECT
  USING (
    is_project_member(project_id)
    AND (owner_id = auth.uid() OR owner_id IS NULL)
  );

-- =============================================
-- CALLS — manager vidí vše v projektu
-- =============================================

DROP POLICY IF EXISTS calls_select_operator ON calls;

CREATE POLICY calls_select_manager ON calls FOR SELECT
  USING (
    is_project_manager(project_id)
  );

CREATE POLICY calls_select_operator ON calls FOR SELECT
  USING (
    is_project_member(project_id)
    AND operator_id = auth.uid()
  );

-- =============================================
-- TASKS — manager vidí vše v projektu
-- =============================================

DROP POLICY IF EXISTS tasks_select_assigned ON tasks;

CREATE POLICY tasks_select_manager ON tasks FOR SELECT
  USING (
    is_project_manager(project_id)
  );

CREATE POLICY tasks_select_assigned ON tasks FOR SELECT
  USING (assigned_to = auth.uid());

-- =============================================
-- SHIFTS — manager vidí všechny směny projektu
-- =============================================

DROP POLICY IF EXISTS shifts_select_own ON shifts;

CREATE POLICY shifts_select_manager ON shifts FOR SELECT
  USING (
    is_project_manager(project_id)
  );

CREATE POLICY shifts_select_own ON shifts FOR SELECT
  USING (operator_id = auth.uid());

-- =============================================
-- AUDIT_LOG — manager vidí vše v projektu
-- =============================================

DROP POLICY IF EXISTS al_select_operator ON audit_log;

CREATE POLICY al_select_manager ON audit_log FOR SELECT
  USING (
    project_id IS NOT NULL AND is_project_manager(project_id)
  );

CREATE POLICY al_select_operator ON audit_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (lead_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM leads WHERE leads.id = audit_log.lead_id AND leads.owner_id = auth.uid()
    ))
  );

-- =============================================
-- PROJECT_MEMBERS — manager projektu vidí členy svého projektu
-- =============================================

DROP POLICY IF EXISTS pm_select_member ON project_members;

CREATE POLICY pm_select_member ON project_members FOR SELECT
  USING (
    is_project_member(project_id)
  );

-- Manager může přiřazovat operátory ke svému projektu
CREATE POLICY pm_insert_manager ON project_members FOR INSERT
  WITH CHECK (
    is_project_manager(project_id)
  );

CREATE POLICY pm_delete_manager ON project_members FOR DELETE
  USING (
    is_project_manager(project_id)
  );

-- =============================================
-- Ostatní policies (profiles, projects, stages, custom_fields,
-- outcomes, lost_reasons, email_templates) — beze změny logiky.
-- Member = operator nebo manager, obě role vidí konfiguraci projektu.
-- Jen admin může měnit konfiguraci (stages, outcomes, fields...).
-- =============================================
```

### Část 4: App kód — místa ke změně

| Soubor | Co se mění | Detail |
|---|---|---|
| `src/lib/contexts/project-context.tsx` | `userRole` typ | `'admin' \| 'operator'` → `'admin' \| 'manager' \| 'operator' \| 'user'` (nebo jen project-level) |
| `src/app/(app)/[projectSlug]/layout.tsx` | Jak se zjistí role | Místo `profile.role` načíst `project_members.role` pro aktuální projekt. Superadmin fallback. |
| `src/components/app-header.tsx` | Nav items podle role | `role === "admin"` → `role === "admin" \|\| role === "manager"` pro zobrazení manažerského menu |
| `src/components/user-menu.tsx` | Label role | Přidat "Manažer" label |
| `src/app/actions/users.ts` | `requireAdmin()` | Zachovat pro superadmin akce. Přidat `requireProjectManager(projectId)` pro per-project akce. |
| `src/app/actions/users.ts` | `inviteOperator()` | Přidat výběr role (operator/manager). Uložit do `project_members.role`. |
| `src/app/(admin)/admin/users/page.tsx` | UI správy uživatelů | Zobrazit project role, přidat dropdown pro změnu role |
| `src/app/(admin)/admin/layout.tsx` | Guard | `profile.role !== 'admin'` — beze změny (admin sekce jen pro superadmina) |
| `src/app/page.tsx` | Redirect logika | `profile.role === 'admin'` → OK. Přidat: pokud `role = 'user'` a 0 projektů → "Čekáte na přiřazení" |
| `src/app/settings/page.tsx` | Label role | Přidat project-level role zobrazení |
| `src/proxy.ts` | MFA check | `auth_user_role() = 'admin'` → beze změny (MFA jen pro superadmina) |

### Část 5: Detailní layout.tsx změna

```typescript
// src/app/(app)/[projectSlug]/layout.tsx

// Místo:
const { data: profile } = await supabase
  .from("profiles")
  .select("id, role, full_name")
  .eq("id", user.id)
  .single();

// Bude:
const { data: profile } = await supabase
  .from("profiles")
  .select("id, role, full_name")
  .eq("id", user.id)
  .single();

// Načíst project-level roli:
const { data: membership } = await supabase
  .from("project_members")
  .select("role, project_id, projects(id, name, slug)")
  .eq("profile_id", user.id);

// Efektivní role pro aktuální projekt:
const currentMembership = membership?.find(
  m => (m.projects as any)?.slug === projectSlug
);
const effectiveRole: string =
  profile.role === "admin"
    ? "admin"                            // superadmin = admin všude
    : currentMembership?.role ?? "user";  // project role nebo žádný přístup

// Do ProjectProvider:
userRole: effectiveRole as "admin" | "manager" | "operator"
```

### Část 6: Admin UI pro přiřazování

**Stránka:** `/admin/users` (existující) — rozšířit

**Aktuální stav:** Zobrazuje profily, členství, tlačítko "Přiřadit k projektu".

**Nový stav:**
1. Tabulka uživatelů: jméno, email, globální role, projekty + role v každém
2. U každého projektu: dropdown `Operátor | Manažer` (mění `project_members.role`)
3. Tlačítko "Přiřadit k projektu" → dialog: výběr projektu + role
4. Tlačítko "Odebrat z projektu"
5. Nový uživatel (bez projektů): řádek s textem "Čeká na přiřazení"

**Server Action rozšíření:**

```typescript
// Nová akce
export async function changeProjectRole(
  profileId: string,
  projectId: string,
  role: 'operator' | 'manager'
) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  revalidatePath("/admin/users");
}

// Upravit inviteOperator → inviteUser
export async function inviteUser(formData: FormData) {
  await requireAdmin();
  const role = formData.get("role") as 'operator' | 'manager';
  // ... zbytek jako dřív, ale s rolí
  await admin.from("project_members").insert({
    project_id: projectId,
    profile_id: newUser.user.id,
    role: role,
  });
}
```

### Část 7: Registrace a přihlášení

**Otevřená registrace:** Kdokoli se zaregistruje (email+heslo, Google OAuth).

Nový uživatel po registraci:
1. `handle_new_user()` trigger vytvoří `profiles` s `role = 'user'`
2. 0 řádků v `project_members`
3. Přihlášení úspěšné, ale po redirect vidí: "Čekáte na přiřazení k projektu. Kontaktujte administrátora."
4. Admin ho vidí v `/admin/users` v sekci "Bez projektu" a přiřadí

**Tato část se překrývá s Task #28 (registrace + Google OAuth).** Plán je:
- Task #28 implementuje registraci a OAuth
- Task #29 (tento) mění role model
- Pořadí: #28 první (registrace funguje s globální rolí), pak #29 (přechod na project roles)
- Alternativně: #29 první, #28 potom (vyžaduje aby registrace rovnou zapisovala `role = 'user'`)

**Doporučení:** Implementovat #29 před #28, protože:
- Registrace potřebuje vědět, jakou roli nový uživatel dostane
- S project roles je odpověď jasná: `user` (bez projektu)
- Bez project roles by registrace musela dát `operator`, což je příliš silné

---

## Pořadí implementace

1. **Migrace 005:** enum, ALTER project_members, handle_new_user trigger
2. **Migrace 005 (pokrač.):** helper funkce (project_role_for, is_project_manager, přepis find_project_admin)
3. **Migrace 005 (pokrač.):** přepis RLS policies
4. **App kód:** project-context.tsx, layout.tsx, app-header, user-menu
5. **App kód:** users.ts actions (changeProjectRole, inviteUser s rolí)
6. **App kód:** admin/users/page.tsx UI (dropdown role)
7. **App kód:** page.tsx redirect pro `role = 'user'` bez projektů
8. **SQL testy:** ověřit RLS pro všechny kombinace (admin, manager, operator, user bez projektu)
9. **Build + lint**

---

## Rizika a poznámky

1. **Zpětná kompatibilita:** Stávající admin account musí zůstat funkční. `profiles.role = 'admin'` je superadmin — nezávisí na project_members.

2. **Manager vs Admin v record_call_outcome:** Outcome `meeting` má `assign_to_admin: true`. S novým modelem to přiřadí managerovi projektu (přes přepsaný `find_project_admin`). To je správně — manager vede konzultace, ne superadmin.

3. **Manager nemůže měnit konfiguraci projektu** (stages, outcomes, custom_fields). To dělá jen superadmin. Pokud se to má změnit, je potřeba dodat `is_project_manager` check i na INSERT/UPDATE policies u konfiguračních tabulek.

4. **Denní report (specifikace):** "e-mail adminovi" → teď "e-mail managerovi projektu". Cílový email se bere z managera, ne z globálního admina.

5. **`user_role` enum:** Přidáváme hodnotu `'user'`, ale staré hodnoty (`'admin'`, `'operator'`) nelze z enumu odebrat v Postgresu. `'operator'` v profiles zůstane jako legacy; nové registrace budou `'user'`. Postupně migrovat stávající operátory.

---

## Hotovo, když

- [ ] Nový uživatel se zaregistruje a vidí "čekáte na přiřazení"
- [ ] Admin přiřadí uživatele k projektu jako operátora → vidí své leady + pool
- [ ] Admin přiřadí uživatele k projektu jako managera → vidí všechny leady, hovory, směny
- [ ] Jeden uživatel je operator v projektu A a manager v projektu B → funguje obojí
- [ ] Manager projektu nemůže vidět data jiného projektu
- [ ] Superadmin vidí vše (beze změny)
- [ ] record_call_outcome s assign_to_admin přiřadí managerovi projektu
- [ ] RLS testy projdou pro admin, manager, operator, user-bez-projektu
- [ ] Build + lint bez chyb
