"use client";

import { useState, useEffect } from "react";
import {
  getOperatorStats,
  type OperatorStats,
} from "@/app/actions/performance";

function KpiTile({
  label,
  value,
  suffix,
  highlight,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-lg p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-1">
        {label}
      </p>
      <p
        className={`text-[28px] font-semibold leading-tight ${
          highlight === false ? "text-urgent" : "text-text"
        }`}
      >
        {value}
        {suffix && (
          <span className="text-[14px] font-medium text-muted ml-1">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

export function PerformanceDashboard({
  projectId,
}: {
  projectId: string;
}) {
  const [stats, setStats] = useState<OperatorStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getOperatorStats(projectId).then((data) => {
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      });
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-24 bg-surface border border-line rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-muted text-[15px]">Statistiky nejsou k dispozici.</p>
    );
  }

  const reachedPct =
    stats.calls_today > 0
      ? Math.round((stats.reached_today / stats.calls_today) * 100)
      : 0;

  const progressPct = Math.min(
    100,
    (stats.calls_per_hour / stats.target_per_hour) * 100
  );

  return (
    <div className="space-y-6">
      {/* Calls per hour — large */}
      <div className="bg-surface border border-line rounded-lg p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2">
          Hovory za hodinu
        </p>
        <div className="flex items-end gap-3 mb-3">
          <span
            className={`text-[40px] font-bold leading-none ${
              stats.on_target ? "text-text" : "text-urgent"
            }`}
          >
            {stats.calls_per_hour}
          </span>
          <span className="text-[15px] text-muted mb-1">
            / {stats.target_per_hour} cil
          </span>
        </div>
        <div className="h-2 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              stats.on_target ? "bg-accent" : "bg-urgent"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {!stats.on_target && (
          <p className="text-[13px] text-urgent mt-2 font-medium">
            Pod cilem
          </p>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Hovory dnes" value={stats.calls_today} />
        <KpiTile
          label="Dovolano"
          value={stats.reached_today}
          suffix={`${reachedPct} %`}
        />
        <KpiTile label="Konzultace" value={stats.meetings_today} />
        <KpiTile label="Odpracovano" value={stats.hours_today} suffix="h" />
      </div>
    </div>
  );
}
