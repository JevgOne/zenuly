import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardView } from "./dashboard-view";

export const instant = false;

export default async function DashboardPage({
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
    .select("id, name")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  return (
    <DashboardView
      projectId={project.id}
      projectName={project.name}
      projectSlug={projectSlug}
    />
  );
}
