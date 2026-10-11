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
