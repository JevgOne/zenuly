# Evžen Review: Kroky 6+7+8 proti zadání uživatele

**Datum:** 2026-10-08
**Status:** SCHVÁLENO S VÝHRADAMI (3 blocker, 5 upozornění)

---

## METODIKA

Kontrolováno: veškerý kód v `src/app/(app)/`, `src/components/`, `src/app/actions/`, `src/app/register/`, `src/app/login/`, `src/app/(admin)/`, + migrace 006-010. Každý bod porovnán se zadáním uživatele + `docs/specifikace-weblyx.md` + `docs/navod-operatorka.md` + `docs/design.md` + `docs/postup-prompty.md`.

---

## BLOCKER NALEZKY (musí se opravit)

### B1: Outcome panel obsahuje 10 výsledků místo 8 ze specifikace
**Zadání:** 8 výsledků hovoru (meeting, offer, deck, later, no_answer, busy, not_interested, wrong_number) -- viz `specifikace-weblyx.md` tabulka.
**Stav:** `outcome-panel.tsx` obsahuje 10 výsledků:
- `report` (Rozbor) -- shortcut 4
- `defunct` (Firma nefunguje) -- shortcut 0
**Důsledek:** Přidané outcomes posouvají klávesové zkratky. Specifikace říká klávesy 1-8. Aktuálně je 1-9 + 0. Zkratky **nesedí** se specifikací:
- Spec: later=4, no_answer=5, busy=6, not_interested=7, wrong_number=8
- Kód: report=4, later=5, no_answer=6, busy=7, not_interested=8, wrong_number=9, defunct=0
**Poznámka:** Outcomes `report` a `defunct` přišly z migrace 006, která se odkazuje na `SYSTEM.md` a `ZADANI.md` -- ale zadání uživatele pro TOTO CRM je `specifikace-weblyx.md`. Tyto dva outcomes v zadání uživatele NEJSOU. Nicméně pokud uživatel výslovně schválil jejich přidání v předchozí iteraci, je to OK -- ale klávesové zkratky musí být opraveny aby seděly.
**Doporučení:** Ověřit u uživatele zda report+defunct patří do MVP. Pokud ano, opravit klávesové zkratky (1-8 pro core, 9-0 pro doplňky).

### B2: Nápověda "?" neobsahuje texty "Během hovoru" z `navod-operatorka.md` sekce "Nikdy"
**Zadání:** `navod-operatorka.md` obsahuje sekci "Nikdy" (4 body: nevolej čísla mimo CRM, nevymýšlej slevy, neříkej že neděláme s AI).
**Stav:** `help-sheet.tsx` má sekci "Během hovoru" (5 tipů) ale **chybí** sekce "Nikdy". Tabulka "Co zvolit po hovoru" obsahuje navíc řádky pro `report` a `defunct` (viz B1), což je konzistentní s outcome panelem, ale rozšiřuje původní spec.
**Doporučení:** Přidat sekci "Nikdy" do help-sheet.

### B3: Výsledek "Jindy" -- chybí text "za měsíc" u odložení
**Zadání:** `navod-operatorka.md` říká: „Ozvěte se za měsíc / po sezóně" → Jindy → Ťukni „za měsíc" nebo vyber datum a napiš proč. Lead se ti sám vrátí ve správný den.
**Stav:** Quick options v `outcome-panel.tsx` obsahují "za 2 h · zítra 9:00 · za týden · za měsíc · za 3 měsíce · vlastní…" -- **SEDÍ** se specifikací.
**Ale:** Požadavek na "důvod" u odložení >= 7 dní (`needsPostponeReason`) je správně implementován. Placeholder textu je "Proč voláte za tak dlouho?" -- **formulace je z pohledu operátora zvláštní**, mělo by být spíš "Důvod odložení (např. po sezóně)".
**OPRAVA B3:** Toto je spíš upozornění, ne blocker. Přeřazuji na W5.

---

## KONTROLA PODLE ZADÁNÍ UŽIVATELE

### 1. CRM pro callcentrum, operátorky volají firmám z telefonu, zapisují výsledek
- **OK.** Celý calling flow (fronta → karta leadu → zavolat přes `tel:` → zapsat výsledek) funguje.
- Karta leadu má velké tlačítko "Zavolat" s `tel:` odkazem.
- Zápis výsledku přes outcome panel s "Uložit a další lead".

### 2. Registrace email+telefon, open registrace, bez Google OAuth
- **OK.** `/register` obsahuje formulář s email, heslo, telefon, jméno.
- `/login` používá `signInWithPassword` -- žádný Google OAuth.
- Open registrace -- odkaz z loginu na registraci existuje.
- **BEZ** Google OAuth -- ověřeno Grep, žádný OAuth provider v kódu.

### 3. Project-level permissions: operator/manager per project, admin = owner vidí vše
- **OK.** Migrace 005 (`project_roles.sql`) přidává project-level role.
- `project_members` tabulka s `role` (operator/manager).
- Layout v `[projectSlug]/layout.tsx` řádek 78: `effectiveRole` se vypočítá z `profile.role` a `project.projectRole`.
- Admin vidí vše (řádek 50-53: admin fallback na všechny projekty).

### 4. Operátorka vidí jen své leady + pool, manager vidí vše v projektu
- **OK.** `get_queue` SQL funkce (007): `WHERE ... AND (l.owner_id = p_operator_id OR l.owner_id IS NULL)` -- operátor vidí své + pool.
- **UPOZORNĚNÍ W1:** Manager/admin queue visibility není explicitně řešena v get_queue. Funkce vždy filtruje na `p_operator_id`. Manager by měl vidět všechny leady v projektu, ne jen své. Toto může být záměrné (manager volá ze své fronty) ale nesedí s "manager vidí vše v projektu".

### 5. Volací obrazovka: fronta, karta leadu, callscript, outcomes
- **OK.** `calling-layout.tsx` implementuje 3 breakpointy:
  - Desktop (xl): 3 sloupce (fronta | karta+námitky | výsledky)
  - Tablet (md-xl): 2 sloupce (fronta | karta+výsledky)
  - Mobil: stacked pages (fronta → karta → výsledek)
- Callscript card, First sentence, Objection chips -- vše přítomno.
- Námitky viditelné jen na xl (`hidden xl:block`) -- na tabletu chybí.

### 6. Round-robin přiřazení, SLA monitoring
- **OK.** Migrace 009 (`assignment_sla.sql`):
  - `assign_new_lead`: round-robin mezi operátory s aktivní směnou a < max_leads (80).
  - `reassign_stale_leads`: SLA check každých 15 min, přeřadí nebo do poolu.
  - `claim_lead`: operátor si vezme lead z poolu.
  - Kapacita 80 je z `projects.max_leads` (ne hardcoded).
- **UPOZORNĚNÍ W2:** `assign_new_lead` se volá jen z `reassign_stale_leads` a není napojená na trigger při INSERT do `leads`. Nové leady se automaticky nepřidělují -- round-robin funguje jen jako SLA re-assignment. Toto může být záměrné (import → pool → operátor si bere), ale specifikace říká "přidělování leadů round-robin", což implikuje automatické přidělení při importu.

### 7. Onboarding wizard pro nové operátorky
- **OK.** `onboarding-wizard.tsx` -- 4 kroky přesně podle `navod-operatorka.md`:
  1. Začni směnu
  2. Volej odshora
  3. Přečti si háček
  4. Zapiš výsledek
- Tlačítko "Rozumím, začínám" na posledním kroku.
- Zobrazí se pouze pokud `onboarding_completed === false`.
- `completeOnboarding` action uloží do DB.
- **OK:** Progress bar, kroky, Zpět/Dál navigace.

### 8. "?" nápověda na každé obrazovce
- **OK.** `help-sheet.tsx` je v `calling-layout.tsx` jako fixed button vpravo dole.
- Obsahuje tabulku "Co zvolit po hovoru" -- **sedí** s `navod-operatorka.md` (+ navíc report a defunct).
- Obsahuje sekci "Během hovoru" s 5 tipy.
- **CHYBÍ:** sekce "Nikdy" (viz B2).
- **UPOZORNĚNÍ W3:** Help button je pouze na volací obrazovce (`calling-layout.tsx`). Zadání říká "každá obrazovka pro operátora má tlačítko ?". Další obrazovky (Úkoly, Kalendář, Výkon) nemají "?" protože zatím neexistují -- ale je to noted pro budoucí implementaci.

---

## KONTROLA UI PRAVIDEL

### Žádné zkratky v UI (celé české názvy)
- **OK.** Vše v češtině:
  - Navigace: "Fronta", "Úkoly", "Kalendář", "Výkon", "Pipeline", "Administrace"
  - Role: "Administrátor", "Manažer", "Operátor"
  - Outcomes: "Konzultace", "Nabídka", "Prezentace", "Jindy", "Nevzal to", "Obsazeno", "Nemá zájem", "Špatné číslo"
  - Sekce: "Propadlé", "Nové", "Dnes"
  - Tlačítka: "Začít směnu", "Pauza", "Pokračovat", "Ukončit", "Uložit a další lead", "Zpět", "Rozumím, začínám"
- **BEZ zkratek** -- vše celé názvy.

### Nic neschováno — admin vidí vše v navigaci
- **OK.** Admin header (`app-header.tsx`):
  - Fronta, Úkoly, Kalendář, Pipeline, Výkon, Administrace
  - Manager: stejné jako admin (Pipeline navíc).
  - Operátor: Fronta, Úkoly, Kalendář, Výkon.
- **UPOZORNĚNÍ W4:** Stránky "Úkoly" (`/ukoly`), "Kalendář" (`/kalendar`), "Výkon" (`/vykon`), "Pipeline" (`/pipeline`) jsou v navigaci ale **neexistují** jako pages. Zatím se jedná o Krok 6-8, tyto stránky přijdou v pozdějších krocích (9, 11, 12). Je správné je mít v navigaci? Uživatel řekl "nic se neschovává" -- ale tyto stránky budou vracet 404. **Měly by být buď odstraněny z navigace, nebo by měly zobrazit "Připravujeme" placeholder.**

### Nedokončené funkce jsou OZNAČENY
- **ČÁSTEČNĚ OK.**
  - Mikrofon (hlasová poznámka) v outcome panelu je `disabled` s `title="Připravujeme"` -- **OK**.
  - "Zapomenuté heslo?" odkaz v login-form je button ale nic nedělá -- **NEOZNAČEN** jako nedokončený.
  - Navigace na neexistující stránky (Úkoly, Kalendář, Výkon, Pipeline) -- **NEOZNAČENY**.
  - Pole "Nejčastěji berou" v lead-details-grid zobrazuje "—" -- nedokončená funkce (Fáze 4), **NEOZNAČENO**.

### České texty korektní
- **OK.** Všechny texty v češtině, korektní:
  - Tykání v průvodci a nápovědě (konsistentní s `navod-operatorka.md`)
  - Vykání v registraci a loginu ("Vytvořte si", "Zadejte svůj", "Zaregistrujte se", "Nemáte účet?")
  - Konzistentní v rámci kontextu.

---

## UPOZORNĚNÍ (ne-blockery)

| # | Popis | Soubor | Řádek |
|---|-------|--------|-------|
| W1 | Manager queue nefiltruje na všechny leady projektu, jen na vlastní + pool | `007_queue_shifts_rpcs.sql` | 78 |
| W2 | Round-robin `assign_new_lead` není napojena na INSERT trigger | `009_assignment_sla.sql` | 10 |
| W3 | "?" tlačítko jen na volací obrazovce, ne na ostatních | `calling-layout.tsx` | 256 |
| W4 | Navigace odkazuje na neexistující stránky (Úkoly, Kalendář, Výkon, Pipeline) | `app-header.tsx` + `bottom-nav.tsx` | — |
| W5 | Placeholder "Proč voláte za tak dlouho?" -- lepší "Důvod odložení (např. po sezóně)" | `outcome-panel.tsx` | 397 |

---

## VÝSLEDEK

Kroky 6, 7, 8 jsou **z většiny implementovány správně** a odpovídají zadání uživatele. Hlavní concern je B1 (extra outcomes report+defunct mění klávesové zkratky) -- potřebuje schválení uživatele. B2 (chybí sekce "Nikdy" v help-sheet) je jednoduchý fix. W4 (navigace na neexistující stránky) je riziko UX ale spadá do scope pozdějších kroků.

**Verdikt: PODMÍNĚNĚ SCHVÁLENO -- opravit B1 klávesové zkratky a B2 chybějící "Nikdy" sekci.**
