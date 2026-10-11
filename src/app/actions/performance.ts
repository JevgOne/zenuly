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
  projectId: string
): Promise<OperatorStats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_operator_stats", {
    p_project_id: projectId,
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

export async function exportMonthlyHoursCSV(
  projectId: string,
  year: number,
  month: number
): Promise<string> {
  const rows = await getMonthlyHours(projectId, year, month);

  const header =
    "Operator;Smeny;Hodiny;Pauzy;Ciste hodiny;Hovory;Dovolano;Hovory/h";

  const lines = rows.map(
    (r) =>
      `${r.operator_name};${r.total_shifts};${r.total_hours};${r.total_pause_hours};${r.net_hours};${r.total_calls};${r.total_reached};${r.calls_per_hour}`
  );

  return [header, ...lines].join("\n");
}
