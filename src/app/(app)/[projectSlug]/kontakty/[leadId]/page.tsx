import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getContactDetail } from "@/app/actions/contacts";

export const instant = false;

function stageColor(type: string): string {
  if (type === "won") return "bg-green-100 text-green-700";
  if (type === "lost") return "bg-urgent-soft text-urgent";
  return "bg-accent-soft text-accent";
}

function priorityLabel(p: number): string {
  if (p === 1) return "Nízká";
  if (p === 3) return "Vysoká";
  return "Střední";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ projectSlug: string; leadId: string }>;
}) {
  const { projectSlug, leadId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin/manager only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  if (profile.role !== "admin") {
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("profile_id", user.id)
      .single();
    if (!membership || membership.role !== "manager") {
      redirect(`/${projectSlug}/fronta`);
    }
  }

  const contact = await getContactDetail(leadId);
  if (!contact) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href={`/${projectSlug}/kontakty`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Kontakty
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">{contact.company}</h1>
          {contact.contact_person && (
            <p className="text-muted mt-1">{contact.contact_person}</p>
          )}
        </div>
        <span
          className={`px-3 py-1 rounded-md text-xs font-semibold uppercase tracking-wide ${stageColor(contact.stage_type)}`}
        >
          {contact.stage_name}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact info card */}
        <div className="bg-surface border border-line rounded-lg p-5">
          <h2 className="text-sm font-semibold text-text mb-3">Kontaktní údaje</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Telefon</dt>
              <dd className="text-text font-mono">
                <a href={`tel:${contact.phone}`} className="text-accent hover:underline">
                  {contact.phone}
                </a>
              </dd>
            </div>
            {contact.email && (
              <div className="flex justify-between">
                <dt className="text-muted">E-mail</dt>
                <dd className="text-text truncate ml-4">
                  <a href={`mailto:${contact.email}`} className="text-accent hover:underline">
                    {contact.email}
                  </a>
                </dd>
              </div>
            )}
            {contact.website && (
              <div className="flex justify-between">
                <dt className="text-muted">Web</dt>
                <dd className="text-text truncate ml-4">
                  <a
                    href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {contact.website}
                  </a>
                </dd>
              </div>
            )}
            {contact.city && (
              <div className="flex justify-between">
                <dt className="text-muted">Město</dt>
                <dd className="text-text">{contact.city}</dd>
              </div>
            )}
            {contact.ico && (
              <div className="flex justify-between">
                <dt className="text-muted">IČO</dt>
                <dd className="text-text font-mono">{contact.ico}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Pipeline info card */}
        <div className="bg-surface border border-line rounded-lg p-5">
          <h2 className="text-sm font-semibold text-text mb-3">Pipeline</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Fáze</dt>
              <dd className="text-text font-medium">{contact.stage_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Priorita</dt>
              <dd className="text-text">{priorityLabel(contact.priority)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Pokusů</dt>
              <dd className="text-text font-mono">{contact.attempt_count}</dd>
            </div>
            {contact.owner_name && (
              <div className="flex justify-between">
                <dt className="text-muted">Operátor</dt>
                <dd className="text-text">{contact.owner_name}</dd>
              </div>
            )}
            {contact.next_action_at && (
              <div className="flex justify-between">
                <dt className="text-muted">Další akce</dt>
                <dd className="text-text">
                  {contact.next_action_type === "call" ? "Zavolat" : contact.next_action_type === "meeting" ? "Schůzka" : contact.next_action_type ?? "—"}{" "}
                  <span className="text-muted">{formatDate(contact.next_action_at)}</span>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Zdroj</dt>
              <dd className="text-text">{contact.lead_source ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Vytvořen</dt>
              <dd className="text-text">{formatDate(contact.created_at)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Hook text */}
      {contact.hook_text && (
        <div className="bg-surface border border-line rounded-lg p-5 mt-6">
          <h2 className="text-sm font-semibold text-text mb-2">Háček / důvody</h2>
          <p className="text-sm text-muted whitespace-pre-wrap">{contact.hook_text}</p>
        </div>
      )}

      {/* Call history */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-text mb-3">
          Historie hovorů ({contact.calls.length})
        </h2>
        {contact.calls.length === 0 ? (
          <div className="bg-surface border border-line rounded-lg p-5">
            <p className="text-sm text-muted">Zatím žádné hovory.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contact.calls.map((call) => (
              <div
                key={call.id}
                className="bg-surface border border-line rounded-lg px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1"
              >
                <span className="text-sm font-medium text-text">
                  {call.outcome_name}
                </span>
                <span className="text-xs text-muted">{call.operator_name}</span>
                <span className="text-xs text-muted ml-auto">
                  {formatDate(call.created_at)}
                </span>
                {call.note && (
                  <p className="w-full text-xs text-muted mt-1">{call.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
