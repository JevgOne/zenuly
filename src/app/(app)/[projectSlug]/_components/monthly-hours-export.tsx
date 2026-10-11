"use client";

import { useState, useEffect, useRef } from "react";
import {
  getMonthlyHours,
  exportMonthlyHoursCSV,
  type MonthlyHoursRow,
} from "@/app/actions/performance";

const MONTH_NAMES = [
  "Leden",
  "Unor",
  "Brezen",
  "Duben",
  "Kveten",
  "Cerven",
  "Cervenec",
  "Srpen",
  "Zari",
  "Rijen",
  "Listopad",
  "Prosinec",
];

export function MonthlyHoursExport({
  projectId,
}: {
  projectId: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<MonthlyHoursRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    getMonthlyHours(projectId, year, month).then(
      (data) => {
        if (fetchId !== fetchIdRef.current) return;
        setRows(data);
        setLoading(false);
      },
      () => {
        if (fetchId !== fetchIdRef.current) return;
        setRows([]);
        setLoading(false);
      }
    );
  }, [projectId, year, month]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const csv = await exportMonthlyHoursCSV(projectId, year, month);
      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hodiny-${year}-${String(month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // Generate year options (current year and 2 previous)
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="space-y-6">
      {/* Month/year selector */}
      <div className="flex flex-wrap gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || rows.length === 0}
          className="px-5 h-11 bg-accent text-white rounded-lg font-medium text-[14px] hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {downloading ? "Stahuji..." : "Stahnout CSV"}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="h-40 bg-surface border border-line rounded-lg animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg p-8 text-center">
          <p className="text-muted text-[15px]">
            Za {MONTH_NAMES[month - 1]} {year} nejsou zadne zaznamy.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line rounded-lg">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="bg-bg text-left">
                <th className="px-4 py-3 font-medium text-muted">
                  Operator
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Smeny
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Hodiny
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Pauzy
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Ciste h
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Hovory
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Dovolano
                </th>
                <th className="px-4 py-3 font-medium text-muted text-right">
                  Hovory/h
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.operator_id} className="hover:bg-bg/50">
                  <td className="px-4 py-3 font-medium text-text">
                    {r.operator_name}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {r.total_shifts}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {r.total_hours}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {r.total_pause_hours}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text">
                    {r.net_hours}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {r.total_calls}
                  </td>
                  <td className="px-4 py-3 text-right text-text">
                    {r.total_reached}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-text">
                    {r.calls_per_hour}
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
