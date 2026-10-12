import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHelpButton } from "@/components/page-help-button";
import { getCalendarConnection } from "@/app/actions/calendar";

export const instant = false;

export default async function KalendarPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Use the same function as settings for consistency
  const connection = await getCalendarConnection();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHelpButton text="Propojte kalendář pro automatickou synchronizaci domluvených konzultací." />
      <h1 className="text-2xl font-semibold text-text mb-6">
        Kalendář
      </h1>

      {connection?.isActive ? (
        <div className="bg-surface border border-line rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-text">
              {connection.provider === "google"
                ? "Google Calendar"
                : connection.provider === "notion"
                  ? "Notion Calendar"
                  : connection.provider}{" "}
              propojeno
            </span>
          </div>
          <p className="text-sm text-muted">
            Konzultace se automaticky vytvářejí v kalendáři
            po domluvení schůzky s klientem.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-lg p-6 text-center">
          <p className="text-sm text-muted mb-4">
            Kalendář není propojený. Propojte ho v nastavení
            pro automatické vytváření konzultací.
          </p>
          <Link
            href="/settings"
            className="inline-flex h-10 items-center px-4 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Přejít do nastavení
          </Link>
        </div>
      )}
    </div>
  );
}
