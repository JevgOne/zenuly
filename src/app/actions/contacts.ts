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

export type ContactDetail = {
  id: string;
  company: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  city: string | null;
  ico: string | null;
  lead_source: string | null;
  phone_source: string;
  hook_text: string | null;
  priority: number;
  attempt_count: number;
  next_action_at: string | null;
  next_action_type: string | null;
  created_at: string;
  updated_at: string;
  stage_name: string;
  stage_key: string;
  stage_type: string;
  owner_name: string | null;
  calls: {
    id: string;
    outcome_name: string;
    note: string | null;
    operator_name: string;
    created_at: string;
  }[];
};

export async function getContactDetail(
  leadId: string
): Promise<ContactDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, company, contact_person, phone, email, website, city, ico, lead_source, phone_source, hook_text, priority, attempt_count, next_action_at, next_action_type, created_at, updated_at, stage_id, owner_id"
    )
    .eq("id", leadId)
    .single();

  if (!lead) return null;

  // Get stage info
  const { data: stage } = await supabase
    .from("stages")
    .select("name, key, type")
    .eq("id", lead.stage_id)
    .single();

  // Get owner name
  let ownerName: string | null = null;
  if (lead.owner_id) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", lead.owner_id)
      .single();
    ownerName = owner?.full_name ?? null;
  }

  // Get call history
  const { data: calls } = await supabase
    .from("calls")
    .select("id, outcome_id, note, operator_id, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve outcome names and operator names
  const resolvedCalls: ContactDetail["calls"] = [];
  for (const call of calls ?? []) {
    const { data: outcome } = await supabase
      .from("outcomes")
      .select("name")
      .eq("id", call.outcome_id)
      .single();
    const { data: operator } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", call.operator_id)
      .single();
    resolvedCalls.push({
      id: call.id,
      outcome_name: outcome?.name ?? "—",
      note: call.note,
      operator_name: operator?.full_name ?? "—",
      created_at: call.created_at,
    });
  }

  return {
    id: lead.id,
    company: lead.company,
    contact_person: lead.contact_person,
    phone: lead.phone,
    email: lead.email,
    website: lead.website,
    city: lead.city,
    ico: lead.ico,
    lead_source: lead.lead_source,
    phone_source: lead.phone_source,
    hook_text: lead.hook_text,
    priority: lead.priority,
    attempt_count: lead.attempt_count,
    next_action_at: lead.next_action_at,
    next_action_type: lead.next_action_type,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    stage_name: stage?.name ?? "—",
    stage_key: stage?.key ?? "",
    stage_type: stage?.type ?? "open",
    owner_name: ownerName,
    calls: resolvedCalls,
  };
}
