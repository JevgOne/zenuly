import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHelpButton } from "@/components/page-help-button";
import { MfaSetup } from "./mfa-setup";
import { CalendarSection } from "./calendar-section";
import { getAvailableProviders } from "@/lib/calendar/factory";
import { getCalendarConnection } from "@/app/actions/calendar";
import { ProfileNameForm } from "./profile-name-form";

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

  // Check if user is a manager in any project (profiles.role only has "admin" | "operator")
  const isManager = profile.role === "admin" || await (async () => {
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("role", "manager")
      .limit(1)
      .maybeSingle();
    return !!membership;
  })();

  const providers = getAvailableProviders();
  const calendarConnection = await getCalendarConnection();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHelpButton text="Nastavení vašeho profilu, hesla a propojení s kalendářem." />
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Zpět
      </Link>
      <h1 className="text-2xl font-semibold text-text mb-6">Nastavení</h1>

      <div className="space-y-6">
        <div className="bg-surface border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text mb-3">Profil</h2>
          <div className="space-y-3">
            <ProfileNameForm currentName={profile.full_name ?? ""} />
            <div className="text-sm text-muted space-y-1">
              <p>{user.email}</p>
              <p>
                {profile.role === "admin"
                  ? "Administrátor"
                  : "Uživatel"}
              </p>
            </div>
          </div>
        </div>

        {isManager && (
          <Suspense fallback={<div className="bg-surface border border-line rounded-lg p-6 animate-pulse h-40" />}>
            <CalendarSection
              providers={providers}
              currentConnection={calendarConnection}
            />
          </Suspense>
        )}

        {profile.role === "admin" && <MfaSetup />}
      </div>

    </div>
  );
}
