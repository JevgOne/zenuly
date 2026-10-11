"use server";

import { createClient } from "@/lib/supabase/server";

export type ShiftInfo = {
  active: boolean;
  shift_id?: string;
  status?: string;
  started_at?: string;
  paused_at?: string | null;
  total_pause_s?: number;
  calls_this_hour?: number;
};

export async function getActiveShift(projectId: string): Promise<ShiftInfo> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_active_shift", {
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return data as ShiftInfo;
}

export async function startShift(projectId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_shift", {
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function pauseShift(shiftId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("pause_shift", {
    p_shift_id: shiftId,
  });
  if (error) throw new Error(error.message);
}

export async function resumeShift(shiftId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_shift", {
    p_shift_id: shiftId,
  });
  if (error) throw new Error(error.message);
}

export async function endShift(shiftId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_shift", {
    p_shift_id: shiftId,
  });
  if (error) throw new Error(error.message);
}
