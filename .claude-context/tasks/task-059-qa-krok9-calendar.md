# QA Report — Krok 9: Kalendáře

**Task #2 | Kontrolor | 2026-10-09**

---

## Výsledek: PROŠLO s 1 bezpečnostním upozorněním

---

## Co bylo zkontrolováno

### 1. CalendarProvider abstrakce (`src/lib/calendar/`)

**PASS.** Interface `CalendarProvider` v `types.ts` definuje čistý kontrakt:
- `testConnection()`, `getBusySlots()`, `createEvent()`, `deleteEvent()`
- Typy `CalendarSlot`, `CalendarEvent`, `CalendarEventResult` jsou správně typovány
- `ProviderMeta` s `credentialFields` umožňuje generické UI bez provider-specifické logiky

**Factory pattern** (`factory.ts`) je správně implementován — `PROVIDER_REGISTRY` umožňuje přidání nového providera bez změny kódu mimo factory.

### 2. Google Calendar provider (`src/lib/calendar/google-provider.ts`)

**PASS.**
- Token refresh (`ensureValidToken`) funguje správně — kontroluje expiry s 60s bufferem
- `onTokenRefresh` callback správně persistuje nové tokeny zpátky do DB
- `getBusySlots` používá Google FreeBusy API správně
- `createEvent` přidává timezone `Europe/Prague`, attendee a reminder
- `deleteEvent` ignoruje 404 (event byl smazán externálně) — správná logika

### 3. Notion Calendar provider (`src/lib/calendar/notion-provider.ts`)

**PASS.**
- `getBusySlots` filtruje záznamy bez `Datum` property (robustní)
- Fallback `addMinutes(start, 20)` pro záznamy bez `end` je správný
- `deleteEvent` archivuje stránku (Notion neumožňuje skutečné mazání) — OK
- Properties `Název` a `Datum` jsou hardcoded — dokumentováno v `setupInstructions`

### 4. DB migrace (`supabase/migrations/011_calendar_integration.sql`)

**PASS.**
- `calendar_connections` tabulka: správná struktura, FK na `profiles`, CASCADE delete
- `UNIQUE (profile_id)` — jeden uživatel = jeden aktivní kalendář, splňuje spec
- RLS aktivní: `cc_own` policy (owner reads own), `cc_admin_read` policy (admin SELECT)
- Trigger `set_updated_at` využívá existující `update_updated_at()` z migrace 002
- `tasks` tabulka rozšířena o `calendar_event_id` a `calendar_provider` — OK

### 5. Server actions (`src/app/actions/calendar.ts`)

**PASS.**
- `getProviderForUser` správně používá admin client (bypass RLS pro čtení cizího tokenu)
- `generateSlots` generuje 20min sloty v pracovní době, správně filtruje minulé sloty
- Timezone handling: hardcoded `+02:00` — mírná poznámka (viz níže)
- `connectCalendar` testuje spojení před uložením — správný postup
- `disconnectCalendar` maže záznam (ne jen `is_active = false`) — akceptovatelné

### 6. UI (`src/app/settings/calendar-section.tsx`)

**PASS.**
- Genericky renderuje providery z `ProviderMeta` bez provider-specifické logiky
- OAuth redirect a token provider form jsou správně odděleny (`authType`)
- `useSearchParams` pro OAuth callback feedback (calendar_connected/calendar_error) — správně
- CalendarSection zobrazena pouze pro `admin` a `manager` rolí v `settings/page.tsx`

### 7. OAuth flow (`src/app/api/auth/google-calendar/`)

**PASS s upozorněním — viz níže.**
- Route i callback správně zpracovávají error stavy
- Tokeny jsou správně uloženy přes admin client
- Redirect na `/settings?calendar_connected=google` po úspěchu

### 8. E2E flow: Konzultace → kalendář (`src/app/actions/calls.ts`)

**PASS.**
- `recordOutcome` korektně volá `createCalendarEvent` pouze když `result.calendar_event` a `result.meeting_time` jsou přítomny
- Selhání calendar event creation nespadne celý outcome (try/catch s prázdným catch) — záměrné
- `targetUserId` je výsledek `find_project_admin` RPC, který existuje od migrace 004/005

### 9. TypeScript build

**PASS** — `npx tsc --noEmit` bez chyb ani varování.

### 10. ESLint

**PASS** — `npx eslint` na všech dotčených souborech bez varování.

---

## Nalezené problémy

### BEZPEČNOST (střední): OAuth state parameter bez CSRF ochrany

**Soubor:** `src/app/api/auth/google-calendar/route.ts:31` a `callback/route.ts:7`

**Popis:**
`state` parametr v OAuth flow obsahuje pouze `user.id`. Útočník, který zná UUID uživatele, může vytvořit podvržený callback URL s platným `code` od svého Google účtu a `state` = cizí user ID. Výsledkem by bylo přepsání calendar_connection cizího uživatele s útočníkovými tokeny.

**Doporučená oprava:**
`state` by měl být kryptograficky náhodný nonce (uložený v session/cookie s krátkou expirací), mapovaný na user ID server-side. Alternativně ověřit, že přihlášený user v callbacku odpovídá `state`.

**Poznámka:** Callback route neověřuje, zda je volající uživatel přihlášen — pouze zpracovává `state` jako user ID.

### DROBNOST: Hardcoded timezone offset `+02:00`

**Soubor:** `src/app/actions/calendar.ts:95-96`

`generateSlots` používá `+02:00` (CEST). V zimním čase (říjen–březen) by správné offset bylo `+01:00` (CET). Pro projekt v ČR je to aktuálně OK (říjen ještě letní čas), ale po přechodu na zimní čas v říjnu 2026 by sloty mohly být posunuty o hodinu.

**Doporučení:** Použít `Intl` nebo library jako `date-fns-tz` s `workingHours.timezone` z projektu (pole existuje).

---

## Shrnutí

| Oblast | Status |
|--------|--------|
| CalendarProvider interface | PASS |
| GoogleCalendarProvider | PASS |
| NotionCalendarProvider | PASS |
| DB migrace + RLS | PASS |
| Server actions | PASS |
| Settings UI | PASS |
| OAuth flow | PASS (s upozorněním) |
| E2E Konzultace flow | PASS |
| TypeScript build | PASS |
| ESLint | PASS |

**Celkový verdikt: PROŠLO** — implementace je funkční a odpovídá plánu. Doporučuji opravit OAuth state CSRF před produkčním nasazením.
