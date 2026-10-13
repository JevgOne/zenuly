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
  findings: string | null;
  notes: string | null;
  priority: number;
  attempt_count: number;
  next_action_at: string | null;
  next_action_type: string | null;
  created_at: string;
  updated_at: string;
  stage_name: string;
  stage_key: string;
  stage_type: string;
  stage_id: string;
  owner_id: string | null;
  owner_name: string | null;
  project_id: string;
  trust_score: number;
  completeness_pct: number;
  total_calls: number;
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
      "id, company, contact_person, phone, email, website, city, ico, lead_source, phone_source, hook_text, findings, priority, attempt_count, next_action_at, next_action_type, created_at, updated_at, stage_id, owner_id, project_id, notes"
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

  // Get call history with outcomes and operator names in a single query
  const { data: callsWithJoins } = await supabase
    .from("calls")
    .select("id, note, created_at, outcomes(name), profiles!calls_operator_id_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);

  const resolvedCalls: ContactDetail["calls"] = (callsWithJoins ?? []).map((call) => ({
    id: call.id,
    outcome_name: (call.outcomes as unknown as { name: string } | null)?.name ?? "—",
    note: call.note,
    operator_name: (call.profiles as unknown as { full_name: string } | null)?.full_name ?? "—",
    created_at: call.created_at,
  }));

  // Compute completeness percentage
  const fields = [lead.company, lead.contact_person, lead.phone, lead.email, lead.website, lead.city, lead.ico];
  const filled = fields.filter(Boolean).length;
  const completeness_pct = Math.round((filled / fields.length) * 100);

  // Simple trust score: based on completeness + call history + stage
  const callBonus = Math.min(resolvedCalls.length * 10, 30);
  const stageBonus = stage?.type === "won" ? 20 : stage?.type === "lost" ? 0 : 10;
  const trust_score = Math.min(Math.round(completeness_pct * 0.5 + callBonus + stageBonus), 100);

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
    findings: lead.findings,
    notes: lead.notes ?? null,
    priority: lead.priority,
    attempt_count: lead.attempt_count,
    next_action_at: lead.next_action_at,
    next_action_type: lead.next_action_type,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    stage_name: stage?.name ?? "—",
    stage_key: stage?.key ?? "",
    stage_type: stage?.type ?? "open",
    stage_id: lead.stage_id,
    owner_id: lead.owner_id,
    owner_name: ownerName,
    project_id: lead.project_id,
    trust_score,
    completeness_pct,
    total_calls: resolvedCalls.length,
    calls: resolvedCalls,
  };
}

async function requireAdminOrManager(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile) throw new Error("Profile not found");

  if (profile.role === "admin") return supabase;

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("project_id", projectId)
    .single();
  if (!membership || membership.role !== "manager")
    throw new Error("Forbidden");

  return supabase;
}

export async function assignLeadOwner(
  leadId: string,
  operatorId: string | null,
): Promise<void> {
  const tmpSupabase = await createClient();
  const { data: lead } = await tmpSupabase
    .from("leads")
    .select("project_id")
    .eq("id", leadId)
    .single();
  if (!lead) throw new Error("Lead not found");

  const supabase = await requireAdminOrManager(lead.project_id);

  const { error } = await supabase
    .from("leads")
    .update({ owner_id: operatorId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function changeLeadStage(
  leadId: string,
  stageId: string,
): Promise<void> {
  const tmpSupabase = await createClient();
  const { data: lead } = await tmpSupabase
    .from("leads")
    .select("project_id")
    .eq("id", leadId)
    .single();
  if (!lead) throw new Error("Lead not found");

  const supabase = await requireAdminOrManager(lead.project_id);

  const { error } = await supabase
    .from("leads")
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function updateLeadNotes(
  leadId: string,
  notes: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}
