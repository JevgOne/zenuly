import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { ProjectProvider } from "@/lib/contexts/project-context";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { OnboardingGate } from "./_components/onboarding-gate";

export const instant = false;

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    .select("id, role, full_name, onboarding_completed")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  // Load user's projects with project-level role
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id, role, projects(id, name, slug)")
    .eq("profile_id", user.id);

  const projects = (memberships ?? [])
    .map((m) => {
      const p = m.projects as unknown as {
        id: string;
        name: string;
        slug: string;
      };
      return p ? { ...p, projectRole: m.role as string } : null;
    })
    .filter(Boolean) as { id: string; name: string; slug: string; projectRole: string }[];

  // Admin sees all projects
  let allProjects: { id: string; name: string; slug: string; projectRole?: string }[] = projects;
  if (profile.role === "admin" && projects.length === 0) {
    const { data: all } = await supabase
      .from("projects")
      .select("id, name, slug");
    allProjects = all ?? [];
  }

  // Verify access to this project
  const currentProject = allProjects.find((p) => p.slug === projectSlug);
  if (!currentProject) {
    // Admin can access any project
    if (profile.role === "admin") {
      const { data: proj } = await supabase
        .from("projects")
        .select("id, name, slug")
        .eq("slug", projectSlug)
        .single();
      if (!proj) notFound();
      allProjects = [...allProjects, proj];
    } else {
      notFound();
    }
  }

  const project = allProjects.find((p) => p.slug === projectSlug)!;

  // Determine effective role for this project context
  const effectiveRole: "admin" | "manager" | "operator" =
    profile.role === "admin"
      ? "admin"
      : (project.projectRole as "manager" | "operator") ?? "operator";

  return (
    <ProjectProvider
      value={{
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        userRole: effectiveRole,
      }}
    >
      <AppHeader
        projects={allProjects}
        currentSlug={projectSlug}
        fullName={profile.full_name}
        role={effectiveRole}
      />
      <main className="pt-14 pb-[78px] lg:pb-0">{children}</main>
      <BottomNav projectSlug={projectSlug} role={effectiveRole} />
      <OnboardingGate onboardingCompleted={profile.onboarding_completed ?? false} />
    </ProjectProvider>
  );
}
