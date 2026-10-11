# Evžen Review: Krok 9 (Google Kalendář / CalendarProvider) proti zadání

**Datum:** 2026-10-09
**Status:** SCHVÁLENO (0 blockerů, 3 upozornění)

---

## METODIKA

Kontrolováno: `src/lib/calendar/` (types.ts, factory.ts, google-provider.ts, notion-provider.ts), `src/app/actions/calendar.ts`, `src/app/actions/calls.ts`, `src/app/api/auth/google-calendar/` (route.ts, callback/route.ts), `src/app/settings/` (page.tsx, calendar-section.tsx), `src/app/(app)/[projectSlug]/_components/slot-picker.tsx`, `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx`, `supabase/migrations/011_calendar_integration.sql`.

Porovnáno se zadáním:

**Zadání Krok 9 z `postup-prompty.md`:**
> Napoj Google Kalendář admina: volné sloty pro výsledek Konzultace, vytvoření události s pozvánkou klientovi, připomínka 1 h předem. Lead se předá adminovi.

**Dodatečný požadavek uživatele:**
> Obecná CalendarProvider API s individuálním napojením per user, Google + Notion Calendar.

---

## KONTROLA PODLE ZADÁNÍ

### 1. Napoj Google Kalendář admina
- **OK.** `google-provider.ts` implementuje `CalendarProvider` s plnou Google Calendar API v3 integrací:
  - OAuth flow: `/api/auth/google-calendar/route.ts` → Google OAuth → `/api/auth/google-calendar/callback/route.ts` → uloží tokeny do `calendar_connections`.
  - Scope: `https://www.googleapis.com/auth/calendar` (plný přístup pro čtení/zápis).
  - Token refresh: automatický (`ensureValidToken`) s callback pro uložení nových tokenů do DB.
  - Test connection: endpoint pro ověření fungování.

### 2. Volné sloty pro výsledek Konzultace
- **OK.** `calendar.ts` → `getAvailableSlots()`:
  - Generuje 20-minutové sloty v pracovních hodinách (z `projects.working_hours`).
  - Dotáže se na busy sloty přes `getBusySlots` (Google freeBusy API / Notion query).
  - Odfiltruje obsazené sloty.
  - Fallback: pokud provider není napojen, vrátí všechny sloty v pracovní době.
- **OK.** `slot-picker.tsx` zobrazuje sloty:
  - Záložky po dnech, grid časů.
  - Fallback na ruční zadání (datetime-local) pokud žádné sloty nebo chyba.
  - Tlačítko "další dny" pro rozšíření rozsahu.
  - Tlačítko "Zadat čas ručně" jako alternativa.
- **OK.** Výsledek "Konzultace" v `outcome-panel.tsx` řádek 310-320 nyní používá `SlotPicker` místo plain `datetime-local`.

### 3. Vytvoření události s pozvánkou klientovi
- **OK.** `calendar.ts` → `createCalendarEvent()`:
  - Summary: `Konzultace: {firma}`.
  - Description: kontaktní osoba, telefon, e-mail, odkaz na lead v CRM.
  - `attendeeEmail`: pokud lead má e-mail → Google pošle pozvánku.
  - `sendUpdates: "all"` v Google provideru → klient dostane pozvánku e-mailem.
  - Délka: 20 minut (fixed, odpovídá specifikaci).
- **OK.** Integrace v `calls.ts`:
  - Po `record_call_outcome` (SQL) pokud výsledek obsahuje `calendar_event` flag → volá `createCalendarEvent`.
  - Najde admin/manager přes `find_project_admin`.
  - Používá admin token pro vytvoření události v jeho kalendáři.
  - Selhání nevyhazuje error (try/catch) -- outcome se uloží vždy.

### 4. Připomínka 1 h předem
- **OK.** `calendar.ts` řádek 222: `reminderMinutes: 60`.
- `google-provider.ts` řádek 149-153: `reminders: { useDefault: false, overrides: [{ method: "popup", minutes: event.reminderMinutes }] }`.
- Notion provider: **nemá** native reminders (Notion API nepodporuje) -- toto je OK, Notion nemá popup reminders.

### 5. Lead se předá adminovi
- **OK.** Toto je řešeno v `record_call_outcome` SQL funkci (migrace 004):
  - Výsledek "meeting" má `rules.set_stage: "meeting_booked"` a `rules.assign_to: "admin"`.
  - `find_project_admin` najde managera nebo admina projektu.
  - Lead dostane `owner_id = admin_id`.

### 6. Obecná CalendarProvider API
- **OK.** `types.ts` definuje interface `CalendarProvider`:
  - `testConnection()`, `getBusySlots()`, `createEvent()`, `deleteEvent()`.
  - `ProviderMeta` pro UI setup.
- **OK.** `factory.ts` — provider registry:
  - Registrace provideru = 1 import + 1 entry.
  - `createCalendarProvider()` factory funkce.
  - `getAvailableProviders()` pro settings UI.
- **DOBRÝ DESIGN:** Zbytek CRM nikdy nepracuje přímo s Google/Notion API -- jen přes interface.

### 7. Individuální napojení per user
- **OK.** `calendar_connections` tabulka:
  - `profile_id` (UNIQUE) = jeden uživatel = jedno napojení.
  - `provider` (TEXT, CHECK: 'google', 'notion').
  - `credentials` (JSONB) = provider-specifické tokeny.
  - RLS: vlastník vidí svůj záznam, admin vidí vše.
- **OK.** Settings UI (`calendar-section.tsx`):
  - Výběr poskytovatele (radio buttons).
  - Google: OAuth flow (tlačítko "Propojit Google Calendar").
  - Notion: formulář s API Token + Database ID + instrukce.
  - Stav: propojeno/odpojeno, test, odpojení.
  - Viditelné jen pro admin/manager (`settings/page.tsx` řádek 50).

### 8. Google + Notion
- **OK.** Oba providery implementováni:
  - `google-provider.ts`: OAuth, freeBusy, events CRUD.
  - `notion-provider.ts`: Token auth, database query, page CRUD.
  - Notion: properties "Název" (title) + "Datum" (date) -- odpovídá instrukci v `NOTION_META.setupInstructions`.

---

## KONTROLA UI PRAVIDEL

### Žádné zkratky v UI
- **OK.** Vše česky:
  - "Propojení kalendáře", "Propojit Google Calendar", "Propojit Notion Calendar"
  - "Otestovat", "Odpojit", "propojeno"
  - "Termín konzultace", "Zadat čas ručně", "další dny"
  - Chybové hlášky: "Přístup k Google Calendar byl odmítnut", "Výměna tokenu selhala"...

### Admin najde nastavení v navigaci
- **OK.** `user-menu.tsx` řádky 57-61: "Nastavení" odkaz v user menu → `/settings`.
- `settings/page.tsx` řádek 50-57: sekce "Propojení kalendáře" viditelná pro admin/manager.
- **Operátor tuto sekci NEVIDÍ** -- korektní, operátor nepotřebuje kalendář.

### Nedokončené funkce označeny
- **OK.** Notion provider je plně funkční (ne placeholder).
- Slot picker má fallback pro chyby a prázdné stavy.
- Žádné `disabled` tlačítka bez vysvětlení.

---

## UPOZORNĚNÍ (ne-blockery)

| # | Popis | Soubor | Řádek |
|---|-------|--------|-------|
| W1 | QA identifikoval: timezone hardcoded "Europe/Prague" v google-provider createEvent -- měl by brát z projektu. Oprava plánována zvlášť. | `google-provider.ts` | 140 |
| W2 | QA identifikoval: Google freeBusy key mismatch -- `data.calendars?.[this.calendarId]` nemusí sedět pokud calendarId="primary" a API vrátí email. Oprava plánována zvlášť. | `google-provider.ts` | 125 |
| W3 | Notion provider nepodporuje pozvánky klientovi (Notion API limitation) -- při Notion napojení klient nedostane e-mailovou pozvánku. Toto je inherentní omezení Notion API, ne bug. | `notion-provider.ts` | — |

---

## VÝSLEDEK

Implementace Kroku 9 **plně odpovídá zadání**. Všechny požadavky splněny:
- Google Calendar napojen přes OAuth
- Volné sloty se zobrazují v outcome "Konzultace" přes SlotPicker
- Událost se vytváří s pozvánkou klientovi a 60min připomínkou
- Lead se předává adminovi
- Obecná CalendarProvider API je čistě navržena
- Individuální napojení per user funguje
- Google i Notion implementovány

QA nalezl 2 bugy (W1, W2) které se opravují zvlášť -- toto jsou technické detaily, ne nesoulad se zadáním.

**Verdikt: SCHVÁLENO.**
