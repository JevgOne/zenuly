import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ContactsView } from "./contacts-view";

export const instant = false;

export default async function KontaktyPage({
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
    if (!membership || membership.role !== "manager")
      redirect(`/${projectSlug}/fronta`);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  const { data: stages } = await supabase
    .from("stages")
    .select("key, name, type")
    .eq("project_id", project.id)
    .order("position");

  return (
    <ContactsView
      projectId={project.id}
      projectSlug={projectSlug}
      stages={(stages ?? []).map((s) => ({
        key: s.key as string,
        name: s.name as string,
        type: s.type as string,
      }))}
    />
  );
}
