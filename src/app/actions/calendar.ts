"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCalendarProvider,
  getAvailableProviders,
} from "@/lib/calendar/factory";
import type {
  CalendarProvider,
  CalendarSlot,
  ProviderMeta,
} from "@/lib/calendar/types";

/** Load calendar provider for a given user (uses admin client to bypass RLS) */
async function getProviderForUser(
  userId: string
): Promise<CalendarProvider | null> {
  const supabase = createAdminClient();
  const { data: conn } = await supabase
    .from("calendar_connections")
    .select("id, provider, credentials")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .single();

  if (!conn) return null;

  const connId = conn.id as string;
  return createCalendarProvider(
    conn.provider as string,
    conn.credentials as Record<string, unknown>,
    async (newCreds) => {
      await supabase
        .from("calendar_connections")
        .update({
          credentials: {
            ...(conn.credentials as Record<string, unknown>),
            ...newCreds,
          },
        })
        .eq("id", connId);
    }
  );
}

/** Check if a slot overlaps with any busy period */
function isOverlapping(
  slot: { start: string; end: string },
  busy: CalendarSlot[]
): boolean {
  const slotStart = new Date(slot.start).getTime();
  const slotEnd = new Date(slot.end).getTime();
  return busy.some((b) => {
    const busyStart = new Date(b.start).getTime();
    const busyEnd = new Date(b.end).getTime();
    return slotStart < busyEnd && slotEnd > busyStart;
  });
}

/** Resolve UTC offset for a local datetime in a given IANA timezone */
function getTimezoneOffsetString(
  localIso: string,
  timezone: string
): string {
  // Format parts in the target timezone to find the actual UTC offset
  const dt = new Date(localIso + "Z"); // treat as UTC temporarily
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(dt);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  // tzPart.value is like "GMT+2", "GMT+1", "GMT-5", "GMT+5:30"
  const raw = tzPart?.value ?? "GMT+0";
  const match = raw.match(/GMT([+-]?)(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+00:00";
  const sign = match[1] === "-" ? "-" : "+";
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] ?? "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

/** Generate 20-min slots within working hours for a date range */
function generateSlots(
  dateFrom: string,
  dateTo: string,
  workingHours: {
    days: number[];
    start: string;
    end: string;
    timezone: string;
  },
  durationMinutes: number
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const tz = workingHours.timezone || "Europe/Prague";

  const current = new Date(from);
  current.setHours(0, 0, 0, 0);

  while (current <= to) {
    const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay();
    if (workingHours.days.includes(dayOfWeek)) {
      const [startH, startM] = workingHours.start.split(":").map(Number);
      const [endH, endM] = workingHours.end.split(":").map(Number);

      const dayStr = current.toISOString().slice(0, 10);
      let slotMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (slotMinutes + durationMinutes <= endMinutes) {
        const h = Math.floor(slotMinutes / 60);
        const m = slotMinutes % 60;
        const localStr = `${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        const offset = getTimezoneOffsetString(localStr, tz);
        const startIso = new Date(`${localStr}${offset}`).toISOString();
        const endStr = new Date(
          new Date(startIso).getTime() + durationMinutes * 60 * 1000
        ).toISOString();

        if (new Date(startIso) > new Date()) {
          slots.push({ start: startIso, end: endStr });
        }

        slotMinutes += durationMinutes;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return slots;
}

/** Get available 20-min slots for a project's admin/manager */
export async function getAvailableSlots(
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ start: string; end: string }[]> {
  const supabase = createAdminClient();

  const { data: adminId } = await supabase.rpc("find_project_admin", {
    p_project_id: projectId,
  });
  if (!adminId) return [];

  const { data: project } = await supabase
    .from("projects")
    .select("working_hours")
    .eq("id", projectId)
    .single();

  const workingHours = (project?.working_hours as {
    days: number[];
    start: string;
    end: string;
    timezone: string;
  }) ?? {
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "18:00",
    timezone: "Europe/Prague",
  };

  const allSlots = generateSlots(dateFrom, dateTo, workingHours, 20);

  const provider = await getProviderForUser(adminId as string);
  if (!provider) return allSlots;

  try {
    const busy = await provider.getBusySlots(dateFrom, dateTo);
    return allSlots.filter((slot) => !isOverlapping(slot, busy));
  } catch {
    return allSlots;
  }
}

/** Create calendar event for a meeting */
export async function createCalendarEvent(params: {
  projectId: string;
  leadId: string;
  targetUserId: string;
  startTime: string;
  leadCompany: string;
  leadPhone: string;
  leadEmail: string | null;
  leadContactPerson: string | null;
}): Promise<{ eventId: string; provider: string; link?: string } | null> {
  const provider = await getProviderForUser(params.targetUserId);
  if (!provider) return null;

  const endTime = new Date(
    new Date(params.startTime).getTime() + 20 * 60 * 1000
  ).toISOString();

  try {
    const result = await provider.createEvent({
      summary: `Konzultace: ${params.leadCompany}`,
      description: [
        params.leadContactPerson
          ? `Kontakt: ${params.leadContactPerson}`
          : null,
        `Telefon: ${params.leadPhone}`,
        params.leadEmail ? `E-mail: ${params.leadEmail}` : null,
        `Lead v CRM: https://zenuly.cz/weblyx/leads/${params.leadId}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: params.startTime,
      end: endTime,
      attendeeEmail: params.leadEmail ?? undefined,
      reminderMinutes: 60,
    });

    return { eventId: result.eventId, provider: result.provider, link: result.link };
  } catch {
    return null;
  }
}

/** Save credentials for token-based providers (Notion) */
export async function connectCalendar(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  try {
    const p = createCalendarProvider(provider, credentials);
    await p.testConnection();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Connection test failed",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("calendar_connections").upsert(
    {
      profile_id: user.id,
      provider,
      credentials,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Disconnect current calendar */
export async function disconnectCalendar(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const admin = createAdminClient();
  await admin
    .from("calendar_connections")
    .delete()
    .eq("profile_id", user.id);

  return { ok: true };
}

/** Test current connection */
export async function testCalendarConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const provider = await getProviderForUser(user.id);
  if (!provider) return { ok: false, error: "No calendar connected" };

  try {
    await provider.testConnection();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Test failed",
    };
  }
}

/** Get available providers for UI */
export async function listProviders(): Promise<ProviderMeta[]> {
  return getAvailableProviders();
}

/** Get current calendar connection for the logged-in user */
export async function getCalendarConnection(): Promise<{
  provider: string;
  isActive: boolean;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("calendar_connections")
    .select("provider, is_active")
    .eq("profile_id", user.id)
    .single();

  if (!data) return null;
  return {
    provider: data.provider as string,
    isActive: data.is_active as boolean,
  };
}
