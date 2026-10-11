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
  const days = [
    "ned\u011ble",
    "pond\u011bl\u00ed",
    "\u00fater\u00fd",
    "st\u0159eda",
    "\u010dtvrtek",
    "p\u00e1tek",
    "sobota",
  ];
  const months = [
    "ledna",
    "\u00fanora",
    "b\u0159ezna",
    "dubna",
    "kv\u011btna",
    "\u010dervna",
    "\u010dervence",
    "srpna",
    "z\u00e1\u0159\u00ed",
    "\u0159\u00edjna",
    "listopadu",
    "prosince",
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
              Denn\u00ed report \u00b7 {formatCzechDate(currentDate)}
            </span>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="text-[13px] text-muted bg-transparent border border-line rounded px-2 py-0.5 outline-none focus:border-accent"
            />
          </div>
          <h1 className="text-[32px] font-semibold text-text leading-tight">
            {report.project_name} dnes: {report.total_meetings} konzultac\u00ed
            ze {report.total_calls} hovor\u016f
          </h1>
        </div>

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
                    : "bg-surface text-text border border-input-border hover:border-text"
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
