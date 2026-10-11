"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePhone, isValidE164 } from "@/lib/utils/phone";

const VALID_PHONE_SOURCES = [
  "web_firmy",
  "profil_firmy",
  "databaze",
  "poptavka",
  "lead_finder",
];

export type ImportRow = {
  company: string;
  phone: string;
  phone_source: string;
  contact_person?: string;
  email?: string;
  website?: string;
  city?: string;
  ico?: string;
  lead_source?: string;
  priority?: number;
  findings?: string;
  hook_text?: string;
  hook_source?: string;
};

export type ImportResult = {
  total: number;
  imported: number;
  duplicates: number;
  invalidPhone: number;
  dnc: number;
  errors: string[];
};

async function requireImportAccess(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") return { user, supabase };

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("project_id", projectId)
    .single();
  if (membership?.role !== "manager") throw new Error("Forbidden");
  return { user, supabase };
}

export async function importLeads(
  projectId: string,
  rows: ImportRow[]
): Promise<ImportResult> {
  const { user, supabase } = await requireImportAccess(projectId);

  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    duplicates: 0,
    invalidPhone: 0,
    dnc: 0,
    errors: [],
  };

  // Get 'new' stage for this project
  const { data: newStage } = await supabase
    .from("stages")
    .select("id")
    .eq("project_id", projectId)
    .eq("key", "new")
    .single();

  if (!newStage) {
    result.errors.push('Projekt nemá fázi "new".');
    return result;
  }

  // Load DNC phones for this project
  const { data: dncRows } = await supabase
    .from("do_not_call")
    .select("phone")
    .eq("project_id", projectId);
  const dncPhones = new Set((dncRows ?? []).map((r) => r.phone));

  // Load existing phones and emails in this project (active leads)
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("phone, email")
    .eq("project_id", projectId)
    .eq("is_active", true);
  const existingPhones = new Set((existingLeads ?? []).map((r) => r.phone));
  const existingEmails = new Set(
    (existingLeads ?? []).filter((r) => r.email).map((r) => r.email as string)
  );

  // Process rows
  const toInsert: Record<string, unknown>[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Validate company name
    if (!row.company?.trim()) {
      result.errors.push(`Řádek ${i + 1}: chybí název firmy.`);
      continue;
    }

    // Normalize phone
    const phone = normalizePhone(row.phone ?? "");
    if (!phone || !isValidE164(phone)) {
      result.invalidPhone++;
      continue;
    }

    // DNC check
    if (dncPhones.has(phone)) {
      result.dnc++;
      continue;
    }

    // Duplicate in existing leads
    if (existingPhones.has(phone)) {
      result.duplicates++;
      continue;
    }

    // Duplicate within this import (phone)
    if (seenPhones.has(phone)) {
      result.duplicates++;
      continue;
    }
    seenPhones.add(phone);

    // Email duplicate check
    const email = row.email?.trim().toLowerCase() || null;
    if (email) {
      if (existingEmails.has(email) || seenEmails.has(email)) {
        result.duplicates++;
        continue;
      }
      seenEmails.add(email);
    }

    // Validate phone_source
    const phoneSource = VALID_PHONE_SOURCES.includes(row.phone_source)
      ? row.phone_source
      : "databaze";

    const priority = row.priority
      ? Math.min(3, Math.max(1, Number(row.priority) || 2))
      : 2;

    toInsert.push({
      project_id: projectId,
      company: row.company.trim(),
      phone,
      phone_source: phoneSource,
      contact_person: row.contact_person?.trim() || null,
      email,
      website: row.website?.trim() || null,
      city: row.city?.trim() || null,
      ico: row.ico?.trim() || null,
      lead_source: row.lead_source?.trim() || null,
      priority,
      stage_id: newStage.id,
      is_active: true,
      next_action_at: new Date().toISOString(),
      next_action_type: "callback",
      findings: row.findings?.trim() || null,
      hook_text: row.hook_text?.trim() || null,
      hook_source:
        row.hook_source?.trim() || (row.findings ? "import" : null),
      imported_at: new Date().toISOString(),
    });
  }

  // Batch insert (500 at a time)
  const BATCH_SIZE = 500;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("leads").insert(batch);
    if (error) {
      result.errors.push(
        `Chyba při vkládání řádků ${i + 1}-${i + batch.length}: ${error.message}`
      );
    } else {
      result.imported += batch.length;
    }
  }

  // Audit log
  await supabase.from("audit_log").insert({
    project_id: projectId,
    user_id: user.id,
    action: "leads_imported",
    details: {
      total: result.total,
      imported: result.imported,
      duplicates: result.duplicates,
      invalid_phone: result.invalidPhone,
      dnc: result.dnc,
    },
  });

  return result;
}
