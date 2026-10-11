import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { ImportWizard } from "./import-wizard";

export const instant = false;

export default async function ImportPage({
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

  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("slug", projectSlug)
    .single();
  if (!project) notFound();

  // Auth: admin or manager of this project
  let canImport = profile.role === "admin";

  if (!canImport) {
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("project_id", project.id)
      .single();
    canImport = membership?.role === "manager";
  }

  if (!canImport) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold text-text mb-6">Import leadů</h1>
      <ImportWizard projectId={project.id} projectSlug={project.slug} />
    </div>
  );
}
