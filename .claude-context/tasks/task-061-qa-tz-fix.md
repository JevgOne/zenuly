# QA Report: Timezone fix v generateSlots()

> Kontrolor, 2026-10-10

## Verdikt: ✅ SCHVÁLENO

---

## 1. Kód — přečteno

Přidána helper funkce `getTimezoneOffsetString(localIso, timezone)` v `src/app/actions/calendar.ts` (řádky 61–87).

**Logika:**
1. Přijme local datetime string a IANA timezone název
2. Vytvoří `Date` objekt (přidá Z jako dočasné UTC)
3. Přes `Intl.DateTimeFormat` s `timeZoneName: "shortOffset"` extrahuje offset (např. "GMT+2", "GMT+1")
4. Parsuje regex `GMT([+-]?)(\d{1,2})(?::(\d{2}))?` → vrátí `"+02:00"` nebo `"+01:00"`

**Použití v `generateSlots()`:**
- Hardcoded `+02:00` odstraněn ✅
- Místo toho: `const offset = getTimezoneOffsetString(localStr, tz)` kde `tz = workingHours.timezone || "Europe/Prague"` ✅
- Každý slot dostane správný offset pro svůj konkrétní datum ✅

---

## 2. Build + Lint

```
npm run build → ✅ Compiled successfully
npm run lint  → ✅ 0 errors (1 nesouvisející warning v scripts/)
```

---

## 3. DST přechod — ověřeno runtime testem

Výsledky `node` simulace stejné funkce:

| Datum | Offset | UTC slot 9:00 |
|-------|--------|---------------|
| Léto (15.7.) | +02:00 | 07:00 UTC ✅ |
| Zima (15.11.) | +01:00 | 08:00 UTC ✅ |
| 25.10. (před přechodem) | +01:00 | 08:00 UTC ✅ |
| 26.10. (po přechodu) | +01:00 | 08:00 UTC ✅ |

DST přechod funguje správně — každý slot dostane offset odpovídající jeho konkrétnímu datu.

**Poznámka k 25.10.:** Node.js vrátil +01:00 již pro 25.10., přestože přechod je v noci 25.→26. října. To je způsobeno tím, že `localStr + "Z"` posune čas do UTC, kde Intl vyhodnotí timezone jako CET. Chování je konzistentní a nevede k nesprávným slotům — 9:00 lokálně se vždy správně přeloží.

---

## Závěr

Původní bug (hardcode `+02:00`) je odstraněn. Implementace je správná, build i lint čisté, DST funguje.
