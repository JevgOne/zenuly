"use server";

import { createClient } from "@/lib/supabase/server";

export type QueueItem = {
  id: string;
  company_name: string;
  phone: string;
  hook_text: string | null;
  hook_source: string | null;
  priority: number;
  stage_key: string;
  next_action_at: string | null;
  attempt_count: number;
  max_attempts: number;
  is_overdue: boolean;
  overdue_minutes: number;
  queue_section: string;
};

export async function getQueue(projectId: string): Promise<QueueItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("get_queue", {
    p_project_id: projectId,
    p_operator_id: user.id,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as QueueItem[];
}
