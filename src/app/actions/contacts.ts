"use server";

import { createClient } from "@/lib/supabase/server";

export type ContactCard = {
  id: string;
  company: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  city: string | null;
  ico: string | null;
  stage_key: string;
  stage_name: string;
  stage_type: string;
  priority: number;
  attempt_count: number;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  last_activity: string;
  total_calls: number;
  completeness_pct: number;
  trust_score: number;
};

export type ContactsResult = {
  total: number;
  contacts: ContactCard[];
};

export async function getContactsOverview(
  projectId: string,
  search?: string,
  stageKey?: string,
  sort?: string,
  limit?: number,
  offset?: number
): Promise<ContactsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("get_contacts_overview", {
    p_project_id: projectId,
    p_search: search || null,
    p_stage_key: stageKey || null,
    p_sort: sort || "trust_desc",
    p_limit: limit ?? 50,
    p_offset: offset ?? 0,
  });

  if (error) throw new Error(error.message);
  return (data ?? { total: 0, contacts: [] }) as ContactsResult;
}
