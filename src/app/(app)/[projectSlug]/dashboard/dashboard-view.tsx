"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getDashboardStats,
  type DashboardStats,
  type PipelineStage,
  type OperatorStat,
} from "@/app/actions/dashboard";
import { PageHelpButton } from "@/components/page-help-button";

function KpiCard({
  label,
  value,
  suffix,
  accent,
  href,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  accent?: boolean;
  href?: string;
}) {
  const content = (
    <div className={`bg-surface border border-line rounded-xl p-5 flex flex-col gap-1 ${href ? "hover:border-accent/40 hover:shadow-sm transition-all cursor-pointer group" : ""}`}>
      <span className={`text-[12px] font-medium text-muted uppercase tracking-wide ${href ? "group-hover:text-accent transition-colors" : ""}`}>
        {label}
      </span>
      <span
        className={`text-[28px] font-bold leading-tight ${accent ? "text-accent" : "text-text"}`}
      >
        {value}
        {suffix && (
          <span className="text-[16px] font-medium text-muted ml-1">
            {suffix}
          </span>
        )}
      </span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function PipelineBar({
  stages,
  total,
}: {
  stages: PipelineStage[];
  total: number;
}) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <h2 className="text-[15px] font-semibold text-text mb-4">Pipeline</h2>
      <div className="flex flex-col gap-2.5">
        {stages.map((stage) => {
          const pct = Math.max((stage.count / maxCount) * 100, 2);
          const colorClass =
            stage.type === "won"
              ? "bg-green-500"
              : stage.type === "lost"
                ? "bg-urgent"
                : "bg-accent";
          return (
            <div key={stage.key}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[13px] font-medium text-text">
                  {stage.name}
                </span>
                <span className="text-[13px] font-mono text-muted">
                  {stage.count}
                </span>
              </div>
              <div className="h-2 bg-bg rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${colorClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-line/50 flex justify-between text-[12px] text-muted">
        <span>Celkem aktivních</span>
        <span className="font-mono text-text">{total}</span>
      </div>
    </div>
  );
}

function OperatorsTable({ operators }: { operators: OperatorStat[] }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-5">
      <h2 className="text-[15px] font-semibold text-text mb-4">
        Aktivita operátorů
      </h2>
      {operators.length === 0 ? (
        <p className="text-[13px] text-muted">
          V projektu zatím nejsou operátoři.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="pb-2 pr-4 font-medium">Operátor</th>
                <th className="pb-2 pr-4 font-medium text-right">
                  Hovory dnes
                </th>
                <th className="pb-2 pr-4 font-medium text-right">Dovoláno</th>
                <th className="pb-2 pr-4 font-medium text-right">
                  Konzultace
                </th>
                <th className="pb-2 font-medium text-center">Směna</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.id} className="border-b border-line/50 last:border-0">
                  <td className="py-2.5 pr-4 text-text font-medium">
                    {op.name}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {op.calls_today}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {op.reached_today}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono">
                    {op.consultations_week}
                  </td>
                  <td className="py-2.5 text-center">
                    {op.has_active_shift ? (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                    ) : (
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-line" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const QUICK_LINKS = [
  { label: "Kontakty", href: "kontakty", icon: "contacts" },
  { label: "Pipeline", href: "pipeline", icon: "pipeline" },
  { label: "Report", href: "report", icon: "report" },
  { label: "Import", href: "import", icon: "import" },
  { label: "Export hodin", href: "export-hodin", icon: "export" },
];

const LINK_ICONS: Record<string, React.ReactNode> = {
  contacts: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM4 16.5c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  pipeline: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 4h14M5 8h10M7 12h6M9 16h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  report: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="3" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  import: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v10M10 13l-3-3M10 13l3-3M4 15v1.5a1 1 0 001 1h10a1 1 0 001-1V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  export: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 13V3M10 3l-3 3M10 3l3 3M4 15v1.5a1 1 0 001 1h10a1 1 0 001-1V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function DashboardView({
  projectId,
  projectName,
  projectSlug,
}: {
  projectId: string;
  projectName: string;
  projectSlug: string;
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardStats(projectId)
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setStats(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-surface border border-line rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[88px] bg-surface border border-line rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-[300px] bg-surface border border-line rounded-xl animate-pulse" />
          <div className="h-[300px] bg-surface border border-line rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-8">
        <div className="bg-surface border border-line rounded-xl p-12 text-center">
          <p className="text-[15px] text-muted">
            Nepodařilo se načíst data dashboardu.
          </p>
        </div>
      </div>
    );
  }

  const reachedPct =
    stats.calls_today > 0
      ? Math.round((stats.reached_today / stats.calls_today) * 100)
      : 0;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-8">
      <PageHelpButton text="Dashboard zobrazuje přehled projektu — počty leadů, hovory, operátory a klíčové metriky." />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text">Dashboard</h1>
        <p className="text-[13px] text-muted mt-1">{projectName}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard label="Celkem leadů" value={stats.total_leads} href={`/${projectSlug}/kontakty`} />
        <KpiCard label="Hovory dnes" value={stats.calls_today} accent href={`/${projectSlug}/report`} />
        <KpiCard
          label="Dovoláno"
          value={`${stats.reached_today}`}
          suffix={`(${reachedPct} %)`}
          href={`/${projectSlug}/report`}
        />
        <KpiCard label="Konzultace" value={stats.consultations_this_week} suffix="/ týden" href={`/${projectSlug}/kalendar`} />
        <KpiCard label="Nevyřízené úkoly" value={stats.pending_tasks} href={`/${projectSlug}/ukoly`} />
        <KpiCard label="Aktivní směny" value={stats.active_shifts} href={`/${projectSlug}/vykon`} />
      </div>

      {/* Pipeline + Operators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <PipelineBar stages={stats.pipeline} total={stats.total_leads} />
        <OperatorsTable operators={stats.operators} />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-[15px] font-semibold text-text mb-3">
          Rychlý přístup
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={`/${projectSlug}/${link.href}`}
              className="bg-surface border border-line rounded-xl p-4 flex items-center gap-3 hover:border-accent/40 hover:shadow-sm transition-all group"
            >
              <span className="text-muted group-hover:text-accent transition-colors">
                {LINK_ICONS[link.icon]}
              </span>
              <span className="text-[14px] font-medium text-text group-hover:text-accent transition-colors">
                {link.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
