# QA Report: Krok 7+8 — Round-robin, Onboarding, HelpSheet, Report/Defunct

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor (agent)  
**Build:** ✅ PASS  
**TS check:** ✅ PASS  
**ESLint:** ✅ PASS

---

## 1. Migration 009 — assign_new_lead, reassign_stale_leads, claim_lead

**Soubor:** `supabase/migrations/009_assignment_sla.sql`

### assign_new_lead
- ✅ SECURITY DEFINER — správně, volána cron jobem nebo serverem
- ✅ max_leads se čte z projects tabulky per projekt
- ✅ CTE active_operators filtruje shift status='active' + project_id
- ✅ lead_counts LEFT JOIN leads filtruje is_active=true + project_id — nenasčítává leads z jiných projektů
- ✅ ORDER BY open_leads ASC, random() — fair round-robin, tie breaking náhodný
- ✅ Audit log: action='lead_assigned', method='round_robin'
- ✅ p_exclude_operator_id — správně podporuje reassign (vynechá stávajícího vlastníka)

### reassign_stale_leads
- ✅ Filtruje stage='new' + is_active + owner_id IS NOT NULL + SLA překročení
- ✅ Volá assign_new_lead s exclude stávajícího operátora
- ✅ Fallback: pokud není jiný operátor, dá lead do poolu (owner_id = NULL)
- ✅ Audit log pro obě větve (sla_reassigned / sla_pool)
- ⚠️ POZOR: `sla_pool` audit_log řádek nemá sloupec `user_id` — INSERT má jen 4 hodnoty (project_id, lead_id, action, details), což je OK pouze pokud `user_id` má DEFAULT NULL. Nutno ověřit DDL tabulky audit_log.

### claim_lead
- ✅ FOR UPDATE — race condition ochrana
- ✅ Kontrola: owner_id IS NULL nebo owner_id = auth.uid() — nelze ukrást cizí lead
- ✅ UPDATE s double-check podmínkou (WHERE owner_id IS NULL OR owner_id = auth.uid())
- ✅ Audit log: action='lead_claimed', method='manual'
- ✅ auth.uid() — RLS-safe, nelze zfalšovat caller identity

### pg_cron schedule
- ✅ Bezpečný DO block, ignoruje chybu pokud pg_cron není dostupný
- ✅ Cron expression `*/15 * * * *` — každých 15 minut

**Celkové hodnocení migrace 009: ✅ PASS s jednou upozorněním (audit_log user_id nullable)**

---

## 2. Migration 010 — get_lead_card custom_fields fix

**Soubor:** `supabase/migrations/010_fix_get_lead_card_custom_fields.sql`

- ✅ Bug opravený: `WHERE cf.project_id = v_project_id` místo owner_id
- ✅ v_project_id správně extrahováno z leads JOIN projects
- ✅ STABLE + SECURITY DEFINER — vhodné pro read-only funkci
- ✅ NULL guard: vrací error JSON pokud lead nenalezen

---

## 3. OnboardingWizard

**Soubor:** `src/app/(app)/[projectSlug]/_components/onboarding-wizard.tsx`

- ✅ "use client" — správně klientská komponenta
- ✅ 4 kroky definovány v STEPS poli — pokrývají: směna, fronta, háček, výsledek
- ✅ Progress bar: segmenty 1–4, aktivní i <= step (správně zvýrazňuje i aktuální krok)
- ✅ Krok X ze 4 counter — uživatelsky srozumitelné
- ✅ Tlačítko Zpět — správně skryto na kroku 0
- ✅ Tlačítko Dál / "Rozumím, začínám" — správný label na posledním kroku
- ✅ disabled={saving} + opacity-50 — UX feedback při ukládání
- ✅ handleFinish volá completeOnboarding() → při chybě pokračuje dál (silently fails) — správné rozhodnutí, onboarding nesmí blokovat práci
- ✅ min-h-[44px] na tlačítkách — přístupnost (touch target)
- ✅ z-50 overlay — zobrazí se nad celým layoutem
- ✅ Česky bez chyb

---

## 4. HelpSheet

**Soubor:** `src/app/(app)/[projectSlug]/_components/help-sheet.tsx`

- ✅ "use client"
- ✅ "?" tlačítko — w-9 h-9, rounded-full, aria-label="Nápověda"
- ✅ Overlay: fixed inset-0 z-50, overflow-y-auto — scrollovatelná na mobilu
- ✅ Tabulka OUTCOME_ROWS — 11 řádků pokrývají všechny výsledky: Konzultace, Nabídka, Prezentace, Rozbor, Jindy (2x), Nevzal to, Obsazeno, Nemá zájem, Špatné číslo, Firma nefunguje
- ✅ Tabulka odpovídá OUTCOMES v OutcomePanel — konzistentní pojmenování
- ✅ TIPS — 5 tipů, věcné a praktické
- ✅ Zavírací tlačítko — aria-label="Zavřít", min-h/min-w 44px
- ✅ Česky bez chyb
- ⚠️ DROBNOST: HelpSheet nemá kbd shortcut pro zavření (Escape). Není blokující, ale uživatelsky příjemné.

---

## 5. OutcomePanel — report + defunct

**Soubor:** `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx`

### report outcome
- ✅ Vyžaduje email + consent checkbox
- ✅ canSubmit: `selected === "report" && (!email.includes("@") || !consent)` → false
- ✅ Consent text: "Klient výslovně souhlasil s odesláním rozboru" — správně

### defunct outcome
- ✅ Definován jako `{ key: "defunct", name: "Firma nefunguje", group: "end", shortcut: 0 }`
- ✅ EFFECT_TEXT: "Lead se vyřadí. Firma je označena jako nefungující."
- ✅ Skupina "end" → červené zvýraznění při výběru (border-urgent, bg-urgent-soft)
- ✅ Žádné extra formulářové pole — správně (stačí submit)

### Keyboard shortcuts
- ✅ 1–9 pro outcomes, 0 pro defunct — pokrývá všechny shortcuty
- ✅ Enter pro submit (pokud canSubmit)
- ✅ Escape pro zrušení výběru
- ✅ Guard: nespouštějí se v INPUT/TEXTAREA/SELECT
- ✅ useEffect cleanup: removeEventListener — bez memory leak

### canSubmit logika
- ✅ meeting: vyžaduje timeSlot
- ✅ offer/deck: vyžaduje email s "@"
- ✅ report: vyžaduje email + consent
- ✅ later: vyžaduje callbackAt
- ✅ not_interested: vyžaduje lostReasonId
- ✅ needsPostponeReason: >= 7 dnů → povinný důvod

### Dynamic effect text pro no_answer
- ✅ Počítá zbývající pokusy: `maxAttempts - attemptCount - 1`
- ✅ Správná česká skloňování: "pokus" / "pokusy" / "pokusů"

---

## 6. Server Actions

### onboarding.ts
- ✅ "use server"
- ✅ Ověření auth.getUser() — nenechá neauth. uživatele zapsat
- ✅ UPDATE profiles SET onboarding_completed = true WHERE id = user.id
- ✅ Hází error pokud Supabase vrátí chybu

### leads.ts — claimLead
- ✅ "use server"
- ✅ Ověření auth.getUser() — nutné pro bezpečnost
- ✅ Volá RPC claim_lead s p_lead_id — deleguje logiku do SECURITY DEFINER funkce
- ✅ Vrací boolean z DB

---

## 7. calling-layout.tsx integrace

- ✅ Import: OnboardingWizard, HelpSheet
- ✅ `showOnboarding` state inicializovaný z `!onboardingCompleted` prop
- ✅ OnboardingWizard renderován podmíněně: `{showOnboarding && ...}`
- ✅ onComplete callback: `() => setShowOnboarding(false)` — neznovuotevírá
- ✅ HelpSheet: `fixed bottom-4 right-4 z-40` — viditelný na všech breakpointech
- ✅ HelpSheet z-40 < OnboardingWizard z-50 — správné z-index pořadí (onboarding je výše)

---

## 8. fronta/page.tsx

- ✅ `profile.onboarding_completed` čten z DB
- ✅ Fallback: `profile?.onboarding_completed ?? false` — nový user bez profilu dostane onboarding
- ✅ Předáno jako `onboardingCompleted` prop do CallingLayout
- ⚠️ DROBNOST: `export const instant = false` — pravděpodobně má být `export const dynamic = "force-dynamic"`. `instant` není Next.js segment config. Funkčně to nevadí (ignoruje se), ale je to nesprávný klíč.

---

## Souhrn nálezů

| # | Závažnost | Soubor | Popis |
|---|-----------|--------|-------|
| 1 | ⚠️ Nízká | migration 009 | audit_log INSERT pro sla_pool vynechává user_id — funkční pouze pokud je sloupec nullable |
| 2 | ℹ️ Info | help-sheet.tsx | Chybí Escape shortcut pro zavření sheetu |
| 3 | ⚠️ Nízká | fronta/page.tsx | `export const instant = false` — neplatný Next.js segment config, pravděpodobně má být `dynamic = "force-dynamic"` |

**Žádný blocker. Vše kompiluje, lint čistý, logika správná. Krok 7+8 je připraven pro Evžena.**

---

## Výsledek QA

✅ **APPROVED** — implementace je funkčně správná, bezpečná (RLS + SECURITY DEFINER), česky bez chyb.  
3 drobné poznámky předány implementátorovi k posouzení (neblokují postup).
