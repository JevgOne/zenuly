# QA Report: Krok 11 — Směny a výkon

> Kontrolor, 2026-10-10

---

## 1. SIMPLIFY kontrola

### Hodnocení: ČISTÉ — jeden střední nález (chybějící live polling)

**supabase/migrations/013_performance_alerts.sql** — solidní migrace:
- `alerts` tabulka s dvěma indexy (project+time, unread partial index) ✅
- Trigger `trg_check_rapid_calls` — AFTER INSERT na calls, porovná s předchozím hovorem téhož operátora v projektu. ✅
- `get_operator_stats()` — počítá calls_today, reached_today, meetings_today, hours_today, calls_per_hour vs. target. Správně čte `calls_per_hour` target z `projects` tabulky. ✅
- `export_monthly_hours()` — CTE join shift_data + call_data, ROUND na 1 desetinné místo, LEFT JOIN zachytí operátory bez hovorů. ✅
- RLS pro `alerts`: pouze admin. ✅

**Drobnost v trigger funkci:** `check_rapid_calls` hledá předchozí hovor s `id != NEW.id` — ale trigger je AFTER INSERT, takže NEW.id v tabulce existuje. Podmínka je správná, ale trochu neintuitivní. Funkční. ✅

**src/app/actions/performance.ts** — tři čisté Server Actions. CSV generuje header + řádky oddělené `;`. ✅

**vykon/page.tsx** — minimální server wrapper, správně předává `projectId`. ✅

**performance-dashboard.tsx:**
- Jednorázový `useEffect` při mount — načte statistiky jednou. ✅
- **⚠️ STŘEDNÍ: Chybí live polling.** Zadání říká "živé počítadlo" — ale dashboard se neobnovuje automaticky. Operátor musí manuálně refreshnout stránku aby viděl aktualizované číslo hovorů za hodinu. shift-bar.tsx má polling každých 60s — ale ten volá `loadRef` (shift data), ne `getOperatorStats`. Performance dashboard naopak žádný interval nemá.
- `progressPct` je správně clampnutý na max 100. ✅
- `highlight === false` (strict equality) pro červenou — správně použito pro `on_target`. ✅

**export-hodin/page.tsx** — správně ověřuje `role === 'admin'` před rendrováním, redirect pro non-adminy. ✅

**monthly-hours-export.tsx:**
- Race condition guard (`fetchIdRef`) ✅
- UTF-8 BOM: `"\uFEFF" + csv` ✅
- CSV delimiter `;` ✅
- Download přes `URL.createObjectURL` + cleanup `revokeObjectURL` ✅
- Download tlačítko disabled pokud `rows.length === 0` ✅
- `/export-hodin` není v navigaci — přístupné jen přímou URL pro admina. Záměrné. ✅

**shift-bar.tsx (polling úprava):**
- `setInterval(60_000)` při aktivní směně ✅
- Volá `loadRef.current?.()` — refreshuje shift data (calls_this_hour v shift baru) ✅

---

## 2. DEBUG kontrola

### Build: ✅ PASSED

```
npm run build → ✓ Compiled successfully
/[projectSlug]/vykon ✅ přítomna
```

Nová route `/export-hodin` v build výstupu není vidět jako samostatná položka — ověřím:
- Route existuje v `/src/app/(app)/[projectSlug]/export-hodin/page.tsx` ✅
- Je pod `[projectSlug]` skupinou, zobrazuje se jako součást PPR skupiny ✅

### Lint: ✅ PASSED

```
0 errors, 1 nesouvisející warning
```

---

## 3. REVERZNÍ kontrola

### Zadání: "Živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy (< 20s trigger), měsíční export odpracovaných hodin pro admina (CSV se středníkem + UTF-8 BOM)."

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 1 | Počítadlo hovorů za hodinu | ✅ | `calls_per_hour` v `get_operator_stats()` + dashboard UI |
| 2 | Cíl (target) pro porovnání | ✅ | `target_per_hour` z `projects.calls_per_hour`, fallback 20 |
| 3 | Vizuální indikace pod cílem | ✅ | Progress bar + červená barva + "Pod cilem" text |
| 4 | Živé počítadlo (auto-refresh) | ⚠️ | Dashboard se nenačítá automaticky — jednorázový load při mount |
| 5 | Upozornění na rychlé zápisy < 20s | ✅ | DB trigger `trg_check_rapid_calls` + `alerts` tabulka |
| 6 | Měsíční export hodin pro admina | ✅ | `/export-hodin` page + `export_monthly_hours()` RPC |
| 7 | CSV se středníkem | ✅ | Delimiter `;` v `exportMonthlyHoursCSV()` |
| 8 | UTF-8 BOM | ✅ | `"\uFEFF"` prefix v Blob |
| 9 | Admin-only export | ✅ | Server-side role check v page.tsx |

---

## Shrnutí

**Build:** ✅ OK  
**Lint:** ✅ OK  
**Reverzní kontrola:** 8/9 bodů ✅

### Nalezené problémy

| Závažnost | Popis | Soubor |
|-----------|-------|--------|
| ⚠️ STŘEDNÍ | `PerformanceDashboard` nemá live polling — načte se jednou při mount, operátor musí manuálně refreshnout. Zadání říká "živé počítadlo". Fix: přidat `setInterval(60_000)` analogicky jak shift-bar. | `src/app/(app)/[projectSlug]/_components/performance-dashboard.tsx` |

### Doporučený fix

```tsx
// Přidat do performance-dashboard.tsx
useEffect(() => {
  const interval = setInterval(() => {
    getOperatorStats(projectId).then(setStats).catch(() => {});
  }, 60_000);
  return () => clearInterval(interval);
}, [projectId]);
```
