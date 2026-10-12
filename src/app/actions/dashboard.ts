"use server";

import { createClient } from "@/lib/supabase/server";

export type OperatorStat = {
  id: string;
  name: string;
  calls_today: number;
  reached_today: number;
  consultations_week: number;
  has_active_shift: boolean;
};

export type PipelineStage = {
  name: string;
  key: string;
  type: string;
  count: number;
};

export type DashboardStats = {
  total_leads: number;
  calls_today: number;
  reached_today: number;
  calls_today_total_for_pct: number;
  consultations_this_week: number;
  pending_tasks: number;
  active_shifts: number;
  pipeline: PipelineStage[];
  operators: OperatorStat[];
};

export async function getDashboardStats(
  projectId: string
): Promise<DashboardStats> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("get_dashboard_stats", {
    p_project_id: projectId,
  });

  if (error) throw new Error(error.message);

  const defaults: DashboardStats = {
    total_leads: 0,
    calls_today: 0,
    reached_today: 0,
    calls_today_total_for_pct: 1,
    consultations_this_week: 0,
    pending_tasks: 0,
    active_shifts: 0,
    pipeline: [],
    operators: [],
  };

  return (data ?? defaults) as DashboardStats;
}
