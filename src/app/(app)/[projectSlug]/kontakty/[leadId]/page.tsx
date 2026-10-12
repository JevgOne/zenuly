import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getContactDetail } from "@/app/actions/contacts";
import { ContactDetailView } from "./contact-detail-view";

export const instant = false;

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

  // Load operators for assignment dropdown
  const { data: members } = await supabase
    .from("project_members")
    .select("profile_id, profiles(full_name)")
    .eq("project_id", contact.project_id);

  const operators = (members ?? []).map((m) => ({
    id: m.profile_id,
    name: (m.profiles as unknown as { full_name: string })?.full_name ?? "\u2014",
  }));

  // Load stages for stage change dropdown
  const { data: stages } = await supabase
    .from("stages")
    .select("id, name, key, type, position")
    .eq("project_id", contact.project_id)
    .order("position");

  return (
    <ContactDetailView
      contact={contact}
      projectSlug={projectSlug}
      operators={operators}
      stages={(stages ?? []).map((s) => ({ id: s.id, name: s.name, key: s.key, type: s.type }))}
    />
  );
}
