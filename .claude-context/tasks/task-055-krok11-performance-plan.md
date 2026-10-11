# Krok 11: Směny a výkon — kompletní implementační plán

> Planner v2, 2026-10-10 — enhanced s kompletním kódem

## Zdroje

- `docs/postup-prompty.md` Krok 11: "Udělej směny (Začít, Pauza, Ukončit), živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy a měsíční export odpracovaných hodin pro admina."
- `docs/specifikace-weblyx.md`: Cíl hovorů za hodinu (default 20), live počítadlo, upozornění na zápisy < 20s
- Existující kód: shift-bar.tsx, shifts.ts, migrace 007 (shift RPCs), migrace 013 (alerts + stats + export RPCs)

## Hotovo, když

> Z exportu spočítáš výplatu za testovací směny.

---

## Co už existuje vs. co chybí

| Funkce | Stav | Kde |
|--------|------|-----|
| Začít/Pauza/Ukončit směnu | HOTOVO | shift-bar.tsx + RPCs (007) |
| Live počítadlo hovorů/h vs. cíl | HOTOVO | shift-bar.tsx — progress bar, calls_this_hour, 60s polling |
| Pod cílem vizuál (červená) | HOTOVO | shift-bar.tsx:152-166 — urgent barva + "pod cilem" text |
| Alerts tabulka + RLS | HOTOVO | 013_performance_alerts.sql:6-20 |
| Rapid calls trigger (< 20s) | HOTOVO | 013_performance_alerts.sql:25-58 |
| `get_operator_stats` RPC | HOTOVO | 013_performance_alerts.sql:63-119 |
| `export_monthly_hours` RPC | HOTOVO | 013_performance_alerts.sql:124-181 |
| **Server actions** | CHYBÍ | — |
| **Stránka Výkon (operátor)** | CHYBÍ | bottom-nav má "Výkon" odkaz, ale route neexistuje |
| **Stránka Export hodin (admin)** | CHYBÍ | — |
| **Admin alert notifikace** | CHYBÍ | badge / seznam alertů pro admina |

---

## Závislosti

- Migrace 013 (performance_alerts) — **už existuje, neměnit**
- `src/app/actions/shifts.ts` — **existuje, neměnit**
- `shift-bar.tsx` — **existuje, funguje správně, neměnit** (live polling 60s, progress bar, pod cílem vizuál)
- `calling-layout.tsx` — ShiftBar je integrována ve všech 3 breakpointech

---

## Pořadí implementace (5 kroků)

1. Server actions — `src/app/actions/performance.ts`
2. Stránka Výkon pro operátora — `vykon/page.tsx` + `vykon/stats-view.tsx`
3. Export hodin pro admina — `export-hodin/page.tsx` + `export-hodin/export-view.tsx`
4. Admin alerts — `src/app/actions/alerts.ts` + badge v navigaci (volitelné, nice-to-have)
5. `npm run lint`, `npm run build`

---

## Krok 1: Server Actions `src/app/actions/performance.ts`

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export type OperatorStats = {
  calls_today: number;
  reached_today: number;
  meetings_today: number;
  hours_today: number;
  calls_per_hour: number;
  target_per_hour: number;
  on_target: boolean;
};

export type MonthlyHoursRow = {
  operator_id: string;
  operator_name: string;
  total_shifts: number;
  total_hours: number;
  total_pause_hours: number;
  net_hours: number;
  total_calls: number;
  total_reached: number;
  calls_per_hour: number;
};

export async function getOperatorStats(
  projectId: string,
  date?: string
): Promise<OperatorStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_operator_stats", {
    p_project_id: projectId,
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return data as OperatorStats;
}

export async function getMonthlyHours(
  projectId: string,
  year: number,
  month: number
): Promise<MonthlyHoursRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_monthly_hours", {
    p_project_id: projectId,
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MonthlyHoursRow[];
}

export function formatMonthlyHoursCSV(rows: MonthlyHoursRow[]): string {
  const header =
    "Operátor;Směny;Hodiny celkem;Pauzy (h);Čisté hodiny;Hovory;Dovoláno;Hovory/h";
  const lines = rows.map((r) =>
    [
      r.operator_name,
      r.total_shifts,
      r.total_hours.toFixed(1).replace(".", ","),
      r.total_pause_hours.toFixed(1).replace(".", ","),
      r.net_hours.toFixed(1).replace(".", ","),
      r.total_calls,
      r.total_reached,
      r.calls_per_hour.toFixed(1).replace(".", ","),
    ].join(";")
  );
  return [header, ...lines].join("\n");
}
```

---

## Krok 2: Stránka Výkon pro operátora

### 2.1 `src/app/(app)/[projectSlug]/vykon/page.tsx`

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOperatorStats } from "@/app/actions/performance";
import { StatsView } from "./stats-view";

export default async function VykonPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  const stats = await getOperatorStats(project.id as string);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-text mb-6">Můj výkon</h1>
        <StatsView stats={stats} />
      </div>
    </div>
  );
}
```

### 2.2 `src/app/(app)/[projectSlug]/vykon/stats-view.tsx`

```typescript
"use client";

import type { OperatorStats } from "@/app/actions/performance";

function StatCard({
  label,
  value,
  subtitle,
  accent,
  urgent,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
  urgent?: boolean;
}) {
  return (
    <div
      className={`p-5 rounded-2xl flex flex-col gap-1 ${
        accent
          ? "bg-accent-tint border-[1.5px] border-accent"
          : "bg-surface border border-line"
      }`}
    >
      <span
        className={`text-[13px] ${accent ? "text-accent-ink" : "text-muted"}`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[28px] font-medium ${
          urgent ? "text-urgent" : accent ? "text-accent-deep" : "text-text"
        }`}
      >
        {value}
      </span>
      {subtitle && (
        <span
          className={`text-[13px] ${
            urgent ? "text-urgent" : accent ? "text-accent-ink" : "text-muted"
          }`}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function StatsView({ stats }: { stats: OperatorStats }) {
  const reachedPct =
    stats.calls_today > 0
      ? Math.round((stats.reached_today / stats.calls_today) * 100)
      : 0;

  const progressPct = Math.min(
    100,
    (stats.calls_per_hour / stats.target_per_hour) * 100
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Calls per hour — hero card */}
      <div
        className={`p-6 rounded-2xl flex flex-col gap-3 ${
          stats.on_target
            ? "bg-accent-tint border-[1.5px] border-accent"
            : "bg-urgent-tint border-[1.5px] border-urgent"
        }`}
      >
        <span
          className={`text-[13px] font-medium ${
            stats.on_target ? "text-accent-ink" : "text-urgent-ink"
          }`}
        >
          Hovory za hodinu
        </span>
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-[40px] font-medium ${
              stats.on_target ? "text-accent-deep" : "text-urgent"
            }`}
          >
            {stats.calls_per_hour}
          </span>
          <span
            className={`text-[15px] ${
              stats.on_target ? "text-accent-ink" : "text-urgent-ink"
            }`}
          >
            / cíl {stats.target_per_hour}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-white/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              stats.on_target ? "bg-accent" : "bg-urgent"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {!stats.on_target && (
          <span className="text-[13px] text-urgent-ink font-medium">
            Pod cílem
          </span>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Hovory dnes" value={stats.calls_today} />
        <StatCard
          label="Dovoláno"
          value={stats.reached_today}
          subtitle={`${reachedPct} %`}
        />
        <StatCard label="Konzultace" value={stats.meetings_today} accent />
        <StatCard
          label="Odpracováno"
          value={`${stats.hours_today} h`}
        />
      </div>
    </div>
  );
}
```

---

## Krok 3: Export hodin pro admina

### 3.1 `src/app/(app)/[projectSlug]/export-hodin/page.tsx`

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ExportView } from "./export-view";

export default async function ExportHodinPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") redirect(`/${projectSlug}/fronta`);

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-text mb-2">
          Export odpracovaných hodin
        </h1>
        <p className="text-sm text-muted mb-6">
          {project.name as string} — měsíční přehled pro výpočet odměn
        </p>
        <ExportView projectId={project.id as string} />
      </div>
    </div>
  );
}
```

### 3.2 `src/app/(app)/[projectSlug]/export-hodin/export-view.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  getMonthlyHours,
  formatMonthlyHoursCSV,
  type MonthlyHoursRow,
} from "@/app/actions/performance";

const MONTH_NAMES = [
  "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
  "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
];

export function ExportView({ projectId }: { projectId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<MonthlyHoursRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMonthlyHours(projectId, year, month)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, year, month]);

  function handleDownloadCSV() {
    const csv = formatMonthlyHoursCSV(rows);
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hodiny-${year}-${String(month).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Totals
  const totalShifts = rows.reduce((s, r) => s + r.total_shifts, 0);
  const totalNetHours = rows.reduce((s, r) => s + r.net_hours, 0);
  const totalCalls = rows.reduce((s, r) => s + r.total_calls, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Month/year picker */}
      <div className="flex items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="h-11 px-3 border border-input-border rounded-lg bg-surface text-text text-[15px] outline-none focus:border-accent"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-11 px-3 border border-input-border rounded-lg bg-surface text-text text-[15px] outline-none focus:border-accent"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
            (y) => (
              <option key={y} value={y}>
                {y}
              </option>
            )
          )}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-8 text-center">
          <p className="text-muted text-[15px]">
            Za {MONTH_NAMES[month - 1]} {year} nejsou žádné směny.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-muted text-left">
                    <th className="px-4 py-3 font-medium border-b border-line">
                      Operátor
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Směny
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Hodiny
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Pauzy
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Čisté h
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Hovory
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Dovoláno
                    </th>
                    <th className="px-4 py-3 font-medium border-b border-line text-right">
                      Hovory/h
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.operator_id}>
                      <td className="px-4 py-3 font-medium text-text border-b border-track">
                        {r.operator_name}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.total_shifts}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.total_hours.toFixed(1).replace(".", ",")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.total_pause_hours.toFixed(1).replace(".", ",")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium border-b border-track">
                        {r.net_hours.toFixed(1).replace(".", ",")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.total_calls}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.total_reached}
                      </td>
                      <td className="px-4 py-3 text-right font-mono border-b border-track">
                        {r.calls_per_hour.toFixed(1).replace(".", ",")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-bg font-medium">
                    <td className="px-4 py-3 text-text">Celkem</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totalShifts}
                    </td>
                    <td className="px-4 py-3 text-right font-mono" colSpan={2} />
                    <td className="px-4 py-3 text-right font-mono">
                      {totalNetHours.toFixed(1).replace(".", ",")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totalCalls}
                    </td>
                    <td className="px-4 py-3 text-right font-mono" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownloadCSV}
            className="w-full h-12 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors"
          >
            Stáhnout CSV ({MONTH_NAMES[month - 1]} {year})
          </button>
        </>
      )}
    </div>
  );
}
```

---

## Krok 4: Admin alerts (volitelné, nice-to-have)

Admin alerts pro rychlé zápisy. Tabulka `alerts` + trigger `check_rapid_calls` v migraci 013 už existují. Stačí server action + UI.

### 4.1 `src/app/actions/alerts.ts`

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export type Alert = {
  id: string;
  alert_type: string;
  operator_name: string;
  details: {
    gap_seconds: number;
    call_id: string;
    previous_call_at: string;
  };
  read: boolean;
  created_at: string;
};

export async function getUnreadAlerts(
  projectId: string
): Promise<{ alerts: Alert[]; count: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("alerts")
    .select("id, alert_type, operator_id, details, read, created_at, profiles!operator_id(full_name)")
    .eq("project_id", projectId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const alerts = (data ?? []).map((a) => ({
    id: a.id as string,
    alert_type: a.alert_type as string,
    operator_name: (a.profiles as unknown as { full_name: string })?.full_name ?? "?",
    details: a.details as Alert["details"],
    read: a.read as boolean,
    created_at: a.created_at as string,
  }));

  return { alerts, count: alerts.length };
}

export async function markAlertRead(alertId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ read: true })
    .eq("id", alertId);
  if (error) throw new Error(error.message);
}

export async function markAllAlertsRead(projectId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("alerts")
    .update({ read: true })
    .eq("project_id", projectId)
    .eq("read", false);
  if (error) throw new Error(error.message);
}
```

### 4.2 Admin navigace — přidat "Export hodin" odkaz

V `src/components/app-header.tsx`, přidat "Export hodin" do `ADMIN_NAV_ITEMS`:

```typescript
// AKTUÁLNÍ (po K12):
const ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 3),
  { label: "Pipeline", href: "pipeline" },
  { label: "Import", href: "import" },
  { label: "Report", href: "report" },
  NAV_ITEMS[3], // Výkon
];

// NOVÝ — přidat Export hodin:
const ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 3),
  { label: "Pipeline", href: "pipeline" },
  { label: "Import", href: "import" },
  { label: "Report", href: "report" },
  { label: "Export hodin", href: "export-hodin" },
  NAV_ITEMS[3], // Výkon
];
```

**Poznámka:** "Export hodin" je admin-only stránka. Operátor vidí "Výkon" v bottom-nav (už existuje v `bottom-nav.tsx`). Admin vidí obojí v desktop nav.

---

## Krok 5: Build ověření

```bash
npm run lint
npm run build
```

---

## Soubory k vytvoření/upravit

| Soubor | Akce | Krok |
|--------|------|------|
| `src/app/actions/performance.ts` | NOVÝ — server actions | 1 |
| `src/app/(app)/[projectSlug]/vykon/page.tsx` | NOVÝ — operátor stránka | 2 |
| `src/app/(app)/[projectSlug]/vykon/stats-view.tsx` | NOVÝ — client component | 2 |
| `src/app/(app)/[projectSlug]/export-hodin/page.tsx` | NOVÝ — admin stránka | 3 |
| `src/app/(app)/[projectSlug]/export-hodin/export-view.tsx` | NOVÝ — client component | 3 |
| `src/app/actions/alerts.ts` | NOVÝ — alert actions (volitelné) | 4 |
| `src/components/app-header.tsx` | UPRAVIT — přidat "Export hodin" | 4 |

## DB migrace

**ŽÁDNÁ nová migrace.** Vše co je potřeba v DB už existuje v `013_performance_alerts.sql`:
- `alerts` tabulka s RLS
- `check_rapid_calls` trigger
- `get_operator_stats` RPC
- `export_monthly_hours` RPC

---

## Poznámky pro implementátora

1. **Shift-bar je hotová a funguje.** Neupravovat. Polling 60s, progress bar, pod cílem vizuál — vše OK.
2. **Migrace 013 je hotová.** Neměnit. RPCs `get_operator_stats` a `export_monthly_hours` jsou připraveny.
3. **CSV formát:** Středník jako oddělovač (české Excel). UTF-8 BOM (`\uFEFF`) pro správné otevření v Excelu. Čísla s čárkou místo tečky (`replace(".", ",")`).
4. **Výkon stránka:** Pro operátora i admina. Admin vidí svůj vlastní výkon (get_operator_stats používá `auth.uid()`). Pro admin přehled všech operátorů slouží Denní report (Krok 12).
5. **Export hodin:** Admin-only. Page.tsx kontroluje `profile.role !== 'admin'` → redirect. Jen ukončené směny (RPC filtruje `s.status = 'ended'`).
6. **Bottom nav:** "Výkon" odkaz (`href: "vykon"`) už existuje v `bottom-nav.tsx`, **neměnit**. Route `vykon/page.tsx` jen chybí.
7. **Alerts join:** Dotaz na `alerts` potřebuje JOIN na `profiles` pro jméno operátora. Supabase query: `.select("..., profiles!operator_id(full_name)")` — ověřit že RLS to povoluje (admin policy je `FOR ALL`).
8. **formatMonthlyHoursCSV** je server action (ne "use server" ale běží na serveru) — volá se z klienta, vrací string, klient vytváří Blob a downloaduje. Alternativně by šlo udělat jako API route, ale server action je jednodušší.
9. **Tabulka v exportu:** Footer řádek "Celkem" sečte směny, čisté hodiny a hovory. Pauzy a hovory/h se pro celkový řádek nezobrazují (nemá smysl průměrovat).
10. **Hero karta "Hovory za hodinu":** Na stránce Výkon je velká accent/urgent karta s číslem, cílem a progress barem. Kopíruje vizuální jazyk ze shift-bar ale větší.

## Kritérium "Hotovo, když"

- [ ] Stránka `/vykon` zobrazí operátorovi: hovory dnes, dovoláno, konzultace, hodiny, hovory/h vs. cíl
- [ ] Stránka `/export-hodin` zobrazí admin tabulku za zvolený měsíc
- [ ] CSV stažení funguje a otevře se správně v Excelu (české formátování)
- [ ] Z exportu lze spočítat výplatu za testovací směny (= net_hours × hodinová sazba)
- [ ] Rapid calls trigger generuje alert do DB (existuje, jen ověřit)
- [ ] `npm run build` projde bez chyb
