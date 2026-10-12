# Audit rolí — Task #53

Datum: 2026-10-12
Kontrolor: QA agent

---

## Schéma rolí (správné)

```
profiles.role:          "admin" | "operator"
project_members.role:   "manager" | "operator"
effectiveRole (layout): "admin" | "manager" | "operator"
```

`effectiveRole` v `layout.tsx:79-82`:
```typescript
const effectiveRole = profile.role === "admin"
  ? "admin"
  : (project.projectRole as "manager" | "operator") ?? "operator";
```
Tato logika je **správná** — globální admin → "admin", jinak bere project-level roli.

---

## Nalezené bugy — přehled

### BUG 1: KRITICKÝ — dashboard, pipeline, kontakty, report, export-hodin, kontakty/[leadId]
**Chybná kontrola `profile.role !== "manager"`**

`profiles.role` NIKDY neobsahuje "manager" — manager existuje pouze v `project_members.role`. Kontrola `profile.role !== "manager"` je vždy true → manažeři jsou **vždy blokováni** z těchto stránek.

**Postižené soubory:**

| Soubor | Řádek | Chybný kód |
|--------|-------|-----------|
| `dashboard/page.tsx` | 25 | `profile.role !== "admin" && profile.role !== "manager"` |
| `pipeline/page.tsx` | 25 | `profile.role !== "admin" && profile.role !== "manager"` |
| `kontakty/page.tsx` | 25 | `profile.role !== "admin" && profile.role !== "manager"` |
| `report/page.tsx` | 29 | `profile.role !== "admin" && profile.role !== "manager"` |
| `export-hodin/page.tsx` | 27 | `profile.role !== "admin" && profile.role !== "manager"` |

**Správný fix pro všech 5 stránek** — přidat membership check:
```typescript
const { data: profile } = await supabase
  .from("profiles").select("role").eq("id", user.id).single();
if (!profile) redirect("/login");

// Admin: vždy přístup
// Manager: přístup přes project_members
if (profile.role !== "admin") {
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (membership?.role !== "manager") redirect(`/${projectSlug}/fronta`);
}
```

---

### BUG 2: KRITICKÝ — `[projectSlug]/page.tsx:25` (root redirect)

```typescript
if (profile?.role === "admin" || profile?.role === "manager") {
  redirect(`/${projectSlug}/dashboard`);
}
```

`profile.role` nikdy není "manager" → manažer není přesměrován na dashboard, místo toho jde na `/fronta`.

**Správný fix:**
```typescript
if (profile?.role === "admin") {
  redirect(`/${projectSlug}/dashboard`);
}
// check project-level manager
const { data: membership } = await supabase
  .from("project_members")
  .select("role")
  .eq("profile_id", user.id)
  .single();
if (membership?.role === "manager") {
  redirect(`/${projectSlug}/dashboard`);
}
redirect(`/${projectSlug}/fronta`);
```

---

### BUG 3: STŘEDNÍ — `settings/page.tsx:59`

```typescript
{(profile.role === "admin" || profile.role === "manager") && (
  <CalendarSection ... />
)}
```

Manažeři nevidí CalendarSection — `profile.role` není "manager".

**Fix:** Přidat membership check v settings page, nebo CalendarSection zobrazit všem (operátoři taky mohou mít kalendář) — záleží na byznys rozhodnutí.

Alternativně: jednoduché řešení — CalendarSection zobrazit **všem přihlášeným** (operators ji taky potřebují pro konzultace).

---

### BUG 4: NÍZKÁ — `app/page.tsx:29` (root home)

```typescript
const isManager = (memberships ?? []).some((m) => m.role === "manager");
// ...
redirect(isAdmin || isManager ? `/${slug}/dashboard` : `/${slug}`);
```

Tento soubor je **správný** — `isManager` čte z `project_members.role`, ne `profiles.role`. ✅

---

### BUG 5: NÍZKÁ — `import/page.tsx:38-47`

```typescript
let canImport = profile.role === "admin";
if (!canImport) {
  const { data: membership } = ...
  canImport = membership?.role === "manager";
}
```

Tento pattern je **správný** — dvoustupňový check, admin z profiles, manager z project_members. ✅

---

### BUG 6: NÍZKÁ — `kontakty/[leadId]/page.tsx:53-62`

```typescript
if (profile.role !== "admin") {
  const { data: membership } = ...
  if (!membership || membership.role !== "manager") {
    redirect(`/${projectSlug}/fronta`);
  }
}
```

Tento pattern je **správný** — vzor pro ostatní stránky. ✅

---

## Layout.tsx effectiveRole — hodnocení

```typescript
// layout.tsx:79-82
const effectiveRole: "admin" | "manager" | "operator" =
  profile.role === "admin"
    ? "admin"
    : (project.projectRole as "manager" | "operator") ?? "operator";
```

**Správný** — `project.projectRole` pochází z `project_members.role` (načteno na řádku 36-37). ✅

Navigace (app-header, bottom-nav) dostávají `effectiveRole` — správně rozlišují admin/manager/operator. ✅

---

## Navigace — hodnocení

**app-header.tsx:40:** `role === "admin" || role === "manager"` — dostává `effectiveRole` → ✅
**bottom-nav.tsx:137:** `role === "admin" || role === "manager"` — dostává `effectiveRole` → ✅

---

## Souhrn bugů

| # | Soubor | Problém | Závažnost |
|---|--------|---------|-----------|
| 1 | dashboard/page.tsx:25 | `profile.role !== "manager"` — nikdy pravda | KRITICKÁ |
| 1 | pipeline/page.tsx:25 | totéž | KRITICKÁ |
| 1 | kontakty/page.tsx:25 | totéž | KRITICKÁ |
| 1 | report/page.tsx:29 | totéž | KRITICKÁ |
| 1 | export-hodin/page.tsx:27 | totéž | KRITICKÁ |
| 2 | [projectSlug]/page.tsx:25 | `profile.role === "manager"` — nikdy pravda | KRITICKÁ |
| 3 | settings/page.tsx:59 | `profile.role === "manager"` — CalendarSection skrytá pro manažery | STŘEDNÍ |

**Správné (reference pattern):**
- `import/page.tsx` — dvoustupňový check ✅
- `kontakty/[leadId]/page.tsx` — dvoustupňový check ✅
- `layout.tsx` effectiveRole ✅
- `app/page.tsx` root home ✅

---

---

## RLS audit — supabase/migrations/

### Helpery (002_core_tables.sql)

```sql
auth_user_role() → SELECT role FROM profiles WHERE id = auth.uid()
is_project_member(p_project_id) → EXISTS (SELECT 1 FROM project_members WHERE ...)
```

`auth_user_role()` vrací `profiles.role` = "admin" | "operator" — správně, nikdy "manager". ✅

### 003_rls_policies.sql — základní RLS

**leads:**
- `leads_select_operator`: `is_project_member(project_id) AND (owner_id = auth.uid() OR owner_id IS NULL)` — operátor vidí jen vlastní nebo volné leady ✅
- `leads_update_operator`: `is_project_member(project_id) AND owner_id = auth.uid()` — update jen vlastních ✅
- `leads_claim_pool`: claim volného leadu (owner_id IS NULL → owner_id = auth.uid()) ✅

**calls:** operátor vidí jen vlastní hovory ✅

**do_not_call:** člen projektu může přidat, smazat jen admin ✅

**audit_log `al_insert`:** `WITH CHECK (true)` — **POZOR:** každý autentizovaný uživatel může insertovat do audit_logu. Toto je záměrné (SECURITY DEFINER funkce `record_call_outcome` to píše), ale INSERT policy by měla být omezenější nebo spoléhat jen na SECURITY DEFINER funkce. Nízká závažnost — exploitace vyžaduje autentizaci.

### 005_project_roles.sql — manager vrstva

**`user_role` enum rozšířen o 'user'** — registry uživatel bez projektu. ✅

**`is_project_manager(p_project_id)`:**
```sql
auth_user_role() = 'admin' OR EXISTS (SELECT 1 FROM project_members WHERE role = 'manager' ...)
```
Správně kombinuje globálního admina i project-level manažera. ✅

**`find_project_admin(p_project_id)`** — preferuje project manager nad global admin. Použito v `record_call_outcome`. ✅

**Manažerské RLS policies:**
- `leads_select_manager`: `is_project_manager(project_id)` — manažer vidí všechny leady projektu ✅
- `calls_select_manager`, `tasks_select_manager`, `shifts_select_manager`, `al_select_manager` — manažer vidí vše v projektu ✅
- `pm_insert_manager`, `pm_delete_manager` — manažer může spravovat členy (ale ne sebe odebrat) ✅

**NESHODA s aplikační vrstvou:** RLS správně dává manažerům přístup k leadům/calls/tasks — ale aplikační kód (5 stránek) je blokuje na úrovni Next.js page. Tzn. databáze by data vydala, ale UI je nepustí dál.

### 008_fix_rls_own_membership.sql

**`pm_select_own`:** `profile_id = auth.uid()` — uživatel vidí vlastní membership row. ✅

**`profiles_select_project_member`:** member vidí profily svých kolegů (join přes project_members). ✅ Potřebné pro zobrazení jmen v UI.

---

## RLS souhrn

| Oblast | Stav | Poznámka |
|--------|------|----------|
| `auth_user_role()` helper | ✅ | profiles.role, nikdy "manager" |
| `is_project_manager()` helper | ✅ | admin OR project manager |
| leads — manažer vidí vše | ✅ | policies 005 |
| calls — manažer vidí vše | ✅ | policies 005 |
| tasks — manažer vidí vše | ✅ | policies 005 |
| shifts — manažer vidí vše | ✅ | policies 005 |
| audit_log INSERT | ⚠️ | `WITH CHECK (true)` — každý auth user; nízká závažnost |
| project_members správa | ✅ | manager může add/remove, ne sebe |
| profiles viditelnost kolegů | ✅ | 008 fix |

**RLS je celkově správné.** Manažerská vrstva je dobře implementována v databázi (`is_project_manager`). Problém je **výhradně v aplikační vrstvě** (Next.js pages), která nesprávně kontroluje `profiles.role` místo `project_members.role`.

---

## Doporučení pro implementátora

**Všude kde se píše `profile.role !== "manager"` nebo `profile.role === "manager"`:**
→ Vyměnit za dvoustupňový check (vzor z `kontakty/[leadId]/page.tsx:53-62` nebo `import/page.tsx:38-47`).

**5 stránek s identickým bugem** (dashboard, pipeline, kontakty, report, export-hodin) doporučuji opravit najednou jedním commitem — pattern je identický.

**RLS nevyžaduje žádné změny** — databázová vrstva je správná. Opravy jsou pouze v Next.js page souborech.
