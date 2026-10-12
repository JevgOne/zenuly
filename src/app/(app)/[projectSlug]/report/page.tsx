import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getDailyReport } from "@/app/actions/report";
import { ReportView } from "./report-view";

export const instant = false;

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { projectSlug } = await params;
  const { date } = await searchParams;
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
    .select("id, name, slug")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  const { data: allProjects } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("is_active", true);

  const reportDate = date ?? new Date().toISOString().slice(0, 10);
  const report = await getDailyReport(project.id as string, reportDate);

  return (
    <div className="min-h-screen bg-bg">
      <ReportView
        report={report}
        projects={
          (allProjects ?? []) as { id: string; name: string; slug: string }[]
        }
        currentProjectSlug={projectSlug}
        currentDate={reportDate}
      />
    </div>
  );
}
