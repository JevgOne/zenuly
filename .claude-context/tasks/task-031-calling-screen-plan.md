# Task #31: Krok 6 — Obrazovka volání (callscript + calling UI)

## Kontext

Tento plán pokrývá Kroky 6, 7 a 8 z `docs/postup-prompty.md`:
- **Krok 6**: Karta leadu, seznam a pipeline
- **Krok 7**: Fronta "Volat teď", přidělování leadů, průvodce prvním přihlášením, nápověda "?"
- **Krok 8**: Zápis výsledku hovoru (outcome recording)

Team-lead je sloučil do jednoho celku "Obrazovka volání", protože operátor je vidí jako jeden flow: fronta → karta leadu → zavolat → zapsat výsledek → další lead.

### Vstupní dokumenty (přečteno)

| Dokument | Obsah relevantní pro plán |
|---|---|
| `docs/specifikace-weblyx.md` | Role, fáze, outcomes s pravidly, fronta řazení, přidělování round-robin, SLA 2h |
| `docs/design.md` | 13 barevných tokenů, 3 breakpointy (mobil <768, tablet 768-1279, počítač ≥1280), IBM Plex Sans/Mono |
| `docs/navod-operatorka.md` | Průvodce (4 kroky), co zvolit po hovoru, karty námitek (7), nápovědy na obrazovkách |
| `docs/design-predloha/01` | Mobil fronta: projekt-switcher, směna, counter 14/20, progress, sekce Propadlé/Nové/Dnes, bottom nav |
| `docs/design-predloha/02` | Mobil karta leadu: zpět na frontu, pokus 1/4, h1 firma, háček (accent-tint), první věta, mřížka údajů, historie, CTA Zavolat + Zapsat výsledek |
| `docs/design-predloha/03` | Mobil zápis výsledku: 3 skupiny (zájem 3, retry 3, konec 2), efekt text, podmíněné formuláře, mikrofon, Uložit a další lead |
| `docs/design-predloha/04` | Nápověda "?" - bottom sheet s tabulkou outcomes, tip "Jindy", "Nikdy" pravidla |
| `docs/design-predloha/05` | Průvodce prvním přihlášením: 4 kroky, demo karta, tečky, Zpět/Další/Rozumím |
| `docs/design-predloha/06` | Tablet 1180px: 2 sloupce (fronta 380px + karta+zápis), outcomes 4×2 mřížka |
| `docs/design-predloha/07` | Počítač 1440px: top header, 3 sloupce (fronta 360px + karta + outcomes 400px), klávesy 1-8, Enter, námitky pills |
| `docs/design-predloha/08` | Report majitele (pro pozdější krok, ale KPI tiles relevantní) |
| `docs/predloha-volani/page.tsx` | Prototype: fetch-based, Turso backend, lucide-react icons, outcomes list |
| `docs/predloha-volani/callscript.ts` | `buildScript()`, `reasonsFor()`, 11 REASONS patterns, 7 steps, 17 objections |
| `docs/predloha-volani/store.ts` | Prototype Turso store (inspirace pro queue logic) |
| `supabase/migrations/004_record_call_outcome.sql` | `record_call_outcome()` RPC, `next_working_day_at()`, `find_project_admin()` |
| `supabase/seed.sql` | 8 outcomes, 9 lost_reasons, groups interest/retry/end |
| `.claude-context/tasks/task-020-callscript-analysis.md` | Outcomes mapping prototype → CRM, 9 neshod, integrace buildScript |
| `.claude-context/tasks/task-026-findings-migration.sql` | ALTER TABLE leads ADD findings, outcome report/defunct |
| `.claude-context/tasks/task-029-project-roles-plan.md` | project_members.role (operator/manager), effectiveRole |

### Závislosti

- **task-026** (findings migration): sloupec `leads.findings` musí existovat pro `reasonsFor()`
- **task-029** (project roles): `effectiveRole` v layoutu pro guard operátor/manager/admin
- Krok 5 (import leadů): leadové musí být v DB, ale import UI je nezávislý

---

## Část 1: Databázové přípravy

### 1.1 Queue view (SQL view nebo RPC)

Nová SQL funkce `get_queue(p_project_id uuid, p_operator_id uuid)` vrací seřazený seznam leadů k zavolání. Řazení přesně dle specifikace:

```
1. Propadlé callbacky (next_action_at < now(), nejstarší první)
2. Nové leady v SLA (stage = 'new', seřazeno priority DESC, created_at ASC)
3. Dnešní callbacky (next_action_at >= now() AND < end_of_today, podle času)
4. Úkoly k odeslání (tasks WHERE status = 'pending' AND type IN ('send_offer', 'send_deck'))
```

Filter:
- `leads.is_active = true`
- `leads.owner_id = p_operator_id OR leads.owner_id IS NULL` (vlastní + pool)
- `leads.next_action_at <= end_of_working_day OR leads.stage = 'new'`
- NOT IN do_not_call

Return type: `(id, company_name, phone, hook_text, hook_source, priority, stage_key, next_action_at, attempt_count, max_attempts, is_overdue boolean, overdue_minutes int, queue_section text)`

`queue_section` = `'overdue' | 'new' | 'today' | 'task'` — pro zobrazení ve frontě.

### 1.2 Lead card RPC

`get_lead_card(p_lead_id uuid)` vrací detail leadu pro kartu:
- lead fields (company_name, phone, email, website, contact_person, findings, hook_text, hook_source, stage, priority, phone_source, attempt_count, max_attempts, custom_field values, postponed_until, postpone_reason)
- calls history (outcome name, operator name, note, created_at) — posledních 10
- callscript data (findings pro buildScript na klientu)

### 1.3 Shift management RPCs

- `start_shift(p_project_id)` — creates shift row, returns shift_id
- `pause_shift(p_shift_id)` — sets paused_at
- `resume_shift(p_shift_id)` — clears paused_at, increments pause_duration
- `end_shift(p_shift_id)` — sets ended_at

### 1.4 Assignment function

`assign_new_lead(p_lead_id, p_project_id)` — round-robin:
1. Najdi operátory s aktivní směnou a < 80 otevřených leadů
2. Zvol toho s nejméně leady (round-robin)
3. Pokud nikdo → owner_id = NULL (pool)
4. Zapíše do audit_log

### 1.5 SLA check (pg_cron nebo Edge Function)

Plánovaná úloha každých 15 min:
- Najdi leady stage='new' kde `created_at + 2h < now()` a `owner_id IS NOT NULL`
- Přeřaď jinému operátorovi (assign_new_lead se stávajícím owner_id vyloučeným)
- Vlož upozornění pro admina do audit_log (nebo notifikace)

---

## Část 2: Struktura souborů a routování

### Adresářová struktura

```
src/app/(app)/[projectSlug]/
├── page.tsx                          — redirect na /queue (or queue page itself)
├── queue/
│   └── page.tsx                      — Fronta "Volat teď" (server component → client)
├── lead/[leadId]/
│   └── page.tsx                      — Karta leadu (mobil samostatná stránka)
├── _components/
│   ├── queue-list.tsx                — QueueList (client) — lead items, auto-refresh
│   ├── lead-card.tsx                 — LeadCard (client) — detail, háček, první věta, údaje, historie
│   ├── outcome-panel.tsx             — OutcomePanel (client) — outcome buttons, forms, submit
│   ├── call-button.tsx               — CallButton — tel: link, phone display
│   ├── shift-bar.tsx                 — ShiftBar — start/pause/end, counter, progress
│   ├── onboarding-wizard.tsx         — OnboardingWizard — 4-step průvodce
│   ├── help-sheet.tsx                — HelpSheet — "?" bottom sheet / dialog
│   ├── objection-chips.tsx           — ObjectionChips — pills pro počítač
│   ├── callscript-card.tsx           — CallscriptCard — HÁČEK PRO OTEVŘENÍ + PRVNÍ VĚTA
│   ├── lead-details-grid.tsx         — LeadDetailsGrid — fáze, priorita, zdroj, kdy berou
│   ├── history-list.tsx              — HistoryList — call/audit history
│   ├── responsive-calling-layout.tsx — Wrapper: mobil pages / tablet 2-col / počítač 3-col
│   └── keyboard-shortcuts.tsx        — useEffect handler for keys 1-8, Enter (počítač)
```

### Responzivní layout strategie

Na **mobilu** (<768px): 3 oddělené stránky navigované přes router:
1. `/queue` — fronta + bottom nav
2. `/lead/[id]` — karta leadu
3. Zápis výsledku = bottom sheet / modal na kartě leadu

Na **tabletu** (768-1279px): `responsive-calling-layout.tsx` renderuje 2 sloupce:
- Levý sloupec (380px fixed): QueueList + ShiftBar
- Pravý sloupec (flex): LeadCard + OutcomePanel pod sebou

Na **počítači** (≥1280px): 3 sloupce:
- Levý (max 360px): QueueList
- Střed (flex): LeadCard + ObjectionChips + HistoryList
- Pravý (max 400px): OutcomePanel
- Top header: projekt switcher, nav tabs (Fronta / Úkoly / Kalendář / Pipeline / Výkon), counter, Pauza, avatar

---

## Část 3: Fronta "Volat teď" (Krok 7)

### 3.1 Server action: `getQueue`

```typescript
// src/app/actions/queue.ts
"use server"

export async function getQueue(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_queue', {
    p_project_id: projectId,
    p_operator_id: (await supabase.auth.getUser()).data.user?.id
  });
  return data;
}
```

### 3.2 QueueList component

- Sections:
  - **PROPADLÉ** (overdue callbacky) — `urgent-tint` pozadí, štítek `−52 min` v `urgent`
  - **NOVÉ** (new leads in SLA)
  - **DNES** (dnešní callbacky + úkoly)
- Each lead item:
  - Název firmy (font-weight 600)
  - Subtitle: hook_text zkrácený na ~40 znaků, nebo "Nový lead"
  - Priorita: plná tečka `accent` = vysoká, prázdný kroužek = běžná
  - Callback time: IBM Plex Mono, right-aligned
  - Vybraný (active) lead: `accent-tint` border + background (predloha-06 řádek 33)
- Auto-refresh: `setInterval` every 30s calling `getQueue`
- Click → naviguje na kartu / vybírá na tablet/počítač
- Prázdný stav: "Všechno máš hotové. Nové leady se objeví samy, nebo dej Pauza." (z navod-operatorka.md)

### 3.3 ShiftBar

- Směna neaktivní: velký CTA "Začít směnu"
- Směna aktivní:
  - "Směna 2 h 14 min" (živý čas z `shifts.started_at`)
  - Counter: "Hovory tuto hodinu 14 / 20" (IBM Plex Mono)
  - Progress bar: šířka = calls_this_hour / project.calls_per_hour (20)
  - Tlačítko Pauza (toggles to Pokračovat when paused)
- Actions volají shift RPCs

### 3.4 Lead assignment (round-robin)

Trigger v DB: `AFTER INSERT ON leads` volá `assign_new_lead()`.
Nebo server action při importu.

### 3.5 SLA monitoring

pg_cron job `*/15 * * * *`:
```sql
SELECT reassign_stale_leads();
```
Funkce: leads WHERE stage='new' AND owner_id IS NOT NULL AND created_at + interval '2 hours' < now() → přeřadí + audit.

---

## Část 4: Karta leadu (Krok 6)

### 4.1 LeadCard component

Přesně dle předloh 02 (mobil), 06 (tablet), 07 (počítač):

**Header:**
- Mobil: `← Fronta` zpět, "Pokus 1 / 4" badge (track bg)
- Tablet/počítač: inline v hlavním panelu

**Company info:**
- H1: `company_name` (26-28px, font-weight 600)
- Subtitle: `sector · city · contact_person, role` (14px, muted)

**Call button:**
- Mobil: full-width, 56px tall, accent bg, phone icon + tel:xxx masked
  - `<a href="tel:+420...">` pro nativní dialer
  - Masking: `+420 7xx xxx xxx` (skrýt prostřední číslice pro RLS)
- Tablet/počítač: button v headeru

**HÁČEK PRO OTEVŘENÍ** (CallscriptCard):
- accent-tint pozadí, accent-ink text
- Header: "HÁČEK PRO OTEVŘENÍ" (12px uppercase 0.06em) + badge "AI audit" / zdroj
- Hlavní text: `hook_text` (17px, accent-deep)
- Pokud `findings` existuje: generuje se z `reasonsFor(findings)` v buildScript
- Pokud `hook_text` chybí: fallback text "Audit webu nemáme. Začni: 'Volám kvůli vašemu webu, mám pro vás jednu věc…'" (z navod-operatorka.md)
- Footer: PageSpeed score (Plex Mono) + čas + link "Otevřít web"

**PRVNÍ VĚTA:**
- surface bg, line border
- Generuje se z `buildScript(lead, callerName).steps[0].say`
- Závisí na: lead.company, lead.website, lead.findings (reasons)

**Mřížka údajů** (LeadDetailsGrid):
- 2×2 grid (1px gap, surface bg):
  - Fáze (stage.name)
  - Priorita (tečka + text)
  - Zdroj čísla (phone_source label)
  - Nejčastěji berou (custom field nebo "—")

**HISTORIE** (HistoryList):
- Chronologicky (nejnovější nahoře)
- Formát: akce text + čas (muted, right-aligned)

**Dolní CTA (mobil):**
- "Zapsat výsledek hovoru" → otevře outcome sheet/page

### 4.2 Integrace callscript (buildScript)

Přesunout `docs/predloha-volani/callscript.ts` do `src/lib/callscript.ts`:

```typescript
// src/lib/callscript.ts
export { buildScript, reasonsFor } from './callscript-core';
```

Funkce `buildScript` se volá na klientu s daty z LeadCard:
```typescript
const script = buildScript(
  { company: lead.company_name, website: lead.website, reasons: lead.findings ?? '' },
  currentUser.full_name
);
```

Výstup:
- `script.steps[0].say` → karta PRVNÍ VĚTA
- `script.steps` → callscript detail (expandable na tabletu/počítači)
- `script.objections` → ObjectionChips (počítač predloha-07)
- `script.rules` → collapsible "Pravidla volání"

### 4.3 ObjectionChips (jen počítač ≥1280px)

Dle predloha-07 řádky 55-62:
- Section "NÁMITKY – ŤUKNI BĚHEM HOVORU" (12px uppercase)
- Wrap flex row of pill buttons: "Už máme web", "Nemám čas", "Je to drahé", "Děláte to přes AI", "Pošlete e-mail"
- Click → expanduje odpověď (z navod-operatorka.md tabulka)
- Na mobilu/tabletu: námitky nejsou viditelné přímo (přístupné přes "?")

### 4.4 Telefonní číslo a maskování

- Operátor vlastnící lead: vidí plné číslo v `<a href="tel:...">`
- Cizí leady: nevidí vůbec (RLS)
- Telefon formátován s mezerami: `+420 xxx xxx xxx`

---

## Část 5: Zápis výsledku hovoru (Krok 8)

### 5.1 OutcomePanel component

Přesně dle předloh 03 (mobil), 06 (tablet), 07 (počítač).

**Layout:**
- Mobil: bottom sheet (swipe up z karty leadu), nebo nová stránka po návratu z tel:
- Tablet: inline pod kartou leadu v pravém sloupci
- Počítač: pravý sticky sloupec (400px max), sticky top-4

**Outcome buttons — 3 skupiny (z DB outcomes.group_name):**

```
ZÁJEM (interest / accent styling):
  1. Konzultace   [key 1]
  2. Nabídka       [key 2]
  3. Prezentace    [key 3]

ZKUSIT ZNOVU (retry / default styling):
  4. Jindy         [key 4]
  5. Nevzal to     [key 5]
  6. Obsazeno      [key 6]

KONEC (end / urgent styling):
  7. Nemá zájem    [key 7]
  8. Špatné číslo  [key 8]
```

Styling vybraného:
- interest: `border 1.5px accent, bg accent-tint, color accent-deep, font-weight 600`
- end: `border 1.5px urgent-ink, bg urgent-tint, color urgent-ink, font-weight 600`
- retry/default: `border 1px line, bg surface, color ink`

Na počítači: každé tlačítko má badge s číslem klávesy (Plex Mono, 12px, track bg).

**Efekt text:**
Po výběru se pod tlačítky zobrazí text vysvětlující, co se stane (z predloha-03 JS):
```
meeting:  "Lead přejde na majitele, schůzka se zapíše do jeho kalendáře a operátor ho už nevolá."
offer:    "Nabídka odejde e-mailem a za 3 dny přijde callback."
deck:     "Prezentace odejde e-mailem a za 2 dny přijde callback."
later:    "Lead zmizí z fronty a vrátí se přesně v čas, který klient řekl – i za měsíc."
no_answer: "Další pokus zítra v jinou denní dobu. Zbývají X pokusy."
busy:     "Lead se vrátí do fronty za 30 minut."
not_interested: "Fáze Ztraceno. Znovu oslovit za 6 měsíců, pokud nechce na seznam Nevolat."
wrong_number: "Fáze Ztraceno, lead jde ke kontrole majiteli."
```
Pozor: text "Zbývají X pokusy" je dynamický (max_attempts - attempt_count - 1).

### 5.2 Podmíněné formuláře (conditional inputs)

Podle `outcomes.rules.required_inputs`:

**meeting (Konzultace):**
- "Volné termíny majitele:" (admin/manager kalendář)
  - Tlačítka s konkrétními sloty (z Google Calendar API — zatím hardcoded)
  - "Jiný…" → datetime-local input
- Povinný: time_slot

**offer / deck (Nabídka / Prezentace):**
- E-mail input (prefilled z lead.email)
- Checkbox: "Výslovně řekli, že jim to můžu poslat." (deck: souhlas ne, offer: souhlas ne)
- Povinný: email

**later (Jindy):**
- Rychlé volby: "za 2 h · zítra 9:00 · za týden · za měsíc · za 3 měsíce · vlastní…"
  - Přesně dle design.md: za 2h, tomorrow_9, 1w, 1m, 3m, custom
- Při odložení ≥ 7 dní: objeví se textové pole "Důvod" (required)
  - Pravidlo z outcomes.rules.reason_required_after_days = 7
- Povinný: date (callback_at)

**not_interested (Nemá zájem):**
- Select/radio s lost_reasons (z DB)
- Checkbox: "Nevolat – přidat na seznam" (optional)
- Povinný: lost_reason_id

**no_answer, busy, wrong_number:**
- Žádný extra vstup

### 5.3 Společné prvky

**Poznámka textarea:**
- Vždy přítomný (nahoře na počítači, dole na mobilu)
- Placeholder: "Poznámka: co řekli, s kým jste mluvili…" (z prototype page.tsx)

**Hlasová poznámka (budoucí):**
- Tlačítko mikrofon (52×52px, line-strong border, bg bg) — zatím disabled s tooltipem "Připravujeme"

**CTA "Uložit a další lead":**
- Full-width, accent bg, white text, 52px tall
- Na počítači: badge "Enter" (Plex Mono)
- Disabled dokud nejsou vyplněny required_inputs pro vybraný outcome
- Po kliknutí:
  1. Volá `recordOutcome` server action
  2. Server action volá `supabase.rpc('record_call_outcome', {...})`
  3. Při úspěchu: automaticky načte další lead z fronty
  4. Při chybě: zobrazí error toast

### 5.4 Server action: recordOutcome

```typescript
// src/app/actions/calls.ts
"use server"

export async function recordOutcome(params: {
  leadId: string;
  outcomeKey: string;
  note?: string;
  callbackAt?: string;
  email?: string;
  timeSlot?: string;
  lostReasonId?: string;
  addToDnc?: boolean;
  postponeReason?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_call_outcome', {
    p_lead_id: params.leadId,
    p_outcome_key: params.outcomeKey,
    p_note: params.note ?? null,
    p_callback_at: params.callbackAt ?? null,
    p_email: params.email ?? null,
    p_time_slot: params.timeSlot ?? null,
    p_lost_reason_id: params.lostReasonId ?? null,
    p_add_to_dnc: params.addToDnc ?? false,
    p_postpone_reason: params.postponeReason ?? null,
  });

  if (error) throw new Error(error.message);
  return data;
}
```

### 5.5 Keyboard shortcuts (počítač ≥1280px)

`keyboard-shortcuts.tsx`:
- `useEffect` s `keydown` listener
- Keys 1-8: vybere outcome podle shortcut čísla
- Enter: potvrdí (= klikne "Uložit a další lead")
- Escape: zruší výběr outcome
- Aktivní jen když není focus v textarea/input

---

## Část 6: Průvodce a nápověda (Krok 7)

### 6.1 OnboardingWizard

Přesně dle predloha-05:

- Trigger: při prvním přihlášení operátorky (flag `profiles.onboarding_completed` = false)
- Full-screen overlay na bg
- 4 kroky z navod-operatorka.md:
  1. "Začni směnu" — chip SMĚNA, demo "Začít směnu 0/20"
  2. "Volej odshora" — chip VOLAT TEĎ, demo "Autoservis Dvořák 1."
  3. "Než zavoláš, přečti si háček" — chip HÁČEK, demo "Web 6,1 s na mobilu 34/100"
  4. "Po hovoru ťukni, jak skončil" — chip PO HOVORU, demo "Konzultace 1"
- Progress: tečky (active 22px accent, inactive 8px line-strong)
- Buttons: "Zpět" (from step 2), "Další" / "Rozumím, začínám" (step 4)
- "Přeskočit" link top-right
- Po dokončení: set `onboarding_completed = true`

### 6.2 HelpSheet ("?")

Přesně dle predloha-04:

- Trigger: "?" button v headeru karty leadu
- Mobil: bottom sheet (border-radius 24px top, max-height 760px)
- Tablet/počítač: dialog/modal
- Content:
  - H2 "Co zvolit po hovoru" + X zavřít
  - Tabulka outcomes (z navod-operatorka.md):
    - Levý sloupec: situace (text)
    - Pravý sloupec: badge s outcome názvem (accent pro interest, track pro retry, urgent pro end)
  - Tip box (accent-tint): "Nevíš, co zvolit? Dej Jindy a do poznámky napiš, co klient řekl."
  - Section "NIKDY": "Nevymýšlej slevy, termíny ani reference. Nevolej čísla mimo CRM."
  - CTA "Rozumím" → zavře sheet

### 6.3 DB change for onboarding

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
```

---

## Část 7: Bezpečnost a role guard

### 7.1 Přístupová pravidla

- **Operátor**: vidí frontu svého projektu, své leady + pool. Volá, zapisuje výsledky. Nemůže přeřazovat.
- **Manager** (z task-029): vidí všechny leady projektu, může přeřazovat, vidí report.
- **Admin**: vidí vše, spravuje projekty.

### 7.2 RLS relevance

Existující RLS politiky (003_rls_policies.sql) už řeší:
- `leads_select_operator`: operátor vidí `owner_id = auth.uid() OR owner_id IS NULL`
- `leads_select_admin`: admin vidí vše

Po task-029 (project roles): manager politika = vidí všechny leady v projektu.

### 7.3 Phone masking

V SQL view/RPC pro queue: operátor vidí plné číslo jen pro leady, které vlastní.
Pool leady: číslo maskované do přiřazení.

### 7.4 Server action guards

Každá server action:
```typescript
const user = await requireAuth();  // throws if not logged in
const membership = await requireProjectMember(projectId);  // throws if not member
```

`recordOutcome` navíc ověří, že `lead.owner_id = currentUser.id` (operátor může zapisovat jen své leady).

---

## Část 8: Callscript integrace

### 8.1 Přesun callscript.ts

Zkopírovat `docs/predloha-volani/callscript.ts` → `src/lib/callscript.ts`.

Úpravy:
1. **Outcome mapping** (z task-020 analýzy):
   - Prototype `wants_report` → CRM nemá (zatím se neimplementuje, přidá se v task-026 jako outcome `report`)
   - Prototype `do_not_call` → CRM řeší jako checkbox u `not_interested`
   - Prototype `callback` → CRM `later`
2. **Žádné API calls** — callscript je pure funkce, volá se na klientu s daty z DB
3. **Caller name** z `profile.full_name` (ne hardcoded "Petra")

### 8.2 Findings → hook_text mapping

Klientská funkce v LeadCard:
```typescript
function getHookContent(lead: LeadCardData) {
  if (lead.hook_text) {
    // hook_text already set (e.g. from lead-finder AI audit)
    return { text: lead.hook_text, source: lead.hook_source ?? 'import' };
  }
  if (lead.findings) {
    // Generate from findings using reasonsFor
    const reasons = reasonsFor(lead.findings);
    if (reasons.length > 0) {
      return { text: reasons[0].say + '. ' + reasons[0].impact, source: 'findings' };
    }
  }
  // Fallback
  return { text: null, source: null };
}
```

Fallback (z navod-operatorka.md): "Audit webu nemáme. Začni: 'Volám kvůli vašemu webu, mám pro vás jednu věc…'"

### 8.3 První věta generování

```typescript
function getFirstSentence(lead: LeadCardData, callerName: string) {
  const script = buildScript(
    { company: lead.company_name, website: lead.website ?? '', reasons: lead.findings ?? '' },
    callerName
  );
  return script.steps[0].say; // Úvod step
}
```

---

## Část 9: Responzivní design specifika

### 9.1 Mobil (<768px)

- **Bottom nav** (fixed): Fronta / Úkoly / Kalendář / Výkon (icons + labels, 12px)
- Fronta = main page, karta leadu = separate route
- Zápis výsledku = bottom sheet (overlay na kartě)
- Tlačítka výsledků: column layout, 3 groups s labels
- CTA Zavolat: 56px, full-width v kartě
- CTA Zapsat výsledek: full-width, bottom fixed bar
- Mikrofon + "Uložit a další lead": bottom fixed bar in outcome sheet

### 9.2 Tablet (768-1279px)

- 2 sloupce: aside 380px (fronta) + main flex (karta + zápis)
- Outcome buttons: 4×2 grid
- Shift bar: v header aside
- No bottom nav (tabs are inline)
- Karta + zápis scrollují spolu

### 9.3 Počítač (≥1280px)

- Top header bar:
  - Project switcher (pill button)
  - Nav tabs: Fronta / Úkoly 2 / Kalendář / Pipeline / Výkon (pills, active = accent-tint)
  - Spacer
  - Counter: "Hovory tuto hodinu" + progress bar + "14 / 20"
  - Pauza button
  - Avatar circle (initials, ink bg, surface text)
- 3 sloupce (max-width 1600px, auto margin):
  - aside 1: flex 1 1 300px, max 360px — fronta
  - main: flex 999 1 440px — karta + námitky + historie
  - aside 2: flex 1 1 320px, max 400px — outcome panel (sticky top-4)
- Klávesy 1-8 + Enter active

---

## Část 10: Prototype → CRM mapování (z task-020)

### 10.1 Outcome codes mapping

| Prototype (page.tsx) | CRM (seed.sql) | Notes |
|---|---|---|
| `meeting` | `meeting` | Konzultace — calendar_event, assign_to_admin |
| `wants_report` | *(later: `report`)* | Rozbor e-mailem — requires task-026 migration |
| `callback` | `later` | Jindy — callback_custom, quick_options |
| `no_answer` | `no_answer` | Nevzal to — opposite_part, max attempts |
| `not_interested` | `not_interested` | Nemá zájem — lost, lost_reason, optional DNC |
| `wrong_number` | `wrong_number` | Špatné číslo — lost, task check_contact |
| `do_not_call` | *(checkbox on not_interested)* | DNC je checkbox, ne samostatný outcome |
| — | `offer` | Nabídka — send_offer task, 3d callback |
| — | `deck` | Prezentace — send_deck task, 2d callback |
| — | `busy` | Obsazeno — 30min callback |

### 10.2 Co se NEPŘEBÍRÁ z prototype

- Turso/SQLite backend → Supabase Postgres
- `/api/admin/calls` REST API → Supabase RPC + Server Actions
- `wbx-card` / `--a-*` CSS variables → Tailwind design tokens
- lucide-react icons → inline SVG (dle predloh)
- `useAdminAuth` → Supabase auth + project context
- CSV import v outcome page → separátní import page (Krok 5)

---

## Část 11: Implementační pořadí

Doporučené pořadí stavby (v rámci jednoho Kroku 6-8 celku):

### Fáze A: Databáze a backend (1 den)
1. Migration: `onboarding_completed` na profiles
2. SQL: `get_queue()` RPC
3. SQL: `get_lead_card()` RPC
4. SQL: `start_shift / pause / resume / end_shift` RPCs
5. SQL: `assign_new_lead()` function
6. Server actions: `getQueue`, `getLead`, `recordOutcome`, shift actions

### Fáze B: Callscript + core components (1 den)
7. Zkopírovat callscript.ts do `src/lib/`
8. LeadCard + CallscriptCard + LeadDetailsGrid + HistoryList
9. OutcomePanel + conditional forms
10. QueueList

### Fáze C: Layout a responsivita (1 den)
11. ResponsiveCallingLayout (3 breakpointy)
12. ShiftBar
13. Mobil bottom nav
14. Počítač top header
15. Keyboard shortcuts

### Fáze D: Onboarding a nápověda (0.5 dne)
16. OnboardingWizard
17. HelpSheet
18. ObjectionChips (počítač)

### Fáze E: Assignment a SLA (0.5 dne)
19. Round-robin assignment
20. SLA check cron
21. Propadlý callback styling + notifikace

---

## Část 12: Hotovo, když (z postup-prompty.md)

### Krok 6:
- [ ] Karta leadu zobrazuje company_name, háček, první větu, mřížku údajů, historii
- [ ] Karta respektuje 3 breakpointy (predlohy 02, 06, 07)
- [ ] Jeden lead projde všemi 8 fázemi

### Krok 7:
- [ ] Nová operátorka po prvním přihlášení vidí průvodce (4 kroky)
- [ ] Fronta "Volat teď" zobrazuje leady ve správném pořadí (propadlé → nové → dnes)
- [ ] Nový lead se sám přidělí operátorovi s aktivní směnou (round-robin)
- [ ] Tlačítko "?" otevře nápovědu "Co zvolit po hovoru"

### Krok 8:
- [ ] 8 různých výsledků zapíšeš celkem nejvýš 3 ťuknutími každý
- [ ] Fronta se správně přeskládá po zápisu
- [ ] Na počítači fungují klávesy 1-8 a Enter
- [ ] Na mobilu se outcome sheet otevře po návratu z hovoru (tel: link)
- [ ] Podmíněné formuláře: meeting→termín, offer/deck→email, later→quick options+date, lost→reason+DNC

---

## Otevřené otázky

1. **Google Calendar API**: Krok 9 řeší napojení. V Kroku 8 použít hardcoded mock sloty, nebo placeholder "Jiný termín…"?
   → Doporučení: jen datetime-local input, bez Calendar API.

2. **Hlasová poznámka**: design ukazuje mikrofon. Implementovat, nebo placeholder?
   → Doporučení: disabled placeholder s tooltipem "Připravujeme".

3. **Findings sloupec**: závisí na task-026 migraci. Pokud není hotová, hook_text/hook_source stačí.

4. **Report outcome**: task-026 definuje outcome `report` (Rozbor e-mailem). Přidat do seed, nebo odložit?
   → Doporučení: přidat do seed v rámci task-026 migrace, v UI se zobrazí automaticky (outcomes z DB).

5. **Pipeline kanban** (Krok 6): přetahování mezi fázemi s kontrolou povinných polí. Implementovat v tomto kroku, nebo separátně?
   → Toto je v postup-prompty.md Krok 6, ale admin-only view. Může se odložit na po calling UI.
