import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MonthlyHoursExport } from "../_components/monthly-hours-export";

export const instant = false;

export default async function ExportHodinPage({
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

  if (!profile || (profile.role !== "admin" && profile.role !== "manager"))
    redirect(`/${projectSlug}`);

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();

  if (!project) redirect("/");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">
        Export odpracovaných hodin
      </h1>
      <MonthlyHoursExport projectId={project.id} />
    </div>
  );
}
