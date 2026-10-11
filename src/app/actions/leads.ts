"use server";

import { createClient } from "@/lib/supabase/server";

export type LeadCardData = {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  website: string | null;
  city: string | null;
  ico: string | null;
  lead_source: string | null;
  phone_source: string;
  findings: string | null;
  hook_text: string | null;
  hook_source: string | null;
  stage_key: string;
  stage_name: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  next_action_at: string | null;
  next_action_type: string | null;
  postponed_until: string | null;
  postpone_reason: string | null;
  custom_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  calls: {
    id: string;
    outcome_name: string;
    outcome_key: string;
    outcome_group: string;
    operator_name: string;
    note: string | null;
    created_at: string;
  }[];
  emails: {
    id: string;
    template_key: string;
    subject: string;
    sent_at: string;
    sent_by: string | null;
  }[];
  custom_fields: {
    key: string;
    name: string;
    field_type: string;
    options: unknown;
  }[];
};

export async function getLeadCard(leadId: string): Promise<LeadCardData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("get_lead_card", {
    p_lead_id: leadId,
  });

  if (error) throw new Error(error.message);
  if (!data || data.error) return null;
  return data as LeadCardData;
}

export async function claimLead(leadId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("claim_lead", {
    p_lead_id: leadId,
  });

  if (error) throw new Error(error.message);
  return data as boolean;
}
