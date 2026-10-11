# Task #046: QA — Krok 6 (Calling Screen)

**Kontrolor:** KONTROLOR agent
**Datum:** 2026-10-08
**Verze:** 1.0

---

## Soubory v rozsahu kontroly

| Soubor | Typ |
|---|---|
| `src/lib/callscript.ts` | Lib |
| `supabase/migrations/007_queue_shifts_rpcs.sql` | SQL |
| `src/app/actions/queue.ts` | Server action |
| `src/app/actions/leads.ts` | Server action |
| `src/app/actions/calls.ts` | Server action |
| `src/app/actions/shifts.ts` | Server action |
| `src/app/(app)/[projectSlug]/_components/calling-layout.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/callscript-card.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/first-sentence.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/lead-card.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/lead-details-grid.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/history-list.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/objection-chips.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/queue-list.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/shift-bar.tsx` | UI |
| `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx` | UI |
| `src/app/(app)/[projectSlug]/fronta/page.tsx` | Page |

---

## 1. SIMPLIFY — zbytečná složitost, duplikace, mrtvý kód

### 1.1 buildScript voláno dvakrát pro stejný lead (LOW)

`first-sentence.tsx` a `objection-chips.tsx` každý volají `buildScript(...)` samostatně se stejnými daty.
`LeadCard` je renderuje oba — to jsou dva identické výpočty `buildScript()` v rámci jednoho renderu.

**Dopad:** Malý výkon; `buildScript` je pure funkce, výpočet levný. Nevadí pro první verzi, ale mohlo by být sdíleno přes props.

**Rozhodnutí:** Neopravovat, zaznamenat jako technical debt.

### 1.2 `calling-layout.tsx` — `__reloadQueue` window global (LOW)

Parent `CallingLayout` volá reload fronty přes `window.__reloadQueue` (řádek 55-56), což je hacky pattern.
Implementátor ho použil protože `QueueList` a `CallingLayout` jsou oddělené komponenty bez přímého propojení.

**Dopad:** Funguje, ale je to antipattern — window globals jsou těžko testovatelné a lámou se při SSR/HMR.
Alternativa: `useImperativeHandle` / callback prop. Pro tuto verzi akceptovatelné.

**Rozhodnutí:** Poznámka do technical debt, ale neblokuje.

### 1.3 `queue-list.tsx` — `mountedRef` hack (LOW)

```typescript
if (!mountedRef.current) {
  mountedRef.current = true;
  load();
}
```

Tento guard brání dvojitému načtení v React Strict Mode. Je to správný přístup, ale `mountedRef` + `setInterval` dohromady jsou zbytečně složité — mohl by stačit `useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [projectId])`. V Strict Mode ale `load()` by se zavolalo dvakrát při prvním mount.

**Rozhodnutí:** Akceptovat, funguje správně.

---

## 2. DEBUG — potenciální bugy, logické chyby

### 2.1 KRITICKÉ: `get_lead_card` custom_fields WHERE chyba

**Soubor:** `supabase/migrations/007_queue_shifts_rpcs.sql`, řádky 178–184

```sql
WHERE cf.project_id = (v_lead->>'owner_id')::uuid    -- CHYBA: owner_id je UUID operátora, NE project_id
  OR cf.project_id = (
    SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
  );
```

`v_lead->>'owner_id'` je `profiles.id` (UUID operátora), **nikoli** `project_id`.
První podmínka `cf.project_id = owner_id` je tedy logicky nesmyslná — vrátí sloupce projektu, jehož ID náhodně odpovídá UUID operátora (nikdy neplatí v praxi).
Druhá podmínka (`OR`) funkci zachrání — vrátí správné custom fields — ale první větev je mrtvý kód, který navíc může způsobit FP (very unlikely, ale teoreticky).

**Závažnost:** MEDIUM — v praxi fallback OR podmínka vždy projde správně, takže UI funguje. Ale kód je nesprávný.

**Oprava:**
```sql
WHERE cf.project_id = (
  SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
);
```
Odstranit první podmínku zcela.

### 2.2 KRITICKÉ: `get_active_shift` označen STABLE, ale volá `auth.uid()`

**Soubor:** `supabase/migrations/007_queue_shifts_rpcs.sql`, řádek 316

```sql
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

`STABLE` garantuje, že funkce nemodifikuje DB a vrací stejný výsledek pro stejné argumenty v rámci jedné transakce. Jenže `auth.uid()` se mění mezi voláními různých uživatelů, a `STABLE` může v edge cases způsobit cachování výsledku.

Správně by mělo být jen `SECURITY DEFINER` bez `STABLE`, nebo s `VOLATILE` (default).

**Závažnost:** LOW v praxi (Supabase nevyužívá function inlining na úrovni Postgres planner agresivně), ale technicky nesprávné.

**Oprava:** Změnit na `$$ LANGUAGE plpgsql SECURITY DEFINER;` (bez STABLE).

*Poznámka: `get_queue` (řádek 103) má stejný problém — STABLE + `auth.uid()` přes implicitní RLS. Nicméně `get_queue` volá `auth.uid()` jen ve WHERE přes RLS, nikoli explicitně, takže dopad je menší.*

### 2.3 STŘEDNÍ: `fronta/page.tsx` nekontroluje project membership

**Soubor:** `src/app/(app)/[projectSlug]/fronta/page.tsx`, řádky 28–34

```typescript
const { data: project } = await supabase
  .from("projects")
  .select("id, calls_per_hour")
  .eq("slug", projectSlug)
  .single();

if (!project) redirect("/");
```

Stránka načte projekt přes slug bez ověření, zda je přihlášený uživatel členem projektu. Pokud uživatel zná slug cizího projektu, dostane stránku (CallingLayout). RLS na `leads` a `calls` ochrání data, ale:
1. `project.id` a `calls_per_hour` jsou viditelné bez membership check.
2. `lost_reasons` pro cizí projekt se načtou, pokud RLS na `lost_reasons` povoluje SELECT všem autentizovaným.

Porovnej s `layout.tsx`, který dělá membership check a přesměruje. Jenže `fronta/page.tsx` je vnořená pod `layout.tsx` — tedy layout guard **platí** i zde.

**Skutečný dopad:** Layout (`[projectSlug]/layout.tsx`) ověří membership před renderem `fronta/page.tsx`. Pokud layout redirect funguje, stránka je chráněná.

**Závažnost:** LOW (layout guard kryje), ale je dobré přidat explicitní komentář.

### 2.4 NÍZKÉ: `outcome-panel.tsx` — "no_answer" efekt text (dynamický počet pokusů)

**Soubor:** `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx`, řádek 119–121

```typescript
selected === "no_answer"
  ? `Další pokus zítra v jinou denní dobu. Zbývají ${maxAttempts - attemptCount - 1} pokusy.`
```

Gramatická chyba: "Zbývají 1 pokusy" (místo "Zbývá 1 pokus"). Čeština vyžaduje shodu.
Navíc pokud `maxAttempts - attemptCount - 1 <= 0`, text říká "Zbývají -1 pokusy", což je nesmysl.

**Oprava:** Přidat podmínku a správnou češtinu (plurál):
```typescript
const remaining = maxAttempts - attemptCount - 1;
const text = remaining > 0
  ? `Další pokus zítra v jinou denní dobu. Zbývají ${remaining} ${remaining === 1 ? 'pokus' : 'pokusy'}.`
  : 'Toto je poslední pokus. Po zápisu lead přejde na Ztraceno.';
```

### 2.5 NÍZKÉ: `shift-bar.tsx` — reload po start_shift spoléhá na closure

**Soubor:** `src/app/(app)/[projectSlug]/_components/shift-bar.tsx`, řádek 61

```typescript
const reload = () => loadRef.current?.();
```

`handleStart` po `startShift(projectId)` volá `await reload()` — ale `setLoading(true)` je nastaveno před `startShift`, a po `reload()` není `setLoading(false)` garantováno (závisí na `load()` v closure). V praxi funguje, ale loading spinner může zůstat stuck pokud `getActiveShift` hodí výjimku (catch větev nastaví `setLoading(false)` správně). Bez problémů.

---

## 3. REVERSE-CHECK — nesoulad se zadáním (postup-prompty.md + specifikace + plán task-031)

### 3.1 KRITICKÉ: Chybí 2 outcomes — `report` a `defunct`

**Task-031 plán, sekce 10.1** a **task-020-callscript-analysis.md** uvádějí:
- `report` — "Rozbor e-mailem" (z prototype `wants_report`)
- Dle komentáře v task-031 odloženo na Krok 8 / task-026 migrace

**Seed.sql** má 8 outcomes: meeting, offer, deck, later, no_answer, busy, not_interested, wrong_number.
**outcome-panel.tsx** implementuje přesně těchto 8.

Task-031 plán výslovně říká: "Doporučení: přidat do seed v rámci task-026 migrace, v UI se zobrazí automaticky." Tedy `report` a `defunct` jsou záměrně odloženy.

**Závěr:** Toto je záměrné rozhodnutí, **ne chyba v Kroku 6**. Je zaznamenáno jako Task #49.

### 3.2 STŘEDNÍ: Chybí OnboardingWizard a HelpSheet

**Task-031 plán, části 6.1 a 6.2** specifikují:
- `OnboardingWizard` — 4-krokový průvodce při prvním přihlášení
- `HelpSheet` — "?" bottom sheet s tabulkou outcomes

Ani jeden není implementován. Jsou zaznamenány jako Task #47 a Task #48 (pending).

Spec (CLAUDE.md): "Vestavěný návod pro operátorku od prvního dne. Každá obrazovka pro operátora má tlačítko „?" s krátkou nápovědou... Novou obrazovku bez nápovědy nepovažuj za hotovou."

**Závažnost:** STŘEDNÍ — spec je explicitní. Obrazovka fronta je bez nápovědy a bez průvodce. Blocker pro "Hotovo, když" Krok 7.

### 3.3 NÍZKÉ: Chybí round-robin přidělování (assign_new_lead)

**Task-031 plán, část 3.4** specifikuje `assign_new_lead()` funkci a pg_cron SLA check.

Není implementováno v migration 007. Zaznamemenáno jako Task #46 (Krok 7, in_progress).

**Závěr:** Záměrně odloženo, ne chyba Kroku 6.

### 3.4 NÍZKÉ: Chybí bottom navigation na mobilu

**Task-031 plán, část 9.1**: "Bottom nav (fixed): Fronta / Úkoly / Kalendář / Výkon (icons + labels, 12px)"

Prohlídkou `calling-layout.tsx` ani `fronta/page.tsx` není bottom nav implementován. Výška `h-[calc(100vh-56px-78px)]` (řádek 67 calling-layout.tsx) předpokládá **78px** reservovaných pro bottom nav, ale samotný bottom nav komponent nikde není.

**Závažnost:** LOW na desktop (tam není) — ale na mobilu chybí navigace mimo frontu. Uživatel nemůže přejít na Úkoly/Kalendář/Výkon z mobilního view.

### 3.5 NÍZKÉ: `fronta/page.tsx` neobsahuje `export const dynamic`

**Soubor:** `src/app/(app)/[projectSlug]/fronta/page.tsx`, řádek 5

```typescript
export const instant = false;
```

`instant` není platný Next.js export — neexistuje. Možná zamýšleno jako `export const dynamic = "force-dynamic"`, nebo je to překlep. Stránka se renderuje jako `◐ (Partial Prerender)` dle build výstupu, takže Next.js ignoruje `instant`.

Root `page.tsx` má stejný `export const instant = false` (řádek 4).

**Dopad:** Pravděpodobně bez dopadu na funkci (PPR funguje), ale je to mrtvý export.

---

## 4. Lint + Build

```
npm run lint  → 1 warning (scripts/apply-migration-005.mjs, nepoužitá proměnná readFileSync) — nový kód CLEAN
npm run build → Úspěch. 0 chyb. fronta/page.tsx se builduje jako ◐ Partial Prerender.
```

---

## 5. Shrnutí nálezů

| # | Závažnost | Oblast | Popis | Blokuje? |
|---|---|---|---|---|
| 1 | KRITICKÁ | SQL 007 | `get_lead_card` — custom_fields WHERE používá `owner_id` místo `project_id` | ANO |
| 2 | KRITICKÁ | SQL 007 | `get_active_shift` označeno STABLE + používá `auth.uid()` | NE (low risk) |
| 3 | STŘEDNÍ | Spec | Chybí OnboardingWizard + HelpSheet (spec: "novou obrazovku bez nápovědy nepovažuj za hotovou") | ANO (Krok 7) |
| 4 | STŘEDNÍ | UI | `outcome-panel` no_answer — gramatická chyba + záporný počet pokusů | NE |
| 5 | NÍZKÁ | Page | `export const instant = false` — neplatný Next.js export (mrtvý kód) | NE |
| 6 | NÍZKÁ | Mobil | Chybí bottom navigation (78px výška reservována, ale komponenta chybí) | NE (jiný krok) |
| 7 | NÍZKÁ | SQL 007 | `get_queue` označeno STABLE + implicitní auth.uid() přes RLS | NE |

---

## 6. Verdict

**CONDITIONAL PASS** — Krok 6 (calling layout, callscript, server actions) je funkční a builduje bez chyb.

Bloker #1 (custom_fields WHERE chyba) musí být opraven před nasazením — způsobí špatný dotaz na custom fields, i když výsledek bude správný díky OR fallback větvi.

Bloker #3 (OnboardingWizard + HelpSheet) je záměrně odložen na Krok 7 a je sledován jako Task #47 + #48.

**Doporučení:** Implementátor opraví nálezy #1 a #4. Nálezy #2, #5, #6, #7 zaznamenány jako technical debt.
