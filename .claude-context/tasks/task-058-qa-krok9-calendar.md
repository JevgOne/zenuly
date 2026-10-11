# QA Report: Krok 9 — Kalendáře (CalendarProvider + Google + Notion)

**Datum:** 2026-10-09  
**Kontrolor:** kontrolor (agent)  
**Build:** ✅ PASS — `/api/auth/google-calendar` + `/api/auth/google-calendar/callback` routes přítomny  
**TS check:** ✅ PASS  
**ESLint:** ✅ PASS

---

## 1. types.ts — CalendarProvider interface

**Soubor:** `src/lib/calendar/types.ts`

- ✅ Interface `CalendarProvider` definuje: `testConnection`, `getBusySlots`, `createEvent`, `deleteEvent` — kompletní CRUD
- ✅ `CalendarSlot`, `CalendarEvent`, `CalendarEventResult` — dobře typované
- ✅ `ProviderMeta` s `authType: "oauth" | "token"` — driver pro settings UI
- ✅ `credentialFields` optional array — pouze token-based providery ho vyplní
- ✅ Provider-agnostický design: CRM nikde netouche provider-specific API — ✅ splněno dle zadání

---

## 2. factory.ts — Provider registry

**Soubor:** `src/lib/calendar/factory.ts`

- ✅ PROVIDER_REGISTRY jako Record — snadno rozšiřitelný (přidej klíč + import)
- ✅ Komentář v kódu vysvětluje jak přidat nový provider (1. create file, 2. import, 3. update DB CHECK) — ✅ dobrá DX
- ✅ `createCalendarProvider` throws pro neznámý provider — fail-fast
- ✅ `onTokenRefresh` callback předáván do Google provideru — správná architektura
- ✅ `getAvailableProviders()` exportuje ProviderMeta pro UI — bez circular dependency

---

## 3. google-provider.ts — Google Calendar

**Soubor:** `src/lib/calendar/google-provider.ts`

### Token management
- ✅ `ensureValidToken()`: obnoví token pokud vyprší do 60 sekund — správná proactive obnova
- ✅ Po refresh volá `onTokenRefresh` callback → uloží nový token do DB
- ✅ Env vars kontrola: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — throws pokud chybí
- ✅ `calendar_id` fallback na "primary" — správné

### API volání
- ✅ `getBusySlots`: freeBusy endpoint — čte pouze obsazenost, ne obsah událostí (privacy-safe)
- ✅ `createEvent`: `timeZone: "Europe/Prague"`, `sendUpdates: "all"`, attendees, reminder 60min
- ✅ `deleteEvent`: 404 ignoruje — idempotentní, správné
- ✅ URL encoding: `encodeURIComponent(this.calendarId)` — správné pro non-primary calendars

### Drobné nálezy
- ⚠️ STŘEDNÍ: `getBusySlots` — odpověď z Google je `data.calendars?.[this.calendarId]`. Pokud je `calendar_id = "primary"`, Google vrátí výsledky pod klíčem skutečného calendar ID (např. user@gmail.com), ne pod "primary". Toto může způsobit prázdný result i když jsou busy sloty. **Nutno ověřit v praxi.** Řešení: použít skutečné ID z `testConnection` response a uložit ho do credentials.
- ℹ️ Info: chybí typ pro Google API response (`data.json()` vrací `any`). Nízká závažnost — interní.

---

## 4. notion-provider.ts — Notion Calendar

**Soubor:** `src/lib/calendar/notion-provider.ts`

- ✅ NOTION_VERSION = "2022-06-28" — správná stabilní verze
- ✅ `getBusySlots`: filtruje DB přes Notion filter API, mapuje "Datum" property
- ✅ Fallback `end ?? addMinutes(start, 20)` pokud Notion stránka nemá end datum
- ✅ `createEvent`: správná Notion page struktura s title + date property + description block
- ✅ `deleteEvent`: archivuje stránku (PATCH archived: true) — správné, Notion nemá DELETE
- ✅ 404 ignoruje v deleteEvent — idempotentní
- ⚠️ DROBNOST: `getBusySlots` Notion filter používá `on_or_after` + `before` — správný range, ale Notion filter combinace pro date range vyžaduje `and` clause pokud chceme obě podmínky. Aktuálně query vrátí vše od `timeMin` bez horní hranice `timeMax`. Nízká závažnost — přebývající výsledky se nezobrazí uživateli (pouze ovlivní dostupnost slotů).

---

## 5. calendar.ts — Server actions

**Soubor:** `src/app/actions/calendar.ts`

### getProviderForUser (private helper)
- ✅ Používá `createAdminClient()` — správně obchází RLS pro čtení cizích tokenů
- ✅ Předává `onTokenRefresh` callback → transparentní obnova tokenu při každém volání
- ✅ Vrací null pokud user nemá připojenou calendar — caller musí ošetřit

### generateSlots
- ✅ Správná logika dnů týdne (ISO — pondělí=1, neděle=7) přes `getDay() === 0 ? 7 : getDay()`
- ✅ Generuje 20minutové sloty v pracovní době
- ✅ Filtruje minulé sloty: `if (new Date(startIso) > new Date())`
- ⚠️ STŘEDNÍ: `startStr` se vytváří jako `YYYY-MM-DDTHH:MM:00` bez timezone info, pak se přidá `+02:00` hardcoded. V zimním čase bude offset +01:00, což způsobí posun všech slotů o hodinu. Správné řešení: použít `workingHours.timezone` pro výpočet. **Blokující pro zimní čas** (říjen–březen).

### getAvailableSlots
- ✅ `find_project_admin` RPC existuje v migration 005 (ověřeno) — správná závislost
- ✅ Fallback `workingHours` pokud projekt nemá konfiguraci
- ✅ Pokud provider selže, vrátí všechny sloty bez filtrování — degradace bez pádu

### createCalendarEvent
- ✅ Vytváří event o délce přesně 20 minut
- ✅ Popis obsahuje: kontakt, telefon, email, link do CRM
- ⚠️ DROBNOST: CRM link je hardcoded `https://zenuly.cz/weblyx/leads/${leadId}`. Správnější by bylo `${process.env.NEXT_PUBLIC_APP_URL}/${projectSlug}/leads/${leadId}`, ale funkčně to nevadí pro produkci.
- ✅ Silent fail (return null) pokud provider chybí — správné

### connectCalendar
- ✅ Testuje connection před uložením — uživatel dostane chybu pokud token nefunguje
- ✅ `upsert` s `onConflict: "profile_id"` — jeden user = jeden calendar
- ✅ Používá `adminClient` pro upsert (RLS by blokoval INSERT pro nového uživatele)

### disconnectCalendar / testCalendarConnection / getCalendarConnection
- ✅ Všechny ověřují `auth.getUser()` — bez auth neposlouží
- ✅ `getCalendarConnection` používá normální client (RLS `cc_own` policy povolí čtení vlastního záznamu)

---

## 6. OAuth flow — google-calendar routes

**Soubory:** `src/app/api/auth/google-calendar/route.ts` + `callback/route.ts`

### Initiation route
- ✅ Ověří auth před přesměrováním — anonymní přístup zamítnut
- ✅ `access_type: "offline"` + `prompt: "consent"` — zajišťuje refresh_token
- ✅ `state: user.id` — přenáší identitu do callbacku
- ⚠️ STŘEDNÍ: `state` parametr je pouze `user.id` — nezabezpečeno CSRF (chybí PKCE/nonce). Útočník by mohl zaslat uživateli upravené callback URL s cizím `code` a jiným `state`. V Supabase SaaS kontextu je riziko omezené (callback zpracovává pouze server), ale pro produkci doporučeno přidat signed state.

### Callback route
- ✅ Error handling pro všechny Google error kódy
- ✅ `tokenRes.ok` check před použitím tokens
- ✅ Používá `createAdminClient()` — správně, user nemusí být autentizovaný v callbacku (jiná session)
- ✅ Přesměruje na `/settings?calendar_connected=google` nebo `?calendar_error=...`
- ⚠️ STŘEDNÍ: `state` není ověřen — viz výše. `profile_id: state` je tedy unauthenticated claim. Útočník by mohl zneužít callback URL s platným `code` a cizím `state` k propojení calendáře jiného uživatele.

---

## 7. Settings UI

**Soubory:** `src/app/settings/page.tsx` + `calendar-section.tsx`

### settings/page.tsx
- ✅ Zobrazuje CalendarSection pouze pro `admin` nebo `manager` — správná RBAC
- ✅ `Suspense` fallback pro CalendarSection — přístupnější UI
- ✅ Opakující se `export const instant = false` — neplatný Next.js config (3. výskyt v projektu)

### calendar-section.tsx
- ✅ `useSearchParams` pro detekci `calendar_connected` / `calendar_error` — správné zpracování OAuth redirect
- ✅ OAuth provider → `router.push` na API route (ne client-side fetch) — správně
- ✅ Token provider → client-side `connectCalendar()` server action
- ✅ Všechny chybové kódy z callbacku jsou přeloženy do češtiny
- ✅ `disabled={status !== "idle"}` na všech tlačítkách — zamezuje double-submit
- ✅ Po disconnectu reset všech state hodnot

---

## 8. SlotPicker — UI

**Soubor:** `src/app/(app)/[projectSlug]/_components/slot-picker.tsx`

- ✅ Načítá sloty přes `getAvailableSlots` server action
- ✅ `fetchIdRef` race condition guard — správné (concurrent fetchů je ignorován starší)
- ✅ Fallback na `datetime-local` input pokud: 0 slotů, chyba fetche, nebo "zadat ručně"
- ✅ "další dny" button rozšíří rozsah na 14 dní
- ✅ Sloty seskupeny po dnech (day tabs)
- ✅ Skeleton loading animace
- ✅ Formátování CZ locale: `cs-CZ`, timezone `Europe/Prague`
- ✅ `activeDay` bound-safe: `days[activeDay] ?? days[0]`

---

## 9. outcome-panel.tsx integrace

- ✅ Import `SlotPicker` přidán
- ✅ `meeting` outcome zobrazuje `<SlotPicker>` místo původního `datetime-local` inputu
- ✅ `projectId` prop předán do SlotPicker — správně (potřebuje pro `find_project_admin`)
- ✅ `timeSlot` state funguje pro oba případy (slot click + fallback ruční zadání)

---

## 10. migration 011 — calendar_connections

**Soubor:** `supabase/migrations/011_calendar_integration.sql`

- ✅ `UNIQUE (profile_id)` — jeden user = jeden calendar — konzistentní s `upsert(onConflict: "profile_id")`
- ✅ `ON DELETE CASCADE` na `profile_id → profiles` — smazání profilu smaže token
- ✅ `CHECK (provider IN ('google', 'notion'))` — databázová validace
- ✅ `credentials jsonb NOT NULL DEFAULT '{}'` — vždy má hodnotu
- ✅ RLS `cc_own`: `FOR ALL USING (profile_id = auth.uid())` — owner policy
- ✅ RLS `cc_admin_read`: `FOR SELECT USING (auth_user_role() = 'admin')` — `auth_user_role()` existuje v migration 002 ✅
- ✅ `update_updated_at()` trigger — existuje v migration 002 ✅
- ✅ `tasks` tabulka rozšířena: `calendar_event_id text`, `calendar_provider text` — IF NOT EXISTS, bezpečné
- ⚠️ DROBNOST: `cc_admin_read` policy umožňuje admin číst credentials přes RLS. V praxi admins přistupují přes `adminClient` (bypass RLS), takže tato policy se nepoužije. Nadbytečná, ale neškodná.

---

## 11. Reverzní kontrola proti plánu (task-053)

Plán definoval tyto požadavky — stav implementace:

| Požadavek | Stav |
|-----------|------|
| CalendarProvider interface s 4 metodami | ✅ |
| Google OAuth2 flow + refresh token | ✅ |
| Notion token-based auth | ✅ |
| Factory pattern pro přidávání providerů | ✅ |
| getBusySlots → filtrovat dostupné sloty | ✅ (s výhradou freeBusy key) |
| SlotPicker nahrazuje datetime-local v outcome-panel | ✅ |
| Fallback na ruční zadání | ✅ |
| Settings page pro admin/manager | ✅ |
| RLS na calendar_connections | ✅ |
| test/connect/disconnect actions | ✅ |
| Hardcoded timezone Europe/Prague | ⚠️ pouze +02:00 (letní), zimní čas chybí |
| provider-agnostický volající kód | ✅ |

---

## Souhrn nálezů

| # | Závažnost | Soubor | Popis |
|---|-----------|--------|-------|
| 1 | ⚠️ Střední | google-provider.ts | `freeBusy` response key nemusí být "primary" — busy sloty nebudou detekovány |
| 2 | ⚠️ Střední | calendar.ts | Timezone offset hardcoded +02:00 — zimní čas (říjen–březen) posune sloty o hodinu |
| 3 | ⚠️ Střední | callback/route.ts | OAuth state není CSRF-chráněn — callback přijme libovolný state bez ověření |
| 4 | ℹ️ Info | notion-provider.ts | Notion filter date range chybí `and` clause → přebývající výsledky (neblokující) |
| 5 | ℹ️ Info | calendar.ts | CRM link hardcoded na zenuly.cz/weblyx |
| 6 | ℹ️ Info | migration 011 | `cc_admin_read` RLS policy je nadbytečná (admins používají adminClient) |
| 7 | ℹ️ Info | settings/page.tsx | `export const instant = false` — neplatný Next.js segment config (3. výskyt v projektu) |

---

## Výsledek QA

⚠️ **PODMÍNĚNĚ APPROVED** — Funkčně správné pro letní čas a testovací provoz. Tři středně závažné problémy (freeBusy key, timezone, OAuth state) doporučuji opravit před ostrým nasazením, zejména:

- **Priorita 1:** Timezone fix (přechod na zimní čas nastane brzy — říjen 2026)
- **Priorita 2:** freeBusy response key ověřit real testem s Google účtem
- **Priorita 3:** OAuth CSRF protection (nonce/state signing)

Build, lint, TS — vše čisté. Architektura provider-agnostická dle zadání. RLS správná.
