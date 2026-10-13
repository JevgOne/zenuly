import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHelpButton } from "@/components/page-help-button";
import {
  getCalendarConnection,
  getUpcomingConsultations,
} from "@/app/actions/calendar";

export const instant = false;

export default async function KalendarPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  const [connection, consultations] = await Promise.all([
    getCalendarConnection(),
    getUpcomingConsultations(project.id),
  ]);

  // Group consultations by day (Europe/Prague)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStr = today.toLocaleDateString("cs-CZ", {
    timeZone: "Europe/Prague",
  });
  const tomorrowStr = tomorrow.toLocaleDateString("cs-CZ", {
    timeZone: "Europe/Prague",
  });

  const groups = new Map<string, typeof consultations>();
  for (const c of consultations) {
    const eventDate = new Date(c.next_action_at!);
    const dateStr = eventDate.toLocaleDateString("cs-CZ", {
      timeZone: "Europe/Prague",
    });

    let label: string;
    if (dateStr === todayStr) {
      label = "Dnes";
    } else if (dateStr === tomorrowStr) {
      label = "Zítra";
    } else {
      label = eventDate.toLocaleDateString("cs-CZ", {
        timeZone: "Europe/Prague",
        weekday: "short",
        day: "numeric",
        month: "numeric",
      });
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <PageHelpButton text="Propojte kalendář pro automatickou synchronizaci domluvených konzultací." />
      <h1 className="text-2xl font-semibold text-text mb-6">Kalendář</h1>

      {/* Connection status — compact */}
      <div className="flex items-center gap-2 mb-6">
        {connection?.isActive ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-muted">
              {connection.provider === "google"
                ? "Google Calendar"
                : connection.provider === "notion"
                  ? "Notion Calendar"
                  : connection.provider}{" "}
              propojeno
            </span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <Link
              href="/settings"
              className="text-sm text-accent hover:underline"
            >
              Propojit kalendář v nastavení
            </Link>
          </>
        )}
      </div>

      {/* Upcoming consultations */}
      <h2 className="text-lg font-semibold text-text mb-4">
        Nadcházející konzultace
      </h2>

      {consultations.length === 0 ? (
        <div className="bg-surface border border-line rounded-lg p-6 text-center">
          <p className="text-sm text-muted">
            Zatím žádné naplánované konzultace. Konzultace se vytvoří
            automaticky, když operátor domluví schůzku.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([dayLabel, items]) => (
            <div
              key={dayLabel}
              className="bg-surface border border-line rounded-lg overflow-hidden"
            >
              <div className="px-4 py-2 bg-muted/5 border-b border-line">
                <span className="text-sm font-semibold text-text">
                  {dayLabel}
                </span>
              </div>
              <div className="divide-y divide-line">
                {items.map((c) => {
                  const time = new Date(c.next_action_at!).toLocaleTimeString(
                    "cs-CZ",
                    {
                      timeZone: "Europe/Prague",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  );
                  const profilesArr = c.profiles as unknown as { full_name: string }[] | null;
                  const ownerName = profilesArr?.[0]?.full_name;
                  return (
                    <div key={c.id} className="px-4 py-3 flex gap-4">
                      <span className="text-sm font-mono font-medium text-accent min-w-[45px]">
                        {time}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text truncate">
                          {c.company || "Bez názvu"}
                        </div>
                        <div className="text-xs text-muted mt-0.5 space-x-2">
                          {c.contact_person && (
                            <span>{c.contact_person}</span>
                          )}
                          {c.phone && <span>{c.phone}</span>}
                          {ownerName && (
                            <span className="text-muted/70">
                              · {ownerName}
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/${projectSlug}/kontakty/${c.id}`}
                        className="text-xs text-accent hover:underline self-center whitespace-nowrap"
                      >
                        Zobrazit
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
