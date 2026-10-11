# Analýza: Callscript prototyp vs. CRM Zenuly

> Task #22 — planner, 2026-10-08

Porovnání callscript prototypu (`~/Desktop/callscript.ts`, `CALLSCRIPT.md`, `predloha-obrazovky-volani/`) s CRM systémem Zenuly (`seed.sql`, `002_core_tables.sql`, `004_record_call_outcome.sql`, `specifikace-weblyx.md`) a s lead-finder systémem (`docs/lead-finder/SYSTEM.md`, `docs/lead-finder/ZADANI.md`).

**Oprava 2026-10-08:** Doplněna neshoda N9 (outcome "firma nefunguje" ze SYSTEM.md §3.10, chybí v callscriptu i CRM). Ověřeno proti SYSTEM.md §3.8, §3.10, §6 a ZADANI.md §4.

---

## 1. Mapování outcomes

| # | Callscript (key) | Callscript (label) | CRM (key) | CRM (label) | Shoda | Poznámky |
|---|---|---|---|---|---|---|
| 1 | `meeting` | Konzultace | `meeting` | Konzultace | **Ano** | Oba: fáze `meeting_booked`, vlastník = admin. Callscript: "s Jevgenijem"; CRM: generic admin. |
| 2 | `wants_report` | Chce rozbor e-mailem | `deck` | Prezentace | **Částečná** | Callscript odesílá live website audit report. CRM `deck` odesílá prezentaci (ukázky webů z oboru). Jiný obsah, jiný účel — viz neshoda N1. |
| 3 | `callback` | Zavolat později | `later` | Jindy | **Ano** | Rozdíl v klíči, logika shodná. CRM má navíc quick_options a reason_required_after_days. |
| 4 | `no_answer` | Nezvedl | `no_answer` | Nevzal to | **Ano, s rozdíly** | Viz neshoda N2 (max pokusy, retry logika). |
| 5 | `not_interested` | Nemá zájem | `not_interested` | Nemá zájem | **Ano** | Oba: fáze `lost`. CRM přidává recontact_after 6 měsíců. |
| 6 | `wrong_number` | Špatné číslo | `wrong_number` | Špatné číslo | **Ano** | CRM přidává úkol check_contact pro admina. |
| 7 | `do_not_call` | Nevolat | — | — | **Neshoda** | Viz neshoda N3. |
| — | — | — | `offer` | Nabídka | **Chybí v callscriptu** | Viz neshoda N4. |
| — | — | — | `busy` | Obsazeno | **Chybí v callscriptu** | Viz neshoda N5. |
| — | — | — | — | — | **Chybí v obou** | SYSTEM.md §3.10: "firma nefunguje" — vyřazeno, zapíše se do sdílené DB. Viz neshoda N9. |

### Celkem: 5 shodných, 2 chybějící v callscriptu, 1 chybějící v CRM, 1 s jiným obsahem, 1 chybějící v obou (ze SYSTEM.md).

---

## 2. Neshody a řešení

### N1: `wants_report` vs. `deck` — jiný obsah emailu

**Callscript:** Outcome `wants_report` spustí live website audit (`audit(lead.website)`) a odešle HTML report se skóre a bod-po-bodu kontrolou. Consent od volaného je povinný (GDPR). Když web chybí, report se neposílá.

**CRM:** Outcome `deck` posílá prezentaci s ukázkami webů z oboru (template `deck`). Jiný obsah, jiný účel.

**Doporučení:** CRM potřebuje **devátý outcome `report`** (Rozbor e-mailem), který:
- required_inputs: `["email", "consent"]`
- set_stage: `"contacted"`
- create_task: `"send_report"` (task_delay: "0")
- callback_delay: `"2 days"`
- V API route: po zápisu outcome spustit `audit()` a odeslat report emailem
- Stávající `deck` zůstává — je to jiná věc (prezentace/ukázky na přání operátora, ne rozbor webu na základě hovoru)

Alternativně: `deck` přejmenovat/přeúčelovat na rozbor webu. Ale specifikace je jednoznačná — `deck` je "Ukázky webů pro {{obor}}", ne technický audit. Proto doporučuji přidat nový outcome.

### N2: `no_answer` — retry logika

| Parametr | Callscript (store.ts) | CRM (seed.sql + funkce) |
|---|---|---|
| Max pokusů | 3 (`MAX_ATTEMPTS`) | 4 (`projects.max_attempts`) |
| Retry interval | 3 hodiny (`RETRY_AFTER_S`) | Další pracovní den, opačná část dne |
| Inkrement pokusů | Ano (pro VŠECHNY outcomes) | Jen pro `no_answer` (rules.increment_attempt) |
| Auto-lost | Implicitně (žádný výběr po max) | Explicitně (mark_lost_after_max + auto_email) |

**Doporučení:** CRM řešení je lepší (working-hour-aware, konfigurovatelné per-project). Převzít CRM logiku beze změny. Callscript increment pro všechny outcomes je chyba — meeting nebo callback nemá zvyšovat attempt_count.

### N3: `do_not_call` — strukturální rozdíl

**Callscript:** Samostatný outcome `do_not_call` s labelem "Nevolat".

**CRM:** Checkbox `add_to_dnc` na outcome `not_interested` (rules: `"add_to_dnc": "optional"`).

**Doporučení:** CRM řešení je správné podle specifikace. "Nemá zájem" + "Nevolat" checkbox pokrývá use case. Ale CALLSCRIPT.md říká explicitně "Kdo řekne, ať nevoláte, toho zapište jako Nevolat" — musí být jasně viditelný v UI. Řešení:
- Checkbox "Nevolat" na `not_interested` outcome musí být vizuálně výrazný (ne malé zaškrtávátko dole)
- Přidat tooltip: "Klient výslovně řekl, ať nevoláte? Zaškrtněte."
- V onboardingu operátora zdůraznit

### N4: `offer` chybí v callscriptu

**CRM:** `offer` = "Nabídka" — úkol send_offer, callback +3 dny, fáze offer_sent.

**Proč chybí:** Callscript popisuje PRVNÍ kontakt. Nabídka se odesílá až po konzultaci (fáze meeting_done → offer_sent). Operátor ji při prvním hovoru nenabízí — to dělá admin/Jevgenij.

**Doporučení:** Není třeba nic měnit. Outcome `offer` je správně v CRM a bude se používat v pozdějších fázích pipeline. V UI volací obrazovky se zobrazí, jen pokud to pravidla projektu dovolí (outcomes se filtrují per-stage v budoucí implementaci).

### N5: `busy` chybí v callscriptu

**CRM:** `busy` = "Obsazeno" — callback +30 min, nepočítá se jako pokus.

**Proč chybí:** V callscript prototypu operátor asi dával `no_answer` i pro obsazeno. To je problém, protože zvyšuje attempt_count.

**Doporučení:** CRM řešení je lepší. `busy` je potřebný — obsazeno ≠ nezvedl. Přidat do callscript UI.

### N6: Stale assignment (přiřazení leadu)

**Callscript (store.ts):** Lead je přiřazen volajícímu na 30 minut (`STALE_ASSIGNMENT_S`). Po 30 min bez výsledku se vrátí do poolu. `next(caller)` funkce claimuje lead atomicky.

**CRM:** `leads.owner_id` + `leads.next_action_at`. Žádný explicitní stale assignment timeout. Lead patří operátorovi, dokud nezapíše výsledek nebo admin nepřeřadí.

**Doporučení:** CRM má shifts (směny). Stale assignment řešit takto:
- Když operátor ukončí směnu, jeho nepozapsané leady (bez výsledku v aktuální směně) se vrátí do poolu
- Denně v 18:30 (po konci pracovní doby): leady přiřazené operátorovi, který dnes neměl směnu, se vrátí do poolu
- Neimplementovat 30min timeout — je příliš agresivní pro CRM s více fázemi

### N7: Telegram notifikace

**Callscript (api-route.ts):** Při `wants_report` nebo `meeting` odešle Telegram zprávu + admin email.

**CRM:** Žádná Telegram integrace v plánu.

**Doporučení:** Přidat Telegram notifikaci do CRM jako volitelnou konfiguraci v `projects` tabulce:
- `projects.telegram_chat_id` (nullable)
- `projects.telegram_bot_token` (nullable, encrypted)
- Když jsou vyplněné, odeslat notifikaci při outcome kde `rules.notify_admin: true`
- Implementovat až v pozdějším kroku (ne blokující)

### N8: Consent pro report email (GDPR)

**Callscript (api-route.ts):** Implicitní consent — operátor zvolí `wants_report` jen když volaný výslovně řekl ano. V CALLSCRIPT.md: "Rozbor smíte poslat jen tomu, kdo výslovně řekne ano."

**CRM:** Žádný explicitní consent field.

**Doporučení:** Pro nový outcome `report` přidat `required_inputs: ["email", "consent"]`. V UI: checkbox "Klient výslovně souhlasil s odesláním rozboru" — bez zaškrtnutí nelze outcome zapsat. Audit log zaznamená consent.

### N9: "Firma nefunguje" — chybí v callscriptu i CRM

**SYSTEM.md §3.10:** Outcome "firma nefunguje" — vyřazeno, zapíše se do sdílené databáze pro všechny projekty. Toto je výsledek hovoru, ne výsledek prověřování webu.

**Callscript prototype:** Nemá tento outcome.

**CRM seed.sql:** Nemá tento outcome.

**Doporučení:** Přidat outcome `defunct` (Firma nefunguje), skupina end, fáze lost. V aplikační vrstvě: zapsat do sdílené tabulky firem (SYSTEM.md §6 "firmy"), aby se při příštím hledání nezpracovávala. SQL v task-026-findings-migration.sql.

---

## 3. buildScript() — napojení na CRM data

### Současný stav

```typescript
// callscript.ts
buildScript(lead: { company: string; website: string; reasons: string }, callerName: string)
```

`reasons` je pipe-delimited string z lead-finderu: `"nemá web|bez HTTPS|PageSpeed mobil 31/100"`. Funkce `reasonsFor(findings)` matchuje 11 regex vzorů a vrací max 2 `{say, impact}` páry.

### CRM lead data

```sql
-- leads table
company     text NOT NULL,
website     text,
hook_text   text,      -- "proč voláme" (z lead-finderu)
hook_source text,      -- zdroj háčku (audit, import, manual)
custom_data jsonb,     -- per-project custom fields
```

### Problém

CRM lead nemá `reasons` string. Má `hook_text` (lidsky čitelný text) a `hook_source` (odkud přišel). Lead-finder pipeline (ZADANI.md bod 4.9) generuje `callReason` a `talkingPoints` — ty se uloží do `hook_text`.

### Navrhované řešení

**A) Přidat `findings` pole do leads:**

```sql
ALTER TABLE leads ADD COLUMN findings text;
```

Při importu z lead-finderu se surový findings string (pipe-delimited) uloží do `findings`. Funkce `buildScript()` ho použije beze změny.

`hook_text` zůstane jako lidsky čitelný důvod hovoru (pro operátora, který nečte kód).

**B) Adaptér v TypeScript:**

```typescript
// src/lib/calls/script.ts

import { reasonsFor, buildScript as _buildScript } from './callscript';
import type { Lead } from '@/types/lead';

export function buildCallScript(lead: Lead, callerName: string) {
  return _buildScript(
    {
      company: lead.company,
      website: lead.website ?? '',
      reasons: lead.findings ?? lead.hook_text ?? '',
    },
    callerName
  );
}
```

**Doporučení:** Varianta A+B. Přidat `findings` sloupec, uložit surová data z lead-finderu, a adaptér mapuje CRM lead na callscript vstup. `hook_text` je lidský překlad pro kartu, `findings` je strojový vstup pro script.

### reasonsFor() vzory vs. lead-finder

| Vzor v callscript.ts | Kde vzniká v lead-finderu | Zdroj |
|---|---|---|
| `nemá web` | `inspectSite` → stav "nemá" | `inspect.ts` |
| `jen profil na sociální síti` | `inspectSite` → stav "jen profil" | `inspect.ts` |
| `web nefunguje` | `inspectSite` → stav "nefunguje" | `inspect.ts` |
| `není responzivní` | `datedness` → absence viewport meta | `inspect.ts` |
| `bez HTTPS` | `inspectSite` → kontrola protocol | `inspect.ts` |
| `patička © YYYY` | `datedness` → regex na footer | `inspect.ts` |
| `neměněno od YYYY` | `datedness` → Last-Modified/meta | `inspect.ts` |
| `PageSpeed mobil NN/100` | `verify` → PageSpeed API (zatím vypnuté) | `kvalita.mjs` |
| `starý WordPress/Joomla` | `datedness` → meta generator | `inspect.ts` |
| `Flash/zastaralé HTML/...` | `datedness` → detekce starých technologií | `inspect.ts` |
| `chybí OG tagy` | `datedness` → kontrola OG meta | `inspect.ts` |

**Shoda:** Všech 11 vzorů odpovídá výstupům z `inspect.ts` / `kvalita.mjs`. Formát findings stringu je konzistentní. Funkci `reasonsFor()` převzít beze změny.

---

## 4. UI (page.tsx) — co převzít, co přepsat

### Převzít 1:1

| Prvek | Důvod |
|---|---|
| Layout volací obrazovky | Osvědčený single-page design pro callcentrum |
| Stats tiles (K zavolání, Zavolat později, Nezvedli, Zájem, Moje hovory dnes) | Odpovídá specifikaci (denní report) |
| Outcome buttons s klávesovými zkratkami | Specifikace definuje shortcuts 1-8 |
| Script panel (kroky, námitky, pravidla) | Přímý výstup `buildScript()` |
| Note textarea | Povinné po každém hovoru |
| Email input s validací | Pro `meeting`, `deck`, `report` |

### Upravit

| Prvek | Původní | CRM verze | Důvod |
|---|---|---|---|
| Auth | `useAdminAuth()` custom | Supabase Auth + `createClient()` | Jiný auth systém |
| Data fetch | `fetch('/api/admin/calls')` | Server Actions nebo Supabase RPC | Server-first architecture |
| CSS vars | `--a-brand`, `--a-ink`, `--a-muted`, `--a-border`, `--a-bg` | `--color-accent`, `--color-ink`, `--color-muted`, `--color-line`, `--color-bg` | Design tokeny z `design.md` |
| Outcome buttons | 7 outcomes hardcoded | 8-9 outcomes z DB (`outcomes` tabulka) | Outcomes jsou konfigurace, ne kód |
| Lead assignment | `next(caller)` → API → Turso | `leads` queue query → Supabase | RLS + owner_id |
| CSV import | Inline v API route | Krok 5 import wizard (task-019-plan) | Jiný import flow |

### Přepsat

| Prvek | Důvod |
|---|---|
| `store.ts` (celý) | Turso → Supabase, SQLite → Postgres, flat table → relační model |
| `api-route.ts` (celý) | Custom auth → Supabase, inline audit → Edge Function, Telegram → konfigurovatelný |
| Report sending | Inline `audit()` → task `send_report` zpracovaný na pozadí |

---

## 5. store.ts logika — detailní porovnání

### Fronta a přiřazení

| Aspekt | Callscript store.ts | CRM (specifikace + DB) |
|---|---|---|
| Datová struktura | Flat table `call_leads` | Relační: `leads` + `calls` + `outcomes` + `stages` |
| Přiřazení | `assigned_to` text (jméno) | `owner_id` uuid (FK profiles) |
| Stale timeout | 30 min | Směna-based (viz N6) |
| Fronta řazení | assigned first → callbacks → new → score | propadlé callbacky → SLA nové → callbacky → úkoly |
| Duplicity | `phone_key` unique | `phone` unique per project (WHERE is_active) |
| Max leadů | Neomezeno | 80 per operátor (`projects.max_leads`) |
| Import | CSV inline | 3-step wizard (Krok 5) |
| DNC | Žádný | `do_not_call` tabulka s project scope |

### Klíčové rozdíly v logice

1. **Attempt increment:** Callscript zvyšuje `attempts` pro KAŽDÝ outcome. CRM jen pro `no_answer`. CRM je správně.
2. **Phone normalization:** Callscript: strip non-digits, remove +420. CRM: E.164 format (+420...). CRM je správně (mezinárodní kompatibilita).
3. **ID generation:** Callscript: `call_${timestamp}_${index}_${random}`. CRM: UUID v4.
4. **Timestamps:** Callscript: unix epoch (integer). CRM: timestamptz.

---

## 6. Bezpečnostní rizika v prototypu

| Riziko | Kde | Závažnost | CRM řešení |
|---|---|---|---|
| Caller identifikace jménem (ne auth tokenem) | store.ts `next(caller)` | Střední | Supabase Auth `auth.uid()` |
| SQL injection v template literals | store.ts `STALE_ASSIGNMENT_S` v SQL | Nízká (constants) | Parametrized queries |
| Žádný rate limiting | api-route.ts | Střední | Supabase RLS + proxy.ts rate limit |
| Report email bez DKIM/SPF ověření | api-route.ts `sendEmail` | Nízká | Resend handles |
| Admin email hardcoded | api-route.ts `EMAIL_CONFIG.adminEmail` | Nízká | `projects` config |

---

## 7. Souhrnná doporučení

### A) Převzít beze změny

1. **`callscript.ts`** — `buildScript()` a `reasonsFor()` funkce. Zkopírovat do `src/lib/calls/callscript.ts`. Přidat adaptér `buildCallScript()` pro CRM lead typ.
2. **`CALLSCRIPT.md`** — Scénář hovoru, námitky, pravidla. Převzít jako obsah nápovědy operátora (tlačítko "?" na volací obrazovce).
3. **REASONS pattern matching** — 11 vzorů sedí s lead-finder výstupy.

### B) Upravit

1. **Outcomes:** Přidat outcome `report` (Rozbor e-mailem) s consent checkboxem. Přidat outcome `defunct` (Firma nefunguje) ze SYSTEM.md §3.10. Stávající `deck` nechat pro prezentaci.
2. **UI layout:** Převzít design, přehodit na Supabase + Server Actions + CRM design tokeny.
3. **Stats tiles:** Doplnit o metriky ze specifikace (hovory/h, dovolatelnost).
4. **Leads tabulka:** Přidat sloupec `findings text` pro surový findings string z lead-finderu (hook_text a hook_source už existují).

### C) Přepsat

1. **`store.ts`** — Celý. Nahradit Supabase queries + `record_call_outcome()` RPC.
2. **`api-route.ts`** — Celý. Nahradit Server Actions + Supabase RPC. Report sending jako async task, ne inline.
3. **Lead assignment** — Nahradit CRM frontu (specifikace bod "Fronta Volat teď") místo simple `next()`.

### D) Chybějící v CRM (přidat)

1. `findings` sloupec v `leads` tabulce (hook_text, hook_source už existují)
2. Outcome `report` (Rozbor e-mailem) s consent pravidly
3. Outcome `defunct` (Firma nefunguje) ze SYSTEM.md §3.10
4. `send_report` v task_type enumu, `lead_finder` v phone_source enumu
5. Consent tracking pro email report
6. Telegram notifikace (volitelná, pozdější krok)
7. `busy` outcome v callscript UI
8. DNC rozšířit na email + cross-project (SYSTEM.md §3.10: "i pro e-mail", "pro všechny projekty")

---

## 8. Kompletní migrace

Viz `.claude-context/tasks/task-026-findings-migration.sql` — obsahuje:
1. `ALTER TABLE leads ADD COLUMN findings text`
2. `ALTER TYPE task_type ADD VALUE 'send_report'`
3. `ALTER TYPE phone_source ADD VALUE 'lead_finder'`
4. `INSERT outcome 'report'` (Rozbor e-mailem)
5. `INSERT outcome 'defunct'` (Firma nefunguje) + lost_reason

Každý krok je zdůvodněný odkazem na SYSTEM.md/ZADANI.md.

---

## 9. Diagram: outcome flow callscript → CRM

```
Callscript outcome     CRM outcome        CRM action
─────────────────      ───────────        ──────────
meeting          ───→  meeting            stage→meeting_booked, owner→admin, calendar
wants_report     ───→  report (NEW)       stage→contacted, task send_report, callback +2d
callback         ───→  later              stage→contacted, callback custom
no_answer        ───→  no_answer          attempt+1, callback opposite part
(N/A)            ───→  busy (ADD to UI)   callback +30min
not_interested   ───→  not_interested     stage→lost, DNC optional
do_not_call      ───→  not_interested     stage→lost, DNC checked (!)
wrong_number     ───→  wrong_number       stage→lost, task check_contact
(N/A)            ───→  defunct (NEW)      stage→lost, mark in shared DB (SYSTEM.md §3.10)
(N/A)            ───→  offer              (post-meeting, not first call)
(N/A)            ───→  deck               (presentation, separate from report)
```
