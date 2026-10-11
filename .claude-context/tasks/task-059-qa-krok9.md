# QA Report: Krok 9 — Kalendáře

> Kontrolor, 2026-10-10

---

## 1. SIMPLIFY kontrola

### Hodnocení: DOBRÉ — žádné zásadní problémy

**types.ts** — čistý, minimální interface. Vše potřebné, nic navíc.

**google-provider.ts** — solidní implementace. Poznámky:
- `ensureValidToken()`: kontrola expirace používá `- 60_000` buffer (1 min) — správně.
- `createEvent()` správně posílá `sendUpdates: "all"` pro pozvánky.
- `deleteEvent()` správně ignoruje 404 (idempotentní).
- Drobnost: `onTokenRefresh` callback v factory.ts má správně typed `create` signaturu, ale v plánu byl jednodušší bez callback — implementátor správně přidal token refresh propagaci do DB. Dobrý upgrade.

**notion-provider.ts** — funkční.
- Pomocná funkce `addMinutes()` je inlined jen v tomto souboru — OK pro single use.
- `getBusySlots` správně filtruje stránky bez `Datum` property (`.filter(...)` guard).
- `deleteEvent` archivuje (PATCH archived: true) — správně, Notion API nemá skutečné DELETE.
- Drobnost: Notion `getBusySlots` neimplementuje retry pro rate limit (plan zmínil backoff) — **menší odchylka od plánu, ale nekritická**.

**factory.ts** — čistý registry pattern. Komentář o přidání nového provideru je přítomen.
- `create` funkce v registry správně předávají `onTokenRefresh` jen pro Google — Notion ho nepotřebuje. ✅

**calendar.ts (actions)** — velmi dobře strukturované.
- `getProviderForUser()` používá `createAdminClient()` (bypass RLS) — správně, token jiného uživatele by RLS blokoval.
- `generateSlots()` správně generuje jen budoucí sloty (`> new Date()`).
- `getAvailableSlots()` gracefully fallback: pokud `getBusySlots` selže, vrátí všechny vygenerované sloty (catch blok).
- **Potenciální problém:** `getAvailableSlots` volá `createAdminClient()` pro `find_project_admin`, ale jiné dotazy v téže funkci taky přes admin client — konzistentní. ✅
- **Drobnost:** Timezone handling v `generateSlots()` — sloty jsou generovány s `+02:00` offset hardcoded. V zimním čase (CET = +01:00) by sloty byly posunuty o hodinu. Mělo by se číst z `working_hours.timezone` přes Intl. **Střední závažnost — funkční bug v zimě.**

**calls.ts** — integrace je správná. Try/catch blok zajišťuje že selhání kalendáře NIKDY nezablokuje uložení outcome. ✅

**slot-picker.tsx** — dobře implementovaná komponenta.
- Race condition ochrana přes `fetchIdRef` + `fetchId !== fetchIdRef.current` — správně.
- Fallback na datetime-local při prázdných slotech i při chybě. ✅
- `daysToShow` rozšíření na 14 dní tlačítkem "další dny" — hezký UX detail.
- Duplikace: "žádné sloty" render je na dvou místech (řádky 91-111 a 138-155) — mohlo by být extrahováno do jedné větve, ale není kritické.

**settings/page.tsx + calendar-section.tsx** — čisté. CalendarSection dostává providers z getAvailableProviders() — provider-agnostické UI ✅. OAuth flow správně přesměrovává na route.

**OAuth routes** — korektní. `state` = user.id pro bezpečný callback (jednodušší než CSRF token, akceptovatelné pro interní CRM).

---

## 2. DEBUG kontrola

### Build: ✅ PASSED

```
npm run build → ✓ Compiled successfully in 530ms
TypeScript → ✓ Finished TypeScript in 883ms
Static pages → ✓ 18/18 generated
```

Všechny nové routes jsou přítomny:
- `ƒ /api/auth/google-calendar` ✅
- `ƒ /api/auth/google-calendar/callback` ✅
- `ƒ /settings` ✅

### Lint: ✅ PASSED (1 nesouvisející warning)

```
1 warning: scripts/apply-migration-005.mjs — 'readFileSync' unused
→ Nesouvisí s Krokem 9, existovalo dřív
```

**Žádné TypeScript errory, žádné ESLint errory v kalendářovém kódu.**

---

## 3. REVERZNÍ kontrola

### Zadání: "Napoj Google Kalendář admina: volné sloty pro výsledek Konzultace, vytvoření události s pozvánkou klientovi, připomínka 1 h předem. Lead se předá adminovi."

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 1 | Google Kalendář admina napojený | ✅ | OAuth flow: `/api/auth/google-calendar` + callback |
| 2 | Volné sloty pro výsledek Konzultace | ✅ | `getAvailableSlots()` + `SlotPicker` v outcome-panel |
| 3 | Vytvoření události po výsledku Konzultace | ✅ | `createCalendarEvent()` v calls.ts po `recordOutcome` |
| 4 | Pozvánka klientovi | ✅ | `attendees: [{ email }]` + `sendUpdates: "all"` v Google provider |
| 5 | Připomínka 1 hodinu předem | ✅ | `reminderMinutes: 60` v createCalendarEvent call |
| 6 | Lead se předá adminovi | ✅ | `find_project_admin` RPC + `targetUserId: adminId` |

### Zadání: "Obecná CalendarProvider abstrakce (Google + Notion), provider-agnostický kód, UI z ProviderMeta, nikdy neblokovat uložení hovoru."

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 7 | CalendarProvider interface | ✅ | types.ts — getBusySlots, createEvent, deleteEvent, testConnection |
| 8 | Google provider | ✅ | google-provider.ts |
| 9 | Notion provider | ✅ | notion-provider.ts |
| 10 | Provider-agnostický zbytek kódu | ✅ | factory.ts, calendar.ts, calls.ts neví o konkrétních providerech |
| 11 | UI z ProviderMeta | ✅ | calendar-section.tsx generuje formulář z credentialFields |
| 12 | Nikdy neblokovat uložení hovoru | ✅ | try/catch v calls.ts — selhání kalendáře je tiché |
| 13 | Notion retry (rate limit) | ⚠️ | Plan zmínil backoff — není implementováno. Nekritické pro MVP. |
| 14 | Timezone zimní čas | ⚠️ | generateSlots hardcode +02:00, v zimě sloty posunuté o hodinu |

---

## Shrnutí

**Build:** ✅ OK  
**Lint:** ✅ OK (1 nesouvisející warning)  
**TypeScript:** ✅ OK  
**Plán vs. implementace:** 12/14 bodů splněno ✅

### Nalezené problémy

| Závažnost | Popis | Soubor |
|-----------|-------|--------|
| ⚠️ STŘEDNÍ | Timezone hardcode `+02:00` — špatné sloty v zimě (CET = +01:00) | `src/app/actions/calendar.ts` — `generateSlots()` |
| ℹ️ NÍZKÁ | Notion rate limit retry (backoff) není implementován | `src/lib/calendar/notion-provider.ts` |
| ℹ️ NÍZKÁ | Duplikace "žádné sloty" render v slot-picker.tsx | `slot-picker.tsx` řádky 91-111 vs 138-155 |

### Doporučení

Timezone bug v generateSlots je funkční chyba (ne jen code quality). Doporučuji opravu před nasazením:

```typescript
// Místo hardcode +02:00 použít Intl pro dynamický offset
const tzOffset = -new Date().getTimezoneOffset(); // nebo lookup pro Europe/Prague
```

Ale protože `working_hours.timezone` je v DB a CRM běží na serveru (UTC), správné řešení je použít knihovnu jako `date-fns-tz` nebo vypočítat offset dynamicky z `working_hours.timezone`.

Ostatní problémy jsou nekritické a mohou počkat na další iteraci.
