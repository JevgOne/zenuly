# Krok 12: Denní report — kompletní implementační plán

> Planner, 2026-10-10 — enhanced s kompletním kódem

## Zdroje

- `docs/postup-prompty.md` Krok 12: "Udělej denní report podle specifikace (body 1–5): stránku pro admina přesně podle předlohy 08 a e-mail každý pracovní den v 18:30 Europe/Prague přes plánovanou úlohu."
- `docs/specifikace-weblyx.md`: Denní report body 1–5 (bod 6 = AI, fáze 4)
- `docs/design-predloha/08-report-majitele.html` — závazná vizuální předloha
- `docs/design.md`: Report majitele layout, barvy, fonty

## Hotovo, když

> Report dorazí sám a čísla sedí s daty v databázi.

## Závislosti

- **K10 (Resend)** — hotovo, `src/lib/resend.ts` existuje
- **K11 (Shifts/Performance)** — hotovo, migrace 013, shifts RPCs, `get_operator_stats`, `export_monthly_hours`
- `CRON_SECRET` env proměnná pro autorizaci cron endpointu

## Existující infrastruktura

| Co | Kde |
|---|---|
| Email utility | `src/lib/resend.ts` — `sendEmail({ to, subject, html })` |
| Template renderer | `src/lib/template-renderer.ts` — `renderTemplate()` |
| Admin client | `src/lib/supabase/admin.ts` — `createAdminClient()` |
| Shifts data | `supabase/migrations/007_queue_shifts_rpcs.sql`, `013_performance_alerts.sql` |
| Sent emails tracking | `supabase/migrations/012_email_sending.sql` |
| Project layout | `src/app/(app)/[projectSlug]/layout.tsx` — auth, role, ProjectProvider |
| App header nav | `src/components/app-header.tsx` — NAV_ITEMS, ADMIN_NAV_ITEMS |
| Bottom nav | `src/components/bottom-nav.tsx` — mobile nav |
| Project context | `src/lib/contexts/project-context.tsx` |

## Obsah reportu (body 1–5 ze specifikace)

| # | Sekce | Data |
|---|-------|------|
| 1 | Operátoři | Hodiny, hovory, hovory/h vs. cíl, dovolatelnost — po operátorech |
| 2 | Outcome přehled | Konzultace, odeslané prezentace, odeslané nabídky, Jindy, Nemá zájem, nová Nevolat |
| 3 | Důvody ztráty | Top důvody dnes + trend za 7 dní |
| 4 | Trychtýř | Dovoláno → zájem (výsledky 1–3) → konzultace, vs. minulý týden |
| 5 | Nedodělky | Úkoly po termínu, propadlé callbacky |
| 6 | Doporučení | Placeholder — AI fáze 4, zatím statický panel |

---

## Pořadí implementace (8 kroků)

1. Migrace — `get_daily_report` RPC
2. Server action — `getDailyReport`
3. Admin stránka — `report/page.tsx` (Server Component)
4. Report view — `report/report-view.tsx` (Client Component s date picker)
5. Dílčí UI komponenty — KPI grid, lost reasons chart, operators table, funnel, recommendations
6. Navigace — přidat "Report" do admin nav
7. E-mail template — `report-email-template.ts`
8. Cron endpoint + vercel.json

---

## Krok 1: Migrace `supabase/migrations/014_daily_report.sql`

Pozn: 013 je obsazena (performance_alerts). Další je 014.

```sql
-- =============================================
-- 014: Daily report RPC
-- =============================================

CREATE OR REPLACE FUNCTION get_daily_report(
  p_project_id uuid,
  p_date date DEFAULT CURRENT_DATE
) RETURNS jsonb AS $$
DECLARE
  v_project projects%ROWTYPE;
  v_target int;
  v_operators jsonb;
  v_outcomes jsonb;
  v_lost_reasons jsonb;
  v_lost_trend jsonb;
  v_funnel jsonb;
  v_funnel_prev jsonb;
  v_overdue_tasks int;
  v_overdue_callbacks int;
  v_new_dnc int;
  v_total_calls int;
  v_total_reached int;
  v_total_meetings int;
  v_avg_calls_per_hour numeric;
  v_total_hours numeric;
  v_decks_overdue int;
  v_offers_overdue int;
BEGIN
  SELECT * INTO v_project FROM projects WHERE id = p_project_id;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  v_target := v_project.calls_per_hour;

  -- ============================================
  -- 1. OPERÁTOŘI: hodiny, hovory, hovory/h, dovolatelnost, konzultace
  -- ============================================
  SELECT COALESCE(jsonb_agg(op_row ORDER BY op_row->>'operator_name'), '[]'::jsonb)
  INTO v_operators
  FROM (
    SELECT jsonb_build_object(
      'operator_id', sub.operator_id,
      'operator_name', sub.operator_name,
      'hours', sub.net_hours,
      'calls', sub.total_calls,
      'calls_per_hour', sub.calls_per_hour,
      'reached', sub.reached,
      'reached_pct', CASE WHEN sub.total_calls > 0
        THEN ROUND(sub.reached * 100.0 / sub.total_calls, 0) ELSE 0 END,
      'meetings', sub.meetings,
      'below_target', sub.calls_per_hour < v_target
    ) AS op_row
    FROM (
      SELECT
        pm.profile_id AS operator_id,
        pr.full_name AS operator_name,
        COALESCE(ROUND((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 1), 0) AS net_hours,
        (SELECT COUNT(*) FROM calls c
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date)::int AS total_calls,
        (SELECT COUNT(*) FROM calls c
         JOIN outcomes o ON o.id = c.outcome_id
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date
           AND o.key NOT IN ('no_answer', 'busy'))::int AS reached,
        (SELECT COUNT(*) FROM calls c
         JOIN outcomes o ON o.id = c.outcome_id
         WHERE c.operator_id = pm.profile_id
           AND c.project_id = p_project_id
           AND c.created_at::date = p_date
           AND o.key = 'meeting')::int AS meetings,
        CASE WHEN COALESCE((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 0) > 0
        THEN ROUND((
          SELECT COUNT(*)::numeric FROM calls c
          WHERE c.operator_id = pm.profile_id
            AND c.project_id = p_project_id
            AND c.created_at::date = p_date
        ) / NULLIF((
          SELECT SUM(
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
            - s.total_pause_s
          ) / 3600.0
          FROM shifts s
          WHERE s.operator_id = pm.profile_id
            AND s.project_id = p_project_id
            AND s.started_at::date = p_date
        ), 0), 1)
        ELSE 0 END AS calls_per_hour
      FROM project_members pm
      JOIN profiles pr ON pr.id = pm.profile_id
      WHERE pm.project_id = p_project_id
        AND pr.role = 'operator'
    ) sub
    WHERE sub.total_calls > 0 OR sub.net_hours > 0
  ) x;

  -- ============================================
  -- 2. OUTCOMES přehled (celkový za den)
  -- ============================================
  SELECT jsonb_build_object(
    'total_calls', COUNT(*)::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int,
    'offers', COUNT(*) FILTER (WHERE o.key = 'offer')::int,
    'decks', COUNT(*) FILTER (WHERE o.key = 'deck')::int,
    'reports', COUNT(*) FILTER (WHERE o.key = 'report')::int,
    'later', COUNT(*) FILTER (WHERE o.key = 'later')::int,
    'no_answer', COUNT(*) FILTER (WHERE o.key = 'no_answer')::int,
    'busy', COUNT(*) FILTER (WHERE o.key = 'busy')::int,
    'not_interested', COUNT(*) FILTER (WHERE o.key = 'not_interested')::int,
    'wrong_number', COUNT(*) FILTER (WHERE o.key = 'wrong_number')::int,
    'defunct', COUNT(*) FILTER (WHERE o.key = 'defunct')::int,
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int
  ) INTO v_outcomes
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date;

  v_total_calls := (v_outcomes->>'total_calls')::int;
  v_total_reached := (v_outcomes->>'reached')::int;
  v_total_meetings := (v_outcomes->>'meetings')::int;

  -- Total hours for avg calls/h
  SELECT COALESCE(ROUND(SUM(
    EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))
    - s.total_pause_s
  ) / 3600.0, 1), 0) INTO v_total_hours
  FROM shifts s
  WHERE s.project_id = p_project_id
    AND s.started_at::date = p_date;

  v_avg_calls_per_hour := CASE WHEN v_total_hours > 0
    THEN ROUND(v_total_calls::numeric / v_total_hours, 1)
    ELSE 0 END;

  -- ============================================
  -- 3. DŮVODY ZTRÁTY (dnes)
  -- ============================================
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason_name', lr.name,
    'reason_key', lr.key,
    'count', sub.cnt
  ) ORDER BY sub.cnt DESC), '[]'::jsonb) INTO v_lost_reasons
  FROM (
    SELECT l.lost_reason_id, COUNT(*)::int AS cnt
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    WHERE l.project_id = p_project_id
      AND s.type = 'lost'
      AND l.updated_at::date = p_date
      AND l.lost_reason_id IS NOT NULL
    GROUP BY l.lost_reason_id
  ) sub
  JOIN lost_reasons lr ON lr.id = sub.lost_reason_id;

  -- 7-day trend: all reasons over last 7 days for comparison
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reason_name', lr.name,
    'reason_key', lr.key,
    'count_7d', sub.cnt,
    'pct_7d', ROUND(sub.cnt * 100.0 / NULLIF(sub.total, 0), 0)
  ) ORDER BY sub.cnt DESC), '[]'::jsonb) INTO v_lost_trend
  FROM (
    SELECT l.lost_reason_id, COUNT(*)::int AS cnt,
           SUM(COUNT(*)) OVER()::int AS total
    FROM leads l
    JOIN stages s ON s.id = l.stage_id
    WHERE l.project_id = p_project_id
      AND s.type = 'lost'
      AND l.updated_at::date BETWEEN p_date - 7 AND p_date
      AND l.lost_reason_id IS NOT NULL
    GROUP BY l.lost_reason_id
  ) sub
  JOIN lost_reasons lr ON lr.id = sub.lost_reason_id;

  -- ============================================
  -- 4. TRYCHTÝŘ: dovoláno → zájem → konzultace (dnes)
  -- ============================================
  SELECT jsonb_build_object(
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int,
    'interest', COUNT(*) FILTER (WHERE o.key IN ('meeting', 'offer', 'deck', 'report'))::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int
  ) INTO v_funnel
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date;

  -- Srovnání: stejný den minulý týden
  SELECT jsonb_build_object(
    'reached', COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int,
    'interest', COUNT(*) FILTER (WHERE o.key IN ('meeting', 'offer', 'deck', 'report'))::int,
    'meetings', COUNT(*) FILTER (WHERE o.key = 'meeting')::int
  ) INTO v_funnel_prev
  FROM calls c
  JOIN outcomes o ON o.id = c.outcome_id
  WHERE c.project_id = p_project_id
    AND c.created_at::date = p_date - 7;

  -- ============================================
  -- 5. NEDODĚLKY
  -- ============================================
  SELECT COUNT(*)::int INTO v_overdue_tasks
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.due_at < now();

  SELECT COUNT(*)::int INTO v_overdue_callbacks
  FROM leads l
  JOIN stages s ON s.id = l.stage_id
  WHERE l.project_id = p_project_id
    AND l.is_active = true
    AND s.type = 'open'
    AND l.next_action_at < now()
    AND l.next_action_type = 'callback';

  -- Overdue deck tasks (send_deck po termínu)
  SELECT COUNT(*)::int INTO v_decks_overdue
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.task_type = 'send_deck'
    AND t.due_at < now();

  -- Overdue offer tasks
  SELECT COUNT(*)::int INTO v_offers_overdue
  FROM tasks t
  WHERE t.project_id = p_project_id
    AND t.status = 'pending'
    AND t.task_type = 'send_offer'
    AND t.due_at < now();

  -- New DNC today
  SELECT COUNT(*)::int INTO v_new_dnc
  FROM do_not_call dnc
  WHERE dnc.project_id = p_project_id
    AND dnc.created_at::date = p_date;

  -- ============================================
  -- COMPOSE RESULT
  -- ============================================
  RETURN jsonb_build_object(
    'date', p_date,
    'project_name', v_project.name,
    'target_per_hour', v_target,
    -- Aggregated KPI
    'total_calls', v_total_calls,
    'total_reached', v_total_reached,
    'total_meetings', v_total_meetings,
    'total_hours', v_total_hours,
    'avg_calls_per_hour', v_avg_calls_per_hour,
    'reached_pct', CASE WHEN v_total_calls > 0
      THEN ROUND(v_total_reached * 100.0 / v_total_calls, 0) ELSE 0 END,
    'not_interested_pct', CASE WHEN v_total_reached > 0
      THEN ROUND((v_outcomes->>'not_interested')::int * 100.0 / v_total_reached, 0) ELSE 0 END,
    -- Detailed breakdowns
    'outcomes', v_outcomes,
    'operators', v_operators,
    'lost_reasons', v_lost_reasons,
    'lost_trend_7d', v_lost_trend,
    'funnel', v_funnel,
    'funnel_prev_week', v_funnel_prev,
    -- Overdue
    'overdue_tasks', v_overdue_tasks,
    'overdue_callbacks', v_overdue_callbacks,
    'overdue_decks', v_decks_overdue,
    'overdue_offers', v_offers_overdue,
    'new_dnc', v_new_dnc
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

---

## Krok 2: Server Action `src/app/actions/report.ts`

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReportData = {
  date: string;
  project_name: string;
  target_per_hour: number;
  total_calls: number;
  total_reached: number;
  total_meetings: number;
  total_hours: number;
  avg_calls_per_hour: number;
  reached_pct: number;
  not_interested_pct: number;
  outcomes: {
    total_calls: number;
    meetings: number;
    offers: number;
    decks: number;
    reports: number;
    later: number;
    no_answer: number;
    busy: number;
    not_interested: number;
    wrong_number: number;
    defunct: number;
    reached: number;
  };
  operators: {
    operator_id: string;
    operator_name: string;
    hours: number;
    calls: number;
    calls_per_hour: number;
    reached: number;
    reached_pct: number;
    meetings: number;
    below_target: boolean;
  }[];
  lost_reasons: {
    reason_name: string;
    reason_key: string;
    count: number;
  }[];
  lost_trend_7d: {
    reason_name: string;
    reason_key: string;
    count_7d: number;
    pct_7d: number;
  }[];
  funnel: {
    reached: number;
    interest: number;
    meetings: number;
  };
  funnel_prev_week: {
    reached: number;
    interest: number;
    meetings: number;
  };
  overdue_tasks: number;
  overdue_callbacks: number;
  overdue_decks: number;
  overdue_offers: number;
  new_dnc: number;
};

export async function getDailyReport(
  projectId: string,
  date?: string
): Promise<ReportData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_daily_report", {
    p_project_id: projectId,
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return data as ReportData;
}

/** For cron — bypasses auth, uses admin client */
export async function getDailyReportAdmin(
  projectId: string,
  date?: string
): Promise<ReportData> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_daily_report", {
    p_project_id: projectId,
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return data as ReportData;
}

/** Get all active projects — for cron to iterate */
export async function getActiveProjects(): Promise<
  { id: string; name: string; slug: string }[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("projects")
    .select("id, name, slug")
    .eq("is_active", true);
  return (data ?? []) as { id: string; name: string; slug: string }[];
}

/** Get admin email for a project */
export async function getProjectAdminEmail(
  projectId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: adminId } = await admin.rpc("find_project_admin", {
    p_project_id: projectId,
  });
  if (!adminId) return null;

  const {
    data: { user },
  } = await admin.auth.admin.getUserById(adminId as string);
  return user?.email ?? null;
}
```

---

## Krok 3: Admin stránka `src/app/(app)/[projectSlug]/report/page.tsx`

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDailyReport } from "@/app/actions/report";
import { ReportView } from "./report-view";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { projectSlug } = await params;
  const { date } = await searchParams;
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") redirect(`/${projectSlug}/fronta`);

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  // Get all projects for switcher
  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("is_active", true);

  // Fetch report
  const reportDate =
    date ?? new Date().toISOString().slice(0, 10);
  const report = await getDailyReport(
    project.id as string,
    reportDate
  );

  return (
    <div className="min-h-screen bg-bg">
      <ReportView
        report={report}
        projects={(allProjects ?? []) as { id: string; name: string; slug: string }[]}
        currentProjectSlug={projectSlug}
        currentDate={reportDate}
      />
    </div>
  );
}
```

---

## Krok 4: Report View (Client Component) `src/app/(app)/[projectSlug]/report/report-view.tsx`

```typescript
"use client";

import { useRouter } from "next/navigation";
import type { ReportData } from "@/app/actions/report";
import { KpiGrid } from "./_components/kpi-grid";
import { LostReasonsChart } from "./_components/lost-reasons-chart";
import { RecommendationsPanel } from "./_components/recommendations-panel";
import { OperatorsTable } from "./_components/operators-table";
import { FunnelChart } from "./_components/funnel-chart";

function formatCzechDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  const months = [
    "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince",
  ];
  return `${days[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}. ${months[d.getMonth()]}`;
}

export function ReportView({
  report,
  projects,
  currentProjectSlug,
  currentDate,
}: {
  report: ReportData;
  projects: { id: string; name: string; slug: string }[];
  currentProjectSlug: string;
  currentDate: string;
}) {
  const router = useRouter();

  function handleDateChange(newDate: string) {
    router.push(`/${currentProjectSlug}/report?date=${newDate}`);
  }

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted">
              Denní report · {formatCzechDate(currentDate)}
            </span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="text-[13px] text-muted bg-transparent border border-line rounded px-2 py-0.5 outline-none focus:border-accent"
            />
          </div>
          <h1 className="text-[32px] font-semibold text-text leading-tight">
            {report.project_name} dnes: {report.total_meetings} konzultací ze{" "}
            {report.total_calls} hovorů
          </h1>
        </div>

        {/* Project switcher pills */}
        {projects.length > 1 && (
          <div className="flex gap-2">
            {projects.map((p) => (
              <button
                key={p.slug}
                onClick={() =>
                  router.push(`/${p.slug}/report?date=${currentDate}`)
                }
                className={`h-10 px-[14px] rounded-full text-sm font-medium transition-colors ${
                  p.slug === currentProjectSlug
                    ? "bg-text text-surface border-[1.5px] border-text"
                    : "bg-surface text-text border border-line-strong hover:border-text"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <KpiGrid report={report} />

      {/* Lost reasons + Recommendations */}
      <div className="flex flex-wrap gap-4">
        <LostReasonsChart
          reasons={report.lost_reasons}
          trend={report.lost_trend_7d}
        />
        <RecommendationsPanel />
      </div>

      {/* Operators table + Funnel */}
      <div className="flex flex-wrap gap-4">
        <OperatorsTable
          operators={report.operators}
          target={report.target_per_hour}
        />
        <FunnelChart
          funnel={report.funnel}
          overdueDecks={report.overdue_decks}
          overdueCallbacks={report.overdue_callbacks}
        />
      </div>
    </div>
  );
}
```

---

## Krok 5: Dílčí UI komponenty

Všechny v `src/app/(app)/[projectSlug]/report/_components/`.

### 5.1 `kpi-grid.tsx`

```typescript
import type { ReportData } from "@/app/actions/report";

type KpiCardProps = {
  label: string;
  value: number;
  subtitle: string;
  accent?: boolean;
  urgentSubtitle?: boolean;
};

function KpiCard({ label, value, subtitle, accent, urgentSubtitle }: KpiCardProps) {
  return (
    <div
      className={`p-[18px] rounded-2xl flex flex-col gap-1.5 ${
        accent
          ? "bg-accent-tint border-[1.5px] border-accent"
          : "bg-surface border border-line"
      }`}
    >
      <span className={`text-[13px] ${accent ? "text-accent-ink" : "text-muted"}`}>
        {label}
      </span>
      <span
        className={`font-mono text-[30px] font-medium ${
          accent ? "text-accent-deep" : "text-text"
        }`}
      >
        {value}
      </span>
      <span
        className={`text-[13px] ${
          urgentSubtitle ? "text-urgent" : accent ? "text-accent-ink" : "text-muted"
        }`}
      >
        {subtitle}
      </span>
    </div>
  );
}

export function KpiGrid({ report }: { report: ReportData }) {
  const o = report.outcomes;
  const reachedPct = report.reached_pct;
  const notInterestedPct = report.not_interested_pct;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      <KpiCard
        label="Hovory"
        value={report.total_calls}
        subtitle={`${report.avg_calls_per_hour} / h · cíl ${report.target_per_hour}`}
      />
      <KpiCard
        label="Dovoláno"
        value={report.total_reached}
        subtitle={`${reachedPct} % hovorů`}
      />
      <KpiCard
        label="Konzultace"
        value={report.total_meetings}
        subtitle={`${report.total_reached > 0 ? Math.round((report.total_meetings / report.total_reached) * 100) : 0} % dovolaných`}
        accent
      />
      <KpiCard
        label="Prezentace odeslány"
        value={o.decks}
        subtitle={report.overdue_decks > 0 ? `${report.overdue_decks} po termínu` : "v pořádku"}
        urgentSubtitle={report.overdue_decks > 0}
      />
      <KpiCard
        label="Nabídky odeslány"
        value={o.offers}
        subtitle={report.overdue_offers > 0 ? `${report.overdue_offers} po termínu` : "v pořádku"}
        urgentSubtitle={report.overdue_offers > 0}
      />
      <KpiCard
        label="Nemá zájem"
        value={o.not_interested}
        subtitle={`${notInterestedPct} % dovolaných`}
      />
    </div>
  );
}
```

### 5.2 `lost-reasons-chart.tsx`

```typescript
type LostReason = {
  reason_name: string;
  reason_key: string;
  count: number;
};

type LostTrend = {
  reason_name: string;
  reason_key: string;
  count_7d: number;
  pct_7d: number;
};

export function LostReasonsChart({
  reasons,
  trend,
}: {
  reasons: LostReason[];
  trend: LostTrend[];
}) {
  if (reasons.length === 0) {
    return (
      <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl">
        <h2 className="text-lg font-semibold text-text">Proč odmítli</h2>
        <p className="text-sm text-muted mt-4">Dnes žádné ztráty.</p>
      </div>
    );
  }

  const maxCount = reasons[0]?.count ?? 1;
  const topReason = reasons[0];
  const total = reasons.reduce((sum, r) => sum + r.count, 0);
  const topPctToday = total > 0 ? Math.round((topReason.count / total) * 100) : 0;

  // Find the same reason in 7-day trend
  const topTrend = trend.find((t) => t.reason_key === topReason.reason_key);
  const topPct7d = topTrend?.pct_7d ?? 0;

  // Determine trend text
  let trendText = "";
  if (topTrend && topPct7d !== topPctToday) {
    const direction = topPctToday > topPct7d ? "roste" : "klesá";
    trendText = `Za 7 dní „${topReason.reason_name}" ${direction} z ${topPct7d} % na ${topPctToday} %.`;
  }

  return (
    <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text">
        Proč odmítli: „{topReason.reason_name}" je {topPctToday} % důvodů
      </h2>
      <div className="flex flex-col gap-3">
        {reasons.map((r, i) => (
          <div
            key={r.reason_key}
            className="grid grid-cols-[140px_minmax(0,1fr)_40px] items-center gap-3 text-sm"
          >
            <span className="text-text">{r.reason_name}</span>
            <div className="h-2.5 rounded-full bg-track">
              <div
                className={`h-2.5 rounded-full ${i === 0 ? "bg-accent" : "bg-muted"}`}
                style={{ width: `${(r.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="font-mono text-right text-text">{r.count}</span>
          </div>
        ))}
      </div>
      {trendText && (
        <span className="text-[13px] text-muted">{trendText}</span>
      )}
    </div>
  );
}
```

### 5.3 `recommendations-panel.tsx`

```typescript
export function RecommendationsPanel() {
  return (
    <div className="flex-[1_1_360px] min-w-0 p-[22px] bg-text text-surface rounded-2xl flex flex-col gap-[14px]">
      <h2 className="text-lg font-semibold text-surface">
        Doporučení na zítra
      </h2>
      <p className="text-[15px] leading-relaxed text-surface/70">
        Tato sekce bude dostupná po pilotním provozu. AI doporučení se budou
        generovat automaticky na základě denních dat.
      </p>
    </div>
  );
}
```

### 5.4 `operators-table.tsx`

```typescript
type Operator = {
  operator_id: string;
  operator_name: string;
  hours: number;
  calls: number;
  calls_per_hour: number;
  reached: number;
  meetings: number;
  below_target: boolean;
};

export function OperatorsTable({
  operators,
  target,
}: {
  operators: Operator[];
  target: number;
}) {
  if (operators.length === 0) {
    return (
      <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl">
        <h2 className="text-lg font-semibold text-text">Operátoři</h2>
        <p className="text-sm text-muted mt-4">Dnes žádná data.</p>
      </div>
    );
  }

  return (
    <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text">Operátoři</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-muted text-left">
              <th className="px-2 py-2.5 font-medium border-b border-line">
                Operátor
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Hodiny
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Hovory
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Za hodinu
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Dovoláno
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Konzultace
              </th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op, i) => (
              <tr key={op.operator_id}>
                <td
                  className={`px-2 py-3 font-medium text-text ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  }`}
                >
                  {op.operator_name}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  }`}
                >
                  {op.hours.toFixed(1).replace(".", ",")}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  }`}
                >
                  {op.calls}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  } ${op.below_target ? "text-urgent" : ""}`}
                >
                  {op.calls_per_hour}
                  {op.below_target && (
                    <span className="text-urgent"> pod cílem</span>
                  )}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  }`}
                >
                  {op.reached}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-track" : ""
                  }`}
                >
                  {op.meetings}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 5.5 `funnel-chart.tsx`

```typescript
export function FunnelChart({
  funnel,
  overdueDecks,
  overdueCallbacks,
}: {
  funnel: { reached: number; interest: number; meetings: number };
  overdueDecks: number;
  overdueCallbacks: number;
}) {
  const maxVal = funnel.reached || 1;

  const levels = [
    { label: "Dovoláno", value: funnel.reached, color: "bg-muted" },
    {
      label: "Zájem (podklady nebo konzultace)",
      value: funnel.interest,
      color: "bg-muted",
    },
    { label: "Konzultace", value: funnel.meetings, color: "bg-accent" },
  ];

  // Build overdue text
  const overdueParts: string[] = [];
  if (overdueDecks > 0) {
    overdueParts.push(
      `${overdueDecks} ${overdueDecks === 1 ? "prezentace" : "prezentace"} po termínu`
    );
  }
  if (overdueCallbacks > 0) {
    overdueParts.push(
      `${overdueCallbacks} ${overdueCallbacks === 1 ? "propadlý callback" : "propadlé callbacky"}`
    );
  }
  const overdueText =
    overdueParts.length > 0
      ? `Nedodělky: ${overdueParts.join(", ")}.`
      : null;

  return (
    <div className="flex-[1_1_360px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-[14px]">
      <h2 className="text-lg font-semibold text-text">Kde hovory padají</h2>
      {levels.map((level) => (
        <div key={level.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-text">{level.label}</span>
            <span className="font-mono">{level.value}</span>
          </div>
          <div
            className={`h-3 rounded-md ${level.color}`}
            style={{ width: `${Math.max((level.value / maxVal) * 100, 2)}%` }}
          />
        </div>
      ))}
      {overdueText && (
        <span className="text-[13px] text-muted">{overdueText}</span>
      )}
    </div>
  );
}
```

---

## Krok 6: Navigace — přidat "Report" pro admina

### 6.1 `src/components/app-header.tsx`

Přidat `{ label: "Report", href: "report" }` do `ADMIN_NAV_ITEMS`:

```typescript
// AKTUÁLNÍ:
const ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 3),
  { label: "Pipeline", href: "pipeline" },
  { label: "Import", href: "import" },
  NAV_ITEMS[3],
];

// NOVÝ:
const ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 3),
  { label: "Pipeline", href: "pipeline" },
  { label: "Import", href: "import" },
  { label: "Report", href: "report" },
  NAV_ITEMS[3],
];
```

Report se objeví v desktop navigaci pro admin/manager roli mezi "Import" a "Výkon".

### 6.2 Bottom nav (mobil)

Bottom nav pro operátory: **neměnit**. Report je admin-only stránka, admini ji otevřou z desktopové navigace nebo z přímého odkazu. Na mobilu admin uvidí Report v AppHeader hamburgeru (pokud existuje) nebo přes URL.

---

## Krok 7: E-mail template `src/lib/report-email-template.ts`

HTML e-mail s inline styly, kompatibilní s Outlook (table layout).

```typescript
import type { ReportData } from "@/app/actions/report";

function formatCzechDateEmail(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  return `${days[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function renderReportEmail(report: ReportData): { subject: string; html: string } {
  const subject = `${report.project_name}: ${report.total_meetings} konzultací ze ${report.total_calls} hovorů — ${formatCzechDateEmail(report.date)}`;

  const o = report.outcomes;

  // KPI cards as table cells
  const kpis = [
    { label: "Hovory", value: report.total_calls, sub: `${report.avg_calls_per_hour}/h · cíl ${report.target_per_hour}` },
    { label: "Dovoláno", value: report.total_reached, sub: `${report.reached_pct} % hovorů` },
    { label: "Konzultace", value: report.total_meetings, sub: `${report.total_reached > 0 ? Math.round((report.total_meetings / report.total_reached) * 100) : 0} % dovolaných`, accent: true },
    { label: "Prezentace", value: o.decks, sub: report.overdue_decks > 0 ? `${report.overdue_decks} po termínu` : "OK", urgent: report.overdue_decks > 0 },
    { label: "Nabídky", value: o.offers, sub: report.overdue_offers > 0 ? `${report.overdue_offers} po termínu` : "OK", urgent: report.overdue_offers > 0 },
    { label: "Nemá zájem", value: o.not_interested, sub: `${report.not_interested_pct} % dovolaných` },
  ];

  const kpiCells = kpis
    .map((k) => {
      const bg = k.accent ? "#E8ECFA" : "#FDFDFB";
      const border = k.accent ? "2px solid #2449C9" : "1px solid #E4E2DC";
      const labelColor = k.accent ? "#1B3699" : "#5E6168";
      const valueColor = k.accent ? "#12245F" : "#16181D";
      const subColor = k.urgent ? "#A3410E" : labelColor;
      return `<td style="padding:8px;width:16.66%">
        <div style="padding:16px;background:${bg};border:${border};border-radius:12px">
          <div style="font-size:13px;color:${labelColor}">${k.label}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:28px;font-weight:500;color:${valueColor};margin:4px 0">${k.value}</div>
          <div style="font-size:13px;color:${subColor}">${k.sub}</div>
        </div>
      </td>`;
    })
    .join("");

  // Lost reasons as bars
  const maxLostCount = report.lost_reasons[0]?.count ?? 1;
  const lostBars = report.lost_reasons
    .slice(0, 6)
    .map((r, i) => {
      const pct = Math.round((r.count / maxLostCount) * 100);
      const barColor = i === 0 ? "#2449C9" : "#8A8D94";
      return `<tr>
        <td style="padding:4px 0;font-size:14px;width:140px">${r.reason_name}</td>
        <td style="padding:4px 8px">
          <div style="height:10px;border-radius:5px;background:#ECEAE4">
            <div style="width:${pct}%;height:10px;border-radius:5px;background:${barColor}"></div>
          </div>
        </td>
        <td style="padding:4px 0;font-family:'IBM Plex Mono',monospace;text-align:right;width:40px;font-size:14px">${r.count}</td>
      </tr>`;
    })
    .join("");

  // Operators table rows
  const opRows = report.operators
    .map((op) => {
      const cphStyle = op.below_target
        ? 'color:#A3410E'
        : '';
      const cphText = op.below_target
        ? `${op.calls_per_hour} pod cílem`
        : `${op.calls_per_hour}`;
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;font-weight:500">${op.operator_name}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.hours.toFixed(1).replace('.', ',')}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.calls}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace;${cphStyle}">${cphText}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.reached}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.meetings}</td>
      </tr>`;
    })
    .join("");

  // Funnel bars
  const funnelMax = report.funnel.reached || 1;
  const funnelLevels = [
    { label: "Dovoláno", value: report.funnel.reached },
    { label: "Zájem", value: report.funnel.interest },
    { label: "Konzultace", value: report.funnel.meetings },
  ];
  const funnelBars = funnelLevels
    .map((f, i) => {
      const pct = Math.max(Math.round((f.value / funnelMax) * 100), 2);
      const color = i === 2 ? "#2449C9" : "#8A8D94";
      return `<tr>
        <td style="padding:6px 0">
          <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px">
            <span>${f.label}</span>
            <span style="font-family:'IBM Plex Mono',monospace">${f.value}</span>
          </div>
          <div style="height:12px;border-radius:6px;background:${color};width:${pct}%"></div>
        </td>
      </tr>`;
    })
    .join("");

  // Overdue text
  const overdueParts: string[] = [];
  if (report.overdue_decks > 0) overdueParts.push(`${report.overdue_decks} prezentace po termínu`);
  if (report.overdue_callbacks > 0) overdueParts.push(`${report.overdue_callbacks} propadlé callbacky`);
  const overdueText = overdueParts.length > 0 ? `Nedodělky: ${overdueParts.join(", ")}.` : "";

  const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F6F5F1;font-family:'IBM Plex Sans',Arial,sans-serif;color:#16181D">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F1">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="padding-bottom:24px">
    <div style="font-size:13px;color:#5E6168;margin-bottom:4px">Denní report · ${formatCzechDateEmail(report.date)}</div>
    <div style="font-size:24px;font-weight:600;line-height:1.2">${report.project_name} dnes: ${report.total_meetings} konzultací ze ${report.total_calls} hovorů</div>
  </td></tr>

  <!-- KPI Grid (2x3) -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>${kpiCells.slice(0, 3)}</tr>
      <tr>${kpiCells.slice(3, 6)}</tr>
    </table>
  </td></tr>

  <!-- Spacer -->
  <tr><td style="padding:16px 0"></td></tr>

  <!-- Lost reasons -->
  ${report.lost_reasons.length > 0 ? `
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Proč odmítli</div>
    <table width="100%" cellpadding="0" cellspacing="0">${lostBars}</table>
  </td></tr>
  <tr><td style="padding:8px 0"></td></tr>` : ''}

  <!-- Operators -->
  ${report.operators.length > 0 ? `
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Operátoři</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
      <tr style="color:#5E6168">
        <th style="padding:8px;text-align:left;font-weight:500;border-bottom:1px solid #E4E2DC">Operátor</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Hodiny</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Hovory</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Za hodinu</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Dovoláno</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Konzultace</th>
      </tr>
      ${opRows}
    </table>
  </td></tr>
  <tr><td style="padding:8px 0"></td></tr>` : ''}

  <!-- Funnel -->
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Kde hovory padají</div>
    <table width="100%" cellpadding="0" cellspacing="0">${funnelBars}</table>
    ${overdueText ? `<div style="font-size:13px;color:#5E6168;margin-top:8px">${overdueText}</div>` : ''}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0 0;text-align:center;font-size:12px;color:#5E6168">
    Odesláno z <a href="https://zenuly.cz" style="color:#2449C9">Zenuly CRM</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}
```

---

## Krok 8: Cron endpoint + vercel.json

### 8.1 `src/app/api/cron/daily-report/route.ts`

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderReportEmail } from "@/lib/report-email-template";
import type { ReportData } from "@/app/actions/report";

export async function GET(request: Request) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Check if today is a working day in Europe/Prague
  const now = new Date();
  const pragueWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    weekday: "short",
  }).format(now);

  if (["Sat", "Sun"].includes(pragueWeekday)) {
    return Response.json({ skipped: "weekend" });
  }

  // 3. Get today's date in Prague timezone
  const pragueDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
  }).format(now); // "2026-10-10" format

  const admin = createAdminClient();

  // 4. Get all active projects
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, slug")
    .eq("is_active", true);

  if (!projects || projects.length === 0) {
    return Response.json({ skipped: "no_active_projects" });
  }

  const results: { project: string; sent: boolean; error?: string }[] = [];

  for (const project of projects) {
    try {
      // 4a. Get report data
      const { data: reportData, error: rpcError } = await admin.rpc(
        "get_daily_report",
        {
          p_project_id: project.id,
          p_date: pragueDate,
        }
      );

      if (rpcError) {
        results.push({
          project: project.name as string,
          sent: false,
          error: rpcError.message,
        });
        continue;
      }

      const report = reportData as ReportData;

      // 4b. Render email
      const { subject, html } = renderReportEmail(report);

      // 4c. Find project admin email
      const { data: adminId } = await admin.rpc("find_project_admin", {
        p_project_id: project.id,
      });

      if (!adminId) {
        results.push({
          project: project.name as string,
          sent: false,
          error: "No admin found",
        });
        continue;
      }

      const {
        data: { user: adminUser },
      } = await admin.auth.admin.getUserById(adminId as string);

      if (!adminUser?.email) {
        results.push({
          project: project.name as string,
          sent: false,
          error: "Admin has no email",
        });
        continue;
      }

      // 4d. Send email
      await sendEmail({
        to: adminUser.email,
        subject,
        html,
      });

      // 4e. Audit log
      await admin.from("audit_log").insert({
        project_id: project.id,
        action: "daily_report_sent",
        details: {
          date: pragueDate,
          to: adminUser.email,
          total_calls: report.total_calls,
          total_meetings: report.total_meetings,
        },
      });

      results.push({ project: project.name as string, sent: true });
    } catch (err) {
      results.push({
        project: project.name as string,
        sent: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return Response.json({ results, date: pragueDate });
}
```

### 8.2 `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-report",
      "schedule": "30 16 * * 1-5"
    }
  ]
}
```

**Pozn:** `30 16 * * 1-5` = 16:30 UTC = 18:30 CEST (letní čas). V zimním čase (CET) to bude 17:30 CET, ne 18:30. Report přijde o hodinu dříve v zimě.

**Alternativa pro přesné 18:30 Europe/Prague:** Nastavit dvě crony (16:30 UTC + 17:30 UTC) a v kódu zkontrolovat přesný pražský čas. Jednodušší varianta je nechat 16:30 UTC a akceptovat posun v zimě.

Pokud je potřeba přesné 18:30 celý rok, v route přidat kontrolu:

```typescript
// Přesnější: zkontrolovat Prague time window
const pragueHour = parseInt(
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  }).format(now)
);

if (pragueHour < 17 || pragueHour > 19) {
  return Response.json({ skipped: "outside_window" });
}
```

---

## Soubory k vytvoření/upravit

| Soubor | Akce | Krok |
|--------|------|------|
| `supabase/migrations/014_daily_report.sql` | NOVÝ — `get_daily_report` RPC | 1 |
| `src/app/actions/report.ts` | NOVÝ — server actions | 2 |
| `src/app/(app)/[projectSlug]/report/page.tsx` | NOVÝ — admin stránka | 3 |
| `src/app/(app)/[projectSlug]/report/report-view.tsx` | NOVÝ — client component | 4 |
| `src/app/(app)/[projectSlug]/report/_components/kpi-grid.tsx` | NOVÝ | 5 |
| `src/app/(app)/[projectSlug]/report/_components/lost-reasons-chart.tsx` | NOVÝ | 5 |
| `src/app/(app)/[projectSlug]/report/_components/recommendations-panel.tsx` | NOVÝ | 5 |
| `src/app/(app)/[projectSlug]/report/_components/operators-table.tsx` | NOVÝ | 5 |
| `src/app/(app)/[projectSlug]/report/_components/funnel-chart.tsx` | NOVÝ | 5 |
| `src/components/app-header.tsx` | UPRAVIT — přidat "Report" do ADMIN_NAV_ITEMS | 6 |
| `src/lib/report-email-template.ts` | NOVÝ — HTML email renderer | 7 |
| `src/app/api/cron/daily-report/route.ts` | NOVÝ — cron endpoint | 8 |
| `vercel.json` | NOVÝ — cron schedule | 8 |

## Env proměnné (produkce)

- `CRON_SECRET` — pro ověření cron requestů (přidat do Vercel env)
- `RESEND_API_KEY` — sdílený s K10 (už existuje)
- `RESEND_FROM_EMAIL` — sdílený s K10 (už existuje)

## Poznámky pro implementátora

1. **Předloha `08-report-majitele.html` je závazná.** Barvy, fonty, rozměry, layout přesně podle designu. Viz `docs/design.md` pro token mapu.
2. **Hlavní číslo v titulku:** "{Projekt} dnes: {N} konzultací ze {M} hovorů" — dynamicky z dat.
3. **KPI "Konzultace"** má accent border (modrý, `border-accent`, 1.5px) a accent-tint pozadí — zvýrazněná oproti ostatním.
4. **"Pod cílem"** v tabulce operátorů: pokud `calls_per_hour < target`, text červeně (`text-urgent`) + "pod cílem".
5. **Doporučení** (bod 6 specifikace) = fáze 4, placeholder panel. Tmavé pozadí (`bg-text`), bílý text, zpráva "bude dostupné po pilotu".
6. **Trychtýř "Kde hovory padají":** 3 úrovně s horizontálními pruhy, CSS-only (div s width %). Pod ním nedodělky text.
7. **Trend důvodů ztráty:** Pod bar chartem text "Za 7 dní '{důvod}' roste/klesá z X% na Y%."
8. **Přepínač projektů:** Pill buttons (kulatá tlačítka) v horní části — aktivní = tmavé, neaktivní = border. Funguje jen když > 1 projekt.
9. **Date picker:** Jednoduchý `<input type="date">` vedle nadpisu, mění URL search param `?date=YYYY-MM-DD`.
10. **E-mail — Outlook kompatibilita:** `<table>` layout, inline styly, žádné CSS proměnné, žádný flexbox. Max šířka 600px. Font fallback: Arial.
11. **Cron endpoint:** Ověřuje `CRON_SECRET`. HTTP GET (Vercel Cron). Iteruje přes projekty, pro každý: RPC → render email → find admin → send. Zapisuje do `audit_log`.
12. **CSS grafy = žádné knihovny.** Horizontal bars = `<div>` s `width` a `background-color`. `font-mono` pro čísla.
13. **Stránka je admin-only.** Page.tsx kontroluje `profile.role === 'admin'`, jinak redirect na frontu.
14. **Server Component page** volá RPC a předává data do Client Component `ReportView`. Žádné client-side fetching.
15. **Po implementaci:** `npm run lint`, `npm run build`, ověřit že čísla sedí s DB.

## Kritérium "Hotovo, když"

- [ ] Admin stránka `/report` zobrazuje správná data dle předlohy 08
- [ ] E-mail report dorazí automaticky (cron v 16:30 UTC = 18:30 CEST)
- [ ] Čísla v reportu (hovory, dovoláno, konzultace, operátoři) sedí s daty v DB
- [ ] Admin vidí "Report" v navigaci
- [ ] Historické reporty (výběr data) fungují
- [ ] Trychtýř, důvody ztráty, tabulka operátorů — vše vykresleno
- [ ] "Pod cílem" zobrazeno červeně v tabulce operátorů
- [ ] Doporučení panel jako placeholder (tmavý panel)
- [ ] E-mail zapsán do audit_log
