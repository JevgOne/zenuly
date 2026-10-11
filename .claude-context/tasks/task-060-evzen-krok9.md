# Evžen the King — Verdikt: Krok 9 (Kalendáře)

> Evžen the King, 2026-10-10

---

## VERDIKT: ✅ SCHVÁLENO

---

## Kontrola proti PŮVODNÍMU zadání

**Zadání:** "Napoj Google Kalendář admina: volné sloty pro výsledek Konzultace, vytvoření události s pozvánkou klientovi, připomínka 1 h předem. Lead se předá adminovi."

| # | Požadavek | Stav | Kde v kódu |
|---|-----------|------|------------|
| 1 | Google Kalendář admina napojený | ✅ | `src/app/api/auth/google-calendar/route.ts` — OAuth flow, `callback/route.ts` — token exchange + uložení do `calendar_connections` |
| 2 | Volné sloty pro výsledek Konzultace | ✅ | `calendar.ts:getAvailableSlots()` generuje 20min sloty + odečítá busy z kalendáře. `SlotPicker` v outcome-panel.tsx řádek 315 |
| 3 | Vytvoření události s pozvánkou klientovi | ✅ | `calendar.ts:createCalendarEvent()` s `attendeeEmail` + Google provider má `sendUpdates: "all"` (řádek 141 google-provider.ts) |
| 4 | Připomínka 1 h předem | ✅ | `reminderMinutes: 60` v `createCalendarEvent()` (calendar.ts řádek 189), Google provider nastaví `reminders.overrides` (řádek 148-151) |
| 5 | Lead se předá adminovi | ✅ | `find_project_admin` RPC v `getAvailableSlots()` + `calls.ts` předává `targetUserId: adminId` |

**Všech 5 bodů původního zadání splněno DOSLOVNĚ.**

---

## Kontrola proti ROZŠÍŘENÉMU zadání (plán)

| # | Požadavek | Stav | Kde v kódu |
|---|-----------|------|------------|
| 6 | Obecná CalendarProvider abstrakce | ✅ | `types.ts` — interface s getBusySlots, createEvent, deleteEvent, testConnection |
| 7 | Dva providery: Google + Notion | ✅ | `google-provider.ts` + `notion-provider.ts` |
| 8 | Provider-agnostický kód VŠUDE | ✅ | Grep na `if.*provider.*===` vrátil 0 výsledků mimo factory. calendar.ts, calls.ts, outcome-panel.tsx neví o konkrétních providerech |
| 9 | UI z ProviderMeta.credentialFields | ✅ | `calendar-section.tsx` generuje formuláře dynamicky z `credentialFields` (řádky 90-100+) |
| 10 | NIKDY neblokovat uložení hovoru | ✅ | `calls.ts` má try/catch kolem `createCalendarEvent`, komentář "Calendar event creation failed — don't block outcome save" |
| 11 | Jeden uživatel = jeden kalendář | ✅ | `UNIQUE (profile_id)` v migraci 011, `onConflict: "profile_id"` v upsert |
| 12 | SlotPicker v outcome-panel | ✅ | `<SlotPicker>` importován a použit v outcome-panel.tsx řádek 315 |
| 13 | Fallback na datetime-local | ✅ | `slot-picker.tsx` řádek 90-110 (error/empty → datetime-local input) + řádek 136-154 (days.length === 0) |

**Všech 8 bodů rozšířeného zadání splněno.**

---

## QA problémy — stav po opravách

| Problém z QA | Stav | Poznámka |
|-------------|------|----------|
| ⚠️ Timezone hardcode `+02:00` | ✅ OPRAVENO | Nová funkce `getTimezoneOffsetString()` s Intl API, dynamický offset na základě `workingHours.timezone` |
| ℹ️ Notion rate limit retry | NEKRITICKÉ | Akceptovatelné pro MVP, může se doplnit později |
| ℹ️ Duplikace "žádné sloty" render | NEKRITICKÉ | Dvě mírně odlišné větve (fallback vs. post-load), refactor může počkat |

---

## Závěr

Implementace Kroku 9 **PŘESNĚ odpovídá** jak původnímu, tak rozšířenému zadání. Timezone bug identifikovaný v QA byl opraven (Task #9). Kód je provider-agnostický, neblokuje uložení hovorů, a obsahuje všechny požadované funkce: OAuth flow, sloty, události s pozvánkami, připomínky, a fallback UI.

**Žádné rozpory se zadáním nalezeny.**
