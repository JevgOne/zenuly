import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MfaSetup } from "./mfa-setup";
import { CalendarSection } from "./calendar-section";
import { getAvailableProviders } from "@/lib/calendar/factory";
import { getCalendarConnection } from "@/app/actions/calendar";

export const instant = false;

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const providers = getAvailableProviders();
  const calendarConnection = await getCalendarConnection();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">Nastavení</h1>

      <div className="space-y-6">
        <div className="bg-surface border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text mb-2">Profil</h2>
          <div className="text-sm text-muted space-y-1">
            <p>
              <span className="font-medium text-text">{profile.full_name}</span>
            </p>
            <p>{user.email}</p>
            <p>
              {profile.role === "admin"
                ? "Administrátor"
                : "Uživatel"}
            </p>
          </div>
        </div>

        {(profile.role === "admin" || profile.role === "manager") && (
          <Suspense fallback={<div className="bg-surface border border-line rounded-lg p-6 animate-pulse h-40" />}>
            <CalendarSection
              providers={providers}
              currentConnection={calendarConnection}
            />
          </Suspense>
        )}

        {profile.role === "admin" && <MfaSetup />}
      </div>

      <div className="mt-6">
        <Link
          href="/"
          className="text-sm text-accent hover:text-accent transition-colors"
        >
          Zpět
        </Link>
      </div>
    </div>
  );
}
