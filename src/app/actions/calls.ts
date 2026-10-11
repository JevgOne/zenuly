"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCalendarEvent } from "@/app/actions/calendar";
import { sendAutoEmail } from "@/app/actions/emails";

export async function recordOutcome(params: {
  leadId: string;
  outcomeKey: string;
  note?: string;
  callbackAt?: string;
  email?: string;
  timeSlot?: string;
  lostReasonId?: string;
  addToDnc?: boolean;
  postponeReason?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase.rpc("record_call_outcome", {
    p_lead_id: params.leadId,
    p_outcome_key: params.outcomeKey,
    p_note: params.note ?? null,
    p_callback_at: params.callbackAt ?? null,
    p_email: params.email ?? null,
    p_time_slot: params.timeSlot ?? null,
    p_lost_reason_id: params.lostReasonId ?? null,
    p_add_to_dnc: params.addToDnc ?? false,
    p_postpone_reason: params.postponeReason ?? null,
  });

  if (error) throw new Error(error.message);

  const result = data as Record<string, unknown>;

  // Create calendar event for meetings
  if (result.calendar_event && result.meeting_time) {
    try {
      const admin = createAdminClient();

      // Get lead data for the calendar event
      const { data: leadData } = await admin
        .from("leads")
        .select("project_id, company, phone, email, contact_person")
        .eq("id", params.leadId)
        .single();

      if (leadData) {
        // Find project admin
        const { data: adminId } = await admin.rpc("find_project_admin", {
          p_project_id: leadData.project_id,
        });

        if (adminId) {
          const calResult = await createCalendarEvent({
            projectId: leadData.project_id as string,
            leadId: params.leadId,
            targetUserId: adminId as string,
            startTime: result.meeting_time as string,
            leadCompany: leadData.company as string,
            leadPhone: leadData.phone as string,
            leadEmail: (params.email ?? leadData.email ?? null) as string | null,
            leadContactPerson: (leadData.contact_person ?? null) as string | null,
          });

          if (calResult) {
            result.calendar_event_id = calResult.eventId;
            result.calendar_provider = calResult.provider;
            result.calendar_link = calResult.link;
          }
        }
      }
    } catch {
      // Calendar event creation failed — don't block outcome save
    }
  }

  // Auto email after max attempts reached
  if (result.auto_email && result.max_attempts_reached) {
    try {
      const admin = createAdminClient();
      const { data: leadData } = await admin
        .from("leads")
        .select("project_id, company, email")
        .eq("id", params.leadId)
        .single();

      if (leadData?.email) {
        await sendAutoEmail({
          projectId: leadData.project_id as string,
          leadId: params.leadId,
          leadEmail: leadData.email as string,
          leadCompany: leadData.company as string,
        });
      }
    } catch {
      // Auto email failed — don't block outcome save
    }
  }

  return result;
}
