import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHelpButton } from "@/components/page-help-button";
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
      <PageHelpButton text="Import kontaktů z CSV nebo Excelu. Systém kontroluje duplicity a normalizuje telefonní čísla." />
      <Link
        href={`/${projectSlug}/kontakty`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Zpět
      </Link>
      <h1 className="text-2xl font-semibold text-text mb-6">Import leadů</h1>
      <ImportWizard projectId={project.id} projectSlug={project.slug} />
    </div>
  );
}
