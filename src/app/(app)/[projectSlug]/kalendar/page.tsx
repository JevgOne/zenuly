import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

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

  // Check if user has a calendar connection
  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("id, provider, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">
        Kalendář
      </h1>

      {connection ? (
        <div className="bg-surface border border-line rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-text">
              {connection.provider === "google"
                ? "Google Calendar"
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
