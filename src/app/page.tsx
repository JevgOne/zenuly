import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Load user's project memberships (separate queries to avoid RLS join issues)
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("profile_id", user.id);

  const projectIds = (memberships ?? []).map((m) => m.project_id);
  const isAdmin = profile?.role === "admin";
  const isManager = (memberships ?? []).some((m) => m.role === "manager");

  if (projectIds.length > 0) {
    // Fetch project slugs separately
    const { data: projects } = await supabase
      .from("projects")
      .select("slug")
      .in("id", projectIds)
      .limit(1);
    if (projects && projects.length > 0) {
      const slug = projects[0].slug;
      redirect(isAdmin || isManager ? `/${slug}/dashboard` : `/${slug}`);
    }
  }

  // Admin with no memberships — check all projects
  if (isAdmin) {
    const { data: allProjects } = await supabase
      .from("projects")
      .select("slug")
      .limit(1);
    if (allProjects && allProjects.length > 0)
      redirect(`/${allProjects[0].slug}/dashboard`);
  }

  // No projects — show waiting message
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface border border-line rounded-lg p-8 max-w-md w-full mx-4 text-center">
        <h1 className="text-xl font-semibold text-text mb-2">
          Čekáte na přiřazení k projektu
        </h1>
        <p className="text-sm text-muted">
          Váš účet byl vytvořen. Kontaktujte administrátora, aby vás přiřadil k projektu a nastavil vaši roli.
        </p>
      </div>
    </main>
  );
}
