# QA Report: Admin dashboard (Task #33)

> Kontrolor, 2026-10-10

## Verdikt: ✅ SCHVÁLENO

---

## 1. Migrace 017 — RPC get_dashboard_stats

### KPI counters ✅
Všech 6 KPI přítomno:
- `total_leads` — aktivní leady v projektu ✅
- `calls_today` — hovory od začátku dnešního dne (timezone-aware) ✅
- `reached_today` — hovory s `group_name = 'interest'` dnes ✅
- `consultations_this_week` — tasky typu `consultation` tento týden ✅
- `pending_tasks` — nevyřízené tasky ✅
- `active_shifts` — aktivní směny ✅
- Bonus: `calls_today_total_for_pct` pro výpočet dovoláno % ✅

**Timezone-aware:** `v_today_start` a `v_week_start` počítány přes `date_trunc AT TIME ZONE v_tz` — správně. ✅

### Pipeline ✅
- Stages seřazeny dle `s.position`
- Pro každou fázi: name, key, type, count (aktivní leady)
- COALESCE na `'[]'` pokud žádné fáze ✅

### Operators ✅
- Iteruje přes `project_members` + `profiles` kde `role = 'operator'`
- Pro každého: id, name, calls_today, reached_today, consultations_week, has_active_shift
- `consultations_week` správně čte `t.assigned_to` — sloupec existuje v tasks tabulce (migrace 002 index `idx_tasks_assigned`) ✅
- Seřazeno dle `pr.full_name` ✅

---

## 2. dashboard/page.tsx — guard ✅

```tsx
if (!profile || (profile.role !== "admin" && profile.role !== "manager"))
  redirect(`/${projectSlug}/fronta`);
```
Admin i manager mají přístup, operátor přesměrován. ✅

---

## 3. Dashboard komponenta

### 6 KPI dlaždic ✅
- "Celkem leadů", "Hovory dnes", "Dovoláno" (s %), "Konzultace / týden", "Nevyřízené úkoly", "Aktivní směny" ✅

### Pipeline CSS-only bar chart ✅
- `PipelineBar` komponenta s CSS šířkou (`width: X%`) — žádný JS chart lib ✅
- Barvy podle `stage.type` (won = zelená, lost = červená, open = modrá) ✅

### Tabulka operátorů ✅
- Sloupce: Operátor, Hovory dnes, Dovoláno, Konzultace, stav směny ✅
- "Aktivní" / "Offline" badge ✅

### Rychlé odkazy ✅
- Kontakty, Pipeline, Report, Import, Export hodin ✅
- Všechny jsou interní linky (`/${projectSlug}/{href}`) ✅

### Česky ✅
- Všechny labely česky: "Celkem leadů", "Hovory dnes", "Dovoláno", "Konzultace", "Nevyřízené úkoly", "Aktivní směny", "Operátor", "Aktivní", "Offline" ✅

---

## 4. Redirect v [projectSlug]/page.tsx ✅

```tsx
if (profile?.role === "admin" || profile?.role === "manager") {
  redirect(`/${projectSlug}/dashboard`);
}
redirect(`/${projectSlug}/fronta`);
```
Admin/manager → `/dashboard`, operátor (a neznámá role) → `/fronta`. ✅

---

## 5. app-header.tsx ✅

```tsx
const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", href: "dashboard" },  // první položka ✅
  ...
]
```

---

## 6. Build ✅

```
npm run build → ✅ Compiled successfully
```

---

## Reverzní kontrola

| # | Požadavek | Stav |
|---|-----------|------|
| 1 | RPC get_dashboard_stats — 6 KPI | ✅ |
| 2 | Pipeline se stage counts | ✅ |
| 3 | Operátoři: hovory, dovoláno, konzultace, směna | ✅ |
| 4 | dashboard/page.tsx admin/manager only | ✅ |
| 5 | 6 KPI dlaždic | ✅ |
| 6 | Pipeline CSS bar chart | ✅ |
| 7 | Tabulka operátorů | ✅ |
| 8 | Rychlé odkazy (5 odkazů) | ✅ |
| 9 | Česky, žádná angličtina | ✅ |
| 10 | Redirect admin → /dashboard, operátor → /fronta | ✅ |
| 11 | Dashboard první v ADMIN_NAV_ITEMS | ✅ |
| 12 | Build | ✅ |

**12/12 splněno. Žádné problémy.**
