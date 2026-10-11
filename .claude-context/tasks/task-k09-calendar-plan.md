# TASK-K09: Google Kalendář + konzultace — Implementační plán

## Stav: HOTOVO (90%), zbývá QA a drobné opravy

## Co je hotové

1. **Calendar provider abstrakce** (`src/lib/calendar/types.ts`, `factory.ts`)
   - Interface `CalendarProvider` s metodami `testConnection`, `getBusySlots`, `createEvent`, `deleteEvent`
   - Registry s Google a Notion providery

2. **Google Calendar provider** (`src/lib/calendar/google-provider.ts`)
   - OAuth token refresh, freeBusy query, create/delete event
   - Attendee email, 60min reminder, sendUpdates: "all"

3. **Notion Calendar provider** (`src/lib/calendar/notion-provider.ts`)
   - Token-based auth, database integration

4. **Server actions** (`src/app/actions/calendar.ts`)
   - `getAvailableSlots(projectId, dateFrom, dateTo)` — generuje 20min sloty v pracovní době, filtruje busy
   - `createCalendarEvent(...)` — summary "Konzultace: {firma}", popis s kontaktem
   - `connectCalendar`, `disconnectCalendar`, `testCalendarConnection`, `getCalendarConnection`
   - `listProviders`

5. **Google OAuth flow**
   - `/api/auth/google-calendar/route.ts` — redirect na Google consent
   - `/api/auth/google-calendar/callback/route.ts` — token exchange, uložení do `calendar_connections`

6. **DB migrace 011** — tabulka `calendar_connections`, RLS, rozšíření `tasks` o `calendar_event_id` + `calendar_provider`

7. **UI nastavení** (`src/app/settings/calendar-section.tsx`)
   - Výběr providera, OAuth propojení, test, odpojení, error/success stavy

8. **SlotPicker** (`src/app/(app)/[projectSlug]/_components/slot-picker.tsx`)
   - Načte volné sloty, seskupí po dnech, grid výběr času, fallback na ruční input

9. **Integrace do outcome-panel**
   - Výsledek "Konzultace" → zobrazí SlotPicker → volá `recordOutcome` → `record_call_outcome` vrátí `calendar_event: true` → `calls.ts` vytvoří kalendářovou událost

## Co zbývá (QA / drobnosti)

### 1. Ověřit end-to-end flow
- [ ] Propojení Google Calendar v nastavení
- [ ] Výběr slotu při "Konzultace" v outcome-panel
- [ ] Vytvoření události v Google Calendar
- [ ] Pozvánka dorazí klientovi na email
- [ ] Připomínka 1h předem funguje
- [ ] Lead se předá adminovi (owner_id = admin)
- [ ] Lead zmizí z fronty operátora

### 2. Potenciální problémy k ověření
- **Timezone handling**: slot generátor hardcoded `+02:00` offset → funguje jen pro CEST, v CET (+01:00) bude chyba
  - **Soubor**: `src/app/actions/calendar.ts:98` — `new Date(\`${startStr}+02:00\`)`
  - **Fix**: Použít dynamický offset z timezone nebo knihovnu
- **`find_project_admin` RPC**: existuje v `004_record_call_outcome.sql`, ověřit že je nasazena
- **Error handling**: pokud calendar event selže, outcome se stále uloží (tiché selhání) — to je správně, ale admin by měl být informován

### 3. Chybějící env proměnné (produkce)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI` (= `https://zenuly.cz/api/auth/google-calendar/callback`)

## Závěr

K09 je de facto hotový. Zbývá:
1. **Fix timezone offsetu** v `calendar.ts:98` (kritický bug)
2. **E2E test** propojení → výběr slotu → vytvoření události
3. **Nasadit env proměnné** na Vercel

Odhadovaná práce: 1-2 hodiny implementace.
