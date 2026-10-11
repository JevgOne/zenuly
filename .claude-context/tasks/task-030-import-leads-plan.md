# Krok 5: Import leadů + lead-finder integrace — aktualizovaný plán

> Task #30 — planner, 2026-10-08
> Nahrazuje starý plán task-019-plan.md

## Kontext a vstupní dokumenty

- `docs/postup-prompty.md` Krok 5: "Import leadů z CSV a Excelu pro admina"
- `docs/specifikace-weblyx.md`: pole leadu, DNC pravidla
- `docs/lead-finder/SYSTEM.md` §3.6-3.8: kvalifikace, známka, karta firmy
- `docs/lead-finder/SYSTEM.md` §6: datový model (firmy × leady)
- `docs/lead-finder/ZADANI.md` §4: 10 kroků zpracování firmy
- `task-029-project-roles-plan.md`: project-level role (admin/manager importuje)
- `task-026-findings-migration.sql`: `findings` sloupec, `phone_source = 'lead_finder'`
- `task-020-callscript-analysis.md`: callscript.ts potřebuje `findings` pro `reasonsFor()`

## Co se změnilo oproti starému plánu (task-019)

| Aspekt | Starý plán (task-019) | Tento plán |
|---|---|---|
| Kdo importuje | jen admin | admin NEBO manager projektu (task-029) |
| Zdroj dat | jen CSV/Excel | CSV/Excel + lead-finder pipeline |
| Pole leadu | bez findings/hook | + `findings`, `hook_text`, `hook_source` |
| phone_source | 4 hodnoty | + `lead_finder` |
| Auth check | `profile.role === 'admin'` | `is_project_manager(projectId)` |
| Datový model | jen `leads` tabulka | `leads` + budoucí `companies` (viz pozn.) |

**Pozn. k datovému modelu:** SYSTEM.md §6 definuje sdílenou tabulku `firmy` (companies) a per-project tabulku `leady` (leads). Aktuální CRM má jen `leads`. Sdílená tabulka firem je potřeba pro lead-finder pipeline (Krok 5 stavby ji ještě nestaví — to patří do pozdějšího kroku, kdy se staví lead-finder do CRM). Import v Kroku 5 pracuje přímo s `leads` tabulkou. Pole, která budou v budoucnu v `companies` (web_status, grade, ares_data), se zatím ukládají do `leads.custom_data` a `leads.findings`.

---

## Dva režimy importu

### A) Ruční import (CSV/Excel)

Admin nebo manager nahraje soubor, namapuje sloupce, importuje. Toto je Krok 5 z `docs/postup-prompty.md`.

### B) Lead-finder import (programatický)

Lead-finder pipeline (osm.ts → inspect.ts → kvalita.mjs) produkuje data, která se importují do projektu. Toto se staví později (když bude lead-finder integrovaný do CRM), ale import action musí být připravený přijmout data z obou zdrojů.

**V Kroku 5 se implementuje jen režim A.** Režim B se implementuje, až bude lead-finder pipeline hotový. Server Action ale bude navržený tak, aby podporoval oba — tzn. přijme pole `findings`, `hook_text`, `hook_source`, `phone_source = 'lead_finder'`.

---

## Implementační plán

### Část 1: Utility funkce

#### 1.1 `src/lib/utils/phone.ts`

Převzít beze změny ze starého plánu (task-019). Funkce:
- `normalizePhone(input: string): string | null` — normalizace do E.164
- `isValidE164(phone: string): boolean` — validace

#### 1.2 `src/lib/utils/parse-file.ts`

Převzít beze změny ze starého plánu. Parsování CSV/Excel na klientovi přes SheetJS.

Závislost: `npm install xlsx`

#### 1.3 `src/lib/utils/auto-map-columns.ts`

Rozšířit alias tabulku z task-019 o nová pole:

```typescript
const FIELD_ALIASES: Record<string, string[]> = {
  // ... stávající z task-019 ...
  findings:     ['findings', 'nálezy', 'nalezy', 'rozbor', 'důvody', 'duvody', 'reasons'],
  hook_text:    ['háček', 'hacek', 'hook', 'proč voláme', 'proc volame', 'důvod hovoru', 'duvod hovoru'],
  hook_source:  ['zdroj háčku', 'zdroj hacku', 'hook source'],
}
```

### Část 2: Server Action

#### 2.1 `src/app/actions/import-leads.ts`

Přepsat oproti task-019 s těmito změnami:

**Auth check:**
```typescript
// STARÉ (task-019):
if (profile?.role !== "admin") throw new Error("Forbidden");

// NOVÉ (task-029):
async function requireImportAccess(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Superadmin can always import
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") return user;

  // Manager of this project can import
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("project_id", projectId)
    .single();
  if (membership?.role !== "manager") throw new Error("Forbidden");
  return user;
}
```

**ImportRow typ — rozšířený:**
```typescript
type ImportRow = {
  company: string
  phone: string
  phone_source: string        // 'web_firmy' | 'profil_firmy' | 'databaze' | 'poptavka' | 'lead_finder'
  contact_person?: string
  email?: string
  website?: string
  city?: string
  ico?: string
  lead_source?: string
  priority?: number
  // Nová pole z lead-finderu:
  findings?: string           // pipe-delimited findings string
  hook_text?: string          // "proč voláme" — jedna věta
  hook_source?: string        // 'lead_finder' | 'manual' | 'import'
}
```

**Validace phone_source — rozšířená:**
```typescript
const validSources = ['web_firmy', 'profil_firmy', 'databaze', 'poptavka', 'lead_finder']
```

**Insert — rozšířený o nová pole:**
```typescript
toInsert.push({
  // ... stávající pole z task-019 ...
  findings: row.findings?.trim() || null,
  hook_text: row.hook_text?.trim() || null,
  hook_source: row.hook_source?.trim() || (row.findings ? 'import' : null),
})
```

**Zbytek logiky (DNC check, dedup, batch insert, audit) zůstává beze změny.**

### Část 3: UI komponenty

#### 3.1 Route `src/app/(app)/[projectSlug]/import/page.tsx`

Server Component. Auth guard:

```typescript
// STARÉ: jen admin
// NOVÉ: admin NEBO manager projektu

const { data: profile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();

let canImport = profile?.role === "admin";

if (!canImport) {
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("project_id", project.id)
    .single();
  canImport = membership?.role === "manager";
}

if (!canImport) notFound();
```

#### 3.2 Import wizard — `import-wizard.tsx`

Převzít beze změny z task-019. Stavový automat: `upload → mapping → processing → result`.

#### 3.3 File upload — `file-upload.tsx`

Převzít beze změny z task-019.

#### 3.4 Column mapper — `column-mapper.tsx`

Rozšířit o volitelná pole:
- `findings` — "Nálezy (volitelné)"
- `hook_text` — "Důvod hovoru (volitelné)"

V UI: rozdělit pole na dvě skupiny:
1. **Povinná:** firma, telefon, zdroj čísla
2. **Volitelná:** kontakt, email, web, město, IČO, zdroj leadu, priorita, nálezy, důvod hovoru

Dropdown pro zdroj čísla: přidat `lead_finder` s labelem "Lead-finder (automaticky)" ke stávajícím 4 hodnotám.

#### 3.5 Import result — `import-result.tsx`

Převzít beze změny z task-019.

### Část 4: Navigace

Přidat odkaz na import do navigace:
- **Admin:** vidí v hlavním menu
- **Manager:** vidí v hlavním menu svého projektu
- **Operator:** nevidí

Implementace: v `app-header.tsx` nebo `bottom-nav.tsx`, podmíněno rolí z `ProjectContext.userRole`.

### Část 5: Migrace (závislosti)

Tento krok PŘEDPOKLÁDÁ, že tyto migrace jsou už aplikované:

1. **005_project_roles.sql** (task-029) — `project_members.role`, `project_role` enum, `is_project_manager()`, rozšířené RLS
2. **005b_findings.sql** (task-026) — `leads.findings`, `phone_source += 'lead_finder'`, `task_type += 'send_report'`

Pokud ještě nejsou, implementátor musí nejdřív aplikovat migrace z task-029 a task-026.

---

## Pořadí implementace

1. `src/lib/utils/phone.ts` — normalizePhone, isValidE164
2. `src/lib/utils/parse-file.ts` — parsování CSV/Excel (`npm install xlsx`)
3. `src/lib/utils/auto-map-columns.ts` — automatické mapování (rozšířené aliasy)
4. `src/app/actions/import-leads.ts` — Server Action (rozšířený auth + nová pole)
5. `src/app/(app)/[projectSlug]/import/page.tsx` — route (admin/manager guard)
6. `src/app/(app)/[projectSlug]/import/import-wizard.tsx` — stavový automat
7. `src/app/(app)/[projectSlug]/import/file-upload.tsx` — drag & drop
8. `src/app/(app)/[projectSlug]/import/column-mapper.tsx` — mapování (rozšířené)
9. `src/app/(app)/[projectSlug]/import/import-result.tsx` — souhrn
10. Navigace — odkaz na import pro admin/manager
11. Ověření — import 100 řádků, duplicity + DNC

---

## Kritérium hotovo

Převzato z `docs/postup-prompty.md` Krok 5:

> Import 100 testovacích řádků projde a duplicity i Nevolat se správně odfiltrují.

Rozšířeno:
- [ ] Import 100 testovacích řádků projde
- [ ] Duplicity se správně odfiltrují (telefon i email v rámci projektu)
- [ ] Čísla ze seznamu Nevolat se odmítnou
- [ ] Telefony normalizované do E.164
- [ ] Souhrn ukazuje správné počty
- [ ] Import funguje pro admin I manager projektu
- [ ] Operator nemá přístup k importu
- [ ] CSV s lead-finder daty (findings, hook_text) se importují správně
- [ ] `npm run lint` a `npm run build` prochází

---

## Důležité poznámky pro implementátora

1. **Auth:** Import je pro admin (superadmin) a manager projektu. Ověřit roli v Server Action I v page.tsx. Použít `is_project_manager()` (z task-029) nebo ekvivalent v app kódu.

2. **Parsování na klientovi:** CSV/Excel se parsuje v prohlížeči přes SheetJS. Na server se posílá strukturovaná data (pole objektů), NE raw soubor.

3. **Kódování:** České CSV často Windows-1250. SheetJS zvládne `codepage: 1250`.

4. **Dávkový insert:** Vkládat po 500 řádcích. Supabase má limit na POST request.

5. **Duplicity UVNITŘ importu:** Pokud import obsahuje 2 řádky se stejným telefonem, druhý se odfiltruje.

6. **next_action_at:** Každý importovaný lead dostane `next_action_at = now()` — je okamžitě k dispozici ve frontě. `next_action_type = 'callback'`.

7. **Fáze:** Všechny importované leady jdou do fáze `new`.

8. **Round-robin přiřazení:** Import NEPŘIŘAZUJE leady operátorům — jdou do poolu (`owner_id = NULL`). Přiřazení řeší round-robin v Kroku 7.

9. **Audit log:** Každý import zapíše jeden audit záznam s počty.

10. **Přístupnost:** Drag & drop zóna musí být přístupná i klávesnicí (input type=file jako fallback). Dotykové cíle min. 44 px.

11. **findings pole:** Při ručním importu (CSV) bude většinou prázdné. Při importu z lead-finderu (budoucí režim B) bude vyplněné. Server Action musí přijmout obojí.

12. **hook_source:** Pokud řádek má `findings` ale ne `hook_source`, automaticky nastavit `hook_source = 'import'`.

13. **Závislost na migracích:** Krok 5 vyžaduje migrace z task-029 (project roles) a task-026 (findings + phone_source). Pokud migrace ještě nejsou v DB, import selže na neznámém sloupci `findings` nebo enumu `lead_finder`. Implementátor musí nejdřív aplikovat migrace.
