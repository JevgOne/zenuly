# QA Report: Krok 12 — Denní report

> Kontrolor, 2026-10-10

---

## 1. SIMPLIFY kontrola

### Hodnocení: ČISTÉ — jeden střední bug (cron timezone)

**supabase/migrations/014_daily_report.sql:**
- Komplexní RPC `get_daily_report()` — 5 sekcí (operators, outcomes, lost_reasons, funnel, overdue). ✅
- Operators sekce má subquery duplikaci (hodiny se počítají 3× pro net_hours, calls_per_hour a CASE) — mohlo by být CTE, ale funkční a čitelné. Nekritické.
- `funnel_prev_week` porovnává stejný den minulého týdne (`p_date - 7`) ✅
- Overdue správně rozlišuje tasks vs. callbacks vs. decks vs. offers ✅
- STABLE SECURITY DEFINER — správně ✅

**src/app/actions/report.ts** — dvě clean Server Actions: `getDailyReport` (user client) + `getDailyReportAdmin` (admin client pro cron). ✅

**src/lib/report-email-template.ts** — `server-only` import ✅
- `renderReportEmail()` generuje HTML email s KPI gridem, lost reasons barem, operators tabulkou, funnel barem.
- Podmíněné sekce (lost_reasons, operators) se zobrazí jen pokud mají data. ✅
- `formatCzechDateEmail()` přidá T12:00:00 pro stabilní timezone parsing — správně. ✅
- KPI grid: 6 tiles (hovory, dovoláno, konzultace, prezentace, nabídky, nemá zájem) — přesně podle předlohy ✅

**src/app/api/cron/daily-report/route.ts:**
- Bearer token autorizace přes `CRON_SECRET` ENV ✅
- Weekend skip přes `Intl.DateTimeFormat` s Europe/Prague timezone ✅
- Iteruje přes všechny aktivní projekty ✅
- Najde admina přes `find_project_admin` RPC ✅
- `admin.auth.admin.getUserById()` pro získání emailu admina ✅
- Audit log po odeslání ✅
- `results[]` array pro response — všechny projekty, i ty co selhaly ✅

**vercel.json** — cron schedule `"30 16 * * 1-5"`:
- 16:30 UTC × 1-5 (Po–Pá)
- V létě (CEST = UTC+2): 18:30 Prague ✅
- V zimě (CET = UTC+1): 17:30 Prague ❌

**⚠️ STŘEDNÍ BUG: Cron nerespektuje zimní čas.** Zadání požaduje "18:30 Europe/Prague každý pracovní den". Schedule `30 16 * * 1-5` = 18:30 pouze v létě. V zimě (od 26. října) odejde report v 17:30. Vercel nepodporuje IANA timezone v cron — DST musí řešit aplikace.

**Možné řešení:** Nastavit cron na `30 17 * * 1-5` (17:30 UTC = 18:30 CET v zimě, 19:30 CEST v létě) nebo přidat dva cron záznamy a v route zkontrolovat správný čas:
```json
{ "path": "/api/cron/daily-report", "schedule": "30 16 * * 1-5" },
{ "path": "/api/cron/daily-report", "schedule": "30 17 * * 1-5" }
```
A v route ověřit aktuální Prague hodinu (`getHours()`) a skip pokud není 18.

**report/page.tsx:**
- Admin-only guard + redirect pro operátory ✅
- Přijímá `?date=` query param pro historické reporty ✅
- Načítá všechny projekty pro switcher ✅

**report-view.tsx + 5 komponent:**
- Formatování datumu s T12:00:00 prefix pro stabilní timezone ✅
- Date picker pro navigaci v historii ✅
- Projekt switcher (pokud >1 projekt) ✅
- 5 komponent: kpi-grid, lost-reasons-chart, operators-table, funnel-chart, recommendations-panel ✅

**app-header.tsx — navigace:**
- Odkaz na `/report` přidán ✅

---

## 2. DEBUG kontrola

### Build: ✅ PASSED

```
npm run build → ✓ Compiled successfully
/[projectSlug]/report ✅ přítomna
/api/cron/daily-report ✅ přítomna
```

### Lint: ✅ PASSED

```
0 errors, 1 nesouvisející warning (scripts/)
```

---

## 3. REVERZNÍ kontrola

### Zadání: "Udělej denní report podle specifikace (body 1–5): stránku pro admina přesně podle předlohy 08 a e-mail každý pracovní den v 18:30 Europe/Prague přes plánovanou úlohu."

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 1 | Stránka denního reportu pro admina | ✅ | `/report` page s admin guard |
| 2 | Přesně podle předlohy 08 (KPI grid, lost reasons, operators, funnel) | ✅ | 5 komponent odpovídají předloze |
| 3 | Historické reporty (výběr data) | ✅ | `?date=` query param + date picker |
| 4 | E-mail každý pracovní den | ✅ | Cron `1-5` = Po–Pá ✅, weekend skip v kódu ✅ |
| 5 | E-mail v 18:30 Europe/Prague | ⚠️ | 18:30 jen v létě (CEST), v zimě 17:30 — DST bug |
| 6 | Plánovaná úloha (vercel.json crons) | ✅ | vercel.json crons sekce ✅ |
| 7 | CRON_SECRET autorizace | ✅ | Bearer token check v route ✅ |
| 8 | Audit log po odeslání | ✅ | `daily_report_sent` do audit_log ✅ |
| 9 | Iteruje přes všechny aktivní projekty | ✅ | Loop přes `projects.is_active = true` ✅ |

---

## Shrnutí

**Build:** ✅ OK  
**Lint:** ✅ OK  
**Reverzní kontrola:** 8/9 bodů ✅

### Nalezené problémy

| Závažnost | Popis | Soubor |
|-----------|-------|--------|
| ⚠️ STŘEDNÍ | Cron schedule `30 16 * * 1-5` = 18:30 Praha pouze v létě (CEST). V zimě (CET, od 26. října) odejde report v 17:30. Vercel cron je UTC-only. | `vercel.json` |

### Doporučený fix

Přidat druhý cron záznam (pro zimní čas) + timezone guard v route:
```json
"crons": [
  { "path": "/api/cron/daily-report", "schedule": "30 16 * * 1-5" },
  { "path": "/api/cron/daily-report", "schedule": "30 17 * * 1-5" }
]
```
V route přidat: pokud Prague hodina není 18, return `{ skipped: "wrong_hour" }`. Tím se report odešle vždy přesně v 18:30 Prague bez ohledu na DST.
